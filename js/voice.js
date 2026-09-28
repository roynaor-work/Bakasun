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
  // Android Chrome re-sends earlier results (resultIndex is not reliable), so the text is rebuilt from all results every time
  // instead of appended: no more "build me a quote build me a quote build me a quote".
  rec.onresult = e => {
    let fin = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]; const tr = (r[0] && r[0].transcript) || '';
      if (r.isFinal) fin += tr + ' '; else interim += tr;
    }
    finalText = fin.replace(/\s+/g, ' ').trim();
    onText((finalText + (interim ? ' ' + interim : '')).trim(), !interim);
  };
  rec.onerror = () => { if (onEnd) onEnd(finalText); };
  rec.onend = () => { if (onEnd) onEnd(finalText); };
  try { rec.start(); } catch (e) { return null; }
  return () => { try { rec.stop(); } catch (e) { /* already stopped */ } };
}
