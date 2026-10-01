/* Deleting a recording by mistake should cost nothing: the text goes to a bin for one hour and can be brought back.
   Also the spoken "delete" and "finished" in Hebrew, French or English. Pure, tested. */
import { str } from './core.js';
import { loose } from './travel.js';

export const KEEP_MS = 60 * 60 * 1000;
const MAX = 20;
const DEL_WORD = "(?:(?:תמחקי|תמחק|מחקי|מחק|למחוק|למחיקה|מחיקה|דליט|בטלי|תבטלי|נקי|תנקי)(?:\\s+(?:את\\s+)?(?:הכל|ההקלטה|הטקסט|זה))?|(?:delete|erase|clear|cancel|scrap|scratch that|never mind|nevermind|forget it|forget that|drop it|drop that)(?:\\s+(?:it|that|this|all|everything|the recording|the text|the message|all of it))?|(?:efface|effacez|supprime|supprimez|annule|annulez|effacer|supprimer|annuler|oublie|laisse tomber|laissez tomber)(?:\\s+(?:tout|ça|ca|cela|tout ça|tout ca|l'enregistrement|le texte|le message))?)";
const DONE_WORD = "(?:(?:(?:ok|okay|bon|allez|voilà|alors|good)[,\\s]+)?(?:סיימתי|סימתי|זהו|סיום|סוף|finished|done|that's it|that is it|that's all|that is all|all done|i'm done|i am done|i have finished|i've finished|end|terminé|termine|j'ai fini|j'ai terminé|fini|c'est tout|c'est fini|c'est bon|ça y est|voilà))";
const DELETE = loose(new RegExp('^\\s*' + DEL_WORD + '\\s*[.!]?\\s*$', 'i'));
const DONE = loose(new RegExp('^\\s*' + DONE_WORD + '\\s*[.!]?\\s*$', 'i'));
// the same words at the END of a sentence: she said "...send it to Dana delete" without a pause
const DEL_TAIL = loose(new RegExp('(?:^|\\s)' + DEL_WORD + '\\s*[.!]?\\s*$', 'i'));
const DONE_TAIL = loose(new RegExp('(?:^|\\s)' + DONE_WORD + '\\s*[.!]?\\s*$', 'i'));

/** True when what she said is only "finished" (סיימתי / done / terminé): the recording ends and the instruction runs. */
export function isDoneCommand(text) { return DONE.test(str(text)); }

/** True when what she said is only "delete" (in any of the three languages), not a real instruction. */
export function isDeleteCommand(text) { return DELETE.test(str(text)); }

/** When the sentence ends with "delete" (one or more delete words): the sentence without them (may be ''). Otherwise null. */
export function stripDelete(text) {
  let t = str(text).trim(); if (!DEL_TAIL.test(t)) return null;
  while (DEL_TAIL.test(t)) t = t.replace(DEL_TAIL, '').trim();
  return t;
}

/** When the sentence ends with "finished": the sentence without it (may be ''). Otherwise null. */
export function stripDone(text) {
  let t = str(text).trim(); if (!DONE_TAIL.test(t)) return null;
  while (DONE_TAIL.test(t)) t = t.replace(DONE_TAIL, '').trim();
  return t;
}

/* "finished" said in the middle, and she kept talking: two instructions in one recording, not one long one. Only the explicit
   words split (not "end"/"done", which appear inside ordinary sentences). */
const DONE_MID = loose(/\s+(?:סיימתי|סימתי|finished|i'm done|i have finished|j'ai fini|j'ai terminé|terminé)\s*[.!,]?\s+/i);
export function splitDone(text) { return str(text).split(DONE_MID).map(x => x.trim()).filter(Boolean); }

const K = key => 'bakasun.bin.' + key;
const load = (store, key) => { try { const v = JSON.parse(store.getItem(K(key)) || '[]'); return Array.isArray(v) ? v : (v && v.text ? [v] : []); } catch (e) { return []; } };
const save = (store, key, list) => { if (list.length) store.setItem(K(key), JSON.stringify(list)); else store.removeItem(K(key)); };

/** Puts `text` in the bin under `key` (newest first, at most 20). store is any object with getItem/setItem/removeItem. */
export function stash(store, key, text, now) {
  const t = str(text); if (!t.trim()) return false;
  const at = now || Date.now();
  const list = [{ id: String(at) + Math.random().toString(36).slice(2, 6), text: t, at }].concat(peek(store, key, at)).slice(0, MAX);
  save(store, key, list);
  return true;
}

/** Everything in the bin that is less than an hour old, newest first (older entries are dropped). */
export function peek(store, key, now) {
  const t = now || Date.now();
  const list = load(store, key).filter(v => v && v.text && t - v.at <= KEEP_MS);
  save(store, key, list);
  return list;
}

/** Takes one entry (by id; the newest when no id is given) back out of the bin. Returns its text, or '' if gone. */
export function restore(store, key, id, now) {
  const list = peek(store, key, now); if (!list.length) return '';
  const i = id ? list.findIndex(v => v.id === id) : 0; if (i < 0) return '';
  const [v] = list.splice(i, 1); save(store, key, list);
  return v.text;
}

const EMPTY = loose(/^\s*(?:(?:רוקני|תרוקני|לרוקן|נקי|תנקי)\s+(?:את\s+)?ה?סל|(?:מחקי|תמחקי|למחוק)\s+(?:את\s+)?(?:ה?סל|הכל\s+לגמרי|לגמרי\s+הכל|לצמיתות)|(?:empty|clear|purge|delete)\s+(?:the\s+)?(?:bin|trash|junk|recycle bin|recycling bin|rubbish|deleted recordings)|delete\s+(?:everything\s+|it all\s+|all\s+)?(?:completely|permanently|for good|forever)|(?:vide|vider|videz|efface|effacer|supprime|supprimer|nettoie|nettoyer)\s+(?:la\s+)?(?:corbeille|poubelle)|(?:supprime|supprimer|efface|effacer)\s+(?:tout\s+)?(?:définitivement|pour de bon|complètement|à jamais))\s*[.!]?\s*$/i);
/** True when she asks to empty the bin for good, in any of the three languages. */
export function isEmptyBinCommand(text) { return EMPTY.test(str(text)); }

/** Empties one bin. Returns how many entries were dropped. */
export function emptyBin(store, key) { const n = peek(store, key).length; store.removeItem(K(key)); return n; }

/** Empties every bin (all keys). `keys` lists the store's keys when it cannot enumerate itself. */
export function emptyAllBins(store, keys) {
  const ks = keys || (typeof store.length === 'number' ? Array.from({ length: store.length }, (_, i) => store.key(i)) : []);
  let n = 0; ks.filter(k => k && k.startsWith('bakasun.bin.')).forEach(k => { n += emptyBin(store, k.slice('bakasun.bin.'.length)); });
  return n;
}

/** Minutes left before an entry empties itself. */
export function minutesLeft(v, now) { return v ? Math.max(0, Math.ceil((v.at + KEEP_MS - (now || Date.now())) / 60000)) : 0; }
