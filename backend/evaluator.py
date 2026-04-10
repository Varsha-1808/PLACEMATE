"""
=============================================================
  PlaceMentor AI  ──  NLP Answer Evaluation Module
=============================================================
  Uses HuggingFace sentence-transformers to generate semantic
  embeddings and cosine similarity to score student answers.

  Model : all-MiniLM-L6-v2  (lightweight, fast, accurate)
  Score ranges:
      0.90 – 1.00 → Excellent
      0.75 – 0.89 → Good
      0.50 – 0.74 → Partial
      0.00 – 0.49 → Needs Improvement
=============================================================
"""

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# ─────────────────────────────────────────────────────────────
#  Load the model ONCE when the module is imported.
#  This prevents reloading the model on every API call.
# ─────────────────────────────────────────────────────────────
print("🤖 Loading NLP model: all-MiniLM-L6-v2...")
print("   (First-time download may take a few minutes)")

try:
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print("✅ Model loaded successfully!\n")
    MODEL_AVAILABLE = True
except Exception as e:
    print(f"⚠️  Model load failed: {e}")
    print("   Falling back to keyword-overlap scoring.\n")
    model = None
    MODEL_AVAILABLE = False


# ─────────────────────────────────────────────────────────────
#  FALLBACK: Simple keyword overlap when model is unavailable
# ─────────────────────────────────────────────────────────────
def _keyword_overlap_score(user_answer: str, ideal_answer: str) -> float:
    """
    Basic word-overlap similarity as a fallback.
    Not as accurate as semantic similarity but works offline.
    """
    stop_words = {
        "a", "an", "the", "is", "are", "was", "were", "in", "on",
        "at", "to", "for", "of", "and", "or", "but", "it", "this",
        "that", "be", "with", "as", "by", "from", "not", "can", "will"
    }
    user_words  = set(user_answer.lower().split()) - stop_words
    ideal_words = set(ideal_answer.lower().split()) - stop_words

    if not ideal_words:
        return 0.0

    overlap = user_words & ideal_words
    return len(overlap) / len(ideal_words)


# ─────────────────────────────────────────────────────────────
#  MAIN EVALUATION FUNCTION
# ─────────────────────────────────────────────────────────────
def evaluate_answer(user_answer: str, ideal_answer: str) -> dict:
    """
    Evaluate a student's answer against the ideal answer.

    Parameters
    ----------
    user_answer  : str  — The answer typed by the student
    ideal_answer : str  — The reference answer from question_bank.json

    Returns
    -------
    dict with keys:
        score      (float 0–1)
        percentage (float 0–100)
        grade      (str)
        feedback   (str)
    """

    # ── Handle blank submissions ──────────────────────────────
    if not user_answer or not user_answer.strip():
        return {
            "score": 0.0,
            "percentage": 0.0,
            "grade": "Needs Improvement",
            "feedback": (
                "⚠️ No answer provided. Please type your answer "
                "before submitting!"
            )
        }

    # ── Semantic similarity (primary method) ─────────────────
    if MODEL_AVAILABLE and model is not None:
        # Encode both answers into 384-dimensional vectors
        embeddings = model.encode([
            user_answer.strip(),
            ideal_answer.strip()
        ])

        # Cosine similarity: measures angle between two vectors
        # Returns a 1×1 matrix; we extract the scalar value
        sim_matrix = cosine_similarity(
            embeddings[0].reshape(1, -1),
            embeddings[1].reshape(1, -1)
        )
        score = float(sim_matrix[0][0])

    else:
        # ── Keyword overlap fallback ──────────────────────────
        score = _keyword_overlap_score(user_answer, ideal_answer)

    # Clamp score to valid range [0, 1]
    score = max(0.0, min(1.0, score))
    percentage = round(score * 100, 1)

    # ── Determine grade and personalised feedback ─────────────
    if score >= 0.90:
        grade    = "Excellent"
        feedback = (
            "🌟 Excellent! Your answer closely matches the ideal response. "
            "You have a strong grasp of this topic. Keep it up!"
        )
    elif score >= 0.75:
        grade    = "Good"
        feedback = (
            "✅ Good answer! You covered most of the key concepts. "
            "Adding more specific examples or elaboration would make "
            "your response even stronger."
        )
    elif score >= 0.50:
        grade    = "Partial"
        feedback = (
            "⚠️ Partial answer. You're on the right track but missed "
            "some important concepts. Review this topic carefully and "
            "focus on key definitions and examples."
        )
    else:
        grade    = "Needs Improvement"
        feedback = (
            "❌ Needs Improvement. Your answer doesn't capture the "
            "expected concepts. Please revisit this topic thoroughly "
            "using your notes or textbook."
        )

    return {
        "score":      round(score, 4),
        "percentage": percentage,
        "grade":      grade,
        "feedback":   feedback
    }
