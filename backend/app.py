"""
=============================================================
  PlaceMentor AI  ──  Flask Backend API
=============================================================
  Routes:
      POST /api/start-session          → Begin interview session
      POST /api/submit-answer          → Submit and evaluate answer
      GET  /api/session-results/<id>   → Get interview results
      GET  /api/aptitude/questions     → Fetch MCQ questions
      POST /api/aptitude/submit        → Submit aptitude answers
      GET  /api/dashboard/<name>       → Get student dashboard data
      GET  /api/health                 → Health check
=============================================================
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json, os, random, uuid
from datetime import datetime
from evaluator import evaluate_answer

# ─────────────────────────────────────────────────────────────
#  App initialisation
# ─────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)   # Allow frontend (different port) to call this API

BASE_DIR           = os.path.dirname(os.path.abspath(__file__))
QUESTION_BANK_PATH = os.path.join(BASE_DIR, "question_bank.json")
SESSIONS_PATH      = os.path.join(BASE_DIR, "sessions.json")


# ─────────────────────────────────────────────────────────────
#  Utility helpers
# ─────────────────────────────────────────────────────────────

def load_qb() -> dict:
    """Load the question bank from JSON file."""
    with open(QUESTION_BANK_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_sessions() -> dict:
    """Load all stored sessions."""
    if os.path.exists(SESSIONS_PATH):
        with open(SESSIONS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_sessions(sessions: dict) -> None:
    """Persist sessions to disk."""
    with open(SESSIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2)


def get_grade(score: float) -> str:
    """Convert a 0–1 score to a grade label."""
    if score >= 0.90: return "Excellent"
    if score >= 0.75: return "Good"
    if score >= 0.50: return "Partial"
    return "Needs Improvement"


# ─────────────────────────────────────────────────────────────
#  INTERVIEW ROUTES
# ─────────────────────────────────────────────────────────────

@app.route("/api/start-session", methods=["POST"])
def start_session():
    """
    Create a new interview session.
    Randomly picks questions from the question bank.

    Request body:
        { "name": "Alice", "num_questions": 5 }

    Response:
        session_id, student_name, first question details
    """
    data          = request.get_json() or {}
    student_name  = data.get("name", "Student").strip()
    num_questions = int(data.get("num_questions", 5))

    # Pick random questions
    qb            = load_qb()
    all_questions = qb["interview_questions"]
    selected      = random.sample(all_questions, min(num_questions, len(all_questions)))

    # Build session object
    session_id = str(uuid.uuid4())[:10]
    sessions   = load_sessions()

    sessions[session_id] = {
        "student_name":    student_name,
        "type":            "interview",
        "questions":       selected,
        "answers":         [],
        "scores":          [],
        "current_index":   0,
        "start_time":      datetime.now().isoformat(),
        "completed":       False
    }
    save_sessions(sessions)

    first_q = selected[0]
    return jsonify({
        "success":         True,
        "session_id":      session_id,
        "student_name":    student_name,
        "total_questions": len(selected),
        "current_question": {
            "id":              first_q["id"],
            "question":        first_q["question"],
            "topic":           first_q["topic"],
            "question_number": 1
        }
    })


@app.route("/api/submit-answer", methods=["POST"])
def submit_answer():
    """
    Receive a student answer, run NLP evaluation, return
    score + feedback + next question (if more remain).

    Request body:
        { "session_id": "abc123", "answer": "user text here" }
    """
    data       = request.get_json() or {}
    session_id = data.get("session_id", "")
    user_ans   = data.get("answer", "").strip()

    sessions = load_sessions()

    # Validate session
    if session_id not in sessions:
        return jsonify({"error": "Session not found. Please restart."}), 404

    session   = sessions[session_id]
    idx       = session["current_index"]
    current_q = session["questions"][idx]

    # ── AI Evaluation ──────────────────────────────────────
    evaluation = evaluate_answer(user_ans, current_q["ideal_answer"])

    # Store result in session
    session["answers"].append({
        "question_id":  current_q["id"],
        "question":     current_q["question"],
        "topic":        current_q["topic"],
        "user_answer":  user_ans,
        "ideal_answer": current_q["ideal_answer"],
        "score":        evaluation["score"],
        "percentage":   evaluation["percentage"],
        "grade":        evaluation["grade"],
        "feedback":     evaluation["feedback"]
    })
    session["scores"].append(evaluation["score"])
    session["current_index"] += 1

    # Determine if there is a next question
    next_question     = None
    session_completed = False

    if session["current_index"] < len(session["questions"]):
        nq = session["questions"][session["current_index"]]
        next_question = {
            "id":              nq["id"],
            "question":        nq["question"],
            "topic":           nq["topic"],
            "question_number": session["current_index"] + 1
        }
    else:
        session["completed"] = True
        session["end_time"]  = datetime.now().isoformat()
        session_completed    = True

    save_sessions(sessions)

    return jsonify({
        "success":           True,
        "evaluation":        evaluation,
        "ideal_answer":      current_q["ideal_answer"],
        "next_question":     next_question,
        "session_completed": session_completed,
        "progress": {
            "answered": session["current_index"],
            "total":    len(session["questions"])
        }
    })


@app.route("/api/session-results/<session_id>", methods=["GET"])
def session_results(session_id):
    """Return full results for a completed interview session."""
    sessions = load_sessions()

    if session_id not in sessions:
        return jsonify({"error": "Session not found"}), 404

    session    = sessions[session_id]
    scores     = session.get("scores", [])
    avg_score  = sum(scores) / len(scores) if scores else 0

    # Build topic-wise performance summary
    topic_map = {}
    for ans in session.get("answers", []):
        t = ans["topic"]
        topic_map.setdefault(t, []).append(ans["score"])

    topic_performance = {
        t: round(sum(s) / len(s) * 100, 1)
        for t, s in topic_map.items()
    }

    return jsonify({
        "student_name":      session["student_name"],
        "session_id":        session_id,
        "total_questions":   len(session["questions"]),
        "average_score":     round(avg_score * 100, 1),
        "overall_grade":     get_grade(avg_score),
        "topic_performance": topic_performance,
        "answers_detail":    session.get("answers", []),
        "start_time":        session.get("start_time", ""),
        "end_time":          session.get("end_time", "")
    })


# ─────────────────────────────────────────────────────────────
#  APTITUDE ROUTES
# ─────────────────────────────────────────────────────────────

@app.route("/api/aptitude/questions", methods=["GET"])
def get_aptitude_questions():
    """
    Return random MCQ questions WITHOUT correct answers.
    Frontend displays them; answers are verified on submit.
    """
    count = request.args.get("count", 10, type=int)
    qb    = load_qb()
    all_q = qb.get("aptitude_questions", [])

    selected = random.sample(all_q, min(count, len(all_q)))

    # Strip answers before sending to client
    sanitized = [
        {
            "id":       q["id"],
            "question": q["question"],
            "options":  q["options"],
            "topic":    q.get("topic", "General")
        }
        for q in selected
    ]

    return jsonify({"questions": sanitized, "total": len(sanitized)})


@app.route("/api/aptitude/submit", methods=["POST"])
def submit_aptitude():
    """
    Receive student's MCQ answers, grade them, return results.

    Request body:
        {
            "student_name": "Alice",
            "answers": { "1": "36", "2": "Lazzies", ... },
            "time_taken": 240
        }
    """
    data         = request.get_json() or {}
    student_name = data.get("student_name", "Student")
    user_answers = data.get("answers", {})     # { "q_id": "chosen_option" }
    time_taken   = data.get("time_taken", 0)

    # Build answer key lookup
    qb         = load_qb()
    answer_key = {str(q["id"]): q for q in qb["aptitude_questions"]}

    correct_count = 0
    results       = []

    for q_id, chosen in user_answers.items():
        q_data = answer_key.get(q_id)
        if not q_data:
            continue
        is_correct = (chosen == q_data["correct_answer"])
        if is_correct:
            correct_count += 1
        results.append({
            "question_id":    int(q_id),
            "question":       q_data["question"],
            "topic":          q_data.get("topic", "General"),
            "user_answer":    chosen,
            "correct_answer": q_data["correct_answer"],
            "explanation":    q_data.get("explanation", ""),
            "is_correct":     is_correct
        })

    total    = len(user_answers)
    accuracy = round((correct_count / total) * 100, 1) if total > 0 else 0.0

    # Persist aptitude session
    session_id         = f"apt_{str(uuid.uuid4())[:8]}"
    sessions           = load_sessions()
    sessions[session_id] = {
        "student_name": student_name,
        "type":         "aptitude",
        "correct":      correct_count,
        "total":        total,
        "accuracy":     accuracy,
        "time_taken":   time_taken,
        "results":      results,
        "date":         datetime.now().isoformat()
    }
    save_sessions(sessions)

    return jsonify({
        "success":    True,
        "session_id": session_id,
        "correct":    correct_count,
        "total":      total,
        "accuracy":   accuracy,
        "time_taken": time_taken,
        "results":    results
    })


# ─────────────────────────────────────────────────────────────
#  DASHBOARD ROUTE
# ─────────────────────────────────────────────────────────────

@app.route("/api/dashboard/<student_name>", methods=["GET"])
def get_dashboard(student_name: str):
    """
    Aggregate all session data for a student and return
    statistics for the dashboard.
    """
    sessions = load_sessions()
    name_lc  = student_name.lower()

    # Filter by student and type
    interview_sessions = [
        s for s in sessions.values()
        if s.get("student_name", "").lower() == name_lc
        and s.get("type") == "interview"
        and s.get("completed", False)
    ]
    aptitude_sessions = [
        s for s in sessions.values()
        if s.get("student_name", "").lower() == name_lc
        and s.get("type") == "aptitude"
    ]

    # ── Interview analytics ──────────────────────────────────
    interview_avg_scores = []
    topic_map            = {}
    recent_interviews    = []

    for s in interview_sessions:
        avg = sum(s["scores"]) / len(s["scores"]) if s["scores"] else 0
        interview_avg_scores.append(avg)
        recent_interviews.append({
            "date":      s.get("start_time", "")[:10],
            "score":     round(avg * 100, 1),
            "questions": len(s["scores"]),
            "grade":     get_grade(avg)
        })
        for ans in s.get("answers", []):
            t = ans["topic"]
            topic_map.setdefault(t, []).append(ans["score"])

    topic_performance = {
        t: round(sum(sc) / len(sc) * 100, 1)
        for t, sc in topic_map.items()
    }
    weak_topics = [t for t, s in topic_performance.items() if s < 60]
    avg_interview_pct = (
        round(sum(interview_avg_scores) / len(interview_avg_scores) * 100, 1)
        if interview_avg_scores else 0
    )

    # ── Aptitude analytics ───────────────────────────────────
    apt_accuracies = [s["accuracy"] for s in aptitude_sessions]
    avg_aptitude   = (
        round(sum(apt_accuracies) / len(apt_accuracies), 1)
        if apt_accuracies else 0
    )

    # ── Overall readiness (60% interview + 40% aptitude) ─────
    overall_readiness = round(avg_interview_pct * 0.6 + avg_aptitude * 0.4, 1)

    return jsonify({
        "student_name":      student_name,
        "overall_readiness": overall_readiness,
        "interview": {
            "sessions_count":    len(interview_sessions),
            "average_score":     avg_interview_pct,
            "topic_performance": topic_performance,
            "weak_topics":       weak_topics,
            "recent_sessions":   recent_interviews[-5:]
        },
        "aptitude": {
            "sessions_count":  len(aptitude_sessions),
            "average_accuracy": avg_aptitude,
            "recent_scores":   apt_accuracies[-5:]
        }
    })


# ─────────────────────────────────────────────────────────────
#  HEALTH CHECK
# ─────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "PlaceMentor AI is running! 🚀"})


# ─────────────────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  🚀  PlaceMentor AI  –  Backend Started")
    print("  📡  API running at [localhost](http://localhost:5000)")
    print("=" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)

