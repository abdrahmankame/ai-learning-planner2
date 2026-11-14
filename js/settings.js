import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut, sendPasswordResetEmail, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callApi } from "./api-client.js";

const loading = document.getElementById("loading");
const content = document.getElementById("content");
let currentUser = null;

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.href = "/pages/login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  currentUser = user;
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const profileSnap = await getDoc(doc(db, "users", user.uid, "profile", "main"));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const profileData = profileSnap.exists() ? profileSnap.data() : {};
    document.getElementById("displayName").value = userData.displayName || user.displayName || "";
    document.getElementById("email").value = user.email || "";
    document.getElementById("preferredLanguage").value = profileData.preferredLanguage || "ar";
    document.getElementById("dailyAvailableMinutes").value = profileData.dailyAvailableMinutes || 60;
    document.getElementById("availableDays").value = profileData.availableDays || 5;
    loading.hidden = true;
    content.hidden = false;
  } catch (err) {
    loading.hidden = true;
    content.hidden = false;
    alert("تعذر تحميل البيانات: " + err.message);
  }
});

document.getElementById("save-profile-btn").addEventListener("click", async () => {
  const displayName = document.getElementById("displayName").value.trim();
  if (!displayName) { alert("الاسم مطلوب."); return; }
  try {
    await setDoc(doc(db, "users", currentUser.uid), { displayName, updatedAt: serverTimestamp() }, { merge: true });
    const msg = document.getElementById("profile-msg");
    msg.hidden = false;
    setTimeout(() => msg.hidden = true, 3000);
  } catch (err) { alert("فشل الحفظ: " + err.message); }
});

document.getElementById("save-prefs-btn").addEventListener("click", async () => {
  const preferredLanguage = document.getElementById("preferredLanguage").value;
  const dailyAvailableMinutes = Number(document.getElementById("dailyAvailableMinutes").value);
  const availableDays = Number(document.getElementById("availableDays").value);
  if (dailyAvailableMinutes < 15 || dailyAvailableMinutes > 480) { alert("الوقت اليومي يجب أن يكون بين 15 و480 دقيقة."); return; }
  if (availableDays < 1 || availableDays > 7) { alert("أيام الدراسة يجب أن تكون بين 1 و7."); return; }
  try {
    await setDoc(doc(db, "users", currentUser.uid, "profile", "main"), {
      preferredLanguage, dailyAvailableMinutes, availableDays, updatedAt: serverTimestamp()
    }, { merge: true });
    const msg = document.getElementById("prefs-msg");
    msg.hidden = false;
    setTimeout(() => msg.hidden = true, 3000);
  } catch (err) { alert("فشل الحفظ: " + err.message); }
});

document.getElementById("reset-password-btn").addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    alert("تم إرسال رابط إعادة التعيين إلى بريدك.");
  } catch (err) { alert("فشل الإرسال: " + err.message); }
});

document.getElementById("delete-account-btn").addEventListener("click", async () => {
  const confirm1 = prompt('اكتب كلمة "DELETE" لتأكيد الحذف النهائي:');
  if (confirm1 !== "DELETE") { alert("تم الإلغاء."); return; }
  const confirm2 = confirm("هل أنت متأكد؟ سيتم حذف كل بياناتك نهائياً.");
  if (!confirm2) return;
  const btn = document.getElementById("delete-account-btn");
  btn.disabled = true;
  btn.textContent = "جاري الحذف...";
  try {
    await callApi("delete-account-data", { confirm: "DELETE" });
    try { await deleteUser(currentUser); } catch {}
    window.location.href = "/";
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "حذف الحساب نهائياً";
    alert("فشل الحذف: " + err.message);
  }
});