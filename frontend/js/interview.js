/**
 * ============================================================
 *  PlaceMentor AI  –  Interview Page JavaScript
 * ============================================================
 *  Manages the chat-style mock interview flow:
 *    1. Read student name from localStorage
 *    2. Call /api/start-session to begin
 *    3. Display questions as bot messages
 *    4. Send user answers to /api/submit-answer
 *    5. Display AI evaluation results as chat cards
 *    6. Show session summary on completion
 * ============================================================
 */

const API  = '[localhost](http://localhost:5000/api)';    // Backend URL
const chat = document.getElementById('chatMessages');

// State
let sessionId      = null;
let totalQuestions = 0;
let answered       = 0;
let scoreHistory   = [];   // array of { q, score, grade }
let nextQuestion   = null; // queued next question object
let isWaiting      = false;// prevent double-submit

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Populate sidebar with student name
  const name = localStorage.getItem('pm_student_name') || 'Student';
  document.getElementById('sidebarName').textContent   = name;
  document.getElementById('avatarInitial').textContent = name.charAt(0).toUpperCase();
  document.getElementById('infoName').textContent      = name;

  // Start the interview session
  startSession(name);
});

// ─────────────────────────────────────────────────────────────
//  Start Session  (calls backend)
// ─────────────────────────────────────────────────────────────
async function startSession(name) {
  const numQ = parseInt(localStorage.getItem('pm_num_questions') || '5');

  // Display a greeting from the bot
  addBotMessage(`👋 Hello <strong>${name}</strong>! Welcome to your PlaceMentor AI Mock Interview.<br/><br/>I'm going to ask you <strong>${numQ} technical questions</strong>. Type your answers in the box below and hit Submit.<br/><br/>💡 <em>Tip: Use proper technical terms and give structured answers for higher scores.</em>`);

  showTyping();

  try {
    const res  = await fetch(`${API}/start-session`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, num_questions: numQ })
    });
    const data = await res.json();

    removeTyping();

    if (data.error) {
      addBotMessage(`❌ Error: ${data.error}`);
      return;
    }

    // Save session info
    sessionId      = data.session_id;
    totalQuestions = data.total_questions;

    // Update UI
    document.getElementById('infoSessionId').textContent = sessionId;
    updateProgress(0, totalQuestions);

    // Short delay, then ask first question
    setTimeout(() => askQuestion(data.current_question), 600);

  } catch (err) {
    removeTyping();
    addBotMessage(`⚠️ Cannot connect to AI server. Make sure the Flask backend is running on port 5000.<br/><br/><code>cd backend && python app.py</code>`);
    console.error('API error:', err);
  }
}

// ─────────────────────────────────────────────────────────────
//  Ask a Question
// ─────────────────────────────────────────────────────────────
function askQuestion(q) {
  const msg = `
    <div style="margin-bottom:6px;">
      <span style="font-size:0.78rem;color:var(--text-muted);">
        Question ${q.question_number} of ${totalQuestions}
      </span>
      &nbsp;
      <span class="topic-badge">${q.topic}</span>
    </div>
    <strong>${q.question}</strong>
  `;
  addBotMessage(msg);

  // Update sidebar info
  document.getElementById('currentTopic').textContent = q.topic;
  document.getElementById('infoProgress').textContent  = `${q.question_number - 1} / ${totalQuestions}`;

  // Update progress pills
  updateProgress(q.question_number - 1, totalQuestions);

  // Enable input
  enableInput();
}

// ─────────────────────────────────────────────────────────────
//  Submit Answer
// ─────────────────────────────────────────────────────────────
async function submitAnswer() {
  if (isWaiting) return;

  const input  = document.getElementById('answerInput');
  const answer = input.value.trim();

  if (!answer) {
    showToast('Please type an answer before submitting!', 'error');
    return;
  }

  // Show user message in chat
  addUserMessage(answer);
  input.value = '';
  disableInput();
  isWaiting = true;

  // Show typing indicator (evaluating...)
  showTyping('🤖 Evaluating your answer...');

  try {
    const res  = await fetch(`${API}/submit-answer`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ session_id: sessionId, answer })
    });
    const data = await res.json();

    removeTyping();
    isWaiting = false;

    if (data.error) {
      addBotMessage(`❌ ${data.error}`);
      enableInput();
      return;
    }

    const ev = data.evaluation;
    answered++;

    // Track scores
    scoreHistory.push({
      question_number: answered,
      score:           ev.percentage,
      grade:           ev.grade
    });

    // Show score card
    appendScoreCard(ev, data.ideal_answer);

    // Update progress
    updateProgress(answered, totalQuestions);
    updateSidebar(ev);

    // Queue next question or show completion
    if (data.session_completed) {
      setTimeout(showSessionComplete, 800);
    } else {
      nextQuestion = data.next_question;
      showNextBtn();
    }

  } catch (err) {
    removeTyping();
    isWaiting = false;
    addBotMessage('❌ Connection error. Check that the backend is running.');
    enableInput();
  }
}

