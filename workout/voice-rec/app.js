import { VOICE_LINES } from '../js/voice-lines.js?v=20261010-camera-1';
import { trimVoiceBuffer } from '../js/voice-player.js?v=20261010-camera-1';
import { wavBlob, zipBlob } from './files.js?v=20261010-camera-1';
import { openRecordings } from './storage.js?v=20261010-camera-1';

const $ = id => document.getElementById(id), clips = new Map();
let index = 0, recorder = null, stream = null, context = null, database = null, previewUrl = null, busy = false, recording = false;
const current = () => VOICE_LINES[index];
const status = text => { $('status').textContent = text; };
const supported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));
function stopPreview() { $('preview').pause(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; $('preview').removeAttribute('src'); }
function render() {
  const line = current(), clip = clips.get(line.id);
  stopPreview();
  $('line').textContent = line.text; $('filename').textContent = line.file;
  $('category').textContent = `משפט ${index + 1} מתוך ${VOICE_LINES.length}`;
  $('progress').textContent = `${clips.size} מתוך ${VOICE_LINES.length} הוקלטו`;
  $('bar').max = VOICE_LINES.length; $('bar').value = clips.size;
  $('record').textContent = recording ? '■ עצירה' : clip ? '● הקלטה מחדש' : '● הקלטה';
  $('record').classList.toggle('recording', recording);
  $('record').disabled = !supported || (busy && !recording);
  $('previous').disabled = busy || index === 0;
  $('next').disabled = busy || index === VOICE_LINES.length - 1;
  $('missing').disabled = busy || clips.size === VOICE_LINES.length;
  $('download').disabled = busy || clips.size === 0;
  $('preview').hidden = !clip || busy;
  if (clip && !busy) { previewUrl = URL.createObjectURL(clip.blob); $('preview').src = previewUrl; }
  status(!supported ? 'ההקלטה אינה נתמכת כאן. פתחו ב־Chrome באנדרואיד או Safari באייפון דרך HTTPS.' :
    recording ? 'מקליט… קראו את המשפט ולחצו עצירה.' : busy ? 'מעבד את ההקלטה…' :
    clips.size === VOICE_LINES.length ? 'כל המשפטים הוקלטו! אפשר להוריד את ה־ZIP.' :
    clip ? 'ההקלטה מוכנה להאזנה. אפשר להקליט שוב או להמשיך.' : 'מוכנים? קראו רק את המשפט שמופיע כאן.');
}
function releaseMic() { stream?.getTracks().forEach(track => track.stop()); stream = null; }
async function startRecording() {
  const line = current(); busy = true; render();
  let chunks = [];
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    await context.resume();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true }, video: false });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const sessionRecorder = recorder;
    let failed = false;
    sessionRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    sessionRecorder.onerror = () => { failed = true; recording = false; releaseMic(); };
    sessionRecorder.onstop = async () => {
      recording = false; releaseMic(); render();
      if (failed) { chunks = []; busy = false; render(); status('ההקלטה נכשלה. ההקלטה הקודמת נשמרה; אפשר לנסות שוב.'); return; }
      try {
        const input = new Blob(chunks, { type: sessionRecorder.mimeType });
        const decoded = await context.decodeAudioData(await input.arrayBuffer());
        const trimmed = trimVoiceBuffer(decoded, context), blob = wavBlob(trimmed);
        const clip = { id: line.id, text: line.text, blob };
        if (database) { try { await database.save(clip); } catch { database = null; } }
        clips.set(line.id, clip); busy = false; render();
        if (!database) status('הוקלט בזיכרון הדף. השמירה במכשיר אינה זמינה; הורידו ZIP לפני יציאה.');
      } catch (error) { busy = false; render(); status(`לא נשמרה הקלטה חדשה: ${error.message || 'נסו שוב'}. ההקלטה הקודמת נשארה.`); }
      chunks = [];
    };
    recorder.start(); recording = true; render();
  } catch { busy = false; recording = false; releaseMic(); render(); status('לא ניתן להתחיל הקלטה. בדקו הרשאת מיקרופון ופתחו את הדף דרך HTTPS.'); }
}
$('record').onclick = () => {
  if (recording) { recording = false; recorder.stop(); render(); }
  else if (!busy) void startRecording();
};
$('previous').onclick = () => { if (!busy && index > 0) { index--; render(); } };
$('next').onclick = () => { if (!busy && index < VOICE_LINES.length - 1) { index++; render(); } };
$('missing').onclick = () => { if (busy) return; const at = VOICE_LINES.findIndex(line => !clips.has(line.id)); if (at >= 0) { index = at; render(); } };
$('download').onclick = async () => {
  if (busy) return;
  busy = true; render(); $('export-status').textContent = 'מכין ZIP…';
  try {
    const files = VOICE_LINES.filter(line => clips.has(line.id)).map(line => ({ name: line.file, blob: clips.get(line.id).blob }));
    const blob = await zipBlob(files), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'workout-voice.zip'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('export-status').textContent = `ההורדה מוכנה: ${files.length} קובצי WAV. באייפון: אפשר למצוא את ה־ZIP ב״קבצים״ ← ״הורדות״.`;
  } catch { $('export-status').textContent = 'לא ניתן להכין ZIP. ההקלטות נשמרו; נסו שוב.'; }
  finally { busy = false; render(); }
};
window.addEventListener('beforeunload', event => {
  if (busy || (!database && clips.size)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => { if (recorder?.state === 'recording') recorder.stop(); releaseMic(); stopPreview(); });
try {
  database = await openRecordings();
  for (const clip of await database.all()) if (VOICE_LINES.some(line => line.id === clip.id && line.text === clip.text)) clips.set(clip.id, clip);
} catch { database = null; }
render();
