import { db } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { callGroq } from "./_shared/ai-client.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";
import admin from "firebase-admin";

export async function handler(event) {
  if (event.httpMethod !== "POST") return failure("METHOD_NOT_ALLOWED", "POST only", 405);
  const auth = await verifyUser(event);
  if (auth.error) return auth.error;
  if (!checkRateLimit(auth.uid, 20)) return failure("RATE_LIMIT", "Too many submissions", 429);

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return failure("INVALID_JSON", "Invalid JSON body"); }

  const { pathId, quizId, answers } = body;
  if (!pathId || !quizId || !Array.isArray(answers)) return failure("INVALID_INPUT", "pathId, quizId, answers[] are required");

  const pathRef = db.collection("learningPaths").doc(pathId);
  const pathSnap = await pathRef.get();
  if (!pathSnap.exists) return failure("NOT_FOUND", "Plan not found", 404);
  if (pathSnap.data().ownerId !== auth.uid) return failure("FORBIDDEN", "You don't own this plan", 403);

  const quizSnap = await pathRef.collection("quizzes").doc(quizId).get();
  if (!quizSnap.exists) return failure("NOT_FOUND", "Quiz not found", 404);

  const answersSnap = await pathRef.collection("quizzes").doc(quizId).collection("answers").doc("correct").get();
  if (!answersSnap.exists) return failure("NOT_FOUND", "Quiz answers not found", 404);

  const quiz = quizSnap.data();
  const correct = answersSnap.data().answers || [];
  if (answers.length !== quiz.questions.length) return failure("INVALID_INPUT", "Answer count mismatch");

  let score = 0;
  const feedback = quiz.questions.map((q, i) => {
    const userChoice = answers[i];
    const isCorrect = Number.isInteger(userChoice) && userChoice === correct[i].correctIndex;
    if (isCorrect) score++;
    return { questionIndex: i, correct: isCorrect, correctIndex: correct[i].correctIndex, userChoice, explanation: correct[i].explanation || "" };
  });

  const pct = Math.round((score / quiz.questions.length) * 100);

  let aiFeedback = "";
  if (pct < 70) {
    try {
      aiFeedback = await callGroq([
        { role: "system", content: "You are a supportive tutor. Give 2-3 sentences of encouragement and a concrete tip. Answer in the user's language." },
        { role: "user", content: `Student scored ${pct}% on a quiz about "${quiz.title}". Give brief, actionable feedback.` }
      ]);
    } catch { aiFeedback = ""; }
  }

  const assessmentRef = db.collection("users", auth.uid, "assessments").doc();
  await assessmentRef.set({
    pathId, quizId, lessonId: quiz.lessonId,
    score, total: quiz.questions.length, percentage: pct,
    feedback: aiFeedback,
    answers: answers.map((a, i) => ({ questionIndex: i, choice: a, correct: feedback[i].correct })),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  if (quiz.lessonId) {
    const progressRef = db.collection("users", auth.uid, "progress").doc(quiz.lessonId);
    const progressSnap = await progressRef.get();
    const update = { pathId, lessonId: quiz.lessonId, score: pct, lastQuizAt: admin.firestore.FieldValue.serverTimestamp() };
    if (!progressSnap.exists) { update.status = "in_progress"; update.timeSpentMinutes = 0; }
    await progressRef.set(update, { merge: true });
  }

  return success({ score, total: quiz.questions.length, percentage: pct, feedback, aiFeedback, assessmentId: assessmentRef.id });
}