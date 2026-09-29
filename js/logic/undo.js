/* "Undo": the last thing the app changed for her (a task, a note, a call, a print line, a supplier link) can be taken back
   with one word, like in a voice assistant. Only the last few, only while the app is open. Pure, tested. */
import { str } from './core.js';

const MAX = 5;
const stack = [];

/** Remembers how to undo an action: {label, undo: () => {...}} */
export function remember(label, undo) { stack.push({ label: str(label), undo, at: Date.now() }); while (stack.length > MAX) stack.shift(); }

/** The last remembered action, or null. */
export function lastAction() { return stack.length ? stack[stack.length - 1] : null; }

/** Undoes the last action and forgets it. Returns its label, or '' when there was nothing. */
export function undoLast() { const a = stack.pop(); if (!a) return ''; try { a.undo(); } catch (e) { /* already gone */ } return a.label; }

/** Forgets everything (tests). */
export function forgetAll() { stack.length = 0; }

/** "undo" alone. The words differ from the recording's "delete" words ("מחקי", "בטלי"), which wipe the text in the box. */
export function isUndoCommand(text) { return /^\s*(?:בטלי את הפעולה האחרונה|תבטלי את הפעולה האחרונה|בטלי את הפעולה|תבטלי את הפעולה|בטלי פעולה|החזירי|תחזירי|החזירי אחורה|תחזירי אחורה|חזרי אחורה|אחורה|undo|undo that|undo the last action|go back|annule la dernière action|annuler la dernière action|retour en arrière|reviens en arrière|en arrière)\s*[.!]?\s*$/i.test(str(text)); }
