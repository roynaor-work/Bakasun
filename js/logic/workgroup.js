/* A working group for an event: "open a working group with Eran, Moshe and David". Pure parsing and text, tested.
   The screen resolves the names against the people the app knows, asks her how to work with the group
   (WhatsApp, mail, a brief, tasks) and saves the group on the event. Nothing is sent by itself. */
import { str, trim } from './core.js';
import Office from './office.js';
import { loose, polite } from './travel.js';

const VERB = '(?:פתחי|פתח|תפתחי|תפתח|צרי|תצרי|צור|הקימי|תקימי|open|create|make|set\\s+up|start|form|build|new|ouvre|ouvrir|ouvrez|crée|créer|créez|monte|monter|fais|faire|lance|lancer|mets\\s+en\\s+place|forme|constitue|nouveau|nouvelle)';
const GROUP = '(?:groupe\\s+de\\s+travail|groupe\\s+de\\s+projet|groupe\\s+d\'équipe|groupe\\s+whatsapp|groupe\\s+whats\\s?app|groupe\\s+wa|groupe\\s+mail|groupe|équipe\\s+projet|équipe|קבוצת\\s+(?:ה)?עבודה|קבוצת\\s+(?:ה)?וואטסאפ|קבוצת\\s+(?:ה)?ווצאפ|קבוצת\\s+(?:ה)?פרויקט|קבוצה|צוות\\s+עבודה|working\\s+group|work\\s+group|project\\s+group|whatsapp\\s+group|whats\\s?app\\s+group|wa\\s+group|team\\s+group|group\\s+chat|chat\\s+group|group|team)';
const HEAD = loose(new RegExp('^' + VERB + '(?:-moi|-nous)?\\s+(?:לי\\s+)?(?:me\\s+|moi\\s+|us\\s+)?(?:a\\s+|an\\s+|un\\s+|une\\s+|le\\s+|la\\s+|the\\s+)?(?:את\\s+)?(?:ה)?(?:new\\s+|nouveau\\s+|nouvelle\\s+|petit\\s+|petite\\s+|small\\s+)?' + GROUP + '(?=\\s|$)\\s*(.*)$', 'i'));
const COUNT = /(?:של\s+|of\s+|de\s+)?(?:\d+|שני|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר|two|three|four|five|six|seven|eight|nine|ten|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:אנשים|משתתפים|חברים|people|persons|members|personnes|membres)\s*/i;
const CASE_WITH = loose(/^(?:ל|של\s+|עבור\s+|לאירוע\s+(?:של\s+)?|לתיק\s+(?:של\s+)?|for\s+(?:the\s+)?(?:event\s+(?:of\s+)?|project\s+(?:of\s+)?)?|of\s+|on\s+|pour\s+(?:l'événement\s+(?:de\s+)?|le\s+projet\s+(?:de\s+)?|le\s+dossier\s+(?:de\s+)?)?|de\s+|du\s+|sur\s+)(.+?)\s+(?:עם|with|avec)\s+(.+)$/i);
const CASE_ONLY = loose(/^(?:ל|של\s+|עבור\s+|for\s+(?:the\s+)?|pour\s+(?:le\s+)?|de\s+|du\s+)/i);
const TAIL_OPT = loose(/\s*,?\s*(?:(?:par|by|via|on|sur|en|avec|with|and|et)\s+)?(?:a\s+|an\s+|un\s+|une\s+|des\s+|le\s+|la\s+|the\s+)?(?:ב?וואטסאפ|ב?ווצאפ|ב?ואטסאפ|whats\s?app|whats-app|what's\s?app|ב?מייל|ב?אימייל|e?-?mail|courriel|תדריך|brief|briefing|résumé|summary|משימות|משימה לכולם|tasks|tâches|taches)\s*$/i);

/** {names: [...], caseName: ''} or null when the sentence is not a group request. */
export function parseWorkGroup(text) {
  const t = polite(trim(str(text)).replace(/’/g, "'")).replace(/[.!?]+$/, '');
  const m = HEAD.exec(t); if (!m) return null;
  let rest = trim(m[1] || '').replace(COUNT, ' ').replace(/\s+/g, ' ').trim();
  let caseName = '';
  // "for the Shoval event with ..." / "של שובל עם ..."
  const cm = CASE_WITH.exec(rest);
  if (cm) { caseName = trim(cm[1]).replace(loose(/\s+(?:event|project|événement|projet|אירוע)$/i), ''); rest = trim(cm[2]); }
  else { const wm = /^(?:עם|with|avec)\s+(.+)$/i.exec(rest); if (wm) rest = trim(wm[1]); else if (CASE_ONLY.test(rest)) { caseName = rest.replace(CASE_ONLY, '').trim(); rest = ''; } }
  rest = rest.replace(COUNT, ' ').replace(/\s+/g, ' ').trim();
  // "... with Marina, Rotem and Idit, whatsapp": the way she wants, said in the same breath, is not a person
  let opt = null;
  const tail = TAIL_OPT.exec(rest);
  if (tail) { opt = groupOption(trim(tail[0]).replace(/^,\s*/, '').replace(/^ו(?=[א-ת])/, '')); if (typeof opt !== 'string') opt = null; rest = rest.slice(0, tail.index).trim(); }
  return { names: splitNames(rest), caseName, opt };
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
      // the recognizer garbles foreign names ("ירז'ני" for "וירג'יני"): the closest known first name, when it is close enough
      if (!best) { let d0 = 99; known.forEach(k => { const f = k.key[0]; if (f.length < 4) return; const d = editDistance(f, words[i]); if (d < d0 && d <= allowedDistance(f, words[i])) { d0 = d; best = k; len = 1; } }); }
      if (best) { push(raw.slice(i, i + len).join(' '), best); i += len; }
      else { push(raw[i], null); i += 1; }
    }
  });
  return members;
}

const allowedDistance = (a, b) => { const n = Math.max(a.length, b.length); return n >= 7 ? 3 : n >= 5 ? 2 : n >= 4 ? 1 : 0; };
export function editDistance(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}

const PRE = "(?:(?:par|by|via|on|sur|en|avec|with|and|et)\\s+)?(?:a\\s+|an\\s+|un\\s+|une\\s+|des\\s+|le\\s+|la\\s+|the\\s+)?";
const OPTION = [
  ['wa', '^' + PRE + "(?:ב?וואטסאפ|ב?ווצאפ|ב?ואטסאפ|whats\\s?app|whats-app|what's\\s?app|wa)\\s*[.!]?$"],
  ['mail', '^' + PRE + '(?:ב?מייל|ב?אימייל|ב?דוא"?ל|e?-?mail|courriel|mél)\\s*[.!]?$'],
  ['brief', '^' + PRE + '(?:תדריך|ה?תדריך|סיכום|דף פרויקט|brief|briefing|summary|project sheet|le brief|résumé|fiche projet)\\s*[.!]?$'],
  ['tasks', '^' + PRE + '(?:משימות|משימה לכולם|משימות לכולם|tasks|a task for everyone|a task for each|a task each|tâches|des tâches|une tâche pour tous|une tâche pour chacun|une tâche à tous)\\s*[.!]?$'],
  ['save', "^(?:(?:just|only|juste|seulement|rien,?)\\s+)?(?:שמרי|תשמרי|שמור|רק לשמור|save|save it|save the group|just save|keep it|enregistre|enregistrer|sauvegarde|sauvegarder|garde|garder|enregistre-le|rien)(?:\\s+(?:seulement|juste|only|for now|pour l'instant|pour le moment))?\\s*[.!]?$"]
].map(([k, src]) => [k, loose(new RegExp(src, 'i'))]);
const ADD_ONE = loose(/^(?:תוסיפי|הוסיפי|תוסיף|הוסף|add|ajoute|ajoutes|rajoute|mets|include)\s+(?:את\s+|גם\s+את\s+|גם\s+|also\s+|aussi\s+)?(.+?)\s*(?:לקבוצה|to the group|in the group|au groupe|dans le groupe|too|also|aussi)?\s*[.!]?$/i);
/** What she answered to "how do you want to work with the group?": 'wa' | 'mail' | 'brief' | 'tasks' | 'save' | {add: name} | null. */
export function groupOption(text) {
  const t = polite(trim(str(text)).replace(/’/g, "'"));
  for (const [k, re] of OPTION) if (re.test(t)) return k;
  const add = ADD_ONE.exec(t);
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
