/* Deleting a recording by mistake should cost nothing: the text goes to a bin for one hour and can be brought back.
   Also the spoken "delete" and "finished" in Hebrew, French or English. Pure, tested. */
import { str } from './core.js';

export const KEEP_MS = 60 * 60 * 1000;
const MAX = 20;
const DEL_WORD = '(?:(?:תמחקי|תמחק|מחקי|מחק|למחוק|למחיקה|מחיקה|דליט|בטלי|תבטלי|נקי|תנקי)(?:\\s+(?:את\\s+)?(?:הכל|ההקלטה|הטקסט|זה))?|(?:delete|erase|clear|cancel|scrap)(?:\\s+(?:it|that|this|all|everything|the recording|the text))?|(?:efface|supprime|annule|effacer|supprimer)(?:\\s+(?:tout|ça|ca|cela|l’enregistrement|l\'enregistrement|le texte))?)';
const DONE_WORD = '(?:סיימתי|סימתי|זהו|סיום|סוף|finished|done|that[\'’]?s it|i[\'’]?m done|end|terminé|termine|j[\'’]?ai fini|fini|c[\'’]?est tout|voilà)';
const DELETE = new RegExp('^\\s*' + DEL_WORD + '\\s*[.!]?\\s*$', 'i');
const DONE = new RegExp('^\\s*' + DONE_WORD + '\\s*[.!]?\\s*$', 'i');
// the same words at the END of a sentence: she said "...send it to Dana delete" without a pause
const DEL_TAIL = new RegExp('(?:^|\\s)' + DEL_WORD + '\\s*[.!]?\\s*$', 'i');
const DONE_TAIL = new RegExp('(?:^|\\s)' + DONE_WORD + '\\s*[.!]?\\s*$', 'i');

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

/** Minutes left before an entry empties itself. */
export function minutesLeft(v, now) { return v ? Math.max(0, Math.ceil((v.at + KEEP_MS - (now || Date.now())) / 60000)) : 0; }
