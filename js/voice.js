/* Dictation with the browser's speech recognition (Chrome on Android). The text lands in a field; nothing leaves the phone
   except the audio the browser itself sends to its speech service. */
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

/** Starts listening in `langCode` (he-IL / fr-FR / en-US). onText(text, isFinal) is called as words arrive. Returns stop(). */
export function listen(langCode, onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = langCode; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
    }
    onText(finalText + interim, !interim);
  };
  rec.onerror = () => { if (onEnd) onEnd(finalText); };
  rec.onend = () => { if (onEnd) onEnd(finalText); };
  try { rec.start(); } catch (e) { return null; }
  return () => { try { rec.stop(); } catch (e) { /* already stopped */ } };
}
