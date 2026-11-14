export async function callGroq(messages, { jsonMode = false } = {}) {
    const body = {
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens: 4000
    };
    if (jsonMode) body.response_format = { type: "json_object" };
  
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }
  
  export function safeParseJSON(text) {
    const cleaned = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(cleaned); }
    catch { return null; }
  }