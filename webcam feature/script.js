/* =====================================
   QUIZ DATA
===================================== */

const questions = [

    {
        type: "mcq",

        question: "Which language is used to structure a web page?",

        options: [
            "HTML",
            "CSS",
            "JavaScript",
            "Python"
        ],

        answer: "HTML"
    },

    {
        type: "mcq",

        question: "Which language is primarily used for styling web pages?",

        options: [
            "HTML",
            "CSS",
            "C++",
            "Java"
        ],

        answer: "CSS"
    },

    {
        type: "mcq",

        question: "Which keyword is used to declare a variable in JavaScript?",

        options: [
            "var",
            "int",
            "string",
            "define"
        ],

        answer: "var"
    },

    {
        type: "text",

        question: "Explain the difference between HTML and CSS.",

        answer: ""
    },

    {
        type: "mcq",

        question: "Which HTML tag is used to create a hyperlink?",

        options: [
            "<a>",
            "<link>",
            "<href>",
            "<url>"
        ],

        answer: "<a>"
    }

];


/* =====================================
   VARIABLES
===================================== */

let currentIndex = 0;

let userAnswers = new Array(questions.length).fill(null);

let timeLeft = 10 * 60;

let timerInterval;


/* =====================================
   DOM ELEMENTS
===================================== */

const questionText =
    document.getElementById("questionText");

const questionNumber =
    document.getElementById("questionNumber");

const questionType =
    document.getElementById("questionType");

const mcqContainer =
    document.getElementById("mcqContainer");

const textContainer =
    document.getElementById("textContainer");

const textAnswer =
    document.getElementById("textAnswer");

const progress =
    document.getElementById("progress");

const currentQuestion =
    document.getElementById("currentQuestion");

const totalQuestions =
    document.getElementById("totalQuestions");

const questionNavigation =
    document.getElementById("questionNavigation");

const previousBtn =
    document.getElementById("previousBtn");

const submitBtn =
    document.getElementById("submitBtn");

const charCount =
    document.getElementById("charCount");


/* =====================================
   INITIALIZATION
===================================== */

totalQuestions.textContent = questions.length;

renderQuestion();

createNavigation();

startTimer();


/* =====================================
   RENDER QUESTION
===================================== */

function renderQuestion() {

    const question = questions[currentIndex];

    questionText.textContent = question.question;

    questionNumber.textContent =
        `Question ${currentIndex + 1}`;

    currentQuestion.textContent =
        currentIndex + 1;

    questionType.textContent =
        question.type === "mcq"
            ? "MCQ"
            : "TEXT";


    /* PROGRESS */

    const percentage =
        ((currentIndex + 1) / questions.length) * 100;

    progress.style.width =
        `${percentage}%`;


    /* RESET */

    mcqContainer.innerHTML = "";

    textContainer.classList.add("hidden");


    /* MCQ */

    if (question.type === "mcq") {

        mcqContainer.classList.remove("hidden");

        question.options.forEach((option, index) => {

            const optionDiv =
                document.createElement("label");

            optionDiv.className = "option";


            const input =
                document.createElement("input");

            input.type = "radio";

            input.name = "answer";

            input.value = option;


            if (userAnswers[currentIndex] === option) {

                input.checked = true;

                optionDiv.classList.add("selected");
            }


            input.addEventListener("change", () => {

                userAnswers[currentIndex] =
                    option;

                updateNavigation();

                document
                    .querySelectorAll(".option")
                    .forEach(el =>
                        el.classList.remove("selected")
                    );

                optionDiv.classList.add("selected");

            });


            const text =
                document.createElement("span");

            text.textContent =
                option;


            optionDiv.appendChild(input);

            optionDiv.appendChild(text);

            mcqContainer.appendChild(optionDiv);

        });

    }


    /* TEXT QUESTION */

    else {

        textContainer.classList.remove("hidden");

        textAnswer.value =
            userAnswers[currentIndex] || "";

        charCount.textContent =
            textAnswer.value.length;

    }


    /* PREVIOUS BUTTON */

    previousBtn.disabled =
        currentIndex === 0;


    /* LAST QUESTION */

    if (currentIndex === questions.length - 1) {

        submitBtn.textContent =
            "Finish Assessment ✓";

    } else {

        submitBtn.textContent =
            "Submit Answer →";

    }


    updateNavigation();
}


/* =====================================
   TEXT INPUT
===================================== */

textAnswer.addEventListener("input", () => {

    userAnswers[currentIndex] =
        textAnswer.value;

    charCount.textContent =
        textAnswer.value.length;

    updateNavigation();

});


