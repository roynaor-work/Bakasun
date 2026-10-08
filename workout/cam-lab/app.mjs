import { RepCounter, bodyReport, features, statusCode, EXERCISES, FRAMING, REASONS, FEEDBACK } from './counter.mjs';
import { StatusLine, RestGate, diagnosticLines } from './feedback.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), context = canvas.getContext('2d');
const titles = { squats: 'סקוואט', 'jumping-jacks': 'קפיצות פיסוק', 'high-knees': 'ברכיים גבוהות' };
const instructions = {
  squats: 'מול המצלמה: יורדים בנוחות כאילו מתיישבים, הברכיים בכיוון אצבעות הרגליים, ואז עומדים שוב. אין צורך לרדת בכוח.',
  'jumping-jacks': 'מול המצלמה: פותחים רגליים ומרימים את שתי הידיים מעל הראש, ואז סוגרים ומורידים. נשארים באותו מקום.',
  'high-knees': 'מול המצלמה: מרימים ברך, מורידים ומחליפים רגל. כל הרמה והורדה היא חזרה אחת; לא צריך לרוץ מהר.',
};
const spoken = {
  placement: 'מַנִּיחִים אֶת הַמַּכְשִׁיר בְּיַצִּיבוּת בְּגֹבַהּ הָאַגָּן, מוּל הַגּוּף. עוֹמְדִים בְּמֶרְחָק שְׁנַיִם עַד שְׁלוֹשָׁה מֶטְרִים. מַשְׁאִירִים מָקוֹם לַיָּדַיִם מֵעַל הָרֹאשׁ. מְבֻגָּר יָכוֹל לַעֲזֹר.',
  ready: 'רוֹאִים אֶת כָּל הַגּוּף. אֶפְשָׁר לְהַתְחִיל.',
  squats: 'יוֹרְדִים בְּנוֹחוּת כְּאִלּוּ מִתְיַשְּׁבִים, וְאָז עוֹמְדִים שׁוּב. הַבִּרְכַּיִם בְּכִוּוּן אֶצְבְּעוֹת הָרַגְלַיִם.',
  'jumping-jacks': 'פּוֹתְחִים רַגְלַיִם וּמַרְמִים יָדַיִם מֵעַל הָרֹאשׁ. אָז סוֹגְרִים וּמוֹרִידִים.',
  'high-knees': 'מַרְמִים בֶּרֶךְ אַחַת, מוֹרִידִים, וּמַחֲלִיפִים רֶגֶל. לֹא צָרִיךְ לָרוּץ מַהֵר.',
};
let worker, stream, generation = 0, raf = 0, ready = false, busy = false, active = false;
let counter, exercise, gate, statusLine, attemptStarted = null, lastVideoTime = -1, frameId = 0, pending;
let lastFrame = null, totalFrames = 0, totalInference = 0, log = [], lastSpeak = -Infinity;
let lastMetricPaint = 0, watchdog = 0, totalElapsed = 0;
function localVoice() {
  return window.speechSynthesis?.getVoices().find(v => v.localService && /^he(?:-|_|$)/i.test(v.lang));
}
function voiceStatus() {
  $('voice-status').textContent = localVoice() ? 'הדרכה בקול עברי מותקן במכשיר; אין שימוש בקול רשת.' :
    'לא נמצא קול עברי מקומי. ההדרכה מופיעה בכתב; אפשר להתקין קול עברי בהגדרות המכשיר.';
}
window.speechSynthesis?.addEventListener('voiceschanged', voiceStatus);
voiceStatus();
function speak(text) {
  const voice = localVoice();
  if (!$('voice').checked || !voice || performance.now() - lastSpeak < 6000) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = 'he-IL'; utterance.rate = .85;
  window.speechSynthesis.speak(utterance); lastSpeak = performance.now();
}
function release() {
  generation++; active = false; ready = false; busy = false;
  cancelAnimationFrame(raf); clearTimeout(watchdog); worker?.terminate(); worker = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  video.srcObject = null; window.speechSynthesis?.cancel();
  $('camera').disabled = false;
}
function fail(message, detail = '') {
  release(); $('error').hidden = false; $('error').textContent = message;
  $('setup').hidden = false; $('session').hidden = true;
  if (detail) console.error('cam-lab:', detail);
}
const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function draw(points, visible) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = visible ? '#70e2b5' : '#ffd685'; context.lineWidth = 3;
  for (const [a,b] of links) {
    if (!points[a] || !points[b] || points[a].visibility < .65 || points[b].visibility < .65) continue;
    context.beginPath(); context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); context.stroke();
  }
}
function handleEvent(event) {
  if (!event) return;
  if (event.type === 'counted') { $('count').textContent = counter.count; $('feedback').textContent = 'זוהתה תנועה שלמה'; }
  else if (event.type === 'rejected') {
    const reason = event.reason || 'tracking';
    $('feedback').textContent = FEEDBACK[reason]; speak(FEEDBACK[reason]);
  }
}
function poseResult(data) {
  busy = false; clearTimeout(watchdog);
  const { landmarks, world, timestamp, inferenceMs } = data;
  const aspect = video.videoWidth / video.videoHeight;
  const report = bodyReport(landmarks, aspect);
  const f = features(landmarks, world, aspect, report);
  const visible = report.ok && (exercise !== 'squats' || f.squat != null);
  draw(landmarks, visible);
  // A worker frame captured before the start click belongs to placement.
  if (active && timestamp < attemptStarted) return;
  const interval = lastFrame == null ? 0 : timestamp - lastFrame;
  const fps = interval ? 1000 / interval : 0;
  totalElapsed += interval;
  lastFrame = timestamp; totalFrames++; totalInference += inferenceMs;
  const processingMs = performance.now() - pending.started;
  if (performance.now() - lastMetricPaint > 500) {
    $('metrics').textContent = `FPS ${fps.toFixed(1)} · inference ${inferenceMs.toFixed(0)} ms · processing ${processingMs.toFixed(0)} ms`;
    lastMetricPaint = performance.now();
  }
  if (active) {
    handleEvent(counter.update(landmarks, world, timestamp, aspect));
    paintStatus(counter.status);
    $('view').classList.toggle('ready', visible);
  } else {
    const calibrated = gate.update(visible ? f : null, timestamp);
    if (calibrated && $('start').disabled) speak(spoken.ready);
    $('start').disabled = !calibrated;
    $('view').classList.toggle('ready', calibrated);
    paintStatus(statusCode(report, calibrated ? 'armed' : 'waiting', report.ok && !visible));
  }
  log.push({ frame: data.id, fps: +fps.toFixed(2), inferenceMs: +inferenceMs.toFixed(2),
    processingMs: +processingMs.toFixed(2), tracked: +visible, fullBody: +report.ok,
    phase: active ? ['waiting', 'armed', 'moving'].indexOf(counter.phase) : -1 });
  if (log.length > 900) log.shift();
}
function paintStatus(code) {
  const message = statusLine.update(code, performance.now());
  if (message) { $('status').textContent = message[0]; speak(message[1]); }
}
async function tick(token) {
  if (token !== generation) return;
  if (ready && !busy && video.readyState >= 2 && video.currentTime !== lastVideoTime && !document.hidden) {
    busy = true; lastVideoTime = video.currentTime;
    const started = performance.now();
    try {
      const bitmap = await createImageBitmap(video);
      if (token !== generation) { bitmap.close(); return; }
      const timestamp = performance.now();
      pending = { started }; worker.postMessage({ type: 'frame', bitmap, timestamp, id: ++frameId }, [bitmap]);
      watchdog = setTimeout(() => {
        if (token === generation) fail('עיבוד פריים נמשך זמן רב מדי. נסו דפדפן מעודכן או מכשיר אחר.');
      }, 15000);
    } catch (error) { if (token === generation) fail('המכשיר לא הצליח להעביר תמונה לעיבוד מקומי. נסו דפדפן מעודכן.', error); return; }
  }
  raf = requestAnimationFrame(() => tick(token));
}
$('settings').addEventListener('submit', async event => {
  event.preventDefault(); $('error').hidden = true;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail('מצלמה דורשת כתובת HTTPS בטלפון, או localhost במחשב.'); return;
  }
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
    fail('נדרש דפדפן עם Web Worker ו־OffscreenCanvas. נסו דפדפן מעודכן.'); return;
  }
  release(); const token = generation;
  exercise = $('exercise').value;
  try { counter = new RepCounter(exercise, { age: Number($('age').value), height: Number($('height').value) }); }
  catch (error) { fail(error.message); return; }
  $('camera').disabled = true; $('result').hidden = true;
  log = []; totalFrames = 0; totalInference = 0; totalElapsed = 0; frameId = 0; lastFrame = null; lastVideoTime = -1;
  gate = new RestGate(exercise, counter.t); statusLine = new StatusLine(); attemptStarted = null;
  $('count').textContent = '0'; $('feedback').textContent = ''; $('start').disabled = true;
  $('start').hidden = false; $('finish').hidden = true; $('view').classList.remove('ready');
  $('session-title').textContent = `2. הצבה · ${titles[exercise]}`; $('instructions').textContent = instructions[exercise];
  $('status').textContent = 'טוענים את מודל הזיהוי המקומי…';
  speak(spoken.placement);
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: 'user', width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 20, max: 24 } } });
    if (token !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired; video.srcObject = stream; await video.play();
    if (token !== generation) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $('view').style.aspectRatio = `${video.videoWidth}/${video.videoHeight}`;
    $('setup').hidden = true; $('session').hidden = false;
    worker = new Worker('./pose-worker.js');
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.type === 'ready') { clearTimeout(watchdog); ready = true; tick(token); }
      else if (data.type === 'pose') poseResult(data);
      else if (data.type === 'error') fail('הזיהוי המקומי לא נטען. ודאו שקובצי המודל וה־WASM קיימים ושיש WebGL פעיל בדפדפן.', data.message);
    };
    worker.onerror = e => {
      if (token === generation) fail('עיבוד המצלמה נעצר. אפשר לנסות מחדש בדפדפן מעודכן.', e.message);
    };
    worker.postMessage({ type: 'init' });
    watchdog = setTimeout(() => {
      if (token === generation) fail('טעינת המודל המקומי נמשכה זמן רב מדי. נסו שוב לאחר שהקבצים סיימו לרדת.');
    }, 60000);
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (token === generation) fail('המצלמה התנתקה. אפשר להפעיל אותה מחדש.');
    });
  } catch (error) {
    if (token === generation) fail(error.name === 'NotAllowedError' ? 'הרשאת המצלמה לא ניתנה. אפשר לאפשר מצלמה בהגדרות האתר ולנסות שוב.' :
      'לא הצלחנו לפתוח את המצלמה. ודאו שאינה בשימוש באפליקציה אחרת.', error.message);
  }
});
$('start').onclick = () => {
  if ($('start').disabled || !ready || lastFrame == null || performance.now() - lastFrame > counter.t.maxGap) return;
  attemptStarted = performance.now(); active = true;
  // The 1.2-second standing reference is already established by the gate.
  counter.begin(attemptStarted, true);
  log = []; totalFrames = 0; totalInference = 0; totalElapsed = 0; lastFrame = null;
  $('start').hidden = true; $('finish').hidden = false;
  $('session-title').textContent = `סופרים · ${titles[exercise]}`; speak(spoken[exercise]);
};
function results() {
  counter?.finish(performance.now()); release(); $('session').hidden = true; $('result').hidden = false;
  $('result-count').textContent = `${counter.count} חזרות נספרו`;
  $('result-rejected').textContent = `${counter.rejected} תנועות לא נספרו:`;
  $('reasons').replaceChildren();
  for (const [reason, number] of Object.entries(counter.reasons)) {
    const li = document.createElement('li'); li.textContent = `${REASONS[reason]} — ${number}`; $('reasons').append(li);
  }
  if (!counter.rejected) { const li = document.createElement('li'); li.textContent = 'לא זוהו תנועות שנפסלו'; $('reasons').append(li); }
  $('diagnostics').replaceChildren();
  for (const line of diagnosticLines(counter.snapshot())) {
    const li = document.createElement('li'); li.textContent = line; $('diagnostics').append(li);
  }
  const p95 = log.length ? [...log].sort((a,b) => a.processingMs - b.processingMs)[Math.floor((log.length - 1) * .95)].processingMs : 0;
  const meanFps = totalElapsed ? 1000 * Math.max(0, totalFrames - 1) / totalElapsed : 0;
  $('result-metrics').textContent = `${totalFrames} פריימים עובדו · FPS ממוצע: ${meanFps.toFixed(1)} · זיהוי ממוצע: ${(totalInference / Math.max(totalFrames, 1)).toFixed(0)} מ״ש · זמן עיבוד P95 (עד 900 פריימים): ${p95.toFixed(0)} מ״ש`;
}
$('finish').onclick = results;
$('stop').onclick = () => { if (active) results(); else { release(); $('setup').hidden = false; $('session').hidden = true; } };
$('again').onclick = () => { $('result').hidden = true; $('setup').hidden = false; };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 2, exercise: EXERCISES.indexOf(exercise), totalFrames, retainedFrames: log.length,
    counted: counter.count, rejected: counter.rejected, reasons: counter.reasons,
    thresholds: counter.t, framing: FRAMING, diagnostics: counter.snapshot(), frames: log }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'cam-lab-performance.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && stream) {
    if (active) results(); else { release(); $('setup').hidden = false; $('session').hidden = true; }
  }
});
window.addEventListener('pagehide', release);
