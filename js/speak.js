/* Reading aloud with the phone's own voice (speechSynthesis): the morning list while she drives, a message before it goes out. */
import { t } from './i18n.js';
import { toast } from './ui.js';

const CODE = { he: 'he-IL', fr: 'fr-FR', en: 'en-US' };
export function canSpeak() { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }
export function stopSpeaking() { if (canSpeak()) window.speechSynthesis.cancel(); }

/** Speaks `text` in `lang` (he/fr/en). Hebrew text in a French UI is still read in Hebrew: the language is guessed per text. */
export function speak(text, lang) {
  if (!canSpeak()) { toast(t('noSpeak'), 3500); return false; }
  const s = String(text || '').replace(/[•✓★☏✉→|]/g, ' ').replace(/\s+/g, ' ').trim(); if (!s) return false;
  const L = /[֐-׿]/.test(s) ? 'he' : /[àâçéèêëîïôûùüÿœ]/i.test(s) || lang === 'fr' ? 'fr' : (lang || 'en');
  const code = CODE[L] || 'he-IL';
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(s); u.lang = code; u.rate = 1;
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  const v = voices.find(x => x.lang === code) || voices.find(x => x.lang && x.lang.slice(0, 2) === code.slice(0, 2));
  if (v) { try { u.voice = v; } catch (e) { /* the phone picks by lang */ } }
  try { window.speechSynthesis.speak(u); } catch (e) { toast(t('noSpeak'), 3500); return false; }
  return true;
}

/** "read it to me" in three languages. */
export function isReadAloudCommand(text) { return /^\s*(?:תקריאי(?:\s+לי)?(?:\s+(?:את\s+)?(?:זה|התשובה|ההודעה))?|הקריאי(?:\s+לי)?|read(?:\s+it|\s+that|\s+this)?(?:\s+(?:to me|aloud|out loud))?|lis(?:-le|-moi)?(?:\s+(?:ça|ca|le message))?|lis le)\s*[.!]?\s*$/i.test(String(text || '')); }

/** The readable text of a card: what is written, without button labels. */
export function textOfEl(el) {
  if (!el) return '';
  const c = el.cloneNode(true); c.querySelectorAll('button, .btn, select, input, textarea').forEach(x => x.remove());
  return (c.innerText || c.textContent || '').replace(/\s*\n\s*/g, '. ').replace(/\.\s*\./g, '.').trim();
}
