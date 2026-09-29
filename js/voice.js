/* Dictation with the browser's speech recognition (Chrome on Android). The text lands in a field; nothing leaves the phone
   except the audio the browser itself sends to its speech service.
   Android's "continuous" mode re-sends every interim snapshot as a new result, so the text repeats itself
   ("this is a test this is a test this is a test to see"). We therefore listen in short sessions (continuous off),
   keep only the final result of each session, show only the latest interim, and restart until she taps stop. */
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

/** Starts listening in `langCode` (he-IL / fr-FR / en-US). onText(text, isFinal) is called as words arrive.
    opts.silence (ms): once she said something and then stayed quiet this long, listening stops by itself and
    onEnd(text, 'silence') fires, so a command runs without another tap. Returns stop(). */
export function listen(langCode, onText, onEnd, opts) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const silence = opts && opts.silence > 0 ? opts.silence : 0;
  let finals = [], interim = '', active = true, rec = null, restarts = 0, timer = null, why = 'stop', ended = false;
  let wordPending = false, wordTimer = null; const WORD_WAIT = 2500; // ms of silence after "finished" before it counts
  const bump = () => {
    if (!silence) return;
    clearTimeout(timer);
    if (finals.length) timer = setTimeout(() => { why = 'silence'; active = false; try { rec && rec.stop(); } catch (e) { /* already stopped */ } }, silence);
  };
  const emit = () => { onText((finals.join(' ') + (interim ? ' ' + interim : '')).replace(/\s+/g, ' ').trim(), !interim); bump(); };
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
      // A closing word ("finished", "delete") at the end of what she said ends the listening, but only if she then
      // stops talking: "finished" followed by more words is part of the recording. On Android the word often arrives
      // only as an interim result and is never marked final, so the interim text counts too. The recognizer itself
      // closes the session after a short silence (onend); a word still pending then is the real end.
      const stopOn = opts && typeof opts.stopOn === 'function' ? opts.stopOn : null;
      const current = gotFinal || last;
      wordPending = !!(stopOn && current && stopOn(current));
      clearTimeout(wordTimer);
      if (wordPending) wordTimer = setTimeout(() => { if (!wordPending) return; why = 'word'; active = false; clearTimeout(timer); try { rec.stop(); } catch (e) { /* already stopped */ } }, WORD_WAIT);
    };
    rec.onerror = ev => {
      // "no-speech" and "aborted" are normal between sentences: keep listening; anything else ends the dictation
      if (active && (ev.error === 'no-speech' || ev.error === 'aborted') && restarts < 40) return;
      active = false;
    };
    rec.onend = () => {
      if (interim && finals[finals.length - 1] !== interim) { finals.push(interim); interim = ''; emit(); }
      clearTimeout(wordTimer);
      if (wordPending || (finals.length && opts && typeof opts.stopOn === 'function' && opts.stopOn(finals[finals.length - 1]))) { why = 'word'; active = false; }
      if (active && restarts < 40) { restarts++; try { start(); return; } catch (e) { /* fall through */ } }
      clearTimeout(timer);
      if (ended) return; ended = true;
      if (onEnd) onEnd(finals.join(' '), why, finals.slice());
    };
    rec.start();
  };
  try { start(); } catch (e) { return null; }
  return () => { active = false; clearTimeout(timer); clearTimeout(wordTimer); try { rec && rec.stop(); } catch (e) { /* already stopped */ } };
}
