import { db } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { callGroq, safeParseJSON } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 6)) return failure("RATE_LIMIT", "Too many quiz requests", 429);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return failure("INVALID_JSON", "Invalid JSON body"); }

  const { pathId, lessonId, numQuestions = 5 } = body;
  if (!pathId || !lessonId) return failure("INVALID_INPUT", "pathId and lessonId are required");

  const pathRef = db.collection("learningPaths").doc(pathId);
  const pathSnap = await pathRef.get();
  if (!pathSnap.exists) return failure("NOT_FOUND", "Plan not found", 404);
  if (pathSnap.data().ownerId !== auth.uid) return failure("FORBIDDEN", "You don't own this plan", 403);

  const lessonSnap = await pathRef.collection("lessons").doc(lessonId).get();
  if (!lessonSnap.exists) return failure("NOT_FOUND", "Lesson not found", 404);
  const lesson = lessonSnap.data();

  const plan = pathSnap.data();
  const lang = plan.language === "ar" ? "Arabic" : "English";
  const n = Math.max(3, Math.min(10, Number(numQuestions) || 5));

  const systemPrompt = `You are an expert quiz generator.
Create exactly ${n} multiple-choice questions based ONLY on the provided lesson.
Return ONLY valid JSON:
{
  "questions": [
    { "question": "string", "options": ["string","string","string","string"], "correctIndex": 0, "explanation": "string" }
  ]
}
Rules: 4 options per question, exactly one correct, correctIndex 0-3, language ${lang}.`;

  const userPrompt = `Lesson title: ${lesson.title}
Lesson description: ${lesson.description || ""}
Lesson content:
${(lesson.content || "").slice(0, 6000)}`;

  let aiData;
  try {
    const raw = await callGroq(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      { jsonMode: true }
    );
    aiData = safeParseJSON(raw);
    if (!aiData || !Array.isArray(aiData.questions) || aiData.questions.length === 0) {
      return failure("AI_INVALID_RESPONSE", "AI returned invalid quiz structure", 502);
    }
  } catch (err) {
    console.error("Groq error:", err.message);
    return failure("AI_ERROR", "Could not generate quiz. Try again.", 502);
  }

  const validQuestions = aiData.questions.filter(q =>
    q && typeof q.question === "string" &&
    Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3
  ).slice(0, n);

  if (validQuestions.length === 0) return failure("AI_INVALID_RESPONSE", "No valid questions generated", 502);

  const quizRef = pathRef.collection("quizzes").doc();
  const publicQuestions = validQuestions.map(q => ({
    question: String(q.question).slice(0, 500),
    options: q.options.map(o => String(o).slice(0, 300))
  }));

  await quizRef.set({
    lessonId,
    stageId: lesson.stageId || null,
    title: `اختبار: ${lesson.title}`,
    questions: publicQuestions,
    totalQuestions: publicQuestions.length,
    status: "published",
    createdAt: new Date()
  });

  await quizRef.collection("answers").doc("correct").set({
    answers: validQuestions.map(q => ({
      correctIndex: q.correctIndex,
      explanation: String(q.explanation || "").slice(0, 500)
    }))
  });

  return success({ quizId: quizRef.id, totalQuestions: publicQuestions.length });
}