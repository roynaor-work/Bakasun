import { CameraAttempt, cameraPrivacy } from './camera-session.mjs?v=20261010-camera-1';
import { CameraDemo } from './camera-demo.mjs?v=20261010-camera-1';
import { acquireCamera, configureZoom, cameraSnapshot, reduceResolution, screenOrientation } from '../cam-lab/camera.mjs?v=20261010-camera-1';
import { VIDEO_LIMIT_MS } from '../cam-lab/video-recording.mjs?v=20261010-camera-1';
import { numWord } from './count.js?v=20261010-camera-1';
import { speakLocal, stopSpeak } from './speech.js?v=20261010-camera-1';

const statusText = { legs: 'לא רואה את הרגליים', hands: 'לא רואה את הידיים', head: 'לא רואה את הראש',
  side: 'נסתובב לצד המצלמה', body: 'ניכנס לתמונה', world: 'נחכה רגע', activeSide: 'נחזור לתמונה',
  waiting: 'נחזור לתנוחה הראשונה', armed: 'זזים בקצב שלך', moving: 'זזים בקצב שלך' };
const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function drawSkeleton(context, canvas, points) {
  const located = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const confidence = p => Math.min(p.visibility ?? 0, p.presence ?? 1);
  const color = p => confidence(p) >= .65 ? '#70e2b5' : confidence(p) >= .35 ? '#ffd685' : '#ff8b8b';
  context.lineWidth = 3;
  for (const [a,b] of links) {
    if (!located(points[a]) || !located(points[b])) continue;
    context.strokeStyle = color(confidence(points[a]) < confidence(points[b]) ? points[a] : points[b]);
    context.beginPath(); context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); context.stroke();
  }
  for (const p of points) if (located(p)) {
    context.fillStyle = color(p); context.beginPath(); context.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2); context.fill();
  }
}

