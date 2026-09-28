/* Dictation with the browser's speech recognition (Chrome on Android). The text lands in a field; nothing leaves the phone
   except the audio the browser itself sends to its speech service.
   Android's "continuous" mode re-sends every interim snapshot as a new result, so the text repeats itself
   ("this is a test this is a test this is a test to see"). We therefore listen in short sessions (continuous off),
   keep only the final result of each session, show only the latest interim, and restart until she taps stop. */
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

/** Starts listening in `langCode` (he-IL / fr-FR / en-US). onText(text, isFinal) is called as words arrive. Returns stop(). */
export function listen(langCode, onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let finals = [], interim = '', active = true, rec = null, restarts = 0;
  const emit = () => onText((finals.join(' ') + (interim ? ' ' + interim : '')).replace(/\s+/g, ' ').trim(), !interim);
  const start = () => {
    rec = new SR();
    rec.lang = langCode; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    let gotFinal = '';
    rec.onresult = e => {
      let last = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]; const tr = ((r[0] && r[0].transcript) || '').trim();
        if (r.isFinal) gotFinal = tr; else last = tr;
      }
      interim = gotFinal ? '' : last;
      if (gotFinal && finals[finals.length - 1] !== gotFinal) { finals.push(gotFinal); interim = ''; }
      emit();
    };
    rec.onerror = ev => {
      // "no-speech" and "aborted" are normal between sentences: keep listening; anything else ends the dictation
      if (active && (ev.error === 'no-speech' || ev.error === 'aborted') && restarts < 40) return;
      active = false;
    };
    rec.onend = () => {
      if (interim && finals[finals.length - 1] !== interim) { finals.push(interim); interim = ''; emit(); }
      if (active && restarts < 40) { restarts++; try { start(); return; } catch (e) { /* fall through */ } }
      if (onEnd) onEnd(finals.join(' '));
    };
    rec.start();
  };
  try { start(); } catch (e) { return null; }
  return () => { active = false; try { rec && rec.stop(); } catch (e) { /* already stopped */ } };
}
