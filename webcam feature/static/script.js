/* =====================================
   DSMCT — Quiz Script
   Questions are fetched dynamically from
   the Flask backend (/get-questions).
   Mood detection runs via Groq Vision.
===================================== */


/* =====================================
   STATE
===================================== */

let questions = [];        // loaded from /get-questions
let currentIndex = 0;
let userAnswers = [];
let timeLeft = 10 * 60;
let timerInterval = null;

// Emotion analysis
let emotionInterval = null;
let cameraActive = false;
let lastEmotionResult = null;
const EMOTION_INTERVAL_MS = 5000;

const EMOTION_EMOJI_MAP = {
    happy: "😄", calm: "😌", neutral: "😐", focused: "🎯",
    confused: "😕", tired: "😴", sad: "😢", worried: "😟",
    anxious: "😰", stressed: "😫", fearful: "😨", angry: "😤",
    unknown: "❓",
};


/* =====================================
   DOM ELEMENTS
===================================== */

const questionText = document.getElementById("questionText");
const questionNumber = document.getElementById("questionNumber");
const questionType = document.getElementById("questionType");
const mcqContainer = document.getElementById("mcqContainer");
const textContainer = document.getElementById("textContainer");
const textAnswer = document.getElementById("textAnswer");
const progress = document.getElementById("progress");
const currentQuestionEl = document.getElementById("currentQuestion");
const totalQuestionsEl = document.getElementById("totalQuestions");
const questionNav = document.getElementById("questionNavigation");
const previousBtn = document.getElementById("previousBtn");
const submitBtn = document.getElementById("submitBtn");
const charCount = document.getElementById("charCount");

// Mood panel
const emotionBadge = document.getElementById("emotionBadge");
const emotionEmoji = document.getElementById("emotionEmoji");
const emotionLabel = document.getElementById("emotionLabel");
const stressFill = document.getElementById("stressFill");
const stressValue = document.getElementById("stressValue");
const moodNote = document.getElementById("moodNote");
const moodScanning = document.getElementById("moodScanning");
const reportBtn = document.getElementById("reportBtn");


/* =====================================
   LOADING UI
===================================== */

