import { FaceLandmarker, FilesetResolver } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const wrap = document.querySelector(".video-wrap");

let stream = null;
let landmarker = null;
let running = false;
let lastRun = 0;

const MSG = {
  start: "ابدأ",
  stop: "إيقاف",
  loading: "جاري تحميل النموذج… قد يستغرق ذلك لحظات.",
  ready: "الكاميرا تعمل. وجّه الكاميرا إلى وجهك.",
  faceFound: "تم اكتشاف الوجه ✓",
  noFace: "لا يوجد وجه. اضبط زاوية الكاميرا.",
  sleepy: "⚠️ نعاس! انتبه للطريق!",
  stopped: "تم إيقاف الكاميرا.",
  unsupported: "متصفحك لا يدعم الكاميرا.",
  denied: "تم رفض إذن الكاميرا. اسمح بالوصول من إعدادات المتصفح.",
  notFound: "لم يتم العثور على كاميرا.",
  busy: "الكاميرا مستخدمة من تطبيق آخر.",
  error: "تعذّر تشغيل الكاميرا.",
  modelError: "تعذّر تحميل النموذج. تحقق من الاتصال بالإنترنت."
};

// Same landmark numbers as before: 6 points around each eye.
// Six points per eye, in order around the outline.
const EYE_A = [33, 160, 158, 133, 153, 144];
const EYE_B = [362, 385, 387, 263, 373, 380];
const earEl = document.getElementById("ear");

// Tuning values.
const EAR_THRESHOLD = 0.25;   // below this, the eye counts as closed
const CLOSED_MS = 1000;      // closed this long (1.0 s) means sleepy

let closedSince = null;      // time when the eyes first closed
let sleepy = false;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// p = the six points of one eye, in pixels, in outline order.
function eyeAspectRatio(p) {
  const v1 = dist(p[1], p[5]);
  const v2 = dist(p[2], p[4]);
  const h = dist(p[0], p[3]);
  return (v1 + v2) / (2 * h);
}

function updateDrowsiness(ear, now) {
  if (ear < EAR_THRESHOLD) {
    if (closedSince === null) closedSince = now;
    if (now - closedSince >= CLOSED_MS) sleepy = true;
  } else {
    closedSince = null;
    sleepy = false;
  }
}
// ---------- Alarm sound ----------
let audioCtx = null;
let alarmTimer = null;

// Must be called from a tap/click, or the browser keeps audio blocked.
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  osc.type = "square";
  osc.frequency.value = 2200;

  // Quick fade in and out, so there is no clicking sound.
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  gain.gain.setValueAtTime(0.6, t + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.26);
}

function startAlarm() {
  if (alarmTimer || !audioCtx) return;   // already ringing, or audio not unlocked
  beep();
  alarmTimer = setInterval(beep, 400);   // a beep every 0.4 seconds
}

function stopAlarm() {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

startBtn.textContent = MSG.start;

async function loadModel() {
  if (landmarker) return;
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  const make = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numFaces: 1
    });

  try {
    landmarker = await make("GPU");
  } catch (err) {
    console.warn("GPU failed, using CPU instead:", err);
    landmarker = await make("CPU");
  }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = MSG.unsupported;
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    wrap.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    startBtn.textContent = MSG.stop;

    statusEl.textContent = MSG.loading;
    await loadModel();

    statusEl.textContent = MSG.ready;
    running = true;
    requestAnimationFrame(detectLoop);
  } catch (err) {
    console.error(err);
    if (err.name === "NotAllowedError") statusEl.textContent = MSG.denied;
    else if (err.name === "NotFoundError") statusEl.textContent = MSG.notFound;
    else if (err.name === "NotReadableError") statusEl.textContent = MSG.busy;
    else if (!landmarker) statusEl.textContent = MSG.modelError;
    else statusEl.textContent = MSG.error;
  }
}

function detectLoop(now) {
  if (!running) return;

  // About 15 checks per second to save battery.
  if (now - lastRun >= 66 && video.readyState >= 2) {
    lastRun = now;
    try {
      const result = landmarker.detectForVideo(video, now);
      draw(result.faceLandmarks, now);
    } catch (err) {
      console.error(err);
    }
  }
  requestAnimationFrame(detectLoop);
}

function draw(faces, now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!faces || faces.length === 0 || !Number.isFinite(faces[0][33].x)) {
    closedSince = null;
    sleepy = false;
    stopAlarm();
    statusEl.textContent = MSG.noFace;
    earEl.textContent = "";
    return;
  }

  const points = faces[0];

  // Convert MediaPipe's 0-to-1 positions into real pixels.
  const toPx = (i) => ({
    x: points[i].x * canvas.width,
    y: points[i].y * canvas.height
  });

  const eyes = [EYE_A, EYE_B].map((eye) => eye.map(toPx));

  // Average both eyes into one number.
  const ear = (eyeAspectRatio(eyes[0]) + eyeAspectRatio(eyes[1])) / 2;

  updateDrowsiness(ear, now);
  if (sleepy) startAlarm();
  else stopAlarm();

  statusEl.textContent = sleepy ? MSG.sleepy : MSG.faceFound;
  earEl.textContent = "EAR: " + ear.toFixed(2);

  const lineColor = sleepy ? "#e74c3c" : "#fff";
  const dotColor = sleepy ? "#e74c3c" : "#2ecc71";

  for (const pts of eyes) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = dotColor;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stopCamera() {
  stopAlarm();
  running = false;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusEl.textContent = MSG.stopped;
  startBtn.textContent = MSG.start;
}

startBtn.addEventListener("click", () => {
  initAudio();   // unlock sound while we have a real tap
  if (stream) stopCamera();
  else startCamera();
});

document.getElementById("testBtn").addEventListener("click", () => {
  initAudio();
  beep();
});