/* =====================================
   SUBMIT
===================================== */

submitBtn.addEventListener("click", () => {

    if (userAnswers[currentIndex] === null ||
        userAnswers[currentIndex] === "") {

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

    questionNavigation.innerHTML = "";

    questions.forEach((question, index) => {

        const button =
            document.createElement("button");

        button.className =
            "question-number";

        button.textContent =
            index + 1;


        button.addEventListener("click", () => {

            currentIndex = index;

            renderQuestion();

        });


        questionNavigation.appendChild(button);

    });

}


function updateNavigation() {

    const buttons =
        document.querySelectorAll(".question-number");


    buttons.forEach((button, index) => {

        button.classList.remove("current");

        button.classList.remove("completed");


        if (index === currentIndex) {

            button.classList.add("current");

        }


        if (userAnswers[index] !== null &&
            userAnswers[index] !== "") {

            button.classList.add("completed");

        }

    });

}


/* =====================================
   TIMER
===================================== */

function startTimer() {

    timerInterval =
        setInterval(() => {

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

    const minutes =
        Math.floor(timeLeft / 60);

    const seconds =
        timeLeft % 60;


    document.getElementById("timer")
        .textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

}


/* =====================================
   FINISH QUIZ
===================================== */

function finishQuiz() {

    clearInterval(timerInterval);


    let score = 0;


    questions.forEach((question, index) => {

        if (question.type === "mcq") {

            if (userAnswers[index] === question.answer) {

                score++;

            }

        }

    });


    document.getElementById("score")
        .textContent = score;

    document.getElementById("scoreTotal")
        .textContent = questions.length;


    document.getElementById("resultModal")
        .classList.remove("hidden");

}


/* =====================================
   CAMERA
===================================== */

const video =
    document.getElementById("video");

const overlay =
    document.getElementById("overlay");

const cameraPlaceholder =
    document.getElementById("cameraPlaceholder");

const startCamera =
    document.getElementById("startCamera");

const cameraStatus =
    document.getElementById("cameraStatus");

const faceStatus =
    document.getElementById("faceStatus");

const faceCount =
    document.getElementById("faceCount");

const warningBox =
    document.getElementById("warningBox");


let stream;


/* =====================================
   START CAMERA
===================================== */

startCamera.addEventListener("click", async () => {

    try {

        stream =
            await navigator.mediaDevices.getUserMedia({

                video: true,

                audio: false

            });


        video.srcObject = stream;

        video.style.display = "block";

        cameraPlaceholder.style.display =
            "none";


        cameraStatus.textContent =
            "Camera Active";

        cameraStatus.classList.remove("inactive");

        cameraStatus.classList.add("active");


        initializeFaceDetection();

    }

    catch (error) {

        console.error(error);

        alert(
            "Camera access was denied. Please allow camera permission and try again."
        );

    }

});


/* =====================================
   FACE DETECTION
===================================== */

function initializeFaceDetection() {

    const faceDetection =
        new FaceDetection({

            locateFile: (file) => {

                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;

            }

        });


    faceDetection.setOptions({

        model: "short",

        minDetectionConfidence: 0.5

    });


    faceDetection.onResults(onFaceResults);


    const camera =
        new Camera(video, {

            onFrame: async () => {

                await faceDetection.send({

                    image: video

                });

            },

            width: 640,

            height: 480

        });


    camera.start();

}


/* =====================================
   FACE RESULTS
===================================== */

function onFaceResults(results) {

    const faces =
        results.detections
            ? results.detections.length
            : 0;


    faceCount.textContent =
        `Face count: ${faces}`;


    const dot =
        document.querySelector(".face-status .dot");


    if (faces === 1) {

        faceStatus.textContent =
            "Face detected";

        dot.classList.add("active");

        warningBox.classList.add("hidden");

    }


    else if (faces === 0) {

        faceStatus.textContent =
            "No face detected";

        dot.classList.remove("active");

        warningBox.classList.remove("hidden");

        warningBox.textContent =
            "⚠️ Please keep your face visible in the camera.";

    }


    else {

        faceStatus.textContent =
            "Multiple faces detected";

        dot.classList.remove("active");

        warningBox.classList.remove("hidden");

        warningBox.textContent =
            "⚠️ Multiple faces detected. Only one person is allowed.";

    }

}


/* =====================================
   TAB SWITCH DETECTION
===================================== */

document.addEventListener(
    "visibilitychange",
    () => {

        if (document.hidden) {

            alert(
                "Warning: Please do not switch tabs during the assessment."
            );

        }

    }
);