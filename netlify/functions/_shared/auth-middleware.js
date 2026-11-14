import { auth } from "./firebase-admin.js";
import { failure } from "./responses.js";

export async function verifyUser(event) {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return { error: failure("UNAUTHORIZED", "Missing or invalid token", 401) };
  }
  const token = header.slice(7);
  try {
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid, decoded };
  } catch (err) {
    return { error: failure("UNAUTHORIZED", "Invalid token", 401) };
  }
}