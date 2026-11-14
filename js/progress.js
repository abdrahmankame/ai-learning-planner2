import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callApi } from "./api-client.js";

const loading = document.getElementById("loading");
const errorBox = document.getElementById("error-box");
const errorText = document.getElementById("error-text");
const emptyBox = document.getElementById("empty-box");
const content = document.getElementById("content");
const planSelect = document.getElementById("plan-select");

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.href = "/pages/login.html";
});

let allPlans = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  try {
    const q = query(collection(db, "learningPaths"), where("ownerId", "==", user.uid));
    const snap = await getDocs(q);
    allPlans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    loading.hidden = true;
    if (allPlans.length === 0) { emptyBox.hidden = false; return; }
    content.hidden = false;
    planSelect.innerHTML = allPlans.map(p => `<option value="${p.id}">${p.title}</option>`).join("");
    planSelect.addEventListener("change", () => loadInsights(planSelect.value));
    loadInsights(allPlans[0].id);
  } catch (err) {
    loading.hidden = true;
    errorBox.hidden = false;
    errorText.textContent = "خطأ: " + err.message;
  }
});

async function loadInsights(pathId) {
  document.getElementById("ai-summary-box").hidden = true;
  document.getElementById("assessments-list").innerHTML = '<div class="loading"><div class="spinner"></div>جاري التحميل...</div>';
  try {
    const data = await callApi("get-learning-insights", { pathId });
    document.getElementById("stat-completed").textContent = data.summary.completedLessons;
    document.getElementById("stat-pct").textContent = data.summary.completionPercentage + "%";
    document.getElementById("stat-avg").textContent = data.summary.averageScore !== null ? data.summary.averageScore + "%" : "—";
    document.getElementById("stat-time").textContent = data.summary.timeSpentMinutes;
    document.getElementById("main-progress-fill").style.width = data.summary.completionPercentage + "%";
    document.getElementById("progress-detail").textContent = `${data.summary.completedLessons} من ${data.summary.totalLessons} درس مكتمل · ${data.summary.quizzesTaken} اختبار مأخوذ`;
    if (data.aiSummary) {
      const box = document.getElementById("ai-summary-box");
      box.hidden = false;
      document.getElementById("ai-summary-text").textContent = data.aiSummary;
    }
    const list = document.getElementById("assessments-list");
    if (!data.recentAssessments || data.recentAssessments.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>لم تأخذ أي اختبار بعد.</p></div>`;
    } else {
      list.innerHTML = data.recentAssessments.map(a => `
        <div class="assessment-item">
          <div>
            <strong>اختبار</strong>
            <div style="color:var(--muted);font-size:13px;">${a.date?.toDate ? a.date.toDate().toLocaleDateString("ar") : ""}</div>
          </div>
          <div style="font-size:20px;font-weight:700;color:${a.score >= 70 ? "var(--success)" : a.score >= 50 ? "#f59e0b" : "var(--danger)"};">${a.score}%</div>
        </div>
      `).join("");
    }
  } catch (err) {
    document.getElementById("assessments-list").innerHTML = `<p class="error-message">${err.message}</p>`;
  }
}