// ─────────────────────────────────────────────────────────────
//  Show Next Question Button
// ─────────────────────────────────────────────────────────────
function showNextBtn() {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;justify-content:flex-start;margin:8px 0;';
  div.innerHTML = `
    <button class="btn btn-primary" id="nextQBtn" style="font-size:0.88rem;padding:10px 20px;">
      Next Question <i class="fas fa-arrow-right"></i>
    </button>
  `;
  chat.appendChild(div);
  scrollChat();

  document.getElementById('nextQBtn').addEventListener('click', () => {
    div.remove();
    if (nextQuestion) {
      showTyping();
      setTimeout(() => {
        removeTyping();
        askQuestion(nextQuestion);
      }, 600);
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  Session Complete
// ─────────────────────────────────────────────────────────────
function showSessionComplete() {
  const avg   = scoreHistory.reduce((s, x) => s + x.score, 0) / scoreHistory.length;
  const grade = getGradeLabel(avg);

  // Store last score for dashboard
  localStorage.setItem('pm_last_interview_score', avg.toFixed(1));

  addBotMessage(`
    <strong>🎉 Interview Complete!</strong><br/><br/>
    You answered all ${totalQuestions} questions.<br/>
    <strong>Average Score: <span class="${gradeClass(grade)}">${avg.toFixed(1)}%</span></strong><br/>
    <strong>Overall Grade: </strong><span class="badge ${gradeBadgeClass(grade)}">${grade}</span><br/><br/>
    Check your detailed results on the dashboard!
  `);

  setTimeout(() => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;';
    div.innerHTML = `
      <a href="dashboard.html" class="btn btn-primary" style="font-size:0.88rem;padding:10px 20px;">
        <i class="fas fa-chart-bar"></i> View Dashboard
      </a>
      <a href="interview.html" class="btn btn-secondary" style="font-size:0.88rem;padding:10px 20px;" onclick="localStorage.removeItem('pm_session_id')">
        <i class="fas fa-redo"></i> New Session
      </a>
    `;
    chat.appendChild(div);
    scrollChat();
  }, 500);
}

// ─────────────────────────────────────────────────────────────
//  DOM Helpers — Messages
// ─────────────────────────────────────────────────────────────
function addBotMessage(html) {
  const time = getCurrentTime();
  const el   = document.createElement('div');
  el.className = 'message bot';
  el.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div>
      <div class="msg-bubble">${html}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;
  chat.appendChild(el);
  scrollChat();
}

function addUserMessage(text) {
  const time = getCurrentTime();
  const el   = document.createElement('div');
  el.className = 'message user';
  el.innerHTML = `
    <div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${time}</div>
    </div>
    <div class="msg-avatar">👤</div>
  `;
  chat.appendChild(el);
  scrollChat();
}

function appendScoreCard(ev, idealAnswer) {
  const circumference = 2 * Math.PI * 48;  // r=48
  const offset = circumference - (ev.percentage / 100) * circumference;
  const gradClass = gradeBadgeClass(ev.grade);

  const card = document.createElement('div');
  card.className = 'score-card';
  card.innerHTML = `
    <div class="score-card-header">
      <div class="score-ring" style="width:72px;height:72px;">
        <svg viewBox="0 0 110 110" width="72" height="72">
          <defs>
            <linearGradient id="sg2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#7C3AED"/>
              <stop offset="100%" stop-color="#06B6D4"/>
            </linearGradient>
          </defs>
          <circle fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" cx="55" cy="55" r="48"/>
          <circle fill="none" stroke="url(#sg2)" stroke-width="8" stroke-linecap="round"
            cx="55" cy="55" r="48"
            stroke-dasharray="${circumference.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
            style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset 1s ease;"
          />
        </svg>
        <div class="score-number" style="font-size:0.95rem;font-weight:800;">${ev.percentage}%</div>
      </div>
      <span class="badge ${gradClass}" style="font-size:0.85rem;">${ev.grade}</span>
    </div>
    <p class="score-feedback">${ev.feedback}</p>
    <button class="ideal-toggle" onclick="toggleIdeal(this)">
      <i class="fas fa-eye"></i> View Ideal Answer
    </button>
    <div class="ideal-answer-text">
      <strong>📖 Ideal Answer:</strong><br/>
      ${escapeHtml(idealAnswer)}
    </div>
  `;
  chat.appendChild(card);
  scrollChat();
}

function showTyping(text = 'Thinking...') {
  const el = document.createElement('div');
  el.id    = 'typingIndicator';
  el.className = 'message bot typing-indicator';
  el.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
    <span style="font-size:0.8rem;color:var(--text-muted);margin-left:4px;">${text}</span>
  `;
  chat.appendChild(el);
  scrollChat();
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function toggleIdeal(btn) {
  const div = btn.nextElementSibling;
  div.classList.toggle('visible');
  btn.innerHTML = div.classList.contains('visible')
    ? '<i class="fas fa-eye-slash"></i> Hide Ideal Answer'
    : '<i class="fas fa-eye"></i> View Ideal Answer';
}

// ─────────────────────────────────────────────────────────────
//  Progress & Sidebar Updates
// ─────────────────────────────────────────────────────────────
function updateProgress(done, total) {
  document.getElementById('progressText').textContent = `${done}/${total}`;
  const container = document.getElementById('progressPills');
  container.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const pill = document.createElement('div');
    pill.className = 'pill' + (i < done ? ' done' : i === done ? ' current' : '');
    container.appendChild(pill);
  }
}

function updateSidebar(ev) {
  // Update average score
  const avg = scoreHistory.reduce((s, x) => s + x.score, 0) / scoreHistory.length;
  document.getElementById('infoAvgScore').textContent = avg.toFixed(1) + '%';
  document.getElementById('infoProgress').textContent  = `${answered} / ${totalQuestions}`;

  // Add to timeline
  const timeline = document.getElementById('scoreTimeline');
  const dot      = dotColor(ev.grade);
  const item     = document.createElement('div');
  item.className = 'timeline-item';
  item.innerHTML = `
    <div class="timeline-dot" style="background:${dot};"></div>
    <span>Q${answered}: <strong>${ev.percentage}%</strong> – ${ev.grade}</span>
  `;
  timeline.appendChild(item);
}

// ─────────────────────────────────────────────────────────────
//  Input control
// ─────────────────────────────────────────────────────────────
function enableInput() {
  const ta  = document.getElementById('answerInput');
  const btn = document.getElementById('sendBtn');
  ta.disabled  = false;
  btn.disabled = false;
  ta.focus();
}

function disableInput() {
  document.getElementById('answerInput').disabled = true;
  document.getElementById('sendBtn').disabled     = true;
}

// Allow Enter to submit, Shift+Enter for newline
document.getElementById('answerInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitAnswer();
  }
});

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────
function scrollChat()    { chat.scrollTop = chat.scrollHeight; }
function getCurrentTime(){ return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function escapeHtml(s)   { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

function getGradeLabel(pct) {
  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Good';
  if (pct >= 50) return 'Partial';
  return 'Needs Improvement';
}

function gradeBadgeClass(grade) {
  const map = { 'Excellent':'badge-excellent', 'Good':'badge-good', 'Partial':'badge-partial', 'Needs Improvement':'badge-needs' };
  return map[grade] || 'badge-needs';
}
function gradeClass(grade) {
  const map = { 'Excellent':'', 'Good':'', 'Partial':'', 'Needs Improvement':'' };
  return '';
}
function dotColor(grade) {
  const map = { 'Excellent':'#10B981', 'Good':'#3B82F6', 'Partial':'#F59E0B', 'Needs Improvement':'#EF4444' };
  return map[grade] || '#6B7280';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
