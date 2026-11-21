import { EXERCISES, CATS, byId } from '../exercises.js?v=20261010-camera-1';
import { Figure } from '../figure.js?v=20261010-camera-1';
import { buildItems, workoutReward } from '../logic.js?v=20261014-w2g-1';
import { PROGRAMS } from '../programs.js?v=20261010-camera-1';
import { LocalCapture } from './capture.mjs?v=20261010-camera-1';
import { CAMERA_EXERCISES, MotionCounter, MOTION_MAX_GAP_MS } from './motion.mjs?v=20261010-camera-1';
import { PoseTracker } from './tracking.mjs?v=20261010-camera-1';

const node = id => document.getElementById(id);
function text(id, value) {
  if (node(id).textContent !== value) node(id).textContent = value;
}
function visible(id, show) {
  // SVG elements have no HTMLElement.hidden IDL property.
  node(id).toggleAttribute('hidden', !show);
}
function status(state, message) {
  node('status').dataset.state = state;
  text('status', message);
}
function showHint(message = '') {
  text('hint', message);
  visible('hint', Boolean(message));
}

const trustText = 'התרגיל הזה נספר לפי מה שסימנת, באימון על אמון.';
const cameraText = 'המונה מתקדם כשהמצלמה רואה את התנועה המתאימה.';
function partialText(ex) {
  if (ex.signal) return 'המצלמה סופרת את המסלול הנראה אחרי האות. אפשר לספור בעצמך אם חלק מהמסלול מחוץ לתמונה.';
  if (ex.place === 'hall') return 'המצלמה סופרת תנועה לאורך המסלול שנראה בתמונה. אפשר לספור בעצמך אם חלק מהמסלול מחוץ לתמונה.';
  if (ex.prop) return 'המצלמה מסתכלת על תנועת הגוף. כדאי לבדוק את הציוד והמשטח עם מבוגר.';
  return 'המצלמה יכולה לראות חלק מהתנועה. אפשר לבחור לספור בעצמך.';
}
const viewText = {
  front: 'הפנים אל המצלמה.',
  side: 'הצד של הגוף אל המצלמה.',
  diagonal: 'עמוד בזווית קלה למצלמה.',
};
const errors = {
  permission: 'המצלמה מחכה לאישור. אפשר לנסות שוב, או להמשיך בלי מצלמה.',
  timeout: 'המצלמה מתעכבת. אפשר לנסות שוב, או להמשיך בלי מצלמה.',
  ended: 'המצלמה נעצרה. אפשר להפעיל שוב, או להמשיך בלי מצלמה.',
  unavailable: 'המצלמה לא נפתחה במכשיר הזה. אפשר להמשיך בלי מצלמה.',
  worker: 'זיהוי התנוחה לא נפתח. אפשר לנסות שוב, או להמשיך בלי מצלמה.',
};
let items = [];
let results = [];
let index = 0;
let item;
let exercise;
let policy;
let chosenMode;
let mode;
let tracker;
let counter;
let reference;
let capture;
let cameraDone = 0;
let trustDone = 0;
let demoUntil = -Infinity;
let hintUntil = -Infinity;
let slowFrames = 0;
let lastSample;
let timerStart = 0;
let timerElapsed = 0;
let timerFrame = 0;
let signalTimeout;
let signalReady = false;
let audio;
let figure;
let demoOpen = false;

const isTimed = () => item.type === 'time';
const credit = () => Math.min(item.target, cameraDone + trustDone);
const supportsCamera = () => policy && (!isTimed() || policy.kind !== 'reps');

function renderProgress() {
  const done = credit();
  text('progress', String(isTimed() ? Math.floor(done + 0.00001) : done));
  text('target', 'מתוך ' + item.target + (isTimed() ? ' שניות' : ' חזרות'));
  node('trust-add').disabled = demoOpen || done >= item.target;
  node('trust-remove').disabled = demoOpen || trustDone <= 0;
  node('trust-timer').disabled = demoOpen || (!timerStart && done >= item.target);
  node('attest').disabled = Boolean(timerStart) || trustDone <= 0;
  node('finish').disabled = Boolean(timerStart) || !(done > 0) || (trustDone > 0 && !node('attest').checked);
}

function clearSignal() {
  clearTimeout(signalTimeout);
  signalTimeout = undefined;
  visible('signal-status', false);
  void audio?.close().catch(() => {});
  audio = null;
}
function renderSignal() {
  node('signal').disabled = demoOpen || signalTimeout !== undefined || (mode === 'camera' && !signalReady);
}

