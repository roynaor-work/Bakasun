/* Her own message templates: "save as template tour", then "send Dana the template tour". Stored in the settings
   (so they travel with the cloud), with {name} filled in from the recipient. Pure parsing, tested. */
import Office from './office.js';
import { str, trim } from './core.js';

const KEY = 'templates';
const parse = raw => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };

/** All templates from the settings store (any object with setting(k[, v])). */
export function templates(store) { return parse(store.setting(KEY)); }

/** Adds or replaces the template named `name`. Returns the list. */
export function saveTemplate(store, name, text) {
  const n = trim(name), x = str(text).trim(); if (!n || !x) return templates(store);
  const list = templates(store).filter(tp => Office.normHe(tp.name) !== Office.normHe(n));
  list.push({ name: n, text: x, at: new Date().toISOString() });
  store.setting(KEY, JSON.stringify(list)); return list;
}

/** Removes one template by name. */
export function removeTemplate(store, name) {
  const list = templates(store).filter(tp => Office.normHe(tp.name) !== Office.normHe(name));
  store.setting(KEY, JSON.stringify(list)); return list;
}

/** The template whose name is said (whole or part), or null. */
export function findTemplate(list, name) {
  const q = Office.normHe(name || ''); if (q.length < 2) return null;
  return (list || []).find(tp => Office.normHe(tp.name) === q) || (list || []).find(tp => Office.normHe(tp.name).indexOf(q) >= 0 || q.indexOf(Office.normHe(tp.name)) >= 0) || null;
}

/** {name} / {שם} / {nom} → the first name; {date}/{תאריך} → the event date; {event}/{אירוע} → the event line. */
export function fillTemplate(text, vars) {
  const v = vars || {};
  const first = trim(v.name || '').split(' ')[0];
  return str(text).replace(/\{(?:name|שם|nom|prénom)\}/gi, first).replace(/\{(?:date|תאריך)\}/gi, v.date || '').replace(/\{(?:event|אירוע|événement)\}/gi, v.event || '').replace(/\{(?:place|מקום|lieu)\}/gi, v.place || '').replace(/[ \t]+\n/g, '\n').trim();
}

/** "save as template tour" → 'tour'; null otherwise. */
export function isSaveTemplateCommand(text) {
  const m = /^(?:שמרי|תשמרי|שמור)\s+(?:את\s+)?(?:ההודעה\s+|את ההודעה\s+|זה\s+)?(?:כתבנית|בתור תבנית|כתבנית בשם)\s*[:]?\s*(.+)$|^save\s+(?:this\s+|the message\s+|it\s+)?as\s+(?:a\s+)?template\s*[:]?\s*(.+)$|^(?:enregistre|sauvegarde)\s+(?:ça\s+|le message\s+)?(?:comme|en)\s+modèle\s*[:]?\s*(.+)$/i.exec(trim(str(text)));
  return m ? trim(m[1] || m[2] || m[3]) : null;
}

/** In a message body, "the template tour" → 'tour'; null when the body is a real message. */
export function templateRef(body) {
  const m = /^(?:את\s+)?(?:ה)?תבנית\s+(?:של\s+)?(.+)$|^(?:the\s+)?template\s+(?:of\s+|for\s+)?(.+)$|^(?:le\s+)?(?:modèle|modele)\s+(?:de\s+|pour\s+)?(.+)$/i.exec(trim(str(body)));
  return m ? trim(m[1] || m[2] || m[3]).replace(/[.!]+$/, '') : null;
}

/** "send" alone, said after a message is on screen: the tap on WhatsApp / mail. */
export function isSendCommand(text) { return /^\s*(?:תשלחי|שלחי|שלח|לשלוח|אפשר לשלוח|send|send it|go ahead|envoie|envoyer|envoie-le)\s*[.!]?\s*$/i.test(str(text)); }
