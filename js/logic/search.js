/* Global search, the pure part: one index over everything she keeps (cases, people, tasks, notes, quotes, participants,
   files, contracts, budget lines, run-of-show blocks, history, help texts) and one ranked, grouped query over it.
   No DOM, no storage: js/screens/search.js draws it. Hebrew is normalized (final letters, quotes), phones match by digits,
   and a word matches with or without a Hebrew prefix letter (ל/ב/ה/ו/מ/ש/כ), so "לשפיים" finds "שפיים" and the reverse. */
import Office from './office.js';
import { str, trim, phoneDigits } from './core.js';

export const GROUPS = ['case', 'client', 'supplier', 'contact', 'staff', 'team', 'task', 'call', 'note', 'quote', 'participant', 'file', 'contract', 'budget', 'runsheet', 'history', 'help'];

const PREFIX1 = 'לבהומשכ';
const SEP = /[\s,;:/()|·"“”'’`«»\[\]{}!?]+/;

/** Lower case, no final letters, no quotes/nikud, single spaces. */
export function norm(s) { return Office.normHe(s); }
/** The words of a text, normalized. */
export function tokens(s) { return norm(s).split(SEP).map(w => w.replace(/^[.\-–—]+|[.\-–—]+$/g, '')).filter(Boolean); }
/** A word and the same word without a Hebrew prefix letter (only when what is left is still a word). */
export function variants(w) {
  const out = [w];
  if (w.length > 2 && PREFIX1.indexOf(w[0]) >= 0 && /^[֐-׿]/.test(w)) {
    out.push(w.slice(1));
    if (w.length > 3 && PREFIX1.indexOf(w[1]) >= 0 && w[0] === 'ו') out.push(w.slice(2));
    if (w.length > 3 && w[0] === 'ש' && w[1] === 'ה') out.push(w.slice(2));
  }
  return out;
}
const isPhoneWord = w => /^[\d+\-().\s]+$/.test(w) && w.replace(/\D/g, '').length >= (/^\d+$/.test(w) ? 3 : 4);
const digitsOf = s => str(s).replace(/\D/g, '');
/** Every digit string a record can be found by: as typed and international. */
function phoneKeys(list) {
  const out = [];
  (list || []).forEach(p => { const d = digitsOf(p); if (d.length >= 4) out.push(d); const i = phoneDigits(p); if (i && i !== d) out.push(i); });
  return out;
}

/* ---------------- the index ---------------- */

function doc(group, id, o) {
  const title = trim(o.title), sub = trim(o.sub);
  const strong = (o.strong || [title]).map(str).filter(Boolean);
  const weak = (o.text || []).map(str).filter(Boolean);
  return {
    group, id: str(id), title, sub, href: o.href || '#/' + group, when: str(o.when || ''), caseId: str(o.caseId || ''),
    strongStr: norm(strong.join(' ')), weakStr: norm(weak.concat([sub]).join(' ')),
    strongTok: tokens(strong.join(' ')), weakTok: tokens(weak.concat([sub]).join(' ')),
    digits: phoneKeys(o.phones), nums: (o.nums || []).map(str).filter(Boolean)
  };
}
const dt = x => x && (x.updated || x.created || x.addedAt || x.at || '');
const fmt = d => (d ? Office.fmt(d) : '');
const noteHref = n => n.about === 'client' ? '#/client/' + n.aboutId : n.about === 'supplier' ? '#/supplier/' + n.aboutId : n.about === 'case' ? '#/case/' + n.aboutId : '#/notes';
const COL_HREF = { cases: id => '#/case/' + id, clients: id => '#/client/' + id, suppliers: id => '#/supplier/' + id, quotes: id => '#/quote/' + id, contracts: id => '#/contract/' + id, tasks: () => '#/tasks', calls: () => '#/calls', notes: () => '#/notes', payments: () => '#/money', team: () => '#/settings', staff: () => '#/cases' };

/** data: the store snapshot (or any subset of it); opts.help: the help sections of the current language [{title, items}]. */
export function buildIndex(data, opts) {
  data = data || {}; opts = opts || {};
  const cases = {}; (data.cases || []).forEach(c => { cases[c.id] = c; });
  const sups = {}; (data.suppliers || []).forEach(s => { sups[s.id] = s; });
  const caseName = id => { const c = cases[id]; return c ? [c.client, c.kind].filter(Boolean).join(' · ') : ''; };
  const docs = [];
  (data.cases || []).forEach(c => docs.push(doc('case', c.id, {
    title: [c.client, c.contact].filter(Boolean).join(' · '), sub: [c.kind, fmt(c.date), c.place, c.status].filter(Boolean).join(' · '),
    strong: [c.client, c.contact, c.place, c.kind], text: [c.email, c.purpose, c.notes, c.source, c.participants, c.budget, c.status, c.leadSource],
    phones: [c.phone], href: '#/case/' + c.id, when: dt(c), caseId: c.id })));
  (data.clients || []).forEach(c => docs.push(doc('client', c.id, {
    title: c.name, sub: [c.contact, c.type].filter(Boolean).join(' · '), strong: [c.name, c.contact, c.legalName, c.aliases],
    text: [c.email, c.notes, c.address, c.taxId, c.approver, c.payer, c.invoiceEmail], phones: [c.phone], href: '#/client/' + c.id, when: dt(c) })));
  (data.suppliers || []).forEach(s => docs.push(doc('supplier', s.id, {
    title: s.name, sub: [s.type, s.area].filter(Boolean).join(' · '), strong: [s.name, s.contact, s.type],
    text: [s.email, s.notes, s.area, s.bank], phones: [s.phone], href: '#/supplier/' + s.id, when: dt(s) })));
  (data.contacts || []).forEach(c => docs.push(doc('contact', c.id, {
    title: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · '), strong: [c.name], text: [c.email], phones: [c.phone], href: '#/settings', when: dt(c) })));
  (data.staff || []).forEach(x => docs.push(doc('staff', x.id, {
    title: x.name, sub: [x.role, caseName(x.caseId)].filter(Boolean).join(' · '), strong: [x.name, x.role], text: [x.email, x.note],
    phones: [x.phone], href: x.caseId && cases[x.caseId] ? '#/case/' + x.caseId + '/plan' : '#/cases', when: dt(x), caseId: x.caseId })));
  (data.team || []).forEach(x => docs.push(doc('team', x.id, {
    title: x.name, sub: x.role || '', strong: [x.name, x.role], text: [x.email, x.note], phones: [x.phone], href: '#/settings', when: dt(x) })));
  (data.tasks || []).forEach(x => {
    const no = x.no || x.num || x.number || x.seq || '';
    docs.push(doc('task', x.id, {
      title: (no ? '#' + no + ' ' : '') + str(x.title), sub: [x.who, fmt(x.due), caseName(x.caseId)].filter(Boolean).join(' · '),
      strong: [x.title, no ? '#' + no : ''], text: [x.details, x.who, x.status], phones: [x.phone], nums: no ? [String(no)] : [], href: '#/tasks', when: dt(x), caseId: x.caseId }));
  });
  (data.calls || []).forEach(c => docs.push(doc('call', c.id, {
    title: c.name, sub: c.why || '', strong: [c.name], text: [c.why, c.note], phones: [c.phone], href: '#/calls', when: dt(c) })));
  (data.notes || []).forEach(n => docs.push(doc('note', n.id, {
    title: n.aboutLabel || '', sub: n.text || '', strong: [n.aboutLabel], text: [n.text], href: noteHref(n), when: dt(n), caseId: n.about === 'case' ? n.aboutId : '' })));
  (data.quotes || []).forEach(q => docs.push(doc('quote', q.id, {
    title: [q.no, q.client || caseName(q.caseId)].filter(Boolean).join(' · '), sub: [fmt(q.date), q.status].filter(Boolean).join(' · '),
    strong: [q.client, q.no, caseName(q.caseId)], text: (q.lines || []).map(l => [l.item, l.en, l.fr, l.section, l.notes, l.supplier].filter(Boolean).join(' ')).concat([q.terms, q.status]),
    href: '#/quote/' + q.id, when: dt(q), caseId: q.caseId })));
  (data.participants || []).forEach(p => docs.push(doc('participant', p.id, {
    title: p.name, sub: [p.org, caseName(p.caseId)].filter(Boolean).join(' · '), strong: [p.name, p.org], text: [p.email, p.role, p.notes, p.dietary, p.roommate, (p.tags || []).join(' ')],
    phones: [p.phone], href: '#/case/' + p.caseId + '/participants', when: dt(p), caseId: p.caseId })));
  (data.casefiles || []).forEach(f => docs.push(doc('file', f.id, {
    title: f.name, sub: [f.kind, caseName(f.caseId), f.supplierId && sups[f.supplierId] ? sups[f.supplierId].name : ''].filter(Boolean).join(' · '),
    strong: [f.name, (f.tags || []).join(' ')], text: [f.note, f.kind], href: '#/case/' + f.caseId + '/files', when: dt(f), caseId: f.caseId })));
  (data.contracts || []).forEach(c => {
    const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {};
    docs.push(doc('contract', c.id, {
      title: [cl.name || cl.legalName, c.title].filter(Boolean).join(' · '), sub: [ev.kind, fmt(ev.date), ev.place, c.status].filter(Boolean).join(' · '),
      strong: [c.title, cl.name, cl.legalName], text: [ev.kind, ev.place, cl.contact, cl.email, c.scope, c.status], phones: [cl.phone],
      href: '#/contract/' + c.id, when: dt(c), caseId: c.caseId }));
  });
  (data.budget || []).forEach(l => docs.push(doc('budget', l.id, {
    title: l.item, sub: [l.category, caseName(l.caseId), l.supplierId && sups[l.supplierId] ? sups[l.supplierId].name : ''].filter(Boolean).join(' · '),
    strong: [l.item], text: [l.note, l.category, l.supplierId && sups[l.supplierId] ? sups[l.supplierId].name : '', l.status],
    href: '#/case/' + l.caseId + '/budget', when: dt(l), caseId: l.caseId })));
  (data.runsheet || []).forEach(r => (r.days || []).forEach(d => (d.blocks || []).forEach(b => docs.push(doc('runsheet', r.id + ':' + (b.id || b.title), {
    title: b.title, sub: [fmt(d.date), [b.start, b.end].filter(Boolean).join('-'), b.owner, caseName(r.caseId)].filter(Boolean).join(' · '),
    strong: [b.title, b.owner], text: [b.place, b.notes, b.cue, b.staffName, b.kind], phones: [b.phone], href: '#/runsheet/' + r.caseId, when: dt(r) || r.updatedAt, caseId: r.caseId })))));
  (data.history || []).forEach(h => docs.push(doc('history', h.id, {
    title: h.summary || h.label || '', sub: [h.at ? fmt(h.at.slice(0, 10)) : '', caseName(h.caseId)].filter(Boolean).join(' · '), strong: [h.summary, h.label], text: [],
    href: h.caseId && cases[h.caseId] ? '#/case/' + h.caseId + '/history' : (COL_HREF[h.col] ? COL_HREF[h.col](h.refId) : '#/cases'), when: h.at || dt(h), caseId: h.caseId })));
  (opts.help || []).forEach((sec, i) => (sec.items || []).forEach((it, j) => docs.push(doc('help', 'h' + i + '_' + j, {
    title: sec.title, sub: it, strong: [sec.title], text: [it], href: '#/help', when: '' }))));
  return docs;
}

/* ---------------- the query ---------------- */

/** How well a query word sits in a field: 3 exact word, 2 word start, 1 somewhere inside, 0 not there. */
function level(word, toks, full) {
  const vs = variants(word);
  let best = 0;
  for (let i = 0; i < toks.length && best < 3; i++) {
    const tv = variants(toks[i]);
    for (let a = 0; a < tv.length && best < 3; a++) for (let b = 0; b < vs.length && best < 3; b++) {
      if (tv[a] === vs[b]) best = 3;
      else if (best < 2 && tv[a].indexOf(vs[b]) === 0) best = 2;
    }
  }
  if (!best && vs.some(v => v.length >= 2 && full.indexOf(v) >= 0)) best = 1;
  return best;
}
function scoreDoc(d, words, qn) {
  let score = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; let s = 0;
    if (isPhoneWord(w)) {
      const x = digitsOf(w).replace(/^0/, '');
      if (d.digits.some(k => k === x || k === '0' + x)) s = 9; else if (d.digits.some(k => k.indexOf(x) >= 0)) s = 6;
    } else if (w[0] === '#' && w.length > 1) {
      if (d.nums.indexOf(w.slice(1)) >= 0) s = 9;
    }
    if (!s) s = Math.max(level(w, d.strongTok, d.strongStr) * 3, level(w, d.weakTok, d.weakStr));
    if (!s) return 0;
    score += s;
  }
  const exact = d.strongStr === qn || norm(d.title) === qn;
  if (exact) score += 10;
  else if (norm(d.title).indexOf(qn) === 0) score += 4;
  else if (words.length > 1 && d.strongStr.indexOf(qn) >= 0) score += 2;
  return { score: score + (GROUP_BONUS[d.group] || 0), exact };
}
/* On an equal match a record she works on (a case, a person) comes before a line about it (history, help). */
const GROUP_BONUS = { case: 2, client: 2, supplier: 2, contact: 1, staff: 1, team: 1, task: 1, quote: 1, contract: 1, participant: 1, history: -2, help: -2 };
const byRank = (a, b) => b.score - a.score || (b.when > a.when ? 1 : b.when < a.when ? -1 : 0) || a.title.localeCompare(b.title);

/** Every doc matching every word of q, grouped and ranked: { total, groups: [{key, count, exact, items}], first }.
    Within a group: exact before starts-with before contains, then the most recent first. opts.limit caps each group (count stays full).
    first = the first row shown (top of the first group), the one Enter opens. */
export function search(docs, q, opts) {
  opts = opts || {};
  const qn = norm(q);
  // "052 123 4567" / "+972-52-1234567" is one phone, not four words
  const words = qn.replace(/\+?\d[\d\s\-().]*\d/g, m => m.replace(/[\s\-().]/g, '')).split(' ').filter(Boolean);
  if (!words.length) return { total: 0, groups: [], first: null };
  const hits = [];
  (docs || []).forEach(d => { const r = scoreDoc(d, words, qn); if (r) hits.push(Object.assign({ score: r.score, exact: r.exact }, d)); });
  hits.sort(byRank);
  const by = {}; hits.forEach(h => { (by[h.group] = by[h.group] || []).push(h); });
  const order = opts.order || GROUPS;
  const groups = order.filter(k => by[k]).map(k => ({ key: k, count: by[k].length, best: by[k][0].score, exact: !!by[k][0].exact, items: by[k].slice(0, opts.limit || 12) }));
  // a group whose best hit is an exact name comes first; otherwise the fixed order holds. Enter opens the first row she sees.
  groups.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
  return { total: hits.length, groups, first: groups.length ? groups[0].items[0] : null };
}

/* ---------------- recent searches (the list itself; the screen keeps it in localStorage) ---------------- */

export const RECENT_MAX = 8;
export function addRecent(list, q, max) {
  const s = trim(q); if (!s) return (list || []).slice();
  const k = norm(s);
  return [s].concat((list || []).filter(x => norm(x) !== k)).slice(0, max || RECENT_MAX);
}
export function removeRecent(list, q) { const k = norm(q); return (list || []).filter(x => norm(x) !== k); }
