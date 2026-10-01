/* Contacts into the app: from the phone picker, a Google Contacts / Outlook / vCard export, or a contact card shared from WhatsApp.
   Nothing is written before she has seen the preview (planImport) and pressed "import" (importContacts).
   Existing cards are completed (a missing phone, e-mail or contact person), never overwritten; the whole import is one undo. */
import { db } from './store.js';
import { phoneDigits, trim } from './logic/core.js';
import { classifyAll, findExisting } from './logic/contacts.js';
import { remember } from './logic/undo.js';

export const CLASSES = ['client', 'supplier', 'staff', 'contact', 'skip'];
const COL = { client: 'clients', supplier: 'suppliers', staff: 'staff', contact: 'contacts' };

function lists() { return { clients: db.list('clients'), suppliers: db.list('suppliers'), staff: db.list('staff'), contacts: db.list('contacts') }; }

/** The preview: every contact with its suggested class, why, and the existing card it would complete (nothing is saved). */
export function planImport(list) {
  const all = lists();
  const plan = classifyAll(list || [], all);
  plan.rows.forEach(r => {
    if (!r.existing) { const f = findExisting(r.contact, all.contacts); if (f) r.existing = { col: 'contacts', card: f.card, how: f.how }; }
  });
  return plan;
}

function guessLang(c) {
  const phones = (c.phones && c.phones.length ? c.phones : [c.phone]).filter(Boolean);
  if (phones.some(p => /^33/.test(phoneDigits(p))) || /\.fr$/i.test(c.email || '')) return 'fr';
  if (/[֐-׿]/.test(c.name + (c.org || ''))) return 'he';
  return phones.some(p => /^972/.test(phoneDigits(p))) ? 'he' : 'en';
}
/** What a new card looks like per class. A person at an organisation becomes the organisation's card with the person as contact. */
export function cardFor(cls, c, type) {
  const org = trim(c.org || ''), name = trim(c.name || ''), isOrg = org && cardKey(org) !== cardKey(name);
  const base = { phone: c.phone || '', email: c.email || '' };
  if (cls === 'client') return Object.assign({ name: isOrg ? org : name, contact: isOrg ? name : '', role: c.title || '', kind: '', notes: '', lang: guessLang(c) }, base);
  if (cls === 'supplier') return Object.assign({ name: isOrg ? org : name, contact: isOrg ? name : '', role: c.title || '', type: type || 'אחר', notes: '', lang: guessLang(c) }, base);
  if (cls === 'staff') return Object.assign({ name, role: c.title || '', note: '' }, base);
  return Object.assign({ name: name || org || c.phone || c.email }, base);
}
const cardKey = s => trim(s).toLowerCase();

/** Fills in what the existing card lacks (phone, e-mail, contact person, supplier type, role); returns the patch or null when nothing is missing. */
export function completion(card, cls, c, type) {
  const patch = {};
  const fresh = cardFor(cls, c, type);
  if (!trim(card.phone) && fresh.phone) patch.phone = fresh.phone;
  if (!trim(card.email) && fresh.email) patch.email = fresh.email;
  if (cls === 'client' || cls === 'supplier') {
    if (!trim(card.contact) && fresh.contact) patch.contact = fresh.contact;
    if (!trim(card.role) && fresh.role) patch.role = fresh.role;
    if (cls === 'supplier' && !trim(card.type) && type) patch.type = type;
  }
  if (cls === 'staff' && !trim(card.role) && fresh.role) patch.role = fresh.role;
  return Object.keys(patch).length ? patch : null;
}

/** Writes the import. `choices` is one class per contact (same order as `list`): 'client' | 'supplier' | 'staff' | 'contact' | 'skip';
    missing choices fall back to the classification. Returns {added: {client, supplier, staff, contact}, updated: {...}, skipped, total, undo}.
    One `remember()` for the whole import, so "undo" takes it all back. */
export function importContacts(list, choices, label) {
  list = list || []; choices = choices || [];
  const plan = planImport(list);
  const added = { client: 0, supplier: 0, staff: 0, contact: 0 }, updated = { client: 0, supplier: 0, staff: 0, contact: 0 };
  const newIds = [], befores = []; let skipped = 0;
  const seen = { clients: db.list('clients'), suppliers: db.list('suppliers'), staff: db.list('staff'), contacts: db.list('contacts') };
  plan.rows.forEach((r, i) => {
    const c = r.contact; if (!c.name && !c.phone && !c.email) { skipped++; return; }
    const cls = CLASSES.includes(choices[i]) ? choices[i] : r.cls;
    if (cls === 'skip') { skipped++; return; }
    const col = COL[cls];
    const f = findExisting(c, seen[col]);
    if (f) {
      const patch = completion(f.card, cls, c, r.type);
      if (patch) { befores.push({ col, before: Object.assign({}, f.card) }); db.put(col, Object.assign({ id: f.card.id }, patch)); Object.assign(f.card, patch); updated[cls]++; }
      else skipped++;
    } else {
      const card = cardFor(cls, c, r.type);
      const id = db.put(col, card); newIds.push({ col, id }); seen[col].push(Object.assign({ id }, card)); added[cls]++;
    }
    // everyone she can "send to" also lives in the phone book, unless already there
    if (col !== 'contacts' && (c.phone || c.email) && !findExisting(c, seen.contacts)) { const pb = cardFor('contact', c); const id = db.put('contacts', pb); newIds.push({ col: 'contacts', id }); seen.contacts.push(Object.assign({ id }, pb)); }
  });
  const total = added.client + added.supplier + added.staff + added.contact + updated.client + updated.supplier + updated.staff + updated.contact;
  const undo = () => { newIds.forEach(x => db.remove(x.col, x.id)); befores.forEach(x => db.put(x.col, x.before)); };
  if (total) remember(label || 'import contacts ' + total, undo);
  return { added, updated, skipped, total, undo };
}
