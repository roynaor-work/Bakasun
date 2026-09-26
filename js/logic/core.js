/* The few Core.gs helpers the app needs, ported as they are: the no-Arabic rule, phone normalization, WhatsApp links. */

// Arabic script ranges, built from code points so the source itself holds no Arabic letters.
const ARABIC_RE = new RegExp('[' + [[0x0600, 0x06FF], [0x0750, 0x077F], [0x0870, 0x089F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]]
  .map(r => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + ']');

export const str = v => (v == null ? '' : String(v));
export const trim = v => str(v).replace(/\s+/g, ' ').trim();
export function hasArabic(s) { return ARABIC_RE.test(str(s)); }

/** '052-1234567' / '+972 52 123 4567' / '0033612345678' → '972521234567' (digits only, international), or ''. */
export function phoneDigits(p) {
  let d = str(p).replace(/[^\d+]/g, '');
  if (d.indexOf('+') === 0) d = d.slice(1);
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.indexOf('0') === 0) d = '972' + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : '';
}
/** A phone as she dials it: Israeli numbers local ('052-1234567'), others international ('+33612345678'). */
export function phonePretty(p) {
  const d = phoneDigits(p);
  if (!d) return trim(p);
  if (/^972/.test(d)) { const l = '0' + d.slice(3); return l.length === 10 ? l.slice(0, 3) + '-' + l.slice(3) : l.length === 9 ? l.slice(0, 2) + '-' + l.slice(2) : l; }
  return '+' + d;
}
export function waLink(phone, text) {
  const d = phoneDigits(phone);
  return d ? 'https://wa.me/' + d + '?text=' + encodeURIComponent(text) : '';
}
export function telLink(phone) { const d = phoneDigits(phone); return d ? 'tel:+' + d : ''; }
export function samePhone(a, b) { const x = phoneDigits(a), y = phoneDigits(b); return !!x && x === y; }
