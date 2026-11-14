import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db } from "./firebase-config.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const welcome = document.getElementById("welcome");
const loading = document.getElementById("loading");
const content = document.getElementById("content");
const plansList = document.getElementById("plans-list");
const plansCountEl = document.getElementById("plans-count");
const lessonsCountEl = document.getElementById("lessons-count");

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.href = "/pages/login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  welcome.textContent = `مرحباً ${user.displayName || user.email.split("@")[0]} 👋`;
  try {
    const q = query(collection(db, "learningPaths"), where("ownerId", "==", user.uid));
    const snap = await getDocs(q);
    const plans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loading.hidden = true;
    content.hidden = false;
    plansCountEl.textContent = plans.filter(p => p.status === "active").length;
    lessonsCountEl.textContent = "0";
    if (plans.length === 0) {
      plansList.innerHTML = `
        <div class="empty-state">
          <div class="icon">📚</div>
          <p>لم تنشئ أي خطة بعد.</p>
          <a href="/pages/create-plan.html" class="btn btn-primary" style="margin-top:16px;display:inline-block">أنشئ خطتك الأولى</a>
        </div>`;
    } else {
      plansList.innerHTML = plans.map(p => `
        <div class="stat-card" style="margin-bottom:12px;">
          <h3>${p.title}</h3>
          <p style="color:var(--muted);font-size:14px;">${p.skill} · ${p.currentLevel} · ${p.durationWeeks} أسبوع</p>
          <p style="margin-top:8px;"><span class="badge">${p.status}</span></p>
          <a href="/pages/plan-details.html?id=${p.id}" class="btn btn-outline" style="margin-top:12px;display:inline-block">عرض الخطة</a>
        </div>
      `).join("");
    }
  } catch (err) {
    loading.hidden = true;
    content.hidden = false;
    plansList.innerHTML = `<p class="error-message">خطأ في تحميل البيانات: ${err.message}</p>`;
  }
});