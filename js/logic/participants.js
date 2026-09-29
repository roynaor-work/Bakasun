/* Participants of one event: the pasted-list parser, rooming list, dietary and RSVP summaries, name tags, CSV,
   and the messages to the hotel and the caterer in her voice. Pure logic; addFromText is the only function that touches the store. */
import { str, trim, phoneDigits, phonePretty } from './core.js';
import Office from './office.js';

export const RSVP = ['invited', 'yes', 'no', 'maybe'];
export const ROOMS = ['none', 'single', 'double'];
export const DIETS = ['vegetarian', 'vegan', 'kosher', 'glutenfree', 'allergy'];

/* Labels of the stored keys, per language (Hebrew first). Used in texts to suppliers and in the CSV. */
export const L = {
  rsvp: { invited: { he: 'הוזמן', fr: 'Invité', en: 'Invited' }, yes: { he: 'מגיע', fr: 'Vient', en: 'Coming' }, no: { he: 'לא מגיע', fr: 'Ne vient pas', en: 'Not coming' }, maybe: { he: 'אולי', fr: 'Peut-être', en: 'Maybe' } },
  room: { none: { he: 'בלי לינה', fr: 'Sans nuitée', en: 'No room' }, single: { he: 'סינגל', fr: 'Single', en: 'Single' }, double: { he: 'זוגי', fr: 'Double', en: 'Double' } },
  diet: { vegetarian: { he: 'צמחוני', fr: 'Végétarien', en: 'Vegetarian' }, vegan: { he: 'טבעוני', fr: 'Végan', en: 'Vegan' }, kosher: { he: 'כשר', fr: 'Casher', en: 'Kosher' }, glutenfree: { he: 'ללא גלוטן', fr: 'Sans gluten', en: 'Gluten-free' }, allergy: { he: 'אלרגיה', fr: 'Allergie', en: 'Allergy' } }
};
export function label(group, key, lang) { const x = L[group] && L[group][key]; return x ? (x[lang] || x.he) : str(key); }

/* Words in a pasted line that mean a dietary need or a room type. */
const DIET_WORDS = [[/צמחוני|צמחונית|vegetarian|végétarien|vegetarien|veggie/i, 'vegetarian'], [/טבעוני|טבעונית|vegan|végan/i, 'vegan'], [/כשר|כשרה|kosher|casher|kasher/i, 'kosher'], [/ללא גלוטן|בלי גלוטן|גלוטן|gluten/i, 'glutenfree'], [/אלרגי|אלרגיה|allerg/i, 'allergy']];
const ROOM_WORDS = [[/^(סינגל|יחיד|single|simple)$/i, 'single'], [/^(זוגי|כפול|double)$/i, 'double']];

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{5,}\d/;
const isPhoneToken = s => !/[A-Za-z֐-׿]/.test(s) && !!phoneDigits(s) && str(s).replace(/\D/g, '').length >= 7;

export function normName(s) { return Office.normHe(s); }
function firstName(s) { return trim(s).split(' ')[0] || ''; }

/** One line of a pasted list → one record, or null when there is no name.
    Accepts "שם, טלפון, ארגון", "name - phone", tab separated, "name <mail>", "שם 050-1234567", numbered lines. */
