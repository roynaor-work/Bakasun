import { RepCounter, bodyReport, features, statusCode, worldRequired, FLOOR, EXERCISE_FEEDBACK, EXERCISES, FRAMING, REASONS, FEEDBACK } from './counter.mjs';
import { StatusLine, RestGate, diagnosticLines } from './feedback.mjs';
import { PeopleTracker } from './people.mjs';
import { PlacementGuide, distanceGuide } from './placement.mjs';
import { SkeletonRecorder } from './recording.mjs';
import { cameraConstraints, configureCamera, cameraSummary } from './camera.mjs';
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), context = canvas.getContext('2d');
const titles = { squats: 'סקוואט', 'jumping-jacks': 'קפיצות פיסוק', 'high-knees': 'ברכיים גבוהות',
  lunges: 'מכרעים', 'push-ups': 'שכיבות סמיכה', 'knee-push-ups': 'שכיבות סמיכה על הברכיים', 'glute-bridge': 'גשר ישבן' };
const instructions = {
  squats: 'מול המצלמה: יורדים בנוחות כאילו מתיישבים, הברכיים בכיוון אצבעות הרגליים, ואז עומדים שוב. אין צורך לרדת בכוח.',
  'jumping-jacks': 'מול המצלמה: פותחים רגליים ומרימים את שתי הידיים מעל הראש, ואז סוגרים ומורידים. נשארים באותו מקום.',
  'high-knees': 'מול המצלמה: מרימים ברך, מורידים ומחליפים רגל. כל הרמה והורדה היא חזרה אחת; לא צריך לרוץ מהר.',
  lunges: 'מול המצלמה: צעד קדימה, כיפוף ברכיים בנוחות, חזרה לעמידה והחלפת רגל. כל ירידה ועלייה = חזרה אחת. הגוף זקוף.',
  'push-ups': 'מבט צד, מכשיר על הרצפה או כיסא נמוך: גוף ישר מהכתפיים לקרסוליים. מכופפים מרפקים ומיישרים. ירידה ועלייה = חזרה.',
  'knee-push-ups': 'מבט צד: הברכיים על הרצפה, גוף ישר מהברכיים לכתפיים. מכופפים ומיישרים מרפקים; לא מתקפלים במותניים.',
  'glute-bridge': 'מבט צד: שכיבה על הגב וברכיים כפופות. מרימים אגן לקו כתפיים–אגן–ברכיים, בלי לקמר גב, ומורידים. עלייה וירידה = חזרה.',
};
const spoken = {
  placement: 'מַנִּיחִים אֶת הַמַּכְשִׁיר בְּיַצִּיבוּת עַל הָרִצְפָּה אוֹ עַל כִּסֵּא, בְּלִי הֲטָיָה לַצַּד. מְכַוְּנִים עַד שֶׁרוֹאִים אֶת כָּל הַגּוּף. בִּשְׁנַיִם עוֹמְדִים זֶה לְצַד זֶה בְּאוֹתוֹ מֶרְחָק מֵהַמַּצְלֵמָה.',
  ready: 'רוֹאִים אֶת כָּל הַגּוּף. אֶפְשָׁר לְהַתְחִיל.',
  squats: 'יוֹרְדִים בְּנוֹחוּת כְּאִלּוּ מִתְיַשְּׁבִים, וְאָז עוֹמְדִים שׁוּב. הַבִּרְכַּיִם בְּכִוּוּן אֶצְבְּעוֹת הָרַגְלַיִם.',
  'jumping-jacks': 'פּוֹתְחִים רַגְלַיִם וּמַרְמִים יָדַיִם מֵעַל הָרֹאשׁ. אָז סוֹגְרִים וּמוֹרִידִים.',
  'high-knees': 'מַרְמִים בֶּרֶךְ אַחַת, מוֹרִידִים, וּמַחֲלִיפִים רֶגֶל. לֹא צָרִיךְ לָרוּץ מַהֵר.',
  ...EXERCISE_FEEDBACK,
};
let worker, stream, generation = 0, raf = 0, ready = false, busy = false, active = false;
let counter, exercise, gate, statusLine, attemptStarted = null, lastVideoTime = -1, frameId = 0, pending;
let lastFrame = null, totalFrames = 0, totalInference = 0, log = [], lastSpeak = -Infinity;
let lastMetricPaint = 0, watchdog = 0, totalElapsed = 0;
let pair = false, adult, adultGate, tracker, placement, placementGate, placementDone, queuedSpeech = null;
let calibratedPeople = [false, false];
let recorder = new SkeletonRecorder();
let cameraInfo = null;
function localVoice() {
  return window.speechSynthesis?.getVoices().find(v => v.localService && /^he(?:-|_|$)/i.test(v.lang));
}
function voiceStatus() {
  $('voice-status').textContent = localVoice() ? 'הדרכה בקול עברי מותקן במכשיר; אין שימוש בקול רשת.' :
    'לא נמצא קול עברי מקומי. ההדרכה מופיעה בכתב; אפשר להתקין קול עברי בהגדרות המכשיר.';
}
window.speechSynthesis?.addEventListener('voiceschanged', voiceStatus);
voiceStatus();
function speak(text, priority = 0) {
  const now = performance.now();
  if (!queuedSpeech || queuedSpeech.expires < now || priority >= queuedSpeech.priority) queuedSpeech = { text, priority, expires: now + 12000 };
  flushSpeech();
}
function flushSpeech() {
  const voice = localVoice();
  if (!$('voice').checked || !voice) { queuedSpeech = null; return; }
  if (queuedSpeech?.expires < performance.now()) queuedSpeech = null;
  if (!queuedSpeech || performance.now() - lastSpeak < 6000) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(queuedSpeech.text); queuedSpeech = null;
  utterance.voice = voice; utterance.lang = 'he-IL'; utterance.rate = .85;
  window.speechSynthesis.speak(utterance); lastSpeak = performance.now();
}
function release() {
  generation++; active = false; ready = false; busy = false;
  cancelAnimationFrame(raf); clearTimeout(watchdog); worker?.terminate(); worker = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  video.srcObject = null; window.speechSynthesis?.cancel();
  queuedSpeech = null; recorder.stop(); paintRecorder();
  $('camera').disabled = false;
}
function fail(message, detail = '') {
  release(); $('error').hidden = false; $('error').textContent = message;
  $('setup').hidden = false; $('session').hidden = true;
  if (detail) console.error('cam-lab:', detail);
}
const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function draw(points, visible, isAdult = false) {
  context.strokeStyle = visible ? isAdult ? '#85dcfc' : '#70e2b5' : '#ffd685'; context.lineWidth = 3;
  for (const [a,b] of links) {
    if (!points[a] || !points[b] || points[a].visibility < .65 || points[b].visibility < .65) continue;
    context.beginPath(); context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); context.stroke();
  }
}
function handleEvent(event, person = 0) {
  if (!event) return;
  const prefix = pair ? person ? 'אבא: ' : 'הילד: ' : '';
  if (event.type === 'counted') { $(person ? 'dad-count' : 'count').textContent = person ? adult.count : counter.count; $('feedback').textContent = prefix + 'זוהתה תנועה שלמה'; }
  else if (event.type === 'rejected') {
    const reason = event.reason || 'tracking';
    const message = ['partial', 'alignment', 'alternate'].includes(reason) && EXERCISE_FEEDBACK[exercise] ? EXERCISE_FEEDBACK[exercise] : FEEDBACK[reason];
    $('feedback').textContent = prefix + message; speak(message, 1);
  }
}
function poseResult(data) {
  busy = false; clearTimeout(watchdog);
  const { timestamp, inferenceMs } = data;
  const poses = data.poses || (data.landmarks?.length ? [{ landmarks: data.landmarks, world: data.world }] : []);
  const aspect = video.videoWidth / video.videoHeight;
  // A worker frame captured before the start click belongs to placement.
  if (active && timestamp < attemptStarted) return;
  recorder.add(poses, timestamp); paintRecorder();
  const placementCode = !active && (!FLOOR.includes(exercise) || !placementDone) ? placement.update(poses, timestamp, aspect) : null;
  const assigned = pair ? tracker.update(placementCode ? [] : poses, timestamp, aspect) : [poses[0] || null];
  if (pair && tracker.tracks.length) placementDone = true;
  const reports = assigned.map((p, i) => bodyReport(p?.landmarks || [], aspect, exercise,
    { movement: active && (i ? adult : counter).phase !== 'waiting' }));
  const fs = assigned.map((p, i) => features(p?.landmarks || [], p?.world || [], aspect, reports[i]));
  const visibility = fs.map((f, i) => reports[i].ok && !worldRequired(exercise, f));
  const visible = visibility[0], report = reports[0];
  context.clearRect(0, 0, canvas.width, canvas.height);
  assigned.forEach((p, i) => { if (p) draw(p.landmarks, visibility[i], i === 1); });
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
    [counter, ...(pair ? [adult] : [])].forEach((c, i) => {
      // Ambiguous identity never bridges a rep; brief missing/weak frames use
      // the same 400ms grace as solo, without crediting unknown time.
      if (pair && tracker.status === 'ambiguous' && !c.lossReset) handleEvent(c.resetTracking(), i);
      handleEvent(c.update(assigned[i]?.landmarks || [], assigned[i]?.world || [], timestamp, aspect), i);
      if (pair) $(i ? 'dad-status' : 'child-status').textContent = visibility[i] ? c.phase === 'waiting' ? 'מחכה לעמדת התחלה' : 'סופר' : 'הספירה נעצרה — מחכה לחזרה';
    });
    paintStatus(pair && !visibility.every(Boolean) ? assigned.every(Boolean) ? 'missing-person' : tracker.status : counter.status);
    $('view').classList.toggle('ready', visibility.every(Boolean));
  } else {
    const distance = distanceGuide(assigned[0]?.landmarks || poses[0]?.landmarks || [], aspect,
      FLOOR.includes(exercise) && placementDone ? exercise : 'placement');
    $('distance-meter').value = distance.value;
    $('distance-hint').textContent = distance.text;
    if (FLOOR.includes(exercise) && !pair && !placementDone) {
      const upright = bodyReport(poses[0]?.landmarks || [], aspect, 'placement');
      const standing = features(poses[0]?.landmarks || [], poses[0]?.world || [], aspect, upright);
      placementDone = placementGate.update(placementCode ? null : standing, timestamp);
    }
    calibratedPeople = [counter, ...(pair ? [adult] : [])].map((c, i) => (i ? adultGate : gate).update(
      !placementCode && (!FLOOR.includes(exercise) || placementDone) && visibility[i] ? fs[i] : null, timestamp));
    const calibrated = calibratedPeople.every(Boolean);
    if (calibrated && $('start').disabled) speak(spoken.ready);
    $('start').disabled = !calibrated;
    $('view').classList.toggle('ready', calibrated);
    const code = placementCode || (pair && !tracker.tracks.length ? 'pair' : FLOOR.includes(exercise) && !placementDone ? 'stand-placement' :
      pair && !assigned.every(Boolean) ? tracker.status :
      statusCode(report, calibrated ? 'armed' : FLOOR.includes(exercise) ? 'floor-rest' : 'waiting', report.ok && !visible));
    paintStatus(code);
  }
  flushSpeech();
  log.push({ frame: data.id, fps: +fps.toFixed(2), inferenceMs: +inferenceMs.toFixed(2),
    processingMs: +processingMs.toFixed(2), tracked: +visible, fullBody: +report.ok,
    phase: active ? ['waiting', 'armed', 'moving'].indexOf(counter.phase) : -1 });
  if (log.length > 900) log.shift();
}
function paintStatus(code) {
  const message = statusLine.update(code, performance.now());
  if (message) { $('status').textContent = message[0]; speak(message[1], ['far', 'tilt'].includes(code) ? 1 : 0); }
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
  pair = $('mode').value === 'pair'; adult = pair ? new RepCounter(exercise, { age: 10, height: 180 }) : null;
  tracker = pair ? new PeopleTracker() : null; placement = new PlacementGuide();
  placementGate = new RestGate('squats', counter.t); placementDone = !FLOOR.includes(exercise);
  calibratedPeople = [false, false]; recorder = new SkeletonRecorder();
  $('dad-score').hidden = !pair; $('child-label').textContent = pair ? 'הילד' : 'חזרות שנספרו';
  $('dad-count').textContent = '0'; $('child-status').textContent = ''; $('dad-status').textContent = '';
  $('recording-panel').hidden = false; paintRecorder();
  $('camera').disabled = true; $('result').hidden = true;
  log = []; totalFrames = 0; totalInference = 0; totalElapsed = 0; frameId = 0; lastFrame = null; lastVideoTime = -1;
  lastMetricPaint = 0; $('metrics').textContent = 'FPS — · processing —';
  gate = new RestGate(exercise, counter.t); statusLine = new StatusLine(); attemptStarted = null;
  adultGate = pair ? new RestGate(exercise, adult.t) : null;
  $('count').textContent = '0'; $('feedback').textContent = ''; $('start').disabled = true;
  $('start').hidden = false; $('finish').hidden = true; $('view').classList.remove('ready');
  $('session-title').textContent = `2. הצבה · ${titles[exercise]}`; $('instructions').textContent = instructions[exercise];
  $('status').textContent = 'טוענים את מודל הזיהוי המקומי…';
  $('distance-guide').hidden = false; $('wide-offer').hidden = true;
  speak(spoken.placement);
  try {
    const acquired = await navigator.mediaDevices.getUserMedia(cameraConstraints(window.innerHeight > window.innerWidth,
      $('camera-device').value || ''));
    if (token !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    const { alternatives, ...actual } = await configureCamera(stream.getVideoTracks()[0], navigator.mediaDevices,
      $('camera-width').value !== 'normal');
    if (token !== generation) return;
    cameraInfo = actual;
    video.srcObject = stream; await video.play();
    if (token !== generation) return;
    cameraInfo.width ||= video.videoWidth; cameraInfo.height ||= video.videoHeight;
    $('camera-actual').textContent = cameraSummary(cameraInfo);
    if (alternatives.length) {
      $('camera-device').replaceChildren();
      const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'קדמית — אוטומטי';
      $('camera-device').append(automatic);
      for (const d of alternatives) {
        const option = document.createElement('option'); option.value = d.deviceId;
        option.textContent = `מצלמה רחבה אפשרית: ${d.label}`; $('camera-device').append(option);
      }
      $('wide-offer').hidden = false;
      $('wide-offer').textContent = 'נמצאה מצלמה רחבה אפשרית — בחירה והצבה מחדש (ייתכן שהיא אחורית)';
      $('wide-offer').onclick = () => {
        if (active) return;
        $('camera-device').value = alternatives[0].deviceId;
        release(); $('setup').hidden = false; $('session').hidden = true;
      };
    }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    if ($('record').checked) startRecording(); else paintRecorder();
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
    worker.postMessage({ type: 'init', numPoses: pair ? 2 : 1 });
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
  adult?.begin(attemptStarted, true); recorder.markCountStart(attemptStarted); paintRecorder();
  log = []; totalFrames = 0; totalInference = 0; totalElapsed = 0; lastFrame = null;
  $('start').hidden = true; $('finish').hidden = false;
  $('distance-guide').hidden = true; $('wide-offer').hidden = true;
  $('session-title').textContent = `סופרים · ${titles[exercise]}`; speak(spoken[exercise]);
};
function results() {
  counter?.finish(performance.now()); adult?.finish(performance.now()); release(); $('session').hidden = true; $('result').hidden = false;
  $('result-count').textContent = pair ? `הילד: ${counter.count} · אבא: ${adult.count} חזרות` : `${counter.count} חזרות נספרו`;
  $('result-camera').textContent = cameraSummary(cameraInfo);
  $('result-rejected').textContent = `${counter.rejected + (adult?.rejected || 0)} תנועות לא נספרו:`;
  $('reasons').replaceChildren();
  for (const [i, c] of [counter, ...(pair ? [adult] : [])].entries()) for (const [reason, number] of Object.entries(c.reasons)) {
    const li = document.createElement('li'); li.textContent = `${pair ? i ? 'אבא: ' : 'הילד: ' : ''}${REASONS[reason]} — ${number}`; $('reasons').append(li);
  }
  if (!counter.rejected && !adult?.rejected) { const li = document.createElement('li'); li.textContent = 'לא זוהו תנועות שנפסלו'; $('reasons').append(li); }
  $('diagnostics').replaceChildren();
  for (const [i, c] of [counter, ...(pair ? [adult] : [])].entries()) for (const line of diagnosticLines(c.snapshot())) {
    const li = document.createElement('li'); li.textContent = (pair ? i ? 'אבא: ' : 'הילד: ' : '') + line; $('diagnostics').append(li);
  }
  const p95 = log.length ? [...log].sort((a,b) => a.processingMs - b.processingMs)[Math.floor((log.length - 1) * .95)].processingMs : 0;
  const meanFps = totalElapsed ? 1000 * Math.max(0, totalFrames - 1) / totalElapsed : 0;
  $('result-metrics').textContent = `${totalFrames} פריימים עובדו · FPS ממוצע: ${meanFps.toFixed(1)} · זיהוי ממוצע: ${(totalInference / Math.max(totalFrames, 1)).toFixed(0)} מ״ש · זמן עיבוד P95 (עד 900 פריימים): ${p95.toFixed(0)} מ״ש`;
}
$('finish').onclick = results;
$('stop').onclick = () => { if (active) results(); else { release(); $('setup').hidden = false; $('session').hidden = true; } };
$('again').onclick = () => { $('result').hidden = true; $('setup').hidden = false; $('recording-panel').hidden = true; $('record').checked = false; };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: pair ? 3 : 2, exercise: EXERCISES.indexOf(exercise), totalFrames, retainedFrames: log.length,
    counted: counter.count, rejected: counter.rejected, reasons: counter.reasons,
    thresholds: counter.t, framing: FRAMING, camera: cameraInfo, diagnostics: counter.snapshot(), frames: log,
    ...(pair ? { adult: { counted: adult.count, rejected: adult.rejected, reasons: adult.reasons, thresholds: adult.t, diagnostics: adult.snapshot() } } : {}) }, null, 2)], { type: 'application/json' });
  download(blob, 'cam-lab-performance.json');
};
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function startRecording() {
  // A pair recording must include the upright identity reference, even when
  // recording is enabled manually after the first placement check.
  if (pair) tracker = new PeopleTracker();
  placement = new PlacementGuide();
  gate = new RestGate(exercise, counter.t); adultGate = pair ? new RestGate(exercise, adult.t) : null;
  placementGate = new RestGate('squats', counter.t); placementDone = !FLOOR.includes(exercise);
  $('start').disabled = true;
  recorder.start({ exercise, mode: pair ? 'pair' : 'solo', thresholds: counter.t, adultThresholds: adult?.t,
    aspect: video.videoWidth / video.videoHeight || 4 / 3 }, performance.now()); paintRecorder();
}
function paintRecorder() {
  $('record-toggle').textContent = recorder.active ? 'עצירת הקלטת שלד' : 'התחלת הקלטת שלד';
  $('record-toggle').disabled = !recorder.active && (active || !stream || !!recorder.recording);
  $('record-download').disabled = !recorder.recording?.frames.length;
  $('record-status').textContent = recorder.active ? `מקליט נקודות שלד בלבד · ${recorder.recording.frames.length} פריימים` :
    recorder.recording ? recorder.recording.stoppedByLimit ? 'ההקלטה נעצרה במגבלת 6000 פריימים. אפשר להוריד אותה.' : 'הקלטת השלד נעצרה. אפשר להוריד אותה.' : 'מצב פרטי: הקלטת שלד כבויה';
}
$('record-toggle').onclick = () => { if (recorder.active) recorder.stop(); else if (!active && stream && !recorder.recording) startRecording(); paintRecorder(); };
$('record-download').onclick = () => { const json = recorder.json(); if (json) download(new Blob([json], { type: 'application/json' }), 'cam-lab-skeleton.json'); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && stream) {
    if (active) results(); else { release(); $('setup').hidden = false; $('session').hidden = true; }
  }
});
window.addEventListener('pagehide', release);