export function cameraScreen({ host, exercise: ex, item, uploads, mount, esc, stageHtml, wireStage,
  progress, complete, fallback, back }) {
  uploads.refresh();
  mount(`<section class="camera-screen stack">
    <div class="row between"><button class="btn" id="camera-back">חזרה</button><h1>${esc(ex.name)}</h1></div>
    <p class="small" id="camera-privacy">${cameraPrivacy(uploads.queue?.enabled)}</p>
    <p class="small muted">להורה: אם מוצעת הרשאת זום, מומלץ לאשר.</p>
    <div class="camera-view" id="camera-view">
      <video id="camera-video" autoplay muted playsinline></video><canvas id="camera-skeleton" aria-hidden="true"></canvas>
      <div class="camera-demo" id="camera-demo" data-mode="intro">
        <div class="camera-demo-stage">${stageHtml(ex)}</div>
        <p id="camera-demo-text">ככה עושים</p><button class="btn" id="camera-help-close" hidden>סגור</button>
      </div>
      <output id="camera-count" aria-label="חזרות">${item.done || 0}</output>
    </div>
    <p id="camera-status" role="status">מכינים את המצלמה</p>
    <div class="camera-distance"><span>רחוק</span><meter id="camera-distance" min="0" max="1" value=".5" aria-label="מרחק מהמצלמה"></meter><span>קרוב</span></div>
    <p class="small" id="camera-distance-text">נעמוד במקום נוח</p>
    <p class="small muted" id="camera-zoom"></p>
    <div class="row wrap"><button class="btn" id="camera-flip">החלף מצלמה</button><button class="btn" id="camera-wide" hidden>מצלמה רחבה</button></div>
    <p class="center">היעד: ${item.target} חזרות</p>
    <div class="row"><button class="btn grow" id="camera-help">איך עושים?</button><button class="btn ok grow" id="camera-finish">סיום</button></div>
  </section>`, true);
  const $ = id => host.querySelector('#' + id);
  const video = $('camera-video'), canvas = $('camera-skeleton'), context = canvas.getContext('2d');
  const demoBox = $('camera-demo'), demoStage = wireStage();
  let attempt, worker, ready = false, busy = false, raf = 0, watchdog = 0, limitTimer = 0, introTimer = 0;
  let generation = 0, stopped = false, lastVideoTime = -1, frameId = 0, poseFrames = 0, fpsWindow = [], facing = 'user', wideDevice = null;
  const orientation = screenOrientation();
  const fitVideo = () => {
    const aspect = video.videoWidth / video.videoHeight || .75;
    $('camera-view').style.aspectRatio = String(aspect);
    $('camera-view').style.setProperty('--camera-aspect', String(aspect));
  };
  const initialCount = item.done || 0, initialSecs = item.secs || 0;
  const demo = new CameraDemo({ stage: demoStage, exercise: ex, speak: text => speakLocal(text),
    paint: mode => { demoBox.dataset.mode = mode; $('camera-help-close').hidden = mode !== 'help'; },
    pause: open => attempt?.help(open) });
  const releaseUI = () => {
    if (stopped) return;
    stopped = true; generation++; ready = false; busy = false;
    cancelAnimationFrame(raf); clearTimeout(watchdog); clearTimeout(limitTimer); clearTimeout(introTimer);
    worker?.terminate(); worker = null; demo.dispose(); stopSpeak();
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide);
    video.srcObject = null;
  };
  const end = result => {
    releaseUI(); progress(result.counted, initialSecs + result.seconds);
    if (result.reason === 'target') { complete(result.counted, initialSecs + result.seconds); return; }
    if (['exit', 'pagehide', 'hidden', 'switch', 'error'].includes(result.reason)) return;
    mount(`<section class="stack camera-result"><h1>סיימנו את הניסיון</h1><p>${result.counted} חזרות</p>
      <button class="btn primary big" id="camera-continue">ממשיכים באימון</button>
      <button class="btn big" id="camera-again">נסה שוב</button></section>`, true);
    host.querySelector('#camera-continue').onclick = () => complete(result.counted, initialSecs + result.seconds);
    host.querySelector('#camera-again').onclick = back;
  };
  attempt = new CameraAttempt({ exercise: ex.id, target: item.target, initialCount, uploads,
    onCue: n => { $('camera-count').textContent = n; speakLocal(numWord(n), { quick: true }); },
    onStart: () => { $('camera-count').textContent = initialCount; demo.counting(); },
    onCount: (n, secs, time) => { $('camera-count').textContent = n; progress(n, initialSecs + secs); demo.counted(time); speakLocal(numWord(n), { quick: true }); },
    onRejected: reason => demo.rejected(reason), onEnd: end });
  const leave = (reason = 'exit') => { if (!attempt.ending) attempt.finish(reason); releaseUI(); return attempt.ending; };
  const fail = () => { if (stopped) return; attempt.runtimeError = 'camera-or-model'; leave('error'); fallback(); };
  const visibility = () => { if (document.hidden) { leave('hidden'); fallback(false); } };
  const pagehide = () => leave('pagehide');
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
  $('camera-finish').onclick = () => leave('finish');
  $('camera-back').onclick = () => { leave('exit'); fallback(false); };
  $('camera-help').onclick = () => { demo.help(true); $('camera-status').textContent = 'צופים יחד. הספירה מחכה'; $('camera-help-close').focus(); };
  $('camera-help-close').onclick = () => { demo.help(false); $('camera-help').focus(); };
  const switchCamera = deviceId => { leave('switch'); void attempt.released.then(() => {
    if (host.contains(demoBox)) back({ facing: deviceId ? wideDevice.facing || 'environment' : facing === 'user' ? 'environment' : 'user', deviceId });
  }); };
  $('camera-flip').onclick = () => switchCamera(); $('camera-wide').onclick = () => switchCamera(wideDevice.deviceId);

  async function tick(token) {
    if (stopped || token !== generation) return;
    if (ready && !busy && video.readyState >= 2 && video.currentTime !== lastVideoTime && !document.hidden) {
      busy = true; lastVideoTime = video.currentTime;
      try {
        const bitmap = await createImageBitmap(video);
        if (stopped || token !== generation) { bitmap.close(); return; }
        worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), id: ++frameId }, [bitmap]);
        watchdog = setTimeout(fail, 15000);
      } catch { fail(); return; }
    }
    raf = requestAnimationFrame(() => tick(token));
  }
  async function open(options = {}) {
    if (stopped) return;
    const token = generation;
    try {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || !globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) throw Error('camera unavailable');
      facing = options.facing || 'user';
      const acquired = await acquireCamera(navigator.mediaDevices, { facing, orientation, deviceId: options.deviceId });
      if (stopped || token !== generation) { acquired.stream.getTracks().forEach(track => track.stop()); return; }
      attempt.open(acquired.stream);
      limitTimer = setTimeout(() => leave('limit'), VIDEO_LIMIT_MS);
      video.srcObject = acquired.stream; await video.play();
      if (stopped) return;
      fitVideo();
      const track = acquired.stream.getVideoTracks()[0];
      const zoom = await configureZoom(track, { facing, ptz: acquired.permission });
      if (stopped) return;
      attempt.camera = { ...cameraSnapshot(track), ptz: { ...acquired.permission, actualZoom: zoom.actualZoom } };
      $('camera-view').classList.toggle('rear', (zoom.settings.facingMode || facing) === 'environment');
      $('camera-zoom').textContent = zoom.actualZoom == null ? 'הזום לפי המצלמה שלך' : `זום המצלמה: ${zoom.actualZoom}×`;
      wideDevice = zoom.wideDevice; $('camera-wide').hidden = !wideDevice;
      worker = new Worker(new URL('../cam-lab/pose-worker.js?v=20261010-camera-1', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (stopped || token !== generation) return;
        if (data.type === 'ready') { clearTimeout(watchdog); ready = true; $('camera-status').textContent = 'נחזור לתנוחה הראשונה'; tick(token); }
        else if (data.type === 'model-switching') { ready = false; demo.fps(data.fps); }
        else if (data.type === 'model-change') {
          ready = true; demo.fps(data.fps);
          if (data.lowerResolution) void reduceResolution(track, { orientation }).then(() => {
            if (!stopped) attempt.camera = { ...attempt.camera, ...cameraSnapshot(track) };
          });
        } else if (data.type === 'error') fail();
        else if (data.type === 'pose') {
          busy = false; clearTimeout(watchdog);
          $('camera-view').dataset.frames = String(++poseFrames);
          const aspect = video.videoWidth / video.videoHeight || 1;
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; fitVideo(); }
          context.clearRect(0, 0, canvas.width, canvas.height); (data.poses || []).forEach(p => drawSkeleton(context, canvas, p.landmarks || []));
          fpsWindow.push(data.timestamp); while (fpsWindow.length > 1 && data.timestamp - fpsWindow[0] > 2500) fpsWindow.shift();
          if (fpsWindow.length > 1 && data.timestamp - fpsWindow[0] >= 1800) demo.fps((fpsWindow.length - 1) * 1000 / (data.timestamp - fpsWindow[0]));
          const result = attempt.frame(data, aspect); if (stopped || !result) return;
          $('camera-distance').value = result.distance.position;
          const direction = result.distance.direction;
          $('camera-distance-text').textContent = direction === 'closer' ? 'תתקרב' : direction === 'away' ? 'תתרחק' : 'המרחק נוח';
          if (result.state !== 'paused') $('camera-status').textContent = result.state === 'countdown' ? 'עוד רגע מתחילים' : statusText[result.code] || 'נחכה רגע';
          demo.movement(data.timestamp, result.phase);
        }
      };
      worker.onerror = fail; worker.postMessage({ type: 'init', numPoses: 1 });
      watchdog = setTimeout(fail, 60000); track.addEventListener('ended', fail, { once: true });
      // Allow one complete, large demonstration before automatic calibration.
      Promise.resolve(demoStage.ready).then(() => {
        if (!stopped) introTimer = setTimeout(() => { attempt.introDone = true; }, 5000);
      });
    } catch { if (!stopped && token === generation) fail(); }
  }
  return { open, leave };
}
