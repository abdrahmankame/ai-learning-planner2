import { db, auth } from "./_shared/firebase-admin.js";
import { verifyUser } from "./_shared/auth-middleware.js";
import { success, failure } from "./_shared/responses.js";
import { checkRateLimit } from "./_shared/rate-limit.js";

async function deleteCollection(ref, batchSize = 200) {
  const q = ref.limit(batchSize);
  const snap = await q.get();
  if (snap.size === 0) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === batchSize) await deleteCollection(ref, batchSize);
}

export async function handler(event) {
  if (event.httpMethod !== "POST" && event.httpMethod !== "DELETE") return failure("METHOD_NOT_ALLOWED", "POST or DELETE only", 405);
  const authResult = await verifyUser(event);
  if (authResult.error) return authResult.error;
  if (!checkRateLimit(authResult.uid, 1)) return failure("RATE_LIMIT", "Too many requests", 429);

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  if (body.confirm !== "DELETE") return failure("CONFIRMATION_REQUIRED", "Send { confirm: 'DELETE' } to confirm");

  const uid = authResult.uid;
  try {
    const pathsSnap = await db.collection("learningPaths").where("ownerId", "==", uid).get();
    for (const pathDoc of pathsSnap.docs) {
      const pathRef = pathDoc.ref;
      for (const sub of ["stages", "lessons", "tasks", "versions", "quizzes"]) {
        await deleteCollection(pathRef.collection(sub));
      }
      const quizzesSnap = await pathRef.collection("quizzes").get();
      for (const q of quizzesSnap.docs) {
        await deleteCollection(q.ref.collection("answers"));
      }
      await pathRef.delete();
    }

    const userRef = db.collection("users").doc(uid);
    for (const sub of ["progress", "assessments", "aiReports", "profile"]) {
      await deleteCollection(userRef.collection(sub));
    }
    await userRef.delete();

    await auth.deleteUser(uid);
    return success({ deleted: true, message: "Account and all data deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    return failure("DELETE_FAILED", "Could not delete all data. Contact support.", 500);
  }
}