function pauseTimer() {
  if (!timerStart) return;
  timerElapsed += performance.now() - timerStart;
  timerStart = 0;
  cancelAnimationFrame(timerFrame);
  trustDone = Math.min(item.target - cameraDone, Math.floor(timerElapsed / 1000));
  text('trust-timer', 'המשך שעון');
  renderProgress();
}

function closeCamera() {
  capture?.close();
  capture = null;
  tracker = null;
  reference = null;
  signalReady = false;
  lastSample = null;
  slowFrames = 0;
  demoUntil = hintUntil = -Infinity;
  clearSignal();
  renderSignal();
  counter?.pause();
  visible('camera-preview', false);
}

function toggleDemo(open) {
  demoOpen = open;
  node('demo').setAttribute('aria-expanded', String(open));
  text('demo', open ? 'סגירת הדגמה' : 'הדגם לי');
  visible('demonstration', open);
  visible('steps', open);
  figure?.stop();
  if (open) {
    closeCamera();
    pauseTimer();
    showHint();
    figure ??= new Figure(node('demonstration'));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) figure.still(exercise);
    else figure.play(exercise, 0.7);
    if (mode === 'camera') {
      visible('retry', true);
      status('paused', 'אחרי ההדגמה אפשר להפעיל שוב את המצלמה.');
    }
  }
  node('retry').disabled = open;
  renderSignal();
  renderProgress();
}

function selectMode(nextMode) {
  mode = nextMode;
  visible('camera-controls', nextMode === 'camera');
  visible('trust-controls', nextMode === 'trust');
  visible('trust-add', !isTimed());
  visible('trust-remove', !isTimed());
  visible('trust-timer', isTimed());
  visible('signal', Boolean(exercise.signal));
  text('verification', nextMode === 'trust' ? trustText : policy.verification === 'partial' ? partialText(exercise) : cameraText);
  renderSignal();
}

function useTrust(reason = '') {
  closeCamera();
  chosenMode = 'trust';
  selectMode('trust');
  showHint();
  status('trust', reason || (isTimed() ? 'אפשר להפעיל את השעון כשתהיה מוכן לתרגיל.' : 'בסיום כל חזרה אפשר לסמן חזרה אחת.'));
  renderProgress();
}

function onPose(sample) {
  const result = tracker.update(sample);
  if (result.gap || !result.ready) counter.pause();
  slowFrames = lastSample != null && sample.time - lastSample > MOTION_MAX_GAP_MS ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  lastSample = sample.time;
  const slow = slowFrames >= 3 && (result.ready || result.status === 'calibrating');
  signalReady = result.ready && !slow;
  if (!signalReady) {
    clearSignal();
    renderSignal();
    if (slow) {
      counter.pause();
      status('slow', 'המצלמה מצלמת לאט כרגע. אפשר להמשיך בלי מצלמה.');
    } else {
      let message = result.hint?.text || 'מחפשים תנוחה ברורה כדי להמשיך.';
      if (sample.aspect < 1 && (exercise.place === 'hall' || policy.setup === 'floor') &&
          ['missing', 'move-back', 'center'].includes(result.status)) {
        message += ' אפשר להניח את הטלפון לרוחב כדי שייכנס יותר מהתנועה.';
      }
      status(result.status, message);
    }
    showHint();
    hintUntil = -Infinity;
    return;
  }
  renderSignal();
  if (result.hint?.code === 'demo') {
    demoUntil = sample.time + 3200;
    status('ready', result.hint.text);
  }
  if (result.calibration && result.calibration !== reference) {
    reference = result.calibration;
    const { landmarks, world } = reference.reference;
    counter.setReference(landmarks, { aspect: sample.aspect, world });
  }
  const motion = counter.update(result.pose.landmarks, sample.time, { aspect: sample.aspect, world: result.pose.world });
  const cameraProgress = isTimed() ? motion.activeMs / 1000 : motion.count;
  cameraDone = Math.min(item.target, Number.isFinite(cameraProgress) ? Math.floor(cameraProgress + 0.00001) : 0);
  if (cameraDone >= item.target) status('ready', 'הגעת ליעד! אפשר לסיים את התרגיל.');
  else if (node('status').dataset.state !== 'ready' || sample.time >= demoUntil) {
    status('ready', 'מוכנים. אפשר להתחיל לזוז, או לבחור ״הדגם לי״.');
  }
  const hint = motion.hint?.text || (typeof motion.hint === 'string' ? motion.hint : '');
  if (motion.event === 'counted' && exercise.signal) visible('signal-status', false);
  if (cameraDone >= item.target || motion.event === 'counted') {
    showHint();
    hintUntil = -Infinity;
  } else if (hint) {
    showHint(hint);
    hintUntil = sample.time + 2800;
  } else if (sample.time >= hintUntil) showHint();
  if (policy.twoSides) {
    const amounts = isTimed() ? motion.sideMs.map(ms => Math.floor(ms / 1000)) : motion.sideCounts;
    text('side', 'צד אחד ' + amounts[0] + ' · צד שני ' + amounts[1]);
    visible('side', true);
  }
  renderProgress();
}