export function parseLine(line) {
  let s = str(line).replace(/^[\s\d]*[.)\-•*]+\s*/, '').replace(/^\d+\s+(?=\D)/, '').trim();
  if (!s) return null;
  const rec = { name: '', phone: '', email: '', org: '', role: '', dietary: '', dietTags: [], room: '', notes: '' };
  s = s.replace(/<([^<>]+)>/g, ' $1 ');
  const em = EMAIL_RE.exec(s); if (em) { rec.email = em[0]; s = s.replace(em[0], ' '); }
  let parts;
  if (s.indexOf('\t') >= 0) parts = s.split('\t');
  else if (/[;|]/.test(s)) parts = s.split(/[;|]/);
  else if (s.indexOf(',') >= 0) parts = s.split(',');
  else if (/\s[-–—]\s/.test(s)) parts = s.split(/\s[-–—]\s/);
  else {
    const ph = PHONE_RE.exec(s);
    parts = ph && isPhoneToken(ph[0]) ? [s.slice(0, ph.index), ph[0], s.slice(ph.index + ph[0].length)] : [s];
  }
  // a phone glued to a name inside one part ("שירן לוי - 0541112222, זוגי") is pulled out
  const pieces = [];
  parts.map(trim).filter(Boolean).forEach(p => {
    const m = !isPhoneToken(p) && PHONE_RE.exec(p);
    if (m && isPhoneToken(m[0])) pieces.push(p.slice(0, m.index), m[0], p.slice(m.index + m[0].length)); else pieces.push(p);
  });
  const rest = [];
  pieces.map(x => trim(x).replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')).filter(Boolean).forEach(p => {
    if (isPhoneToken(p)) { if (!rec.phone) rec.phone = phonePretty(p); else rest.push(p); return; }
    if (!rec.room) { const rw = ROOM_WORDS.find(w => w[0].test(p)); if (rw) { rec.room = rw[1]; return; } }
    const dw = DIET_WORDS.find(w => w[0].test(p));
    if (dw && p.split(' ').length <= 3) { if (!rec.dietTags.includes(dw[1])) rec.dietTags.push(dw[1]); if (dw[1] === 'allergy' && p.split(' ').length > 1) rec.dietary = p; return; }
    rest.push(p);
  });
  rec.name = rest.shift() || (rec.email ? rec.email.split('@')[0].replace(/[._]/g, ' ') : '');
  if (!rec.name) return null;
  if (rest.length) rec.org = rest.shift();
  if (rest.length) rec.role = rest.shift();
  if (rest.length) rec.notes = rest.join(', ');
  return rec;
}

/** A whole pasted text (one person per line) → records with rsvp 'invited'. Duplicated names inside the text are folded. */
export function parseParticipantsText(text) {
  const out = [], seen = {};
  str(text).split(/\r?\n/).forEach(line => {
    const r = parseLine(line); if (!r) return;
    const k = normName(r.name);
    if (seen[k]) return;
    seen[k] = 1; out.push(Object.assign({ rsvp: 'invited', roommate: '', arrival: '', departure: '', nameTag: '', tags: [] }, r));
  });
  return out;
}

/** Everyone who did not say no: the ones the hotel and the caterer count. */
export function attending(list) { return (list || []).filter(p => p.rsvp !== 'no'); }

/** Rooms: singles one each, doubles paired by roommate name (a named partner on the list is paired even if their own room is not set yet), the rest wait for a partner. */
export function roomingList(list) {
  const people = attending(list);
  const rooms = [], unpaired = [], noRoom = [];
  const byName = {}; people.forEach(p => { byName[normName(p.name)] = p; });
  const placed = {};
  people.forEach(p => {
    if (placed[p.id || p.name]) return;
    if (p.room === 'single') { placed[p.id || p.name] = 1; rooms.push({ type: 'single', names: [p.name], people: [p] }); return; }
    if (p.room !== 'double') { noRoom.push(p); return; }
    const mate = p.roommate ? byName[normName(p.roommate)] : null;
    if (mate && mate !== p && !placed[mate.id || mate.name] && mate.room !== 'single') {
      placed[p.id || p.name] = 1; placed[mate.id || mate.name] = 1;
      rooms.push({ type: 'double', names: [p.name, mate.name], people: [p, mate] }); return;
    }
    // someone else asked for this person
    const asker = people.find(q => q !== p && q.room === 'double' && !placed[q.id || q.name] && normName(q.roommate) === normName(p.name));
    if (asker) { placed[p.id || p.name] = 1; placed[asker.id || asker.name] = 1; rooms.push({ type: 'double', names: [p.name, asker.name], people: [p, asker] }); return; }
    if (p.roommate && !mate) { placed[p.id || p.name] = 1; rooms.push({ type: 'double', names: [p.name, p.roommate], people: [p], guest: p.roommate }); return; }
    placed[p.id || p.name] = 1; unpaired.push(p);
  });
  const singles = rooms.filter(r => r.type === 'single').length, doubles = rooms.filter(r => r.type === 'double').length;
  return { rooms, singles, doubles, unpaired, noRoom, total: rooms.length, sleeping: rooms.reduce((n, r) => n + r.names.length, 0) + unpaired.length };
}

