/**
 * ============================================================
 *  PlaceMentor AI  –  Aptitude Page JavaScript
 * ============================================================
 *  Manages the timed MCQ aptitude test:
 *    1. Fetch questions from /api/aptitude/questions
 *    2. Render questions one-by-one (with navigation)
 *    3. Run a countdown timer (10 min default)
 *    4. Auto-submit on timeout
 *    5. POST answers to /api/aptitude/submit
 *    6. Display detailed results with explanations
 * ============================================================
 */

const API          = '[localhost](http://localhost:5000/api)';
const TIMER_SECS   = 600;  // 10 minutes

let questions      = [];
let userAnswers    = {};   // { "q_id": "chosen_option" }
let timerInterval  = null;
let timeLeft       = TIMER_SECS;
let testSubmitted  = false;

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const name = localStorage.getItem('pm_student_name') || 'Student';
  document.getElementById('sidebarName').textContent   = name;
  document.getElementById('avatarInitial').textContent = name.charAt(0).toUpperCase();

  loadQuestions();
});

// ─────────────────────────────────────────────────────────────
//  Load Questions from API
// ─────────────────────────────────────────────────────────────
async function loadQuestions() {
  try {
    const res  = await fetch(`${API}/aptitude/questions?count=10`);
    const data = await res.json();
    questions  = data.questions;

    document.getElementById('answeredCount').textContent = `0 / ${questions.length}`;
    renderAllQuestions();
    startTimer();

  } catch (err) {
    document.getElementById('quizScreen').innerHTML = `
      <div class="no-data">
        <i class="fas fa-wifi"></i>
        <p>Cannot connect to server. Make sure the Flask backend is running.<br/>
        <code style="color:var(--primary-light);">cd backend && python app.py</code></p>
      </div>
    `;
    console.error(err);
  }
}

// ─────────────────────────────────────────────────────────────
//  Render All Questions as scrollable cards
// ─────────────────────────────────────────────────────────────
function renderAllQuestions() {
  const screen = document.getElementById('quizScreen');
  screen.innerHTML = '';

  const letters = ['A', 'B', 'C', 'D'];

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'apt-question-card';
    card.id = `qcard-${q.id}`;

    const optionsHtml = q.options.map((opt, i) => `
      <button
        class="option-btn"
        id="opt-${q.id}-${i}"
        onclick="selectOption(${q.id}, '${escapeJs(opt)}', ${i})"
        data-qid="${q.id}"
        data-idx="${i}"
      >
        <span class="option-letter">${letters[i]}</span>
        ${escapeHtml(opt)}
      </button>
    `).join('');

    card.innerHTML = `
      <div class="apt-q-meta">
        <span class="apt-q-num">Question ${idx + 1} of ${questions.length}</span>
        <span class="badge badge-good" style="font-size:0.72rem;">${q.topic}</span>
      </div>
      <div class="apt-question-text">${escapeHtml(q.question)}</div>
      <div class="options-list" id="opts-${q.id}">${optionsHtml}</div>
    `;

    screen.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────
//  Handle Option Selection
// ─────────────────────────────────────────────────────────────
function selectOption(qId, chosenOption, chosenIdx) {
  if (testSubmitted) return;

  const wasAnswered  = userAnswers.hasOwnProperty(qId);
  userAnswers[qId]   = chosenOption;

  // Update button styles
  const opts = document.querySelectorAll(`[data-qid="${qId}"]`);
  opts.forEach((btn, i) => {
    btn.classList.remove('selected');
    if (i === chosenIdx) btn.classList.add('selected');
  });

  // Update progress
  if (!wasAnswered) {
    const count = Object.keys(userAnswers).length;
    document.getElementById('answeredCount').textContent = `${count} / ${questions.length}`;
    const pct = (count / questions.length) * 100;
    document.getElementById('aptProgressBar').style.width = pct + '%';
  }
}

// ─────────────────────────────────────────────────────────────
//  Timer
// ─────────────────────────────────────────────────────────────
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      showToast('⏰ Time is up! Submitting automatically...', 'error');
      submitTest();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const min  = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const sec  = (timeLeft % 60).toString().padStart(2, '0');
  const el   = document.getElementById('timerDisplay');
  const text = document.getElementById('timerText');

  text.textContent = `${min}:${sec}`;

  el.classList.remove('warning', 'danger');
  if (timeLeft <= 60)  el.classList.add('danger');
  else if (timeLeft <= 180) el.classList.add('warning');
}