function startCamera() {
  if (demoOpen || capture) return;
  if (navigator.serviceWorker?.controller) {
    visible('retry', true);
    status('blocked', 'כדי להפעיל מצלמה, פתח את האימון בכתובת המקומית שמציג השרת.');
    return;
  }
  tracker = new PoseTracker({
    view: policy.view === 'diagonal' ? 'either' : policy.view,
    setup: policy.setup,
    required: policy.required,
  });
  counter ??= new MotionCounter(exercise.id, { goal: item.target });
  visible('retry', false);
  visible('camera-preview', true);
  showHint();
  status('opening', 'פותחים מצלמה במכשיר…');
  capture = new LocalCapture(node('camera'), {
    onPose,
    onReady: () => status('calibrating', 'מקמים את הגוף במסגרת. ' + (viewText[policy.view] || '')),
    onError: reason => {
      closeCamera();
      visible('retry', true);
      status('blocked', errors[reason]);
      showHint();
    },
  });
  void capture.start();
}

function exerciseItem() {
  item = items[index];
  exercise = byId[item.exId];
  policy = CAMERA_EXERCISES[exercise.id];
  cameraDone = trustDone = timerElapsed = 0;
  counter = null;
  node('attest').checked = false;
  text('trust-timer', 'התחלת שעון');
  text('exercise-name', exercise.name);
  text('skip', items.length > 1 ? 'דילוג לתרגיל הבא' : 'דילוג');
  text('item-position', items.length > 1 ? 'תרגיל ' + (index + 1) + ' מתוך ' + items.length : '');
  visible('side', false);
  node('steps').replaceChildren(...exercise.steps.map(step => {
    const li = document.createElement('li');
    li.textContent = step;
    return li;
  }));
  toggleDemo(false);
  showHint();
  node('exercise-name').focus();
  if (chosenMode === 'trust' || !supportsCamera()) {
    const preference = chosenMode;
    useTrust(preference === 'camera' ? 'זו תחנה לפי זמן. כאן אפשר להפעיל שעון ולסמן את מה שעשית.' : '');
    chosenMode = preference;
    return;
  }
  selectMode('camera');
  visible('retry', true);
  status('waiting', (viewText[policy.view] || '') + ' כשאתה מוכן, הפעל את המצלמה.');
  renderProgress();
}

function start(nextMode) {
  const program = PROGRAMS.find(candidate => candidate.id === node('program').value) || {
    items: [node('exercise').value],
  };
  items = buildItems(program, byId, node('level').value);
  if (!items.length) return;
  chosenMode = nextMode;
  index = 0;
  results = [];
  visible('setup', false);
  visible('summary', false);
  visible('session', true);
  exerciseItem();
  if (mode === 'camera') startCamera();
}

function saveResult(skipped) {
  const verified = skipped ? 0 : cameraDone;
  const declared = skipped || !node('attest').checked ? 0 : trustDone;
  results.push({ ...item, done: verified + declared, skipped, verified, declared });
}

function cleanItem() {
  closeCamera();
  pauseTimer();
  figure?.stop();
}

function finishWorkout() {
  cleanItem();
  visible('session', false);
  visible('summary', true);
  const summary = workoutReward(results);
  text('reward', summary.message);
  node('results').replaceChildren(...results.map(row => {
    const li = document.createElement('li');
    const amount = value => value + ' ' + (row.type === 'time'
      ? value === 1 ? 'שנייה' : 'שניות'
      : value === 1 ? 'חזרה' : 'חזרות');
    const observed = row.verified > 0 ? amount(row.verified) + ' לפי תנועה שנראתה' : '';
    const trust = row.declared > 0 ? amount(row.declared) + ' לפי מה שסימנת' : '';
    const status = [observed, trust].filter(Boolean).join(' · ') || 'דילגתי';
    li.textContent = row.name + ' · ' + status;
    return li;
  }));
  node('summary-title').focus();
}

