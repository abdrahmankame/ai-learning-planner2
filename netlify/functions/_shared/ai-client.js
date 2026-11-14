// _shared/ai-client.js
// تكامل Google Gemini API — generateContent مع x-goog-api-key

const DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * استدعاء Gemini API.
 * @param {Array<{role:string, content:string}>} messages - بصيغة OpenAI (system/user/assistant)
 * @param {{jsonMode?: boolean}} options
 * @returns {Promise<string>} النص الناتج
 */
export async function callGemini(messages, { jsonMode = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${GEMINI_ENDPOINT}/${model}:generateContent`;

  // تحويل messages إلى systemInstruction + contents
  const systemParts = [];
  const contents = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: 4000
    }
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
  }
  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("GEMINI_TIMEOUT");
    }
    throw new Error("GEMINI_NETWORK_ERROR");
  }
  clearTimeout(timeout);

  if (!res.ok) {
    // لا نكشف نص الاستجابة (قد يحتوي تفاصيل حساسة)
    if (res.status === 400) throw new Error("GEMINI_INVALID_REQUEST");
    if (res.status === 403) throw new Error("GEMINI_INVALID_KEY");
    if (res.status === 429) throw new Error("GEMINI_RATE_LIMIT");
    if (res.status >= 500) throw new Error("GEMINI_SERVER_ERROR");
    throw new Error("GEMINI_UNKNOWN_ERROR");
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("GEMINI_INVALID_JSON_RESPONSE");
  }

  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    if (candidate.finishReason === "MAX_TOKENS") throw new Error("GEMINI_MAX_TOKENS");
    if (candidate.finishReason === "SAFETY" || candidate.finishReason === "RECITATION") {
      throw new Error("GEMINI_BLOCKED");
    }
    throw new Error("GEMINI_UNEXPECTED_FINISH");
  }

  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  const text = parts.map(p => p.text || "").join("");
  if (!text.trim()) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  return text;
}

/**
 * استخراج JSON من نص قد يكون ملفوفًا بـ markdown.
 */
export function safeParseJSON(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}