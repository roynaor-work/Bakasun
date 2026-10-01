/* Her own message templates: "save as template tour", then "send Dana the template tour". Stored in the settings
   (so they travel with the cloud), with {name} filled in from the recipient. Pure parsing, tested. */
import Office from './office.js';
import { str, trim } from './core.js';
import { loose, polite } from './travel.js';

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
const SAVE_TPL = loose(/^(?:שמרי|תשמרי|שמור)\s+(?:את\s+)?(?:ההודעה\s+|את ההודעה\s+|זה\s+)?(?:כתבנית|בתור תבנית|כתבנית בשם)\s*[:]?\s*(.+)$|^(?:save|keep|store)\s+(?:this\s+|the message\s+|this message\s+|that\s+|it\s+)?as\s+(?:a\s+|the\s+)?template\s*(?:called|named)?\s*[:]?\s*(.+)$|^(?:enregistre|enregistrer|sauvegarde|sauvegarder|garde|garder|mets|mettre)\s+(?:ça\s+|ce message\s+|le message\s+|cela\s+|ceci\s+)?(?:comme|en|en tant que|comme un|comme une)\s+(?:modèle|template)\s*(?:appelé|nommé|qui s'appelle)?\s*[:]?\s*(.+)$/i);
export function isSaveTemplateCommand(text) {
  const m = SAVE_TPL.exec(polite(text));
  return m ? trim(m[1] || m[2] || m[3]) : null;
}

/** In a message body, "the template tour" → 'tour'; null when the body is a real message. */
const TPL_REF = loose(/^(?:את\s+)?(?:ה)?תבנית\s+(?:של\s+)?(.+)$|^(?:the\s+|my\s+)?template\s+(?:of\s+|for\s+|called\s+|named\s+)?(.+)$|^(?:le\s+|mon\s+)?(?:modèle|template)\s+(?:de\s+|pour\s+|du\s+|appelé\s+)?(.+)$/i);
export function templateRef(body) {
  const m = TPL_REF.exec(trim(str(body)));
  return m ? trim(m[1] || m[2] || m[3]).replace(/[.!]+$/, '') : null;
}

/** "send" alone, said after a message is on screen: the tap on WhatsApp / mail. */
const SEND_ALONE = loose(/^\s*(?:(?:ok|okay|yes|oui|כן|bon|c'est bon|allez|vas-y|alors|good)[,\s]+)?(?:תשלחי|שלחי|שלח|לשלוח|אפשר לשלוח|send|send it|send that|send this|send now|go ahead|go ahead and send|send away|you can send|envoie|envoyer|envoie-le|envoie-la|envoie ça|envoyez|tu peux envoyer|vas-y|c'est bon tu peux envoyer|c'est bon envoie)\s*[.!]?\s*$/i);
export function isSendCommand(text) { return SEND_ALONE.test(polite(text)); }
