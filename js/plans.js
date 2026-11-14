import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, getDocs, updateDoc, collection, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loading = document.getElementById("loading");
const content = document.getElementById("content");
const errorBox = document.getElementById("error-box");
const errorText = document.getElementById("error-text");

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  window.location.href = "/pages/login.html";
});

const params = new URLSearchParams(window.location.search);
const pathId = params.get("id");

function showError(msg) {
  loading.hidden = true;
  content.hidden = true;
  errorBox.hidden = false;
  errorText.textContent = msg;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  if (!pathId) { showError("لم يتم تحديد معرف الخطة في الرابط."); return; }
  try {
    const pathRef = doc(db, "learningPaths", pathId);
    const pathSnap = await getDoc(pathRef);
    if (!pathSnap.exists()) { showError("الخطة غير موجودة."); return; }
    const plan = pathSnap.data();
    if (plan.ownerId !== user.uid) { showError("ليس لديك صلاحية الوصول لهذه الخطة."); return; }

    const stagesSnap = await getDocs(query(collection(db, "learningPaths", pathId, "stages"), orderBy("order", "asc")));
    const stages = stagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const lessonsSnap = await getDocs(query(collection(db, "learningPaths", pathId, "lessons"), orderBy("order", "asc")));
    const lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const progressSnap = await getDocs(collection(db, "users", user.uid, "progress"));
    const progressList = progressSnap.docs.map(d => d.data()).filter(p => p.pathId === pathId);
    const completedLessons = new Set(progressList.filter(p => p.status === "completed").map(p => p.lessonId));

    renderPlan(plan, stages, lessons, completedLessons);
    loading.hidden = true;
    content.hidden = false;
    setupStatusButtons(pathRef, plan.status);
  } catch (err) {
    console.error(err);
    showError("خطأ في تحميل الخطة: " + err.message);
  }
});

function renderPlan(plan, stages, lessons, completedLessons) {
  document.getElementById("plan-title").textContent = plan.title;
  document.getElementById("plan-meta").textContent = `${plan.skill} · ${plan.currentLevel} · ${plan.durationWeeks} أسبوع · ${plan.dailyMinutes} دقيقة/يوم · ${plan.daysPerWeek} أيام/أسبوع`;
  document.getElementById("stat-stages").textContent = stages.length;
  document.getElementById("stat-weeks").textContent = plan.durationWeeks;
  document.getElementById("stat-lessons").textContent = lessons.length;
  const pct = lessons.length > 0 ? Math.round((completedLessons.size / lessons.length) * 100) : 0;
  document.getElementById("stat-progress").textContent = pct + "%";
  const container = document.getElementById("stages-container");
  if (stages.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>لا توجد مراحل بعد.</p></div>`;
    return;
  }
  container.innerHTML = stages.map(stage => {
    const stageLessons = lessons.filter(l => l.stageId === stage.id);
    const stageCompleted = stageLessons.filter(l => completedLessons.has(l.id)).length;
    const topics = (stage.topics || []).map(t => `<span class="topic-chip">${t}</span>`).join("");
    return `
      <div class="stage-card">
        <div class="stage-header" data-stage-id="${stage.id}">
          <div>
            <h3>${stage.title}</h3>
            <div class="stage-weeks">الأسبوع ${stage.startWeek} - ${stage.endWeek}</div>
          </div>
          <div>${stageLessons.length > 0 ? `<span class="topic-chip">${stageCompleted}/${stageLessons.length} درس</span>` : `<span class="topic-chip">قيد الإعداد</span>`}</div>
        </div>
        <div class="stage-body" id="body-${stage.id}">
          <p class="stage-description">${stage.description || ""}</p>
          ${topics ? `<div class="topics-list">${topics}</div>` : ""}
          ${stageLessons.length === 0
            ? `<button class="btn btn-outline lesson-btn" data-gen-stage="${stage.id}">🪄 توليد الدروس لهذه المرحلة</button>`
            : stageLessons.map(l => `
                <div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                  <span>${completedLessons.has(l.id) ? "✅" : "📖"} ${l.title}</span>
                  <a href="/pages/lesson.html?pathId=${pathId}&lessonId=${l.id}" class="btn btn-outline" style="padding:6px 14px;font-size:13px;">فتح</a>
                </div>
              `).join("")}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".stage-header").forEach(el => {
    el.addEventListener("click", () => {
      const body = document.getElementById("body-" + el.dataset.stageId);
      body.classList.toggle("open");
    });
  });
  container.querySelectorAll("[data-gen-stage]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const stageId = btn.dataset.genStage;
      const stage = stages.find(s => s.id === stageId);
      btn.disabled = true;
      btn.textContent = "جاري التوليد...";
      try {
        const { callApi } = await import("./api-client.js");
        await callApi("generate-lesson", { pathId, stageId, stageTitle: stage.title, topics: stage.topics || [] });
        window.location.reload();
      } catch (err) {
        alert("فشل التوليد: " + err.message);
        btn.disabled = false;
        btn.textContent = "🪄 توليد الدروس لهذه المرحلة";
      }
    });
  });
}

function setupStatusButtons(pathRef, status) {
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const archiveBtn = document.getElementById("archive-btn");
  const updateStatus = async (newStatus) => {
    await updateDoc(pathRef, { status: newStatus, updatedAt: serverTimestamp() });
    window.location.reload();
  };
  if (status === "active") {
    pauseBtn.hidden = false; archiveBtn.hidden = false;
    pauseBtn.onclick = () => updateStatus("paused");
    archiveBtn.onclick = () => { if (confirm("هل تريد أرشفة هذه الخطة؟")) updateStatus("archived"); };
  } else if (status === "paused") {
    resumeBtn.hidden = false; archiveBtn.hidden = false;
    resumeBtn.onclick = () => updateStatus("active");
    archiveBtn.onclick = () => { if (confirm("هل تريد أرشفة هذه الخطة؟")) updateStatus("archived"); };
  }
}