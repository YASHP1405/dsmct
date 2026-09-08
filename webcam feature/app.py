"""
DSMCT — Student Mood & Stress Tracker
Flask Backend with Groq Vision API for Facial Emotion Detection
"""

import os
import base64
import json
import uuid
import random
from datetime import datetime, timedelta

from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dsmct_dev_secret")
CORS(app)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ---------------------------------------------------------------------------
# In-memory mood store  { session_id: [ mood_entry, ... ] }
# ---------------------------------------------------------------------------

mood_store: dict[str, list] = {}

EMOTION_STRESS_MAP = {
    "happy":    1,
    "calm":     2,
    "neutral":  3,
    "focused":  4,
    "confused": 5,
    "tired":    6,
    "sad":      6,
    "worried":  7,
    "anxious":  8,
    "stressed": 9,
    "fearful":  9,
    "angry":   10,
}

# Fallback emotions used when Groq API is unavailable
FALLBACK_EMOTIONS = [
    {"emotion": "focused",  "stress_score": 4, "note": "Student appears focused and engaged."},
    {"emotion": "neutral",  "stress_score": 3, "note": "Student looks calm and composed."},
    {"emotion": "anxious",  "stress_score": 7, "note": "Student seems slightly anxious. Take a deep breath!"},
    {"emotion": "confused", "stress_score": 5, "note": "Student looks a little confused — re-read the question."},
    {"emotion": "stressed", "stress_score": 8, "note": "Student appears stressed. Try to relax and pace yourself."},
    {"emotion": "calm",     "stress_score": 2, "note": "Student is very calm. Great composure!"},
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_session_id() -> str:
    """Create or retrieve a unique session ID stored in Flask session."""
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]


