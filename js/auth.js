import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

export async function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}
export async function logout() {
  await signOut(auth);
  window.location.href = "/pages/login.html";
}
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}
export function translateAuthError(code) {
  const map = {
    "auth/email-already-in-use": "هذا البريد مستخدم مسبقاً.",
    "auth/invalid-email": "البريد الإلكتروني غير صالح.",
    "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل).",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة.",
    "auth/too-many-requests": "محاولات كثيرة، حاول لاحقاً."
  };
  return map[code] || "حدث خطأ، حاول مرة أخرى.";
}