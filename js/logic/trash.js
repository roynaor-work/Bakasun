/* Deleting a recording by mistake should cost nothing: the text goes to a bin for one hour and can be brought back.
   Also the spoken "delete" in Hebrew, French or English. Pure, tested. */
import { str } from './core.js';

export const KEEP_MS = 60 * 60 * 1000;
const DELETE = /^\s*(?:(?:תמחקי|תמחק|מחקי|מחק|למחוק|בטלי|תבטלי|נקי|תנקי)(?:\s+(?:את\s+)?(?:הכל|ההקלטה|הטקסט|זה))?|(?:delete|erase|clear|cancel|scrap)(?:\s+(?:it|that|this|all|everything|the recording|the text))?|(?:efface|supprime|annule|effacer|supprimer)(?:\s+(?:tout|ça|ca|cela|l’enregistrement|l'enregistrement|le texte))?)\s*[.!]?\s*$/i;

/** True when what she said is only "delete" (in any of the three languages), not a real instruction. */
export function isDeleteCommand(text) { return DELETE.test(str(text)); }

/** Puts `text` in the bin under `key`. store is any object with getItem/setItem/removeItem (localStorage). */
export function stash(store, key, text, now) {
  const t = str(text); if (!t.trim()) return false;
  store.setItem('bakasun.bin.' + key, JSON.stringify({ text: t, at: now || Date.now() }));
  return true;
}

/** What is in the bin, if it is less than an hour old; otherwise nothing (and the bin is emptied). */
export function peek(store, key, now) {
  let v = null; try { v = JSON.parse(store.getItem('bakasun.bin.' + key) || 'null'); } catch (e) { v = null; }
  if (!v || !v.text) return null;
  if ((now || Date.now()) - v.at > KEEP_MS) { store.removeItem('bakasun.bin.' + key); return null; }
  return v;
}

/** Takes the text back out of the bin (and empties it). */
export function restore(store, key, now) {
  const v = peek(store, key, now); if (!v) return '';
  store.removeItem('bakasun.bin.' + key); return v.text;
}

/** Minutes left before the bin empties itself. */
export function minutesLeft(v, now) { return v ? Math.max(0, Math.ceil((v.at + KEEP_MS - (now || Date.now())) / 60000)) : 0; }