def analyze_face_with_groq(image_b64: str) -> dict:
    """
    Send a base64 image to Groq Vision (Llama-4-Scout) and ask it
    to detect the student's emotional state and stress level.
    Falls back to a simulated reading if the API key is invalid/expired.
    """
    system_prompt = (
        "You are an expert psychologist and facial emotion analyst. "
        "You are observing a student taking an online quiz. "
        "Analyse the student's facial expression and return ONLY a valid JSON object with these keys:\n"
        "  emotion   - one word (e.g. calm, focused, anxious, stressed, confused, tired, neutral, happy, sad, worried, fearful, angry)\n"
        "  stress_score - integer from 1 (very relaxed) to 10 (extremely stressed)\n"
        "  note      - a one-sentence supportive observation about the student\n"
        "If no face is visible return: {\"emotion\":\"unknown\",\"stress_score\":0,\"note\":\"No face detected\"}\n"
        "Return ONLY the JSON, no markdown, no extra text."
    )

    try:
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            },
                        },
                        {
                            "type": "text",
                            "text": system_prompt,
                        },
                    ],
                }
            ],
            max_tokens=200,
            temperature=0.2,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown fences if model wrapped in ```json ... ```
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw)
        result["stress_score"] = int(result.get("stress_score", 0))
        result["source"] = "groq"
        return result

    except Exception as api_err:
        # API key expired / quota hit — use a simulated fallback reading
        app.logger.warning(f"Groq API unavailable ({api_err}), using mock emotion.")
        mock = random.choice(FALLBACK_EMOTIONS).copy()
        mock["source"] = "mock"
        return mock


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Landing / home page."""
    return render_template("index.html")


@app.route("/quiz")
def quiz():
    """Quiz page with camera and proctoring."""
    # Ensure session ID is created
    get_session_id()
    return render_template("facedetect.html")


@app.route("/report")
def report():
    """Analytics & mood report page."""
    sid = get_session_id()
    entries = mood_store.get(sid, [])
    return render_template("report.html", entries=entries, session_id=sid)


@app.route("/checkin")
def checkin():
    """Daily conversational mood check-in page."""
    get_session_id()
    return render_template("checkin.html")


# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------

# Default mood-based questions used as fallback (also used when Groq unavailable)
DEFAULT_MOOD_QUESTIONS = [
    {
        "type": "mcq",
        "question": "How are you feeling about this assessment right now?",
        "options": ["Confident 💪", "A bit nervous 😰", "Neutral 😐", "Overwhelmed 😫"],
        "answer": "",
        "mood_tag": "confidence"
    },
    {
        "type": "mcq",
        "question": "How well did you prepare for today's assessment?",
        "options": ["Very well prepared ✅", "Adequately prepared 🙂", "Somewhat prepared 😕", "Not enough time 😓"],
        "answer": "",
        "mood_tag": "preparation"
    },
    {
        "type": "mcq",
        "question": "Right now, I am feeling most...",
        "options": ["Focused 🎯", "Distracted 🌀", "Tired 😴", "Anxious 😬"],
        "answer": "",
        "mood_tag": "current_state"
    },
    {
        "type": "mcq",
        "question": "This level of difficulty feels...",
        "options": ["Very manageable 😊", "Just right 👍", "A little hard 😤", "Too difficult 😵"],
        "answer": "",
        "mood_tag": "difficulty"
    },
    {
        "type": "text",
        "question": "In one sentence, describe what's going through your mind right now.",
        "answer": "",
        "mood_tag": "open_reflection"
    },
]


@app.route("/get-questions", methods=["GET"])
def get_questions():
    """
    Returns mood-adaptive assessment questions based on current session emotion.
    If Groq is available and there's face data, generates contextual questions.
    Otherwise returns the default mood question set.
    """
    sid     = get_session_id()
    entries = mood_store.get(sid, [])

    # Get dominant detected emotion from camera (if quiz run previously)
    groq_entries = [e for e in entries if e.get("source") == "groq" and e.get("emotion")]
    detected_emotion = "neutral"
    if groq_entries:
        from collections import Counter
        counts = Counter(e["emotion"] for e in groq_entries)
        detected_emotion = counts.most_common(1)[0][0]

    # Try to generate AI-tailored questions based on detected emotion
    try:
        prompt = (
            f"A student is taking an online assessment. Their camera detected they look '{detected_emotion}'. "
            f"Generate 5 assessment check-in questions to understand their current mood and wellbeing. "
            f"Mix MCQ (4 options each) and 1 text/open question. "
            f"Questions should relate to their emotional state, confidence, focus, stress, and self-reflection. "
            f"Return ONLY a valid JSON array. Each item must have: "
            f"type ('mcq' or 'text'), question (string), options (array of strings, empty for text type), "
            f"answer (empty string), mood_tag (short snake_case label). "
            f"Make questions warm, non-judgmental, and student-friendly."
        )

        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a student wellness quiz designer. Return only valid JSON arrays."},
                {"role": "user",   "content": prompt}
            ],
            max_tokens=700,
            temperature=0.6,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        questions = json.loads(raw)

        # Validate structure — must be a list with at least 3 items
        if not isinstance(questions, list) or len(questions) < 3:
            raise ValueError("Invalid question format from AI")

        # Ensure every item has required keys
        for q in questions:
            q.setdefault("options", [])
            q.setdefault("answer",  "")
            q.setdefault("mood_tag", "general")

        return jsonify({"questions": questions, "source": "groq", "detected_emotion": detected_emotion})

    except Exception as exc:
        app.logger.warning(f"Question generation failed ({exc}), using defaults.")
        return jsonify({"questions": DEFAULT_MOOD_QUESTIONS, "source": "default", "detected_emotion": detected_emotion})


@app.route("/analyze-emotion", methods=["POST"])
def analyze_emotion():
    """
    POST { "image": "<base64 JPEG string>" }
    Returns { emotion, stress_score, note, timestamp }
    """
    data = request.get_json(force=True)
    image_b64 = data.get("image", "")

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    # Strip data-URL prefix if frontend sent it that way
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    # analyze_face_with_groq never raises — it falls back to mock internally
    result = analyze_face_with_groq(image_b64)

    result["timestamp"] = datetime.now().isoformat()
    result["question_index"] = data.get("question_index", 0)

    # Log to session store
    sid = get_session_id()
    mood_store.setdefault(sid, []).append(result)

    return jsonify(result)


@app.route("/log-mood", methods=["POST"])
def log_mood():
    """
    Manually log a mood entry (from quiz answer submissions).
    POST { emotion, stress_score, note, question_index }
    """
    data = request.get_json(force=True)
    sid = get_session_id()

    entry = {
        "emotion":       data.get("emotion", "neutral"),
        "stress_score":  int(data.get("stress_score", 5)),
        "note":          data.get("note", ""),
        "timestamp":     datetime.now().isoformat(),
        "question_index": data.get("question_index", 0),
    }

    mood_store.setdefault(sid, []).append(entry)
    return jsonify({"status": "logged", "total": len(mood_store[sid])})


@app.route("/session-report", methods=["GET"])
def session_report():
    """
    Returns full mood log for the current session as JSON.
    Used by the report page to build charts.
    """
    sid = get_session_id()
    entries = mood_store.get(sid, [])

    # ── If no real data yet, generate demo data so the report is always visible ──
    if not entries:
        demo_emotions = ["focused", "calm", "anxious", "neutral", "stressed",
                         "confused", "focused", "worried", "calm", "neutral"]
        base_time = datetime.now() - timedelta(minutes=10)
        for i, em in enumerate(demo_emotions):
            entries.append({
                "emotion":        em,
                "stress_score":   EMOTION_STRESS_MAP.get(em, 5),
                "note":           f"Demo reading — {em} detected during Q{(i % 5) + 1}.",
                "timestamp":      (base_time + timedelta(seconds=i * 30)).isoformat(),
                "question_index": i % 5,
                "source":         "demo",
            })
        mood_store[sid] = entries          # cache so next call reuses same demo set

    scores = [e["stress_score"] for e in entries if e["stress_score"] > 0]
    emotions_count: dict[str, int] = {}
    for e in entries:
        em = e.get("emotion", "unknown")
        emotions_count[em] = emotions_count.get(em, 0) + 1

    dominant = max(emotions_count, key=emotions_count.get) if emotions_count else "unknown"
    avg_stress = round(sum(scores) / len(scores), 1) if scores else 0
    peak_stress = max(scores) if scores else 0

    # Groq summary generation
    try:
        entries_text = "\n".join(
            [f"Q{e['question_index']+1}: {e['emotion']} (stress {e['stress_score']}/10) — {e['note']}"
             for e in entries[:20]]  # cap at 20 for token safety
        )
        summary_resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a student wellness advisor. "
                        "Given the student's mood log during a quiz, write a short, empathetic 3-sentence summary "
                        "and 2 actionable wellness tips. Keep it warm and encouraging."
                    )
                },
                {
                    "role": "user",
                    "content": f"Mood log:\n{entries_text}"
                }
            ],
            max_tokens=250,
            temperature=0.7,
        )
        ai_summary = summary_resp.choices[0].message.content.strip()
    except Exception as exc:
        app.logger.error(f"Summary error: {exc}")
        ai_summary = "Session complete. Review your mood trends below."

    return jsonify({
        "session_id":     sid,
        "entries":        entries,
        "summary": {
            "avg_stress":      avg_stress,
            "peak_stress":     peak_stress,
            "dominant_emotion": dominant,
            "emotion_counts":  emotions_count,
            "ai_summary":      ai_summary,
        }
    })


@app.route("/clear-session", methods=["POST"])
def clear_session():
    """Clear mood log for current session (call when quiz restarts)."""
    sid = get_session_id()
    mood_store.pop(sid, None)
    session.pop("session_id", None)
    return jsonify({"status": "cleared"})


# ---------------------------------------------------------------------------
# Routes — Check-In API
# ---------------------------------------------------------------------------

def compute_wellness_index(answers: dict, face_score: int | None) -> dict:
    """
    Algorithm to combine questionnaire answers + facial stress score
    into a single Wellness Index (0–100, higher = better).

    Scoring breakdown:
      - Day feeling       (25 pts)  — emoji rating
      - Self-stress score (30 pts)  — slider 1-10 (inverted)
      - Sleep quality     (20 pts)  — chips
      - Main worry depth  (10 pts)  — text length heuristic
      - Face score        (15 pts)  — from camera analysis (optional)
    """

    # 1. Day feeling (25 pts)
    day_map = {"great": 25, "good": 20, "okay": 13, "tough": 6, "rough": 2}
    day_pts = day_map.get(answers.get("day_feeling", "okay"), 13)

    # 2. Self-reported stress (30 pts) — inverted: score 1 → 30 pts, score 10 → 0 pts
    raw_stress = int(answers.get("stress_level", 5))
    stress_pts = round((10 - raw_stress) / 9 * 30)

    # 3. Sleep quality (20 pts)
    sleep_map = {"very_well": 20, "okay": 13, "poorly": 6, "barely": 1}
    sleep_pts = sleep_map.get(answers.get("sleep_quality", "okay"), 10)

    # 4. Worry text depth (10 pts) — longer / more detailed → student is reflecting (good)
    #    but very short answers might mean dismissal or high stress. Cap at 10.
    worry_len = len(answers.get("main_worry", ""))
    worry_pts = min(10, max(2, worry_len // 15))

    # 5. Face score (15 pts) — optional; if unavailable give neutral 7 pts
    if face_score is not None and face_score > 0:
        face_pts = round((10 - face_score) / 9 * 15)
    else:
        face_pts = 7   # neutral default

    total_wi = day_pts + stress_pts + sleep_pts + worry_pts + face_pts
    total_wi = max(0, min(100, total_wi))   # clamp 0-100

    # Mood category
    if total_wi >= 70:
        category = "High"
    elif total_wi >= 45:
        category = "Moderate"
    elif total_wi >= 25:
        category = "Low"
    else:
        category = "Critical"

    return {
        "wellness_index": total_wi,
        "mood_category":  category,
        "stress_score":   raw_stress,
        "breakdown": {
            "day_feeling":   day_pts,
            "stress_level":  stress_pts,
            "sleep_quality": sleep_pts,
            "worry_depth":   worry_pts,
            "face_reading":  face_pts,
        }
    }


@app.route("/analyze-checkin", methods=["POST"])
def analyze_checkin():
    """
    POST { answers: { day_feeling, stress_level, main_worry, sleep_quality, support_needed } }
    Returns full wellness assessment: index, category, AI insight, recommendations.
    """
    data    = request.get_json(force=True)
    answers = data.get("answers", {})
    sid     = get_session_id()

    # Grab latest face stress score from mood_store (if quiz was taken first)
    face_score = None
    session_entries = mood_store.get(sid, [])
    valid_face = [e["stress_score"] for e in session_entries
                  if e.get("stress_score", 0) > 0 and e.get("source") == "groq"]
    if valid_face:
        face_score = round(sum(valid_face) / len(valid_face))

    # Run scoring algorithm
    scores = compute_wellness_index(answers, face_score)
    wi     = scores["wellness_index"]

    # Build Groq prompt for personalised insight + recommendations
    prompt = (
        f"A student just completed a mood check-in. Here are their answers:\n"
        f"- Day feeling: {answers.get('day_feeling', 'okay')}\n"
        f"- Self-reported stress level: {answers.get('stress_level', 5)}/10\n"
        f"- What's on their mind: {answers.get('main_worry', 'Not specified')}\n"
        f"- Sleep last night: {answers.get('sleep_quality', 'okay')}\n"
        f"- Support they need: {answers.get('support_needed', 'general')}\n"
        f"- Wellness Index computed: {wi}/100 (category: {scores['mood_category']})\n"
        f"- Facial stress score from camera: {face_score if face_score else 'Not available'}/10\n\n"
        f"Please respond with a valid JSON object containing exactly these keys:\n"
        f"  insight - 2-3 warm, empathetic sentences about how the student is feeling and what it means\n"
        f"  recommendations - a JSON array of 4 concise, actionable wellness tips tailored to their specific answers\n"
        f"Keep tone warm, supportive, non-clinical. Return ONLY valid JSON, no markdown."
    )

    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system",
                 "content": "You are a compassionate student wellness advisor. You give warm, personalised, evidence-based advice."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=400,
            temperature=0.75,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        ai_result = json.loads(raw)
    except Exception as exc:
        app.logger.warning(f"Checkin AI error: {exc}")
        # Fallback recommendations based on wellness index
        if wi >= 70:
            ai_result = {
                "insight": "You seem to be in a good place today! Your mood and energy are positive. Keep maintaining these healthy habits and approach your studies with this great mindset.",
                "recommendations": [
                    "Take a 5-minute gratitude pause — write 3 things going well today.",
                    "Channel your positive energy into your most challenging task first.",
                    "Stay hydrated and take short movement breaks every hour.",
                    "Share your good mood — connect with a classmate or friend today."
                ]
            }
        elif wi >= 45:
            ai_result = {
                "insight": "You're managing okay, but there are some areas where you could use a bit more support. It's completely normal to feel this way during busy academic periods.",
                "recommendations": [
                    "Try the 4-7-8 breathing technique to reduce stress in 60 seconds.",
                    "Break your tasks into 25-minute Pomodoro sessions with 5-min breaks.",
                    "Aim for at least 7 hours of sleep tonight — it resets stress hormones.",
                    "Step outside for 10 minutes — sunlight and movement boost mood fast."
                ]
            }
        else:
            ai_result = {
                "insight": "It sounds like you're going through a tough time right now. Please know that what you're feeling is valid, and there are people who want to support you. You don't have to face this alone.",
                "recommendations": [
                    "Reach out to a counsellor or trusted faculty member — talking helps.",
                    "Do one very small, easy task to rebuild momentum and confidence.",
                    "Practice progressive muscle relaxation before bed to improve sleep.",
                    "Limit social media for today and focus on one calming activity you enjoy."
                ]
            }

    # Log the checkin result to session mood store
    checkin_entry = {
        "emotion":        scores["mood_category"].lower(),
        "stress_score":   scores["stress_score"],
        "note":           f"Check-in: {answers.get('day_feeling','okay')} day, sleep: {answers.get('sleep_quality','?')}",
        "timestamp":      datetime.now().isoformat(),
        "question_index": 0,
        "source":         "checkin",
        "wellness_index": wi,
    }
    mood_store.setdefault(sid, []).append(checkin_entry)

    return jsonify({
        **scores,
        "insight":         ai_result.get("insight", ""),
        "recommendations": ai_result.get("recommendations", []),
        "face_score":      face_score,
        "answers":         answers,
    })


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
