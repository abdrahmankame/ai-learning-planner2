import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { callApi } from "./api-client.js";

const params = new URLSearchParams(window.location.search);
const pathId = params.get("pathId");
const lessonId = params.get("lessonId");

const loading = document.getElementById("loading");
const errorBox = document.getElementById("error-box");
const errorText = document.getElementById("error-text");
const setupBox = document.getElementById("setup-box");
const quizBox = document.getElementById("quiz-box");
const resultBox = document.getElementById("result-box");

let questions = [];
let userAnswers = [];
let currentIndex = 0;
let quizId = null;

function showError(msg) {
  loading.hidden = true; setupBox.hidden = true; quizBox.hidden = true; resultBox.hidden = true;
  errorBox.hidden = false; errorText.textContent = msg;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/pages/login.html"; return; }
  if (!pathId || !lessonId) { showError("رابط الاختبار غير مكتمل."); return; }
  try {
    const pathSnap = await getDoc(doc(db, "learningPaths", pathId));
    if (!pathSnap.exists() || pathSnap.data().ownerId !== user.uid) { showError("ليس لديك صلاحية الوصول لهذا الاختبار."); return; }
    const lessonSnap = await getDoc(doc(db, "learningPaths", pathId, "lessons", lessonId));
    if (!lessonSnap.exists()) { showError("الدرس غير موجود."); return; }
    const lesson = lessonSnap.data();

    const quizzesSnap = await getDocs(collection(db, "learningPaths", pathId, "quizzes"));
    const existing = quizzesSnap.docs.find(d => d.data().lessonId === lessonId);

    loading.hidden = true;
    if (existing) {
      quizId = existing.id;
      questions = existing.data().questions || [];
      userAnswers = new Array(questions.length).fill(null);
      startQuizUI(lesson);
    } else {
      setupBox.hidden = false;
      document.getElementById("setup-desc").textContent = `سيتم إنشاء اختبار من ${lesson.title}. الاختبار يعتمد على محتوى الدرس فقط.`;
      document.getElementById("start-quiz-btn").addEventListener("click", async () => {
        const btn = document.getElementById("start-quiz-btn");
        btn.disabled = true; btn.textContent = "جاري الإنشاء...";
        try {
          const result = await callApi("generate-quiz", { pathId, lessonId, numQuestions: 5 });
          quizId = result.quizId;
          const newSnap = await getDoc(doc(db, "learningPaths", pathId, "quizzes", quizId));
          questions = newSnap.data().questions;
          userAnswers = new Array(questions.length).fill(null);
          setupBox.hidden = true;
          startQuizUI(lesson);
        } catch (err) {
          btn.disabled = false; btn.textContent = "إنشاء الاختبار";
          alert("فشل الإنشاء: " + err.message);
        }
      });
    }
  } catch (err) { console.error(err); showError("خطأ: " + err.message); }
});

function startQuizUI(lesson) {
  quizBox.hidden = false;
  currentIndex = 0;
  renderQuestion();
  updateProgress();
}

function renderQuestion() {
  const q = questions[currentIndex];
  const container = document.getElementById("questions-container");
  container.innerHTML = `
    <div class="question-card">
      <div class="question-number">السؤال ${currentIndex + 1} من ${questions.length}</div>
      <div class="question-text">${escapeHtml(q.question)}</div>
      <div id="options-list">
        ${q.options.map((opt, i) => `
          <label class="option ${userAnswers[currentIndex] === i ? "selected" : ""}" data-idx="${i}">
            <input type="radio" name="q${currentIndex}" value="${i}" ${userAnswers[currentIndex] === i ? "checked" : ""} />
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;
  container.querySelectorAll(".option").forEach(el => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.idx);
      userAnswers[currentIndex] = idx;
      container.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
      el.classList.add("selected");
      el.querySelector("input").checked = true;
    });
  });
  document.getElementById("prev-btn").disabled = currentIndex === 0;
  const nextBtn = document.getElementById("next-btn");
  const isLast = currentIndex === questions.length - 1;
  nextBtn.textContent = isLast ? "إرسال الإجابات" : "التالي";
}

function updateProgress() {
  const pct = ((currentIndex + 1) / questions.length) * 100;
  document.getElementById("progress-fill").style.width = pct + "%";
  const answered = userAnswers.filter(a => a !== null).length;
  document.getElementById("progress-text").textContent = `تمت الإجابة عن ${answered} من ${questions.length}`;
}

document.getElementById("prev-btn").addEventListener("click", () => {
  if (currentIndex > 0) { currentIndex--; renderQuestion(); updateProgress(); }
});

document.getElementById("next-btn").addEventListener("click", async () => {
  if (userAnswers[currentIndex] === null) { alert("اختر إجابة قبل المتابعة."); return; }
  if (currentIndex < questions.length - 1) {
    currentIndex++; renderQuestion(); updateProgress();
  } else {
    await submitQuiz();
  }
});

async function submitQuiz() {
  if (userAnswers.some(a => a === null)) { alert("أجب عن جميع الأسئلة قبل الإرسال."); return; }
  const btn = document.getElementById("next-btn");
  btn.disabled = true; btn.textContent = "جاري التصحيح...";
  try {
    const result = await callApi("evaluate-answer", { pathId, quizId, answers: userAnswers });
    showResult(result);
  } catch (err) {
    alert("فشل التصحيح: " + err.message);
    btn.disabled = false; btn.textContent = "إرسال الإجابات";
  }
}

function showResult(result) {
  quizBox.hidden = true;
  resultBox.hidden = false;
  document.getElementById("result-score").textContent = result.percentage + "%";
  document.getElementById("result-label").textContent = `أجبت بشكل صحيح على ${result.score} من ${result.total} أسئلة`;
  if (result.aiFeedback) {
    const box = document.getElementById("ai-feedback-box");
    box.hidden = false;
    box.innerHTML = `<strong>💡 ملاحظة المعلم الذكي:</strong><br>${escapeHtml(result.aiFeedback)}`;
  }
  const review = document.getElementById("review-container");
  review.innerHTML = "<h3 style='margin-bottom:16px;'>مراجعة الإجابات</h3>" +
    questions.map((q, i) => {
      const fb = result.feedback[i];
      const options = q.options.map((opt, oi) => {
        let cls = "option";
        if (oi === fb.correctIndex) cls += " correct";
        else if (oi === fb.userChoice && !fb.correct) cls += " wrong";
        const icon = oi === fb.correctIndex ? " ✅" : (oi === fb.userChoice && !fb.correct ? " ❌" : "");
        return `<div class="${cls}"><span>${escapeHtml(opt)}${icon}</span></div>`;
      }).join("");
      return `<div class="question-card" style="margin-top:16px;"><div class="question-number">السؤال ${i + 1} ${fb.correct ? "✅" : "❌"}</div><div class="question-text">${escapeHtml(q.question)}</div>${options}${fb.explanation ? `<div class="explanation">💡 ${escapeHtml(fb.explanation)}</div>` : ""}</div>`;
    }).join("");
  document.getElementById("back-to-lesson").href = `/pages/lesson.html?pathId=${pathId}&lessonId=${lessonId}`;
  document.getElementById("back-to-plan").href = `/pages/plan-details.html?id=${pathId}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}