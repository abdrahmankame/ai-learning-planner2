import { verifyUser } from "./_shared/auth-middleware.js";
import { callGemini } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 15)) return failure("RATE_LIMIT", "Too many requests", 429);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return failure("INVALID_JSON", "Bad JSON"); }
  const question = (body.question || "").toString().slice(0, 1000);
  const context = (body.context || "").toString().slice(0, 2000);
  if (!question) return failure("INVALID_INPUT", "question required");

  const system = `You are a helpful, concise AI tutor. Answer in the user's language. Keep responses focused and beginner-friendly when appropriate.`;
  const user = context ? `Lesson context:\n${context}\n\nStudent question:\n${question}` : `Student question:\n${question}`;

  try {
    const answer = await callGemini([
      { role: "system", content: system },
      { role: "user", content: user }
    ]);
    return success({ answer });
  } catch (err) {
    console.error("AI tutor error code:", err.message);
    return failure("AI_ERROR", "AI tutor unavailable. Please try again.", 502);
  }
}