import { db } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { callGemini, safeParseJSON } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 8)) return failure("RATE_LIMIT", "Too many requests", 429);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return failure("INVALID_JSON", "Invalid JSON body"); }

  const { pathId, stageId, stageTitle, topics } = body;
  if (!pathId || !stageId || !stageTitle) return failure("INVALID_INPUT", "pathId, stageId, stageTitle are required");

  const pathRef = db.collection("learningPaths").doc(pathId);
  const pathSnap = await pathRef.get();
  if (!pathSnap.exists) return failure("NOT_FOUND", "Plan not found", 404);
  if (pathSnap.data().ownerId !== auth.uid) return failure("FORBIDDEN", "You don't own this plan", 403);

  const existing = await pathRef.collection("lessons").where("stageId", "==", stageId).limit(1).get();
  if (!existing.empty) return failure("ALREADY_EXISTS", "Lessons already generated for this stage", 409);

  const plan = pathSnap.data();
  const topicList = Array.isArray(topics) ? topics.slice(0, 10).join(", ") : "";

  const systemPrompt = `You are an expert lesson generator.
Create 3-5 concise lessons for a single learning stage.
Return ONLY valid JSON:
{
  "lessons": [
    { "title": "string", "description": "string", "objectives": ["string"], "content": "string (markdown, 400-800 words)" }
  ]
}
Rules:
- Content in ${plan.language === "ar" ? "Arabic" : "English"}.
- Realistic for ${plan.dailyMinutes} minutes per day.
- Focus on provided topics only.`;

  const userPrompt = `Stage: ${stageTitle}
Topics: ${topicList || "N/A"}
Learner level: ${plan.currentLevel}
Goal: ${plan.goal}
Skill: ${plan.skill}`;

  let aiData;
  try {
    const raw = await callGemini(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      { jsonMode: true }
    );
    aiData = safeParseJSON(raw);
    if (!aiData || !Array.isArray(aiData.lessons) || aiData.lessons.length === 0) {
      return failure("AI_INVALID_RESPONSE", "AI returned invalid lesson structure", 502);
    }
  } catch (err) {
    console.error("Lesson generation error code:", err.message);
    return failure("AI_ERROR", "Could not generate lessons. Please try again.", 502);
  }

  const batch = db.batch();
  const lessonsCol = pathRef.collection("lessons");
  const createdIds = [];
  aiData.lessons.slice(0, 5).forEach((lesson, i) => {
    const ref = lessonsCol.doc();
    createdIds.push(ref.id);
    batch.set(ref, {
      stageId,
      title: String(lesson.title || `Lesson ${i + 1}`).slice(0, 200),
      description: String(lesson.description || "").slice(0, 500),
      content: String(lesson.content || "").slice(0, 12000),
      learningObjectives: Array.isArray(lesson.objectives) ? lesson.objectives.slice(0, 6).map(o => String(o).slice(0, 200)) : [],
      estimatedMinutes: Math.max(15, Math.min(180, plan.dailyMinutes || 60)),
      order: i + 1,
      status: "published",
      createdAt: new Date()
    });
  });
  await batch.commit();
  await pathRef.update({ updatedAt: new Date() });
  return success({ stageId, createdLessons: createdIds.length, lessonIds: createdIds });
}