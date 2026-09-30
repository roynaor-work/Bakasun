/* A working group for an event: "open a working group with Eran, Moshe and David". Pure parsing and text, tested.
   The screen resolves the names against the people the app knows, asks her how to work with the group
   (WhatsApp, mail, a brief, tasks) and saves the group on the event. Nothing is sent by itself. */
import { str, trim } from './core.js';
import Office from './office.js';

const VERB = '(?:פתחי|פתח|תפתחי|תפתח|צרי|תצרי|צור|הקימי|תקימי|open|create|make|set\\s+up|start|ouvre|ouvrir|crée|créer|monte)';
const GROUP = '(?:groupe\\s+de\\s+travail|groupe\\s+whatsapp|groupe|équipe|קבוצת\\s+(?:ה)?עבודה|קבוצת\\s+(?:ה)?וואטסאפ|קבוצת\\s+(?:ה)?ווצאפ|קבוצת\\s+(?:ה)?פרויקט|קבוצה|צוות\\s+עבודה|working\\s+group|work\\s+group|project\\s+group|whatsapp\\s+group|group|whatsapp\\s+group)';
const HEAD = new RegExp('^' + VERB + '\\s+(?:לי\\s+)?(?:בבקשה\\s+)?(?:please\\s+)?(?:me\\s+)?(?:moi\\s+)?(?:a\\s+|an\\s+|un\\s+|une\\s+)?(?:את\\s+)?(?:ה)?' + GROUP + '(?=\\s|$)\\s*(.*)$', 'i');
const COUNT = /(?:של\s+|of\s+|de\s+)?(?:\d+|שני|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר|two|three|four|five|six|seven|eight|nine|ten|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:אנשים|משתתפים|חברים|people|persons|members|personnes|membres)\s*/i;

/** {names: [...], caseName: ''} or null when the sentence is not a group request. */
export function parseWorkGroup(text) {
  const t = trim(str(text)).replace(/[.!?]+$/, '');
  const m = HEAD.exec(t); if (!m) return null;
  let rest = trim(m[1] || '').replace(COUNT, ' ').replace(/\s+/g, ' ').trim();
  let caseName = '';
  // "for the Shoval event with ..." / "של שובל עם ..."
  const cm = /^(?:ל|של\s+|עבור\s+|לאירוע\s+(?:של\s+)?|לתיק\s+(?:של\s+)?|for\s+(?:the\s+)?(?:event\s+(?:of\s+)?)?|of\s+|pour\s+(?:l['’]événement\s+(?:de\s+)?)?|de\s+)(.+?)\s+(?:עם|with|avec)\s+(.+)$/i.exec(rest);
  if (cm) { caseName = trim(cm[1]).replace(/\s+(?:event|événement|אירוע)$/i, ''); rest = trim(cm[2]); }
  else { const wm = /^(?:עם|with|avec)\s+(.+)$/i.exec(rest); if (wm) rest = trim(wm[1]); else if (/^(?:ל|של\s+|עבור\s+|for\s+|pour\s+|de\s+)/i.test(rest)) { caseName = rest.replace(/^(?:ל|של\s+|עבור\s+|for\s+|pour\s+|de\s+)/i, '').trim(); rest = ''; } }
  rest = rest.replace(COUNT, ' ').replace(/\s+/g, ' ').trim();
  return { names: splitNames(rest), caseName };
}

/** "ערן, משה חיים דוד וערן" → words; the screen groups them into known full names. Duplicates are dropped. */
export function splitNames(s) {
  const parts = str(s).split(/\s*(?:,|;|\s\+\s|\sand\s|\set\s|\sו(?=[א-ת]{2,}))\s*/i).map(x => trim(x).replace(/^(?:ו|את\s+)/, '').trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => { if (!out.some(o => Office.normHe(o) === Office.normHe(p))) out.push(p); });
  return out;
}

/** Words she said, matched against the people the app knows: known full names first (longest run of words), the rest one name per word.
    A first name that belongs to a client's or supplier's contact gives that person, with the company as the role. */
export function resolveNames(names, people) {
  const known = [];
  (people || []).forEach(p => (p.names || []).forEach(n => { const key = Office.normHe(n).split(/\s+/).filter(Boolean); if (key.length) known.push({ p, name: String(n).trim(), key }); }));
  const members = [];
  const push = (label, hit) => {
    const name = hit ? hit.name : label;
    if (members.some(m => Office.normHe(m.name) === Office.normHe(name))) return;
    if (!hit) { members.push({ name, phone: '', email: '', about: '', id: '', known: false }); return; }
    const p = hit.p; const org = String(p.label || '').split(' · ').filter(x => Office.normHe(x) !== Office.normHe(name));
    members.push({ name, role: org.join(' · '), phone: p.phone || '', email: p.email || '', about: p.about || '', id: p.id || '', known: true });
  };
  names.forEach(chunk => {
    const words = Office.normHe(chunk).split(/\s+/).filter(Boolean); const raw = chunk.split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      let best = null, len = 0;
      known.forEach(k => {
        const n = k.key.length;
        // the full name in a row, or its first name alone (3+ letters)
        if (n <= words.length - i && k.key.every((w, j) => w === words[i + j]) && n > len) { best = k; len = n; }
        else if (!best && k.key[0].length >= 3 && k.key[0] === words[i]) { best = k; len = 1; }
      });
      if (best) { push(raw.slice(i, i + len).join(' '), best); i += len; }
      else { push(raw[i], null); i += 1; }
    }
  });
  return members;
}

const OPTION = [
  ['wa', /^(?:ב?וואטסאפ|ב?ווצאפ|whats\s?app|on whatsapp|par whatsapp|sur whatsapp)\s*[.!]?$/i],
  ['mail', /^(?:ב?מייל|ב?אימייל|ב?דוא"?ל|e?-?mail|by e?-?mail|par mail|par e-?mail|courriel)\s*[.!]?$/i],
  ['brief', /^(?:תדריך|ה?תדריך|סיכום|דף פרויקט|brief|briefing|summary|le brief|résumé)\s*[.!]?$/i],
  ['tasks', /^(?:משימות|משימה לכולם|משימות לכולם|tasks|a task for everyone|tâches|des tâches)\s*[.!]?$/i],
  ['save', /^(?:שמרי|תשמרי|שמור|רק לשמור|save|just save|enregistre|sauvegarde)\s*[.!]?$/i]
];
/** What she answered to "how do you want to work with the group?": 'wa' | 'mail' | 'brief' | 'tasks' | 'save' | {add: name} | null. */
export function groupOption(text) {
  const t = trim(str(text));
  for (const [k, re] of OPTION) if (re.test(t)) return k;
  const add = /^(?:תוסיפי|הוסיפי|תוסיף|הוסף|add|ajoute)\s+(?:את\s+|גם\s+את\s+|גם\s+)?(.+?)\s*(?:לקבוצה|to the group|au groupe)?\s*[.!]?$/i.exec(t);
  if (add) return { add: trim(add[1]) };
  return null;
}

/** The brief everyone in the group gets: the event in short, who is in the group, what is open. */
export function briefText(c, members, tasks, opts) {
  opts = opts || {};
  const L = opts.lang || 'he';
  const T = {
    he: { title: 'תדריך פרויקט', client: 'לקוח', kind: 'סוג', date: 'תאריך', hours: 'שעות', place: 'מקום', people: 'משתתפים', purpose: 'מטרה', contact: 'איש קשר אצל הלקוח', group: 'קבוצת העבודה', open: 'פתוח כרגע', none: 'אין אירוע מקושר', thanks: 'תודה' },
    fr: { title: 'Brief du projet', client: 'Client', kind: 'Type', date: 'Date', hours: 'Horaires', place: 'Lieu', people: 'Participants', purpose: 'Objectif', contact: 'Contact chez le client', group: 'Groupe de travail', open: 'En cours', none: 'Aucun événement lié', thanks: 'Merci' },
    en: { title: 'Project brief', client: 'Client', kind: 'Type', date: 'Date', hours: 'Hours', place: 'Venue', people: 'Participants', purpose: 'Purpose', contact: 'Client contact', group: 'Working group', open: 'Open now', none: 'No linked event', thanks: 'Thanks' }
  }[L] || {};
  const lines = [T.title + (c ? ' · ' + [c.client, c.kind].filter(Boolean).join(' · ') : ''), ''];
  if (c) {
    if (c.client) lines.push(T.client + ': ' + c.client);
    if (c.kind) lines.push(T.kind + ': ' + c.kind);
    if (c.date) lines.push(T.date + ': ' + Office.fmt(c.date) + (c.hours ? ' · ' + c.hours : ''));
    if (c.place) lines.push(T.place + ': ' + c.place);
    if (c.participants) lines.push(T.people + ': ' + c.participants);
    if (c.purpose) lines.push(T.purpose + ': ' + c.purpose);
    if (c.contact) lines.push(T.contact + ': ' + c.contact + (c.phone ? ' · ' + c.phone : ''));
  } else lines.push(T.none);
  lines.push('', T.group + ':');
  (members || []).forEach(m => lines.push('• ' + m.name + (m.role ? ' · ' + m.role : '') + (m.phone ? ' · ' + m.phone : '') + (!m.phone && m.email ? ' · ' + m.email : '')));
  const open = (tasks || []).slice(0, 8);
  if (open.length) { lines.push('', T.open + ':'); open.forEach(x => lines.push('• ' + x.title + (x.who ? ' · ' + x.who : '') + (x.due ? ' · ' + Office.fmt(x.due) : ''))); }
  lines.push('', T.thanks + ',', opts.signer || '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