/** Counts per dietary need, the names behind each, and the free-text notes. */
export function dietarySummary(list) {
  const people = attending(list);
  const counts = {}, names = {};
  DIETS.forEach(d => { counts[d] = 0; names[d] = []; });
  const notes = [];
  people.forEach(p => {
    (p.dietTags || []).forEach(d => { if (counts[d] !== undefined) { counts[d]++; names[d].push(p.name); } });
    if (trim(p.dietary)) notes.push({ name: p.name, text: trim(p.dietary) });
  });
  return { counts, names, notes, total: people.length, special: people.filter(p => (p.dietTags || []).length || trim(p.dietary)).length };
}

export function rsvpSummary(list) {
  const s = { total: (list || []).length, invited: 0, yes: 0, no: 0, maybe: 0 };
  (list || []).forEach(p => { const k = RSVP.includes(p.rsvp) ? p.rsvp : 'invited'; s[k]++; });
  s.attending = s.total - s.no;
  return s;
}

/** Sorted by name; "מגיע" first when asked. */
export function sortByName(list) { return (list || []).slice().sort((a, b) => str(a.name).localeCompare(str(b.name), 'he')); }

/** Name tags, one per line, tab separated (name, organization, role): pastes straight into a print sheet. */
export function nameTagsText(list) {
  return sortByName(attending(list)).map(p => [trim(p.nameTag) || trim(p.name), trim(p.org), trim(p.role)].filter(Boolean).join('\t')).join('\n');
}