function advance(skipped) {
  if (!skipped && node('finish').disabled) return;
  saveResult(skipped);
  cleanItem();
  index++;
  if (index === items.length) finishWorkout();
  else exerciseItem();
}

function timerTick(now) {
  trustDone = Math.min(item.target - cameraDone, Math.floor((timerElapsed + Math.max(0, now - timerStart)) / 1000));
  if (credit() >= item.target) {
    pauseTimer();
    status('trust', 'השעון הגיע ליעד. אפשר לאשר את מה שעשית.');
    return;
  }
  renderProgress();
  timerFrame = requestAnimationFrame(timerTick);
}

function signal() {
  clearSignal();
  const Audio = window.AudioContext || window.webkitAudioContext;
  try {
    if (Audio) {
      audio = new Audio();
      void audio.resume().catch(() => {});
    }
  } catch { audio = null; }
  visible('signal-status', true);
  text('signal-status', 'היכון… מחכים לאות.');
  signalTimeout = setTimeout(() => {
    signalTimeout = undefined;
    counter?.signal(performance.now());
    if (audio?.state === 'running') {
      const playing = audio;
      const tone = playing.createOscillator();
      tone.frequency.value = 680;
      tone.connect(playing.destination);
      tone.start();
      tone.stop(playing.currentTime + 0.15);
      tone.onended = () => {
        if (audio === playing) audio = null;
        if (playing.state !== 'closed') void playing.close().catch(() => {});
      };
    }
    text('signal-status', 'צא!');
    renderSignal();
  }, 1400 + Math.random() * 2000);
  renderSignal();
}

function pauseSession() {
  if (node('session').hidden) return;
  closeCamera();
  pauseTimer();
  figure?.stop();
  if (mode === 'camera') {
    visible('retry', true);
    status('paused', 'המצלמה כבויה. אפשר להפעיל אותה שוב כשתחזור.');
  }
}

function setup() {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
    visible('unavailable', true);
    return;
  }
  const params = new URLSearchParams(location.search);
  const exerciseMenu = node('exercise');
  for (const [category, details] of Object.entries(CATS)) {
    const group = document.createElement('optgroup');
    group.label = details.name;
    for (const ex of EXERCISES.filter(candidate => candidate.cat === category)) group.append(new Option(ex.name, ex.id));
    if (group.children.length) exerciseMenu.append(group);
  }
  exerciseMenu.value = Object.hasOwn(byId, params.get('ex')) ? params.get('ex') : 'squats';
  for (const program of PROGRAMS) node('program').append(new Option(program.name, program.id));
  if (PROGRAMS.some(p => p.id === params.get('program'))) node('program').value = params.get('program');
  function updateChoice() { visible('exercise-choice', !node('program').value); }
  updateChoice();
  node('program').onchange = updateChoice;
  node('camera-start').onclick = () => start('camera');
  node('trust-start').onclick = () => start('trust');
  node('retry').onclick = startCamera;
  node('switch-trust').onclick = () => useTrust();
  node('demo').onclick = () => toggleDemo(!demoOpen);
  node('signal').onclick = signal;
  node('attest').onchange = renderProgress;
  node('trust-add').onclick = () => {
    if (credit() >= item.target) return;
    trustDone++;
    node('attest').checked = false;
    renderProgress();
  };
  node('trust-remove').onclick = () => {
    trustDone = Math.max(0, trustDone - 1);
    node('attest').checked = false;
    renderProgress();
  };
  node('trust-timer').onclick = () => {
    if (timerStart) { pauseTimer(); return; }
    if (credit() >= item.target) return;
    node('attest').checked = false;
    timerStart = performance.now();
    text('trust-timer', 'השהיית שעון');
    timerFrame = requestAnimationFrame(timerTick);
    renderProgress();
  };
  node('finish').onclick = () => advance(false);
  node('skip').onclick = () => advance(true);
  node('stop').onclick = () => {
    pauseTimer();
    saveResult(cameraDone === 0 && !(trustDone > 0 && node('attest').checked));
    finishWorkout();
  };
  node('another').onclick = () => {
    visible('summary', false);
    visible('setup', true);
    node('camera-start').focus();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSession();
    else if (demoOpen && !node('session').hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) figure?.play(exercise, 0.7);
  });
  window.addEventListener('pagehide', pauseSession);
  visible('setup', true);
}

setup();