// ─────────────────────────────────────────────────────────────
//  Submit Test
// ─────────────────────────────────────────────────────────────
async function submitTest() {
  if (testSubmitted) return;
  testSubmitted = true;
  clearInterval(timerInterval);

  const name      = localStorage.getItem('pm_student_name') || 'Student';
  const timeTaken = TIMER_SECS - timeLeft;

  // Disable submit button
  const btn = document.getElementById('submitTestBtn');
  btn.disabled     = true;
  btn.innerHTML    = '<div class="spinner" style="width:20px;height:20px;border-width:3px;"></div> Submitting...';

  try {
    const res  = await fetch(`${API}/aptitude/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        student_name: name,
        answers:      userAnswers,
        time_taken:   timeTaken
      })
    });
    const data = await res.json();

    // Store score
    localStorage.setItem('pm_last_aptitude_score', data.accuracy);

    showResults(data);

  } catch (err) {
    showToast('Submission failed. Check backend connection.', 'error');
    testSubmitted = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Submit Test';
  }
}

// ─────────────────────────────────────────────────────────────
//  Show Results
// ─────────────────────────────────────────────────────────────
function showResults(data) {
  // Hide quiz, show results
  document.getElementById('quizScreen').style.display    = 'none';
  document.getElementById('testHeaderBar').style.display = 'none';
  const resultsEl = document.getElementById('resultsScreen');
  resultsEl.classList.add('visible');

  // Big score
  const pct = data.accuracy;
  document.getElementById('finalScore').textContent = `${data.correct} / ${data.total}`;
  document.getElementById('finalGrade').textContent  = getGradeText(pct);
  document.getElementById('finalGrade').style.color  = getGradeColor(pct);

  // Topic summary
  const topicMap = {};
  data.results.forEach(r => {
    if (!topicMap[r.topic]) topicMap[r.topic] = { correct: 0, total: 0 };
    topicMap[r.topic].total++;
    if (r.is_correct) topicMap[r.topic].correct++;
  });

  const topicHtml = Object.entries(topicMap).map(([topic, s]) => {
    const pct = Math.round(s.correct / s.total * 100);
    return `
      <div class="topic-item" style="margin-bottom:14px;">
        <div class="topic-header">
          <span class="topic-name">${topic}</span>
          <span class="topic-score ${pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low'}">${pct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%;"></div>
        </div>
        <span style="font-size:0.75rem;color:var(--text-muted);">${s.correct}/${s.total} correct</span>
      </div>
    `;
  }).join('');
  document.getElementById('topicSummary').innerHTML = topicHtml;

  // Detailed breakdown
  const letters = ['A', 'B', 'C', 'D'];
  const detailHtml = data.results.map((r, i) => `
    <div class="result-item ${r.is_correct ? 'correct' : 'incorrect'}">
      <div class="result-item-top">
        <span><strong>Q${i + 1}:</strong> ${escapeHtml(r.question)}</span>
        <span>${r.is_correct ? '✅' : '❌'}</span>
      </div>
      ${!r.is_correct ? `
        <div style="font-size:0.83rem;margin-top:6px;">
          <span style="color:var(--danger);">Your answer:  <em>${escapeHtml(r.user_answer || 'Not answered')}</em></span><br/>
          <span style="color:var(--success);">Correct answer: <em>${escapeHtml(r.correct_answer)}</em></span>
        </div>
      ` : ''}
      <p class="explanation">💡 ${escapeHtml(r.explanation)}</p>
    </div>
  `).join('');
  document.getElementById('resultsBreakdown').innerHTML = detailHtml;

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────
//  Retake
// ─────────────────────────────────────────────────────────────
function retakeTest() {
  // Reset state
  userAnswers   = {};
  testSubmitted = false;
  timeLeft      = TIMER_SECS;
  clearInterval(timerInterval);

  document.getElementById('resultsScreen').classList.remove('visible');
  document.getElementById('quizScreen').style.display    = 'block';
  document.getElementById('testHeaderBar').style.display = 'flex';
  document.getElementById('submitTestBtn').disabled      = false;
  document.getElementById('submitTestBtn').innerHTML     = '<i class="fas fa-check"></i> Submit Test';
  document.getElementById('aptProgressBar').style.width  = '0%';

  loadQuestions();
}

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────
function escapeHtml(s = '') {
  if (!s) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s)));
  return d.innerHTML;
}
function escapeJs(s) { return s.replace(/'/g, "\\'"); }

function getGradeText(pct) {
  if (pct >= 80) return '🌟 Excellent!';
  if (pct >= 60) return '✅ Good';
  if (pct >= 40) return '⚠️ Average';
  return '❌ Needs Practice';
}
function getGradeColor(pct) {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 60) return '#60A5FA';
  if (pct >= 40) return 'var(--warning)';
  return 'var(--danger)';
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className   = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
