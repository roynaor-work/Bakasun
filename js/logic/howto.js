/* "How do I send a quote?": the question is matched against the help text, and the closest lines come back. Pure, tested. */
import { str, trim } from './core.js';
import { loose, polite } from './travel.js';

const ASK = loose(/^(?:איך\s+(?:אני\s+)?|מה עושים (?:כש|אם)\s*|how (?:do|can|should|would|could) (?:i|you|we|one)\s+|how to\s+|how does (?:the |a |an )?|how do (?:the |a )?|what (?:do|should|can) (?:i|we|you) do (?:when|if|to|with|about)\s+|what to do (?:when|if|with|about)\s+|comment (?:est-ce que |est-ce qu')?(?:je |j'|on |tu )?(?:fais|fait|faire|peux|peut|dois|doit|puis)?\s*(?:pour )?|que faire (?:si|quand|lorsque|pour|avec)\s+|qu'est-ce que je fais (?:si|quand|avec|pour)\s+|qu'est-ce qu'on fait (?:si|quand|avec|pour)\s+|c'est quoi la façon de\s+|comment (?:ça |ca )?(?:marche|fonctionne)\s+)/i);
const STOP = new Set(['את', 'של', 'עם', 'לי', 'אני', 'אפשר', 'עושה', 'עושים', 'the', 'a', 'an', 'to', 'i', 'my', 'do', 'it', 'can', 'work', 'works', 'when', 'if', 'should', 'we', 'you', 'on', 'for', 'with', 'le', 'la', 'les', 'un', 'une', 'de', 'des', 'je', 'mon', 'ma', 'mes', 'fais', 'faire', 'peut', 'peux', 'puis', 'pour', 'si', 'quand', 'ça', 'ca', 'marche', 'fonctionne', 'on', 'moi', 'me', 'du', 'au', 'aux', 'en']);
const HE = /^[֐-׿]+$/;

/** The words she is asking about, or null when it is not a "how do I" question. */
export function parseHow(text) {
  const t = polite(trim(str(text)).replace(/[?؟!.]+$/, '').replace(/’/g, "'"));
  if (!t || t.length > 120 || !ASK.test(t)) return null;
  const rest = t.replace(ASK, '').trim();
  return { words: terms(rest), text: rest };
}

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function norm(w) { return str(w).toLowerCase().replace(/[״"'’«»“”().,:;!?→]/g, '').replace(/[ךםןףץ]/g, c => FINALS[c]); }
function terms(s) { return str(s).replace(/(?:^|\s)(?:[jlcdsmnt]|qu)['’](?=\S)/gi, ' ').split(/\s+/).map(norm).filter(w => w.length >= 2 && !STOP.has(w)); }

/** Rough Hebrew stems: without a leading ה/ל/ב/מ/ו/ש, without ים/ות/ה/ת/י endings, without inner ו/י. Several variants, so "הקלטה", "להקליט" and "מקליטה" meet. */
function stems(w) {
  if (!HE.test(w)) return [w.length > 5 ? w.slice(0, 5) : w];
  const out = new Set();
  const bases = [w]; if (w.length >= 4 && /^[הלבמוש]/.test(w)) { bases.push(w.slice(1)); if (w.length >= 5 && /^[הלבמוש]/.test(w.slice(1))) bases.push(w.slice(2)); }
  bases.forEach(b => {
    let x = b.replace(/(?:ים|ות|יות|תי|ת|ה|י)$/, ''); if (x.length < 3) x = b;
    const core = x.length > 3 ? x[0] + x.slice(1).replace(/[וי]/g, '') : x;
    out.add(x); out.add(core.length >= 3 ? core : x);
  });
  return [...out];
}
function same(a, b) {
  if (a === b) return true;
  const sa = stems(a), sb = stems(b);
  return sa.some(x => sb.includes(x));
}

/** The help lines that best answer the question: [{section, text, score}], best first, at most `max` (default 5). */
export function findHelp(words, help, max) {
  const hits = [];
  (help || []).forEach(sec => {
    const secWords = terms(sec.title);
    sec.items.forEach(item => {
      const hay = terms(item).concat(secWords);
      let score = 0;
      words.forEach(w => { if (hay.some(h => same(h, w))) score += 3; else if (w.length >= 4 && hay.some(h => h.length >= 4 && (h.indexOf(w) >= 0 || w.indexOf(h) >= 0))) score += 1; });
      if (score > 0) hits.push({ section: sec.title, text: item, score });
    });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, max || 5);
}
