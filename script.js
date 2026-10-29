
/* ==========================================
   SIGNCONNECT — SIGN LANGUAGE TRANSLATOR
   Interactive features for the student project
   ========================================== */

// Your existing Teachable Machine model.
// Replace this URL after training your improved model.
const MODEL_URL =
  "https://teachablemachine.withgoogle.com/models/QR-mvcP0_/";

let model = null;
let webcam = null;
let cameraRunning = false;
let predictionLoopRunning = false;
let latestPrediction = "";
let conversation = [];
let lastAddedGesture = "";
let lastAddedTime = 0;
let stableLabel = "";
let stableCount = 0;

// Elements from index.html
const startButton = document.getElementById("startCamera");
const stopButton = document.getElementById("stopCamera");
const webcamContainer = document.getElementById("webcamContainer");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const cameraStatus = document.getElementById("cameraStatus");

const predictionText = document.getElementById("predictionText");
const predictionMessage = document.getElementById("predictionMessage");
const confidenceText = document.getElementById("confidenceText");
const confidenceFill = document.getElementById("confidenceFill");
const confidenceProgress = document.getElementById("confidenceProgress");

const speakPredictionButton = document.getElementById("speakPrediction");
const stopSpeechButton = document.getElementById("stopSpeech");

const conversationMessages =
  document.getElementById("conversationMessages");
const conversationEmpty = document.getElementById("conversationEmpty");
const conversationCount = document.getElementById("conversationCount");
const manualMessage = document.getElementById("manualMessage");
const addMessageButton = document.getElementById("addMessage");
const speakConversationButton =
  document.getElementById("speakConversation");
const clearConversationButton =
  document.getElementById("clearConversation");

// Gesture labels that should not become conversation words.
const IGNORED_LABELS = [
  "other",
  "background",
  "none",
  "no gesture",
  "no recognized gesture"
];

// Load a JavaScript library only when needed.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(
      script => script.src === src
    );

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load " + src)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.onerror = () => reject(
      new Error("Could not load the required AI library.")
    );

    document.head.appendChild(script);
  });
}

// Load TensorFlow.js and Teachable Machine's image library.
async function loadAILibraries() {
  if (window.tmImage && window.tf) return;

  await loadScript(
    "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js"
  );

  await loadScript(
    "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js"
  );

  if (!window.tmImage) {
    throw new Error("The Teachable Machine library did not initialise.");
  }
}

// Start the camera and load the trained model.
async function startCamera() {
  if (cameraRunning) return;

  startButton.disabled = true;
  predictionText.textContent = "Preparing camera...";
  predictionMessage.textContent = "Loading the AI model. Please wait.";

  try {
    await loadAILibraries();

    if (!model) {
      model = await tmImage.load(
        MODEL_URL + "model.json",
        MODEL_URL + "metadata.json"
      );
    }

    webcam = new tmImage.Webcam(420, 315, true);

    await webcam.setup();
    await webcam.play();

    webcamContainer.replaceChildren(webcam.canvas);

    webcam.canvas.style.width = "100%";
    webcam.canvas.style.height = "auto";
    webcam.canvas.style.display = "block";
    webcam.canvas.style.borderRadius = "16px";

    cameraRunning = true;
    predictionLoopRunning = true;

    cameraPlaceholder.style.display = "none";
    cameraStatus.innerHTML =
      '<span class="status-dot"></span> Camera active';

    startButton.disabled = true;
    stopButton.disabled = false;

    predictionText.textContent = "Show a trained gesture";
    predictionMessage.textContent =
      "Keep your hand clearly visible in the camera.";

    predictLoop();

 } catch (error) {
  console.error("Camera or model error:", error);

  if (webcam) {
    try {
      webcam.stop();
    } catch (stopError) {
      console.warn("Webcam cleanup:", stopError);
    }
    webcam = null;
  }

  cameraRunning = false;
  predictionLoopRunning = false;
  webcamContainer.replaceChildren();
  cameraPlaceholder.style.display = "";

  cameraStatus.innerHTML =
    '<span class="status-dot"></span> Camera unavailable';

  startButton.disabled = false;
  stopButton.disabled = true;

  predictionText.textContent = "Unable to start";
  predictionMessage.textContent =
    "Error: " + (error.message || "Unknown camera or model error");
}
}

// Continuously predict the gesture visible in the webcam.
async function predictLoop() {
  if (!cameraRunning || !webcam || !model) return;

  try {
    webcam.update();

    const predictions = await model.predict(webcam.canvas);

    if (!cameraRunning) return;

    predictions.sort((a, b) => b.probability - a.probability);

    const best = predictions[0];

    if (best) {
      showPrediction(best.className, best.probability);
    }

  } catch (error) {
    console.error("Prediction error:", error);
    predictionMessage.textContent =
      "Prediction paused. Try restarting the camera.";
  }

  if (cameraRunning) {
    requestAnimationFrame(predictLoop);
  } else {
    predictionLoopRunning = false;
  }
}

