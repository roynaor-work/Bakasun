import { createVoicePlayer } from '../js/voice-player.js?v=20261010-camera-1';
import { splitVoiceText } from '../js/voice-lines.js?v=20261010-camera-1';
import { selectHebrewVoice } from './voice-selection.mjs';

// Only catalog IDs and source categories enter diagnostics; never the voice
// name, phrase text, camera data, endpoint or participant details.
export function createLabSpeech({ synth, Utterance, context, fetchFile, now = () => performance.now() }) {
  let origin = now();
  let generation = 0;
  const counts = {}, events = [];
  const note = (source, ids, callback) => {
    counts[source] = (counts[source] || 0) + 1;
    events.push({ timeMs: Math.max(0, Math.round(now() - origin)), source, ids: ids.filter(Boolean) });
    if (events.length > 30) events.shift();
    callback?.(source);
  };
  const player = createVoicePlayer({ context, fetchFile, now,
    cancelFallback: () => synth?.cancel(),
    speakFallback(text, job, done) {
      const voice = selectHebrewVoice(synth?.getVoices() || [], job.voiceId);
      if (!voice || !Utterance) { job.onSource('text-only', []); return false; }
      try {
        const u = new Utterance(text);
        u.lang = 'he-IL'; u.voice = voice; u.rate = job.rate || .85; u.pitch = 1;
        let ended = false;
        const finish = () => { if (!ended) { ended = true; done(); } };
        u.onend = finish;
        u.onerror = () => { job.onSource('text-only', []); finish(); };
        synth.speak(u);
        job.onSource(voice.localService === true ? 'hebrew-local' : 'hebrew-network', splitVoiceText(job.text).map(p => p.id));
        return true;
      } catch { job.onSource('text-only', []); return false; }
    },
  });
  return {
    play(text, { onSource, ...options } = {}) {
      const token = options.quick ? generation : ++generation;
      return player.play(text, { ...options, onSource: (source, ids = []) => {
        if (token === generation) note(source, ids, onSource);
      } });
    },
    stop() { generation++; player.stop(); },
    preload: ids => Promise.all(ids.map(player.load)),
    resetDiagnostics() { origin = now(); events.length = 0; for (const key of Object.keys(counts)) delete counts[key]; },
    snapshot: () => ({ sources: { ...counts }, lastSource: events.at(-1)?.source ?? null, events: structuredClone(events) }),
  };
}
