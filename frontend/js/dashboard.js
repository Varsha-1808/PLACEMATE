/*
  ============================================================
   PlaceMentor AI  –  Dashboard Page JavaScript
  ============================================================
   Fetches all session data for the current student and
   populates:
     - Readiness score ring
     - Stat cards
     - Topic performance bars
     - Weak topics list
     - Recent sessions table
     - Line chart (score progression)
     - Radar chart (topic performance)
  ============================================================
*/

const API = 'http://localhost:5000/api';

let scoreChartInstance = null;
let topicChartInstance = null;

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const name = localStorage.getItem('pmstudentname') || 'Student';
  document.getElementById('sidebarName').textContent   = name;
  document.getElementById('avatarInitial').textContent = name.charAt(0).toUpperCase();

  loadDashboard(name);
});

// ─────────────────────────────────────────────────────────────
//  Load dashboard data from API
// ─────────────────────────────────────────────────────────────
async function loadDashboard(name) {
  try {
    const res = await fetch(`${API}/dashboard/${encodeURIComponent(name)}`);

    if (res.status === 404) {
      showEmptyState(name);
      return;
    }

    const data = await res.json();
    if (data.error) { showEmptyState(name); return; }

    renderDashboard(data, name);

  } catch (err) {
    console.error('Dashboard load error:', err);
    showEmptyState(name);
  }
}

// ─────────────────────────────────────────────────────────────
//  Empty State (no sessions yet)
// ─────────────────────────────────────────────────────────────
function showEmptyState(name) {
  document.getElementById('dashSubtitle').textContent =
    `Welcome, ${name}! Complete an interview or aptitude test to see your stats here.`;

  // Zero out stat cards
  ['statInterviewSessions','statAptitudeSessions'].forEach(id => {
    document.getElementById(id).textContent = '0';
  });
  document.getElementById('statAvgInterview').textContent = '0%';
  document.getElementById('statAvgAptitude').textContent  = '0%';

  document.getElementById('readinessScore').textContent = '0';
  document.getElementById('readinessDesc').textContent  =
    'No sessions recorded yet. Start a mock interview or aptitude test to build your profile!';

  setValue('interviewPct', '0%');
  setValue('aptitudePct',  '0%');

  document.getElementById('topicPerformanceList').innerHTML =
    '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet. Complete an interview session first.</p>';

  document.getElementById('weakTopicsList').innerHTML =
    '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet.</p>';

  document.getElementById('recentSessionsTable').innerHTML =
    `<div class="no-data">
      <i class="fas fa-inbox"></i>
      <p>No sessions yet. <a href="interview.html">Start your first mock interview!</a></p>
    </div>`;

  // Render empty charts
  renderScoreChart([]);
  renderTopicChart({});
}

// ─────────────────────────────────────────────────────────────
//  Render full dashboard
// ─────────────────────────────────────────────────────────────
function renderDashboard(data, name) {
  const iv  = data.interview;
  const apt = data.aptitude;

  document.getElementById('dashSubtitle').textContent =
    `Welcome back, ${name}! Here's your placement readiness overview.`;

  // ── Readiness ring ────────────────────────────────────
  const readiness = data.overallreadiness;
  animateCounter('readinessScore', readiness);
  setRing('readinessRingFill', readiness);

  document.getElementById('readinessDesc').textContent =
    getReadinessMessage(readiness);

  setValue('interviewPct', iv.averagescore + '%');
  animateBar('interviewBar', iv.averagescore);
  setValue('aptitudePct', apt.averageaccuracy + '%');
  animateBar('aptitudeBar', apt.averageaccuracy);

  // ── Stat cards ────────────────────────────────────────
  animateCounter('statInterviewSessions', iv.sessionscount);
  animateCounter('statAptitudeSessions',  apt.sessionscount);
  document.getElementById('statAvgInterview').textContent = iv.averagescore + '%';
  document.getElementById('statAvgAptitude').textContent  = apt.averageaccuracy + '%';

  // ── Topic performance bars ────────────────────────────
  renderTopicBars(iv.topicperformance);

  // ── Weak topics ───────────────────────────────────────
  renderWeakTopics(iv.weaktopics);

  // ── Recent sessions ───────────────────────────────────
  renderRecentSessions(iv.recentsessions);

  // ── Charts ────────────────────────────────────────────
  renderScoreChart(iv.recentsessions);
  renderTopicChart(iv.topicperformance);
}

