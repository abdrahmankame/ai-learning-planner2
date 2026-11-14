import { db } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { validatePlanInput } from "./_shared/validation.js";
import { callGroq, safeParseJSON } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";
import admin from "firebase-admin";

export async function handler(event) {
  if (event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 5)) return failure("RATE_LIMIT", "Too many requests", 429);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return failure("INVALID_JSON", "Invalid JSON body"); }
  const errors = validatePlanInput(body);
  if (errors.length) return failure("INVALID_INPUT", errors.join("; "));

  const systemPrompt = `You are a professional learning planner.
Create a structured, realistic, personalized learning roadmap.
Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "stages": [
    { "stageId": "stage_1", "title": "string", "description": "string", "startWeek": number, "endWeek": number, "topics": ["string"] }
  ]
}
Rules: 2-6 stages, no unrealistic workload, language = ${body.language}.`;

  const userPrompt = `Skill: ${body.skill}
Level: ${body.level}
Goal: ${body.goal}
Daily minutes: ${body.dailyMinutes}
Days per week: ${body.daysPerWeek}
Duration: ${body.durationWeeks} weeks
Language: ${body.language}`;

  let planData;
  try {
    const raw = await callGroq(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      { jsonMode: true }
    );
    planData = safeParseJSON(raw);
    if (!planData || !Array.isArray(planData.stages)) return failure("AI_INVALID_RESPONSE", "AI returned invalid structure", 502);
  } catch (err) {
    return failure("AI_ERROR", "Could not generate plan. Try again.", 502);
  }

  const pathRef = db.collection("learningPaths").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await pathRef.set({
    ownerId: auth.uid,
    title: planData.title || `${body.skill} Learning Plan`,
    skill: body.skill,
    goal: body.goal,
    currentLevel: body.level,
    durationWeeks: body.durationWeeks,
    dailyMinutes: body.dailyMinutes,
    daysPerWeek: body.daysPerWeek,
    language: body.language,
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  const batch = db.batch();
  planData.stages.forEach((stage, i) => {
    const stageRef = pathRef.collection("stages").doc();
    batch.set(stageRef, {
      title: stage.title || `Stage ${i + 1}`,
      description: stage.description || "",
      order: i + 1,
      startWeek: stage.startWeek || 1,
      endWeek: stage.endWeek || 1,
      topics: stage.topics || [],
      status: "pending"
    });
  });
  await batch.commit();
  return success({ pathId: pathRef.id, title: planData.title, status: "active" });
}