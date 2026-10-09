// דיבור בעברית: הקול של המכשיר (Web Speech API), עם בחירת הקול הטוב ביותר, קצב מכוון, וטקסטים מנוקדים.
// למה ניקוד: מנועי הדיבור (גוגל באנדרואיד, "כרמית" באייפון) מנחשים הגייה של מילים בלי ניקוד וטועים. עם ניקוד הם קוראים נכון.
import { store } from './store.js?v=20261009-weekly-1';

import { createVoicePlayer } from './voice-player.js?v=20261009-weekly-1';
import { VOICE_BY_ID } from './voice-lines.js?v=20261009-weekly-1';

const synth = window.speechSynthesis;
let voices = [];
const refresh = () => { try { voices = (synth?.getVoices() || []).filter(v => /^he|iw/i.test(v.lang)); } catch { voices = []; } };
refresh();
if (synth) synth.addEventListener?.('voiceschanged', refresh);

export const canSpeak = () => !!synth || player.buffers.size > 0;
export const hebrewVoices = () => { if (!voices.length) refresh(); return voices; };

// סדר עדיפות: הקול שנבחר בהגדרות, אחר כך קולות "טבעיים"/רשת, אחר כך כרמית, אחר כך כל קול עברי
const PREFER = [/natural/i, /neural/i, /wavenet/i, /online/i, /enhanced|premium/i, /google/i, /carmit/i, /microsoft/i];
export function bestVoice() {
  const list = hebrewVoices(); if (!list.length) return null;
  const want = store.profile.voiceName; const chosen = want && list.find(v => v.name === want); if (chosen) return chosen;
  for (const re of PREFER) { const v = list.find(v => re.test(v.name)); if (v) return v; }
  return list[0];
}

// טקסט לדיבור: מסירים אימוג'י וסימנים, משאירים אותיות, ניקוד, ספרות ופיסוק
const clean = t => String(t).replace(/[^\p{L}\p{M}\p{N}\s,.!?:;"'()%+\-־]/gu, ' ').replace(/\s+/g, ' ').trim();

let audioContext;
const context = () => {
  if (audioContext) return audioContext;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { audioContext = new AC(); return audioContext; } catch { return null; }
};
const player = createVoicePlayer({
  context,
  fetchFile: url => fetch(url),
  cancelFallback: () => { try { synth?.cancel(); } catch { /* */ } },
  speakFallback(text, options, onDone) {
    if (!synth) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = options.lang; u.rate = options.rate; u.pitch = options.pitch;
      const v = options.lang === 'he-IL' ? bestVoice() :
        (synth.getVoices() || []).find(v => v.lang.startsWith(options.lang.slice(0, 2)) && /natural|neural|online|google|samantha|daniel/i.test(v.name)) ||
        (synth.getVoices() || []).find(v => v.lang.startsWith(options.lang.slice(0, 2)));
      if (v) u.voice = v;
      let ended = false;
      const finish = () => { if (!ended) { ended = true; onDone(); } };
      u.onend = finish; u.onerror = finish; synth.speak(u); return true;
    } catch { return false; }
  },
});
// הקבצים אופציונליים. הטעינה מתחילה מראש; כל חלקי אמירה מוכנים לפני הניגון.
void player.preload();
export function speak(text, { force = false } = {}) {
  if ((!force && store.profile.voice === false) || !canSpeak()) return false;
  return player.play(clean(text), { rate: store.profile.speechRate || 0.92, pitch: 1 });
}
export function speakLang(text, lang = 'en-US', { rate = 0.9, pitch = 1.1 } = {}) {
  if (store.profile.voice === false || !canSpeak()) return false;
  return player.play(clean(text), { lang, rate, pitch });
}
export function sayQuick(text, { rate = 1.05 } = {}) {
  if (store.profile.voice === false || !canSpeak()) return false;
  return player.play(clean(text), { quick: true, rate, pitch: 1.05 });
}
export const spokeRecently = ms => player.spokeRecently(ms);
export const stopSpeak = () => player.stop();
// חגיגות משתמשות בהקלטות הישנות שלהן כאשר אין קובץ חדש מוכן.
export function playVoiceRecording(id) {
  if (store.profile.voice === false || !player.buffers.has(id)) return false;
  const line = VOICE_BY_ID[id];
  return player.play(line.text, { lang: line.lang, rate: 1, pitch: 1 });
}

export { SAY_UI } from './say-ui.js?v=20261009-weekly-1';