// Display the model's predicted gesture and confidence.
function showPrediction(label, probability) {
  const confidence = Math.round(probability * 100);
  const cleanLabel = label.trim();

  confidenceText.textContent = confidence + "%";
  confidenceFill.style.width = confidence + "%";
  confidenceProgress.setAttribute("aria-valuenow", confidence);

  // Avoid displaying low-confidence guesses as reliable results.
  if (probability < 0.65) {
    stableLabel = "";
    stableCount = 0;

    predictionText.textContent = "Gesture not clear";
    predictionMessage.textContent =
      "Try better lighting and hold the sign steady.";

    return;
  }

  if (cleanLabel === stableLabel) {
    stableCount++;
  } else {
    stableLabel = cleanLabel;
    stableCount = 1;
  }

  // Require several matching predictions to reduce flickering.
  if (stableCount < 3) return;

  latestPrediction = cleanLabel;

  predictionText.textContent = cleanLabel;
  predictionMessage.textContent =
    "The model predicts this gesture with " +
    confidence + "% confidence.";

  speakPredictionButton.disabled = false;

  // Add a gesture only after it remains stable.
  // A short cooldown prevents the same held sign being repeated.
  const normalised = cleanLabel.toLowerCase();

  if (
    !IGNORED_LABELS.includes(normalised) &&
    (
      lastAddedGesture !== normalised ||
      Date.now() - lastAddedTime > 2500
    )
  ) {
    

    lastAddedGesture = normalised;
    lastAddedTime = Date.now();
  }
}

// Stop the camera and release the webcam stream.
function stopCamera() {
  cameraRunning = false;
  predictionLoopRunning = false;

  if (webcam) {
    try {
      webcam.stop();
    } catch (error) {
      console.warn("Webcam already stopped.", error);
    }

    webcam = null;
  }

  webcamContainer.replaceChildren();
  cameraPlaceholder.style.display = "";

  cameraStatus.innerHTML =
    '<span class="status-dot"></span> Camera off';

  startButton.disabled = false;
  stopButton.disabled = true;

  predictionText.textContent = "Camera stopped";
  predictionMessage.textContent =
    "Start the camera whenever you want to try again.";
}

// Browser text-to-speech.
function speakText(text) {
  if (!("speechSynthesis" in window)) {
    alert("Text-to-speech is not supported by this browser.");
    return;
  }

  if (!text || !text.trim()) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text.trim());
  speech.lang = "en-IN";
  speech.rate = 0.9;

  window.speechSynthesis.speak(speech);
}

// Speak the latest recognised gesture.
function speakPrediction() {
  speakText(latestPrediction);
}

// Add a message to the conversation panel.
function addConversationMessage(message) {
  const text = message.trim();

  if (!text) return;

  conversation.push(text);

  const bubble = document.createElement("div");
  bubble.className = "conversation-message";
  bubble.textContent = text;

  conversationMessages.appendChild(bubble);

  conversationEmpty.style.display = "none";
  conversationCount.textContent =
    conversation.length + (conversation.length === 1 ? " sign" : " signs");

  speakConversationButton.disabled = false;

  // Keep the newest message visible.
  bubble.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

// Add manually typed text to the conversation.
function addManualMessage() {
  const text = manualMessage.value.trim();

  if (!text) return;

  addConversationMessage(text);
  manualMessage.value = "";
  manualMessage.focus();
}

// Read the accumulated conversation aloud.
function speakConversation() {
  speakText(conversation.join(" "));
}

// Clear the conversation history.
function clearConversation() {
  conversation = [];
  conversationMessages.replaceChildren();

  conversationCount.textContent = "0 signs";
  conversationEmpty.style.display = "";

  speakConversationButton.disabled = true;

  lastAddedGesture = "";
  lastAddedTime = 0;
}

// Mobile navigation menu.
function setupNavigation() {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (!menuToggle || !navLinks) return;

  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Highlight the navigation item for the visible section.
function setupActiveNavigation() {
  const sections = document.querySelectorAll(
    "#home, #translator, #conversation, #learn, #about"
  );
  const links = document.querySelectorAll(".nav-link");

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      links.forEach(link => {
        link.classList.toggle(
          "active",
          link.getAttribute("href") === "#" + entry.target.id
        );
      });
    });
  }, { rootMargin: "-25% 0px -60% 0px" });

  sections.forEach(section => observer.observe(section));
}

// Update the footer year automatically.
function setCurrentYear() {
  const yearElement = document.getElementById("currentYear");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
}

// Connect all interactive controls.
startButton?.addEventListener("click", startCamera);
stopButton?.addEventListener("click", stopCamera);

speakPredictionButton?.addEventListener("click", speakPrediction);

stopSpeechButton?.addEventListener("click", () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

addMessageButton?.addEventListener("click", addManualMessage);

manualMessage?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    addManualMessage();
  }
});

speakConversationButton?.addEventListener(
  "click",
  speakConversation
);

clearConversationButton?.addEventListener(
  "click",
  clearConversation
);

// Initialise the page.
setupNavigation();
setupActiveNavigation();
setCurrentYear();

// Ensure camera and speech are stopped when the page is closed.
window.addEventListener("pagehide", () => {
  stopCamera();

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

console.log("SignConnect website initialised.");
