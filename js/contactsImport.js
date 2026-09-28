/* Contacts into the app: from the phone picker, a Google Contacts export, or a contact card shared from WhatsApp.
   The same phone is never added twice. */
import { db } from './store.js';
import { phoneDigits } from './logic/core.js';

/** Adds contacts that are new (by phone); returns how many were added. */
export function importContacts(list) {
  let n = 0;
  const have = new Set(db.list('contacts').map(c => phoneDigits(c.phone || '')).filter(Boolean));
  (list || []).forEach(c => {
    const d = phoneDigits(c.phone || '');
    if (!c.name && !c.phone) return;
    if (d && have.has(d)) return;
    if (d) have.add(d);
    db.put('contacts', { name: c.name || c.phone, phone: c.phone || '', email: c.email || '' }); n++;
  });
  return n;
}
