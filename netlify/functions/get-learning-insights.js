import { db } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { callGroq } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";

export async function handler(event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "GET or POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 4)) return failure("RATE_LIMIT", "Too many requests", 429);

  const pathId = event.httpMethod === "GET" ? (event.queryStringParameters?.pathId || null) : JSON.parse(event.body || "{}").pathId;
  if (!pathId) return failure("INVALID_INPUT", "pathId required");

  const pathRef = db.collection("learningPaths").doc(pathId);
  const pathSnap = await pathRef.get();
  if (!pathSnap.exists) return failure("NOT_FOUND", "Plan not found", 404);
  if (pathSnap.data().ownerId !== auth.uid) return failure("FORBIDDEN", "You don't own this plan", 403);

  const plan = pathSnap.data();

  const [lessonsSnap, progressSnap, assessmentsSnap] = await Promise.all([
    pathRef.collection("lessons").get(),
    db.collection("users", auth.uid, "progress").get(),
    db.collection("users", auth.uid, "assessments").get()
  ]);

  const lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const progress = progressSnap.docs.map(d => d.data()).filter(p => p.pathId === pathId);
  const assessments = assessmentsSnap.docs.map(d => d.data()).filter(a => a.pathId === pathId);

  const completed = progress.filter(p => p.status === "completed").length;
  const totalLessons = lessons.length;
  const completionPct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
  const avgScore = assessments.length > 0 ? Math.round(assessments.reduce((s, a) => s + (a.percentage || 0), 0) / assessments.length) : null;
  const totalTime = progress.reduce((s, p) => s + (p.timeSpentMinutes || 0), 0);

  let aiSummary = null;
  try {
    aiSummary = await callGroq([
      { role: "system", content: "You are a learning coach. Analyze progress and give 3 short, actionable recommendations under 120 words. Answer in the user's language." },
      { role: "user", content: `Plan: ${plan.title}\nSkill: ${plan.skill}\nGoal: ${plan.goal}\nLessons completed: ${completed}/${totalLessons} (${completionPct}%)\nAverage quiz score: ${avgScore ?? "N/A"}%\nQuizzes taken: ${assessments.length}\nTime spent: ${totalTime} minutes` }
    ]);
  } catch (err) { console.warn("AI insights failed:", err.message); }

  return success({
    summary: { totalLessons, completedLessons: completed, completionPercentage: completionPct, quizzesTaken: assessments.length, averageScore: avgScore, timeSpentMinutes: totalTime },
    aiSummary,
    recentAssessments: assessments
      .sort((a, b) => ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)))
      .slice(0, 5)
      .map(a => ({ quizId: a.quizId, score: a.percentage, date: a.createdAt }))
  });
}