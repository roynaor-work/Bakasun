/* Contact lists brought in from the phone: Google Contacts exports (CSV or vCard) and the phone's own picker.
   Pure parsing, tested. Each contact is {name, phone, email}. */
import { trim, phonePretty, phoneDigits } from './core.js';

/** vCard 2.1 / 3.0 / 4.0 text → contacts. Handles folded lines and quoted-printable Hebrew from old exports. */
export function parseVcf(text) {
  const out = [];
  const unfolded = String(text || '').replace(/\r/g, '').replace(/\n[ \t]/g, '');
  unfolded.split(/BEGIN:VCARD/i).slice(1).forEach(card => {
    const c = { name: '', phone: '', email: '', phones: [] };
    card.split('\n').forEach(line => {
      const i = line.indexOf(':'); if (i < 0) return;
      const key = line.slice(0, i).toUpperCase(); let val = trim(line.slice(i + 1));
      if (/ENCODING=QUOTED-PRINTABLE/.test(key)) val = decodeQp(val, /CHARSET=UTF-8/.test(key) || true);
      if (key.startsWith('FN')) c.name = c.name || val;
      else if (key.startsWith('N') && key.split(';')[0] === 'N' && !c.name) { const p = val.split(';'); c.name = trim([p[1], p[0]].filter(Boolean).join(' ')); }
      else if (key.startsWith('TEL')) { const d = phoneDigits(val); if (d.length >= 9) c.phones.push(phonePretty(val)); }
      else if (key.startsWith('EMAIL')) c.email = c.email || val;
    });
    c.phone = c.phones[0] || '';
    if (c.name || c.phone) out.push({ name: c.name || c.phone, phone: c.phone, email: c.email, phones: c.phones });
  });
  return dedupe(out);
}
function decodeQp(s, utf8) {
  const bytes = []; let i = 0;
  while (i < s.length) { if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 3; } else { bytes.push(s.charCodeAt(i)); i++; } }
  try { return new TextDecoder(utf8 ? 'utf-8' : 'windows-1255').decode(new Uint8Array(bytes)); } catch (e) { return s; }
}

/** Google Contacts CSV (old "First Name/Last Name" and new "Name" layouts) → contacts. */
export function parseContactsCsv(text) {
  const rows = csvRows(String(text || '').replace(/^﻿/, ''));
  if (rows.length < 2) return [];
  const head = rows[0].map(h => trim(h).toLowerCase());
  const col = re => head.findIndex(h => re.test(h));
  const cols = re => head.map((h, i) => re.test(h) ? i : -1).filter(i => i >= 0);
  const iName = col(/^(name|full name|שם)$/), iFirst = col(/^(first name|given name)$/), iLast = col(/^(last name|family name)$/), iOrg = col(/^(organization name|organization 1 - name|company)$/);
  const iPhones = cols(/^phone(\s*\d+)?( - value)?$|טלפון/), iMails = cols(/^e-?mail(\s*\d+)?( - value)?$|מייל/);
  const out = [];
  rows.slice(1).forEach(r => {
    if (!r.some(x => trim(x))) return;
    let name = iName >= 0 ? r[iName] : trim([r[iFirst], r[iLast]].filter(Boolean).join(' '));
    if (!name && iOrg >= 0) name = r[iOrg];
    const phones = iPhones.map(i => r[i]).flatMap(v => String(v || '').split(/\s*:::\s*|\s*;\s*/)).filter(v => phoneDigits(v).length >= 9).map(phonePretty);
    const emails = iMails.map(i => r[i]).flatMap(v => String(v || '').split(/\s*:::\s*|\s*;\s*/)).map(trim).filter(v => /@/.test(v));
    if (name || phones.length) out.push({ name: trim(name) || phones[0], phone: phones[0] || '', email: emails[0] || '', phones, org: iOrg >= 0 ? trim(r[iOrg]) : '' });
  });
  return dedupe(out);
}
function csvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
/** Same phone twice → keep the first, merge the missing e-mail. */
export function dedupe(list) {
  const byPhone = new Map(), out = [];
  list.forEach(c => {
    const k = c.phone ? phoneDigits(c.phone) : 'n:' + trim(c.name).toLowerCase();
    const had = byPhone.get(k);
    if (had) { if (!had.email && c.email) had.email = c.email; return; }
    byPhone.set(k, c); out.push(c);
  });
  return out;
}
/** Which file is it? */
export function parseContactsFile(name, text) {
  return /\.vcf$/i.test(name || '') || /BEGIN:VCARD/i.test(String(text).slice(0, 200)) ? parseVcf(text) : parseContactsCsv(text);
}