const CSV_HEAD = ['שם', 'טלפון', 'מייל', 'ארגון', 'תפקיד', 'אישור הגעה', 'חדר', 'שותף/ה לחדר', 'הגעה', 'יציאה', 'צרכי תזונה', 'הערות תזונה', 'תג שם', 'הערות', 'תגיות'];
export function csvCell(v) {
  const s = str(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** UTF-8 with BOM so Excel reads the Hebrew. Phones as she dials them (the dash keeps them as text in Excel). */
export function toCsv(list, lang) {
  const rows = [CSV_HEAD].concat((list || []).map(p => [p.name, phonePretty(p.phone), p.email, p.org, p.role, label('rsvp', p.rsvp || 'invited', lang), p.room ? label('room', p.room, lang) : '', p.roommate, p.arrival, p.departure,
    (p.dietTags || []).map(d => label('diet', d, lang)).join(' / '), p.dietary, p.nameTag, p.notes, (p.tags || []).join(' / ')]));
  return String.fromCharCode(0xFEFF) + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

function eventLine(cs, lang) {
  const kind = trim(cs && cs.kind), client = trim(cs && cs.client), date = cs && cs.date ? Office.fmt(cs.date) : '';
  const days = trim(cs && cs.days);
  if (lang === 'en') return [kind || 'the event', client ? 'of ' + client : '', date ? 'on ' + date + (days && +days > 1 ? ' (' + days + ' days)' : '') : ''].filter(Boolean).join(' ');
  if (lang === 'fr') return [kind || 'l’événement', client ? 'de ' + client : '', date ? 'le ' + date + (days && +days > 1 ? ' (' + days + ' jours)' : '') : ''].filter(Boolean).join(' ');
  return [kind || 'האירוע', client ? 'של ' + client : '', date ? 'ב-' + date + (days && +days > 1 ? ' (' + days + ' ימים)' : '') : ''].filter(Boolean).join(' ');
}
function stay(p, lang) {
  const a = trim(p.arrival), d = trim(p.departure);
  if (!a && !d) return '';
  const T = lang === 'en' ? ['arrives', 'leaves'] : lang === 'fr' ? ['arrivée', 'départ'] : ['הגעה', 'יציאה'];
  return [a ? T[0] + ' ' + a : '', d ? T[1] + ' ' + d : ''].filter(Boolean).join(', ');
}

/** The rooming list as she sends it to the hotel: short, warm, numbered, in three languages. */
export function hotelListText(list, cs, lang, signer) {
  lang = lang || 'he';
  const r = roomingList(list);
  const n = cs && cs.hotelContact ? ' ' + firstName(cs.hotelContact) : '';
  const lineOf = (room, i) => (i + 1) + '. ' + room.names.join(' + ') + (room.guest ? (lang === 'en' ? ' (partner to confirm)' : lang === 'fr' ? ' (partenaire à confirmer)' : ' (השותף/ה לחדר יאושר)') : '') +
    room.people.map(p => stay(p, lang)).filter(Boolean).map(x => ' · ' + x).join('');
  const singles = r.rooms.filter(x => x.type === 'single'), doubles = r.rooms.filter(x => x.type === 'double');
  const T = lang === 'en' ? { open: 'Hi' + n + ', hope you are doing well!', intro: 'Here is the rooming list for ' + eventLine(cs, lang) + ':', single: 'Single rooms', double: 'Double rooms', unpaired: 'Waiting for a roommate', total: 'Total: {r} rooms for {p} guests.', end: 'Please confirm you received it. Thank you!' }
    : lang === 'fr' ? { open: 'Bonjour' + n + ', j’espère que vous allez bien !', intro: 'Voici la rooming list pour ' + eventLine(cs, lang) + ' :', single: 'Chambres single', double: 'Chambres doubles', unpaired: 'En attente d’un partenaire de chambre', total: 'Total : {r} chambres pour {p} personnes.', end: 'Merci de me confirmer la bonne réception. Merci beaucoup !' }
    : { open: 'היי היי' + n + ', מה שלומך?', intro: 'מצורפת רשימת החדרים ל' + eventLine(cs, lang) + ':', single: 'חדרי סינגל', double: 'חדרים זוגיים', unpaired: 'עוד בלי שותף/ה לחדר', total: 'סה״כ {r} חדרים ל-{p} אורחים.', end: 'אשמח לאישור שקיבלת בבקשה. תודה רבה!' };
  const blocks = [T.open, T.intro];
  if (singles.length) blocks.push(T.single + ' (' + singles.length + '):\n' + singles.map(lineOf).join('\n'));
  if (doubles.length) blocks.push(T.double + ' (' + doubles.length + '):\n' + doubles.map(lineOf).join('\n'));
  if (r.unpaired.length) blocks.push(T.unpaired + ' (' + r.unpaired.length + '):\n' + r.unpaired.map((p, i) => (i + 1) + '. ' + p.name + (stay(p, lang) ? ' · ' + stay(p, lang) : '')).join('\n'));
  blocks.push(T.total.replace('{r}', r.total + (r.unpaired.length ? '+' : '')).replace('{p}', r.sleeping));
  blocks.push(T.end + (signer ? '\n' + signer : ''));
  return blocks.join('\n');
}

/** The dietary needs as she sends them to the caterer or the hotel kitchen. */
export function cateringText(list, cs, lang, signer) {
  lang = lang || 'he';
  const d = dietarySummary(list);
  const T = lang === 'en' ? { open: 'Hi, hope you are doing well!', intro: 'For ' + eventLine(cs, lang) + ': {n} guests in total.', needs: 'Special needs', none: 'No special dietary needs.', notes: 'Allergies and notes', end: 'Please confirm you received it. Thank you!' }
    : lang === 'fr' ? { open: 'Bonjour, j’espère que vous allez bien !', intro: 'Pour ' + eventLine(cs, lang) + ' : {n} convives au total.', needs: 'Besoins particuliers', none: 'Pas de besoin alimentaire particulier.', notes: 'Allergies et remarques', end: 'Merci de me confirmer la bonne réception. Merci beaucoup !' }
    : { open: 'היי היי, מה שלומך?', intro: 'לגבי ' + eventLine(cs, lang) + ': סה״כ {n} סועדים.', needs: 'צרכים מיוחדים', none: 'אין צרכים מיוחדים באוכל.', notes: 'אלרגיות והערות', end: 'אשמח לאישור שקיבלת בבקשה. תודה רבה!' };
  const colon = lang === 'fr' ? ' : ' : ': ';
  const blocks = [T.open, T.intro.replace('{n}', d.total)];
  const lines = DIETS.filter(k => d.counts[k]).map(k => label('diet', k, lang) + colon + d.counts[k] + ' (' + d.names[k].join(', ') + ')');
  blocks.push(lines.length ? T.needs + colon.trimEnd() + '\n' + lines.join('\n') : T.none);
  if (d.notes.length) blocks.push(T.notes + colon.trimEnd() + '\n' + d.notes.map(x => '• ' + x.name + colon + x.text).join('\n'));
  blocks.push(T.end + (signer ? '\n' + signer : ''));
  return blocks.join('\n');
}

/** The RSVP request to one participant, in her voice, per language. */
export function rsvpAskText(p, cs, lang, signer) {
  lang = lang || 'he';
  const n = firstName(p && p.name);
  const place = cs && cs.place ? (lang === 'en' ? ' at ' : lang === 'fr' ? ' à ' : ' ב') + cs.place : '';
  if (lang === 'en') return 'Hi' + (n ? ' ' + n : '') + ', hope you are doing well!\nCan you confirm you are coming to ' + eventLine(cs, lang) + place + '?\nIf you have any dietary needs, let me know. Thank you!' + (signer ? '\n' + signer : '');
  if (lang === 'fr') return 'Bonjour' + (n ? ' ' + n : '') + ', j’espère que vous allez bien !\nPouvez-vous me confirmer votre présence à ' + eventLine(cs, lang) + place + ' ?\nS’il y a un régime particulier, dites-le-moi. Merci beaucoup !' + (signer ? '\n' + signer : '');
  return 'היי' + (n ? ' ' + n : '') + ', מה שלומך? :)\nאשמח לאישור הגעה ל' + eventLine(cs, lang) + place + ' בבקשה.\nאם יש צרכים מיוחדים באוכל, כתבו לי. תודה רבה!' + (signer ? '\n' + signer : '');
}

/** The planned number on the case ('100', '16-20') next to the list: how many are still missing from the list. */
export function plannedCount(cs) {
  const m = /(\d+)\s*(?:-|–|עד)?\s*(\d+)?/.exec(str(cs && cs.participants));
  return m ? { min: +m[1], max: m[2] ? +m[2] : +m[1], text: trim(cs.participants) } : null;
}

/** Records from a pasted text that are not already on the list (same name or same phone). */
export function newOnes(existing, parsed) {
  const names = {}, phones = {};
  (existing || []).forEach(p => { names[normName(p.name)] = 1; const d = phoneDigits(p.phone); if (d) phones[d] = 1; });
  return (parsed || []).filter(p => !names[normName(p.name)] && !(phoneDigits(p.phone) && phones[phoneDigits(p.phone)]));
}

/** Other modules (voice, lead) call this: parse a text and add the people to the event. Returns the added records.
    `dbApi` is the store (default: the app's db); tests pass a fake. */
export async function addFromText(caseId, text, dbApi) {
  const db = dbApi || (await import('../store.js')).db;
  const parsed = parseParticipantsText(text);
  const add = newOnes(db.list('participants', p => p.caseId === caseId), parsed);
  add.forEach(p => { p.caseId = caseId; p.id = db.put('participants', p); });
  return { added: add, skipped: parsed.length - add.length };
}