function showLoadingQuestions() {
    if (questionText) questionText.textContent = "Loading mood questions…";
    if (questionNumber) questionNumber.textContent = "Preparing…";
    if (mcqContainer) mcqContainer.innerHTML =
        `<div style="
            display:flex; align-items:center; gap:0.6rem; padding:1rem 0;
            color:#6366f1; font-size:0.88rem; font-weight:500;">
            <span style="
                display:inline-block; width:16px; height:16px;
                border:2px solid rgba(99,102,241,0.3);
                border-top-color:#6366f1; border-radius:50%;
                animation: spin 0.8s linear infinite;">
            </span>
            Generating personalised mood check-in questions…
         </div>
         <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;
}


/* =====================================
   FETCH QUESTIONS FROM BACKEND
===================================== */

async function loadQuestions() {
    showLoadingQuestions();
    try {
        const res = await fetch("/get-questions");
        const data = await res.json();
        questions = data.questions || [];

        if (questions.length === 0) throw new Error("Empty question list");

        userAnswers = new Array(questions.length).fill(null);
        totalQuestionsEl.textContent = questions.length;

        // Show source badge
        if (data.source === "groq" && data.detected_emotion !== "neutral") {
            showEmotionBanner(data.detected_emotion);
        }

        renderQuestion();
        createNavigation();
        startTimer();

    } catch (err) {
        console.error("Failed to load questions:", err);
        if (questionText) questionText.textContent =
            "⚠️ Could not load questions. Please refresh the page.";
    }
}


function showEmotionBanner(emotion) {
    const banner = document.createElement("div");
    banner.style.cssText = `
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.3);
        border-radius: 10px;
        padding: 0.55rem 1rem;
        margin-bottom: 0.8rem;
        font-size: 0.78rem;
        color: #a5b4fc;
        font-weight: 500;
    `;
    banner.textContent =
        `🤖 Questions personalised based on detected mood: ${emotion}`;
    document.querySelector(".question-container")?.prepend(banner);
}


/* =====================================
   RENDER QUESTION
===================================== */

function renderQuestion() {
    if (!questions.length) return;
    const question = questions[currentIndex];

    questionText.textContent = question.question;
    questionNumber.textContent = `Question ${currentIndex + 1}`;
    currentQuestionEl.textContent = currentIndex + 1;
    questionType.textContent = question.type === "mcq" ? "MCQ" : "REFLECT";

    // Progress bar
    const pct = ((currentIndex + 1) / questions.length) * 100;
    progress.style.width = `${pct}%`;

    mcqContainer.innerHTML = "";
    textContainer.classList.add("hidden");

    if (question.type === "mcq") {

        mcqContainer.classList.remove("hidden");

        (question.options || []).forEach((option) => {

            const optionDiv = document.createElement("label");
            optionDiv.className = "option";

            const input = document.createElement("input");
            input.type = "radio";
            input.name = "answer";
            input.value = option;

            if (userAnswers[currentIndex] === option) {
                input.checked = true;
                optionDiv.classList.add("selected");
            }

            input.addEventListener("change", () => {
                userAnswers[currentIndex] = option;
                updateNavigation();
                document.querySelectorAll(".option")
                    .forEach(el => el.classList.remove("selected"));
                optionDiv.classList.add("selected");
            });

            const text = document.createElement("span");
            text.textContent = option;

            optionDiv.appendChild(input);
            optionDiv.appendChild(text);
            mcqContainer.appendChild(optionDiv);
        });

    } else {

        textContainer.classList.remove("hidden");
        textAnswer.value = userAnswers[currentIndex] || "";
        charCount.textContent = textAnswer.value.length;
    }

    previousBtn.disabled = currentIndex === 0;
    submitBtn.textContent = currentIndex === questions.length - 1
        ? "Finish Assessment ✓"
        : "Submit Answer →";

    updateNavigation();
}


/* =====================================
   TEXT INPUT
===================================== */

textAnswer.addEventListener("input", () => {
    userAnswers[currentIndex] = textAnswer.value;
    charCount.textContent = textAnswer.value.length;
    updateNavigation();
});


/* =====================================
   SUBMIT
===================================== */

submitBtn.addEventListener("click", () => {

    if (userAnswers[currentIndex] === null || userAnswers[currentIndex] === "") {
        alert("Please answer the question first.");
        return;
    }

    if (currentIndex === questions.length - 1) {
        finishQuiz();
        return;
    }

    currentIndex++;
    renderQuestion();
});


/* =====================================
   PREVIOUS
===================================== */

previousBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
});


/* =====================================
   QUESTION NAVIGATION
===================================== */

function createNavigation() {
    questionNav.innerHTML = "";
    questions.forEach((q, index) => {
        const button = document.createElement("button");
        button.className = "question-number";
        button.textContent = index + 1;
        button.title = q.mood_tag || "";
        button.addEventListener("click", () => {
            currentIndex = index;
            renderQuestion();
        });
        questionNav.appendChild(button);
    });
}

function updateNavigation() {
    document.querySelectorAll(".question-number").forEach((button, index) => {
        button.classList.remove("current", "completed");
        if (index === currentIndex) button.classList.add("current");
        if (userAnswers[index] !== null && userAnswers[index] !== "") {
            button.classList.add("completed");
        }
    });
}


/* =====================================
   TIMER
===================================== */

function startTimer() {
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimer();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert("Time is over!");
            finishQuiz();
        }
    }, 1000);
}

function updateTimer() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    document.getElementById("timer").textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


/* =====================================
   FINISH QUIZ
===================================== */

function finishQuiz() {
    clearInterval(timerInterval);
    stopEmotionAnalysis();

    // Post all mood answers to /log-mood
    questions.forEach((q, i) => {
        if (userAnswers[i]) {
            fetch("/log-mood", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emotion: "neutral",
                    stress_score: lastEmotionResult?.stress_score || 5,
                    note: `Q${i + 1} [${q.mood_tag}]: ${userAnswers[i]}`,
                    question_index: i,
                })
            }).catch(() => { });
        }
    });

    // Score: count non-null answers (all questions are mood/reflection, no right/wrong)
    const answered = userAnswers.filter(a => a !== null && a !== "").length;
    document.getElementById("score").textContent = answered;
    document.getElementById("scoreTotal").textContent = questions.length;
    document.getElementById("resultModal").classList.remove("hidden");

    if (reportBtn) reportBtn.style.display = "inline-flex";
}


/* =====================================
   CAMERA
===================================== */

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const startCameraBtn = document.getElementById("startCamera");
const cameraStatus = document.getElementById("cameraStatus");
const faceStatus = document.getElementById("faceStatus");
const faceCount = document.getElementById("faceCount");
const warningBox = document.getElementById("warningBox");

let stream;


/* =====================================
   START CAMERA
===================================== */

startCameraBtn.addEventListener("click", async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        video.srcObject = stream;
        video.style.display = "block";
        cameraPlaceholder.style.display = "none";

        cameraStatus.textContent = "Camera Active";
        cameraStatus.classList.remove("inactive");
        cameraStatus.classList.add("active");

        cameraActive = true;

        initializeFaceDetection();
        startEmotionAnalysis();

        // Reload questions now that camera is active (emotion context available)
        // Only reload if we haven't started answering yet
        if (currentIndex === 0 && userAnswers.every(a => a === null)) {
            setTimeout(() => {
                loadQuestions();
            }, 8000);  // wait 8s for first emotion reading
        }

    } catch (error) {
        console.error(error);
        alert("Camera access was denied. Please allow camera permission and try again.");
    }
});


/* =====================================
   FACE DETECTION (MediaPipe)
===================================== */

function initializeFaceDetection() {
    const faceDetection = new FaceDetection({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
    });
    faceDetection.setOptions({ model: "short", minDetectionConfidence: 0.5 });
    faceDetection.onResults(onFaceResults);

    const camera = new Camera(video, {
        onFrame: async () => { await faceDetection.send({ image: video }); },
        width: 640, height: 480
    });
    camera.start();
}

function onFaceResults(results) {
    const faces = results.detections ? results.detections.length : 0;
    faceCount.textContent = `Face count: ${faces}`;
    const dot = document.querySelector(".face-status .dot");

    if (faces === 1) {
        faceStatus.textContent = "Face detected";
        dot.classList.add("active");
        warningBox.classList.add("hidden");
    } else if (faces === 0) {
        faceStatus.textContent = "No face detected";
        dot.classList.remove("active");
        warningBox.classList.remove("hidden");
        warningBox.textContent = "⚠️ Please keep your face visible in the camera.";
    } else {
        faceStatus.textContent = "Multiple faces detected";
        dot.classList.remove("active");
        warningBox.classList.remove("hidden");
        warningBox.textContent = "⚠️ Multiple faces detected. Only one person is allowed.";
    }
}


/* =====================================
   AI EMOTION ANALYSIS (Groq via Flask)
===================================== */

function captureFrameBase64() {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
}

async function analyzeEmotion() {
    if (!cameraActive || !video.srcObject) return;
    if (moodScanning) moodScanning.classList.remove("hidden");

    try {
        const imageB64 = captureFrameBase64();
        const response = await fetch("/analyze-emotion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageB64, question_index: currentIndex })
        });

        if (!response.ok) throw new Error(`Server ${response.status}`);
        const data = await response.json();
        lastEmotionResult = data;
        updateMoodPanel(data);
        if (reportBtn) reportBtn.style.display = "inline-flex";

    } catch (err) {
        console.warn("Emotion error:", err);
        updateMoodPanel({ emotion: "unknown", stress_score: 0, note: "Analysis unavailable…" });
    } finally {
        if (moodScanning) moodScanning.classList.add("hidden");
    }
}

function updateMoodPanel(data) {
    const { emotion = "neutral", stress_score = 0, note = "" } = data;
    const emoji = EMOTION_EMOJI_MAP[emotion] ?? "🎭";
    if (emotionEmoji) emotionEmoji.textContent = emoji;
    if (emotionLabel) emotionLabel.textContent = emotion.charAt(0).toUpperCase() + emotion.slice(1);

    const pct = Math.min((stress_score / 10) * 100, 100);
    if (stressFill) {
        stressFill.style.width = `${pct}%`;
        stressFill.style.background =
            stress_score <= 3 ? "linear-gradient(90deg,#10b981,#22d3ee)" :
                stress_score <= 6 ? "linear-gradient(90deg,#22d3ee,#f59e0b)" :
                    stress_score <= 8 ? "linear-gradient(90deg,#f59e0b,#f97316)" :
                        "linear-gradient(90deg,#f97316,#f43f5e)";
    }
    if (stressValue) stressValue.textContent = stress_score > 0 ? `${stress_score}/10` : "—";
    if (moodNote) moodNote.textContent = note || "Analysing...";
}

function startEmotionAnalysis() {
    analyzeEmotion();
    emotionInterval = setInterval(analyzeEmotion, EMOTION_INTERVAL_MS);
}

function stopEmotionAnalysis() {
    if (emotionInterval) { clearInterval(emotionInterval); emotionInterval = null; }
}


/* =====================================
   TAB SWITCH DETECTION
===================================== */

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        alert("Warning: Please do not switch tabs during the assessment.");
    }
});


/* =====================================
   BOOT — load questions on page ready
===================================== */

document.addEventListener("DOMContentLoaded", () => {
    loadQuestions();
});