// ─────────────────────────────────────────────────────────────
//  Topic Performance Bars
// ─────────────────────────────────────────────────────────────
function renderTopicBars(topicPerf) {
  const el = document.getElementById('topicPerformanceList');

  if (!topicPerf || Object.keys(topicPerf).length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No topic data yet. Complete an interview session.</p>';
    return;
  }

  el.innerHTML = Object.entries(topicPerf)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, score]) => {
      const cls = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
      return `
        <div class="topic-item">
          <div class="topic-header">
            <span class="topic-name">${topic}</span>
            <span class="topic-score ${cls}">${score}%</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${score}%"></div>
          </div>
        </div>
      `;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
//  Weak Topics
// ─────────────────────────────────────────────────────────────
function renderWeakTopics(weakTopics) {
  const el = document.getElementById('weakTopicsList');
  if (!weakTopics || weakTopics.length === 0) {
    el.innerHTML = '<span style="color:var(--success);font-size:0.88rem;">✅ No weak topics! Great performance across all areas.</span>';
    return;
  }
  el.innerHTML = weakTopics.map(t =>
    `<span class="weak-tag"><i class="fas fa-exclamation-triangle" style="font-size:0.7rem;"></i> ${t}</span>`
  ).join('');
}

// ─────────────────────────────────────────────────────────────
//  Recent Sessions Table
// ─────────────────────────────────────────────────────────────
function renderRecentSessions(sessions) {
  const el = document.getElementById('recentSessionsTable');
  if (!sessions || sessions.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No sessions recorded yet.</p>';
    return;
  }

  const rows = [...sessions].reverse().map(s => {
    const badgeClass = gradeBadgeClass(s.grade);
    return `
      <tr>
        <td>${s.date || 'N/A'}</td>
        <td>${s.questions} Qs</td>
        <td><strong>${s.score}%</strong></td>
        <td><span class="badge ${badgeClass}">${s.grade}</span></td>
      </tr>
    `;
  }).join('');

  el.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Questions</th>
          <th>Score</th>
          <th>Grade</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─────────────────────────────────────────────────────────────
//  Score Line Chart (Chart.js)
// ─────────────────────────────────────────────────────────────
function renderScoreChart(sessions) {
  const ctx = document.getElementById('scoreChart');
  if (!ctx) return;

  if (scoreChartInstance) scoreChartInstance.destroy();

  if (!sessions || sessions.length === 0) {
    ctx.parentElement.innerHTML +=
      '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin-top:8px;">Complete sessions to see score progression.</p>';
    return;
  }

  const labels = sessions.map((s, i) => `Session ${i + 1}`);
  const scores = sessions.map(s => s.score);

  scoreChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:                'Interview Score (%)',
        data:                 scores,
        borderColor:          '#7C3AED',
        backgroundColor:      'rgba(124,58,237,0.1)',
        fill:                 true,
        tension:              0.4,
        pointBackgroundColor: '#7C3AED',
        pointRadius:          5,
        pointHoverRadius:     7
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#E2E8F0', font: { size: 12 } } }
      },
      scales: {
        x: { ticks: { color: '#8892B0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#8892B0' },
          grid:  { color: 'rgba(255,255,255,0.05)' },
          min: 0, max: 100
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  Topic Radar Chart (Chart.js)
// ─────────────────────────────────────────────────────────────
function renderTopicChart(topicPerf) {
  const ctx = document.getElementById('topicChart');
  if (!ctx) return;

  if (topicChartInstance) topicChartInstance.destroy();

  if (!topicPerf || Object.keys(topicPerf).length === 0) {
    ctx.parentElement.innerHTML +=
      '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;margin-top:8px;">Complete interviews to see topic performance chart.</p>';
    return;
  }

  const labels = Object.keys(topicPerf);
  const values = Object.values(topicPerf);

  topicChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label:           'Score (%)',
        data:            values,
        borderColor:     '#7C3AED',
        backgroundColor: 'rgba(124,58,237,0.2)',
        pointBackgroundColor: '#06B6D4',
        pointRadius:     5,
        borderWidth:     2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#E2E8F0', font: { size: 12 } } }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks:    { color: '#8892B0', backdropColor: 'transparent', stepSize: 20 },
          grid:     { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { color: '#E2E8F0', font: { size: 11 } }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  Animated Counter
// ─────────────────────────────────────────────────────────────
function animateCounter(id, target) {
  const el    = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step  = Math.max(1, Math.ceil(target / 60));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 16);
}

// ─────────────────────────────────────────────────────────────
//  Animate Progress Bar
// ─────────────────────────────────────────────────────────────
function animateBar(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  setTimeout(() => { el.style.width = pct + '%'; }, 100);
}

// ─────────────────────────────────────────────────────────────
//  Set Ring (SVG stroke-dashoffset)
// ─────────────────────────────────────────────────────────────
function setRing(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const circumference = 2 * Math.PI * 50;  // r=50 matches dashboard.html SVG
  const offset = circumference - (pct / 100) * circumference;
  setTimeout(() => { el.style.strokeDashoffset = offset.toFixed(1); }, 150);
}

// ─────────────────────────────────────────────────────────────
//  Set Element Value
// ─────────────────────────────────────────────────────────────
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─────────────────────────────────────────────────────────────
//  Readiness Message
// ─────────────────────────────────────────────────────────────
function getReadinessMessage(score) {
  if (score >= 85) return '🌟 Excellent! You are highly prepared for placements. Keep it up!';
  if (score >= 70) return '✅ Good progress! A bit more practice will make you placement-ready.';
  if (score >= 50) return '⚠️ You\'re on the right track. Focus on weak topics and practice regularly.';
  return '❌ Keep practising! Complete more sessions to improve your readiness score.';
}

// ─────────────────────────────────────────────────────────────
//  Grade Badge CSS Class
// ─────────────────────────────────────────────────────────────
function gradeBadgeClass(grade) {
  const map = {
    'Excellent':         'badge-excellent',
    'Good':              'badge-good',
    'Partial':           'badge-partial',
    'Needs Improvement': 'badge-needs'
  };
  return map[grade] || 'badge-needs';
}

// ─────────────────────────────────────────────────────────────
//  Sidebar toggle (mobile)
// ─────────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}