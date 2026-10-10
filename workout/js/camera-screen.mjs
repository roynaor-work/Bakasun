import { CameraAttempt } from './camera-session.mjs?v=20261010-camera-1';
import { CameraDemo, cameraStage } from './camera-demo.mjs?v=20261010-camera-1';
import { acquireCamera, configureZoom, cameraSnapshot, reduceResolution, screenOrientation } from '../cam-lab/camera.mjs?v=20261010-camera-1';
import { CAMERA_LINES, VOICE_BY_ID } from './voice-lines.js?v=20261010-camera-1';
import { createVoicePlayer } from './voice-player.js?v=20261010-camera-1';

export const cameraMarkup = name => `<div class="stack camera-screen">
  <div class="row between"><button class="btn" id="camera-exit">חזרה</button><h1>${name}</h1></div>
  <div class="camera-view" id="camera-view">
    <video id="camera-video" autoplay muted playsinline></video><canvas id="camera-skeleton"></canvas>
    <div class="camera-demo intro" id="camera-demo"><div class="camera-demo-stage" id="camera-demo-stage"></div>
      <p id="camera-demo-caption">ככה עושים</p><button class="btn" id="camera-help-close" hidden>סוגרים</button></div>
    <output id="camera-countdown" aria-live="polite"></output>
  </div>
  <div class="camera-score"><output id="camera-count">0</output><span id="camera-target"></span></div>
  <p id="camera-status" role="status">רגע, המצלמה נפתחת</p>
  <label class="camera-distance">קרוב <meter id="camera-distance" min="0" max="1" value="0.5"></meter> רחוק</label>
  <p class="small" id="camera-zoom"></p>
  <div class="row"><button class="btn grow" id="camera-help">איך עושים?</button><button class="btn ok grow" id="camera-finish">סיום</button></div>
  <button class="btn" id="camera-wide" hidden>מצלמה רחבה</button>
</div>`;

const links = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function drawSkeleton(canvas, poses, video) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 3;
  const located = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const color = p => (p.visibility || 0) >= .65 ? '#70e2b5' : (p.visibility || 0) >= .35 ? '#ffd685' : '#ff8b8b';
  for (const { landmarks: points } of poses) {
    for (const [a,b] of links) if (located(points[a]) && located(points[b])) {
      ctx.strokeStyle = color(points[a]); ctx.beginPath(); ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
      ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); ctx.stroke();
    }
    for (const p of points) if (located(p)) { ctx.fillStyle = color(p); ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2); ctx.fill(); }
  }
}

// Optional repository recordings, then installed Hebrew voices. Never network TTS.
function cameraCoach(enabled) {
  const synth = globalThis.speechSynthesis; let audio;
  const player = createVoicePlayer({
    context: () => { const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      try { return audio ||= AC ? new AC() : null; } catch { return null; } },
    fetchFile: url => fetch(url), cancelFallback: () => synth?.cancel(),
    speakFallback: (text, options, done) => {
      const voice = synth?.getVoices().find(v => v.localService && /^(he|iw)(?:-|_|$)/i.test(v.lang));
      if (!voice) return false;
      try {
        const speech = new SpeechSynthesisUtterance(text); speech.voice = voice; speech.lang = 'he-IL'; speech.rate = .85;
        let ended = false;
        speech.onend = speech.onerror = () => { if (!ended) { ended = true; done(); } }; synth.speak(speech); return true;
      } catch { return false; }
    },
  });
  return {
    say(id, onDone = () => {}) { const line = VOICE_BY_ID['camera-' + id];
      if (!enabled || !line) return onDone(); player.play(line.text, { onDone }); },
    stop: () => player.stop(),
    dispose: () => { player.stop(); void audio?.close().catch(() => {}); },
  };
}

export function openWorkoutCamera({ host, exercise, target, initialCount = 0, queue, use3d, voice = true,
  onCount, onFinish, onFallback, onRetry, onUploadError, deviceId }) {
  const $ = id => host.querySelector('#camera-' + id), video = $('video');
  const coach = cameraCoach(voice);
  $('demo-caption').textContent = CAMERA_LINES['intro-' + exercise.id][0];
  let worker, raf, watchdog, introTimer, introWatchdog, stopped = false, busy = false, ready = false, lastVideo = -1, id = 0;
  const demo = new CameraDemo({ exercise, stage: cameraStage($('demo-stage'), exercise, use3d),
    paint: mode => { $('demo').className = 'camera-demo ' + mode; $('help-close').hidden = mode !== 'help';
      if (mode === 'intro' || mode === 'help') $('demo-caption').textContent = CAMERA_LINES['intro-' + exercise.id][0]; },
    say: reason => { const key = Object.hasOwn(CAMERA_LINES, reason) ? reason : 'partial';
      $('demo-caption').textContent = CAMERA_LINES[key][0]; coach.say(key); } });
  const attempt = new CameraAttempt({ exercise: exercise.id, target: Math.max(1, target - initialCount), initialCount, queue,
    onCue: n => { $('countdown').textContent = n || ''; if (n) coach.say(String(n)); else coach.stop(); },
    onStart: () => { demo.start(); $('view').dataset.counting = 'true'; $('status').textContent = 'מתחילים!'; },
    onCount: n => { $('count').textContent = initialCount + n; onCount(initialCount + n); },
    onReject: reason => demo.reject(reason), onFinish,
    onRelease: () => {
      stopped = true; ready = false; cancelAnimationFrame(raf); clearTimeout(watchdog); clearTimeout(introTimer); clearTimeout(introWatchdog);
      worker?.terminate(); demo.dispose(); coach.dispose();
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide);
    }, onUploadError, onCaptureError: () => fail('recording-failed') });
  const fail = reason => { if (attempt.ended) return; attempt.runtimeError = reason;
    // onFinish stores any counted progress; fallback restores the ordinary exercise.
    attempt.finish('failure'); onFallback(); };
  const hidden = () => { if (document.hidden) attempt.finish('hidden'); };
  const pagehide = () => attempt.finish('pagehide');
  document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
  $('count').textContent = initialCount; $('target').textContent = `מתוך ${target}`;
  $('finish').onclick = () => attempt.finish('finish'); $('exit').onclick = () => attempt.finish('exit');
  $('help').onclick = () => { attempt.pause(); demo.help(true); coach.say('intro-' + exercise.id); };
  $('help-close').onclick = () => { coach.stop(); demo.help(false); attempt.resume(); };
  let minimumIntro = false, spokenIntro = false;
  const introDone = () => { if (!attempt.introDone && minimumIntro && spokenIntro) { attempt.introDone = true; demo.prepare(); } };
  introTimer = setTimeout(() => { minimumIntro = true; introDone(); }, 4000);
  coach.say('intro-' + exercise.id, () => { spokenIntro = true; introDone(); });
  introWatchdog = setTimeout(() => { spokenIntro = true; introDone(); }, 12000);

  async function tick() {
    if (stopped) return;
    if (ready && !busy && video.readyState >= 2 && video.currentTime !== lastVideo && !document.hidden) {
      busy = true; lastVideo = video.currentTime;
      try {
        const bitmap = await createImageBitmap(video);
        if (stopped) { bitmap.close(); return; }
        worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now(), id: ++id }, [bitmap]);
        watchdog = setTimeout(() => fail('frame-timeout'), 15000);
      } catch { fail('frame-failed'); }
    }
    if (!stopped) raf = requestAnimationFrame(tick);
  }
  void (async () => {
    await Promise.resolve(); // Let the router own the controller before any synchronous failure.
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia || !globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) return fail('unsupported');
    try {
      const orientation = screenOrientation();
      const { stream, permission } = await acquireCamera(navigator.mediaDevices, { orientation, deviceId });
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      // Start all consented recording immediately, before playback/model loading.
      attempt.open(stream); if (stopped) return; video.srcObject = stream; await video.play();
      if (stopped) return;
      attempt.skeleton && (attempt.skeleton.recording.aspect = video.videoWidth / video.videoHeight);
      $('view').style.aspectRatio = `${video.videoWidth}/${video.videoHeight}`;
      const track = stream.getVideoTracks()[0];
      attempt.camera = { ...cameraSnapshot(track), ptz: permission };
      const zoom = await configureZoom(track, { wide: true, ptz: permission });
      if (stopped) return;
      attempt.camera = { ...cameraSnapshot(track), ptz: { ...permission, actualZoom: zoom.actualZoom } };
      $('zoom').textContent = zoom.actualZoom == null ? 'המצלמה מוכנה' : `זום: ${zoom.actualZoom}×`;
      if (zoom.wideDevice) { $('wide').hidden = false; $('wide').onclick = () => { attempt.finish('retry'); onRetry(zoom.wideDevice.deviceId); }; }
      worker = new Worker(new URL('../cam-lab/pose-worker.js?v=20261010-camera-1', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        if (data.type === 'ready') { clearTimeout(watchdog); ready = true; tick(); }
        else if (data.type === 'pose') {
          busy = false; clearTimeout(watchdog);
          const result = attempt.pose(data, video.videoWidth / video.videoHeight);
          if (stopped || !result) return;
          $('view').dataset.frames = attempt.frames;
          drawSkeleton($('skeleton'), result.poses, video);
          $('distance').value = 1 - result.distance.position;
          const code = result.distance.direction === 'closer' ? 'far' : result.distance.direction === 'away' ? 'close' : result.placementCode === 'tilt' ? 'tilt' : result.code;
          const key = Object.hasOwn(CAMERA_LINES, code) ? code : 'body';
          $('status').textContent = attempt.pausedAt != null ? 'מחכים עד שסוגרים' : CAMERA_LINES[key][0];
          demo.follow(result.prepared.features, attempt.counter.t, result.fps);
        } else if (data.type === 'model-switching') ready = false;
        else if (data.type === 'model-change') {
          ready = true;
          if (data.lowerResolution) void reduceResolution(track, { orientation }).then(info => {
            if (!stopped) attempt.camera = { ...info, ptz: attempt.camera.ptz };
          });
        } else if (data.type === 'error') fail('model-failed');
      };
      worker.onerror = () => fail('worker-failed'); worker.postMessage({ type: 'init', numPoses: 1 });
      watchdog = setTimeout(() => fail('model-timeout'), 60000);
      track.addEventListener('ended', () => { if (!stopped) fail('camera-ended'); }, { once: true });
    } catch { fail('camera-failed'); }
  })();
  return { finish: reason => attempt.finish(reason), stop: () => attempt.finish('exit') };
}
