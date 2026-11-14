import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, collection, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callApi } from "./api-client.js";

const params = new URLSearchParams(window.location.search);
const pathId = params.get("pathId");
const lessonId = params.get("lessonId");

const loading = document.getElementById("loading");
const content = document.getElementById("content");
const errorBox = document.getElementById("error-box");
const errorText = document.getElementById("error-text");

function showError(msg) {
  loading.hidden = true;
  content.hidden = true;
  errorBox.hidden = false;
  errorText.textContent = msg;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  if (!pathId || !lessonId) { showError("رابط الدرس غير مكتمل."); return; }
  try {
    const pathSnap = await getDoc(doc(db, "learningPaths", pathId));
    if (!pathSnap.exists() || pathSnap.data().ownerId !== user.uid) {
      showError("ليس لديك صلاحية الوصول لهذا الدرس."); return;
    }
    const lessonSnap = await getDoc(doc(db, "learningPaths", pathId, "lessons", lessonId));
    if (!lessonSnap.exists()) { showError("الدرس غير موجود."); return; }
    const lesson = lessonSnap.data();

    document.getElementById("back-link").href = `/pages/plan-details.html?id=${pathId}`;
    document.getElementById("lesson-title").textContent = lesson.title;
    document.getElementById("lesson-desc").textContent = lesson.description || "";

    const objectives = lesson.learningObjectives || [];
    if (objectives.length) {
      document.getElementById("objectives-box").hidden = false;
      document.getElementById("objectives-list").innerHTML = objectives.map(o => `<li>${escapeHtml(o)}</li>`).join("");
    }
    document.getElementById("lesson-body").innerHTML = renderMarkdown(lesson.content || "");

    const completeBtn = document.getElementById("complete-btn");
    completeBtn.addEventListener("click", () => completeLesson(user.uid, lessonId, pathId, completeBtn));

    document.getElementById("quiz-link").href = `/pages/quiz.html?pathId=${pathId}&lessonId=${lessonId}`;

    await setupNextLesson(pathId, lesson.order);
    await recordLessonStarted(user.uid, lessonId, pathId);

    loading.hidden = true;
    content.hidden = false;
  } catch (err) {
    console.error(err);
    showError("خطأ في تحميل الدرس: " + err.message);
  }
});

async function completeLesson(uid, lessonId, pathId, btn) {
  btn.disabled = true;
  btn.textContent = "جاري الحفظ...";
  try {
    const progressRef = doc(db, "users", uid, "progress", lessonId);
    await setDoc(progressRef, {
      pathId, lessonId, status: "completed",
      score: null, timeSpentMinutes: 0,
      completedAt: serverTimestamp()
    }, { merge: true });
    btn.textContent = "✅ تم الإكمال";
    const next = document.getElementById("next-link");
    if (!next.hidden) setTimeout(() => next.click(), 800);
  } catch (err) {
    alert("فشل الحفظ: " + err.message);
    btn.disabled = false;
    btn.textContent = "✅ إكمال الدرس";
  }
}

async function setupNextLesson(pathId, currentOrder) {
  const snap = await getDocs(query(collection(db, "learningPaths", pathId, "lessons"), orderBy("order", "asc")));
  const lessons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const next = lessons.find(l => l.order > currentOrder);
  if (next) {
    const link = document.getElementById("next-link");
    link.href = `/pages/lesson.html?pathId=${pathId}&lessonId=${next.id}`;
    link.hidden = false;
  }
}

async function recordLessonStarted(uid, lessonId, pathId) {
  const ref = doc(db, "users", uid, "progress", lessonId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      pathId, lessonId, status: "in_progress",
      score: null, timeSpentMinutes: 0,
      startedAt: serverTimestamp()
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderMarkdown(md) {
  if (!md) return "";
  let html = escapeHtml(md);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/^\- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
  html = html.split(/\n{2,}/).map(p => {
    if (p.match(/^<(h|ul|pre|li)/)) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  return html;
}

const tutorInput = document.getElementById("tutor-input");
const tutorSend = document.getElementById("tutor-send");
const tutorMessages = document.getElementById("tutor-messages");

function addTutorMessage(text, who) {
  const el = document.createElement("div");
  el.className = `tutor-msg ${who}`;
  el.textContent = text;
  tutorMessages.appendChild(el);
  tutorMessages.scrollTop = tutorMessages.scrollHeight;
}

async function sendTutorQuestion() {
  const q = tutorInput.value.trim();
  if (!q) return;
  tutorInput.value = "";
  addTutorMessage(q, "user");
  tutorSend.disabled = true;
  const lessonBodyText = document.getElementById("lesson-body")?.innerText || "";
  try {
    const { answer } = await callApi("ask-ai-tutor", { question: q, context: lessonBodyText.slice(0, 1500) });
    addTutorMessage(answer, "ai");
  } catch (err) {
    addTutorMessage("عذراً، حدث خطأ: " + err.message, "ai");
  } finally {
    tutorSend.disabled = false;
  }
}

tutorSend.addEventListener("click", sendTutorQuestion);
tutorInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendTutorQuestion(); });