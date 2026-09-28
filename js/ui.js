/* Small UI helpers: HTML building, escaping, toasts, dialogs, and the one place WhatsApp / dialing links are opened. */
import { t, lang } from './i18n.js';
import { hasArabic, waLink, telLink } from './logic/core.js';
import Office from './logic/office.js';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Tagged template: ${} values are escaped unless wrapped in raw(). */
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), '');
}
function render(v) {
  if (v == null || v === false) return '';
  if (v && v.__raw) return v.__raw;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}
export const raw = s => ({ __raw: String(s == null ? '' : s) });
export const ltr = s => raw('<span class="ltr">' + esc(s) + '</span>');

export function toast(msg, ms) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms || 2200);
}

/** A simple modal with a form body. Resolves with the FormData as an object, or null on cancel. */
export function dialog(title, bodyHtml, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<form class="modal-card" method="dialog"><h2>${esc(title)}</h2><div class="modal-body">${bodyHtml}</div>
      <div class="row end"><button type="button" class="btn ghost" data-x="cancel">${esc(opts.cancel || t('cancel'))}</button>
      <button type="submit" class="btn ${opts.danger ? 'danger' : 'primary'}">${esc(opts.ok || t('save'))}</button></div></form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    addContactPicker(form);
    const done = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.dataset.x === 'cancel') done(null); });
    form.addEventListener('submit', e => { e.preventDefault(); const o = {}; new FormData(form).forEach((v, k) => { o[k] = k in o ? [].concat(o[k], v) : v; }); done(o); });
    const first = form.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(), 50);
  });
}
export function confirmDialog(msg, okLabel) { return dialog(msg, '', { ok: okLabel || t('delete'), danger: true }).then(r => r !== null); }

/** The one rule: nothing is sent by the app. WhatsApp opens with the text; she presses send. Arabic letters block it. */
export function openWhatsApp(phone, text) {
  if (hasArabic(text)) { toast(t('arabicBlocked'), 4000); return false; }
  const url = waLink(phone, text);
  if (!url) { toast(t('noPhone')); return false; }
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  toast(t('openWa'), 2500);
  return true;
}
/** Opens the mail app with recipient, subject and body ready; she presses send. Same Arabic guard. */
export function openMail(to, subject, body) {
  if (hasArabic(body) || hasArabic(subject)) { toast(t('arabicBlocked'), 4000); return false; }
  if (!to) { toast(t('noEmail')); return false; }
  const a = document.createElement('a'); a.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || ''); a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  toast(t('openMail'), 2500);
  return true;
}
export function dial(phone) {
  const url = telLink(phone);
  if (!url) { toast(t('noPhone')); return; }
  window.location.href = url;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(t('copied')); } catch (e2) { /* nothing */ } ta.remove();
  }
}

export function fmtDate(d) { return Office.fmt(d); }
export function relDay(d) {
  const n = Office.daysBetween(new Date(), d);
  if (n === 0) return t('todayIs'); if (n === 1) return t('tomorrow');
  return n > 1 ? t('inDays', { n }) : Office.fmt(d);
}
export function field(name, label, value, opts) {
  opts = opts || {};
  const type = opts.type || 'text';
  const cls = opts.ltr ? ' class="ltr-input"' : '';
  const inp = type === 'textarea' ? `<textarea name="${name}" rows="${opts.rows || 3}"${cls}>${esc(value)}</textarea>`
    : type === 'select' ? `<select name="${name}">${opts.options.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(value) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
    : `<input name="${name}" type="${type}" value="${esc(value)}"${cls}${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ''}${opts.inputmode ? ` inputmode="${opts.inputmode}"` : ''}>`;
  return `<label class="f"><span>${esc(label)}</span>${inp}</label>`;
}
/** On phones that have it (Android Chrome), a button next to the phone field that picks from the phone's contacts. */
export function contactsSupported() { return !!(navigator.contacts && navigator.contacts.select); }
export async function pickContacts(multiple) {
  if (!contactsSupported()) return null;
  try {
    const res = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: !!multiple });
    return (res || []).map(c => ({ name: (c.name || [])[0] || '', phone: (c.tel || [])[0] || '', phones: c.tel || [], email: (c.email || [])[0] || '' }));
  } catch (e) { return []; }
}
function addContactPicker(form) {
  const tel = form.querySelector('input[name=phone]'); if (!tel || !contactsSupported()) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost pick'; b.textContent = t('fromPhone');
  tel.parentNode.appendChild(b);
  b.onclick = async () => {
    const list = await pickContacts(false); const c = list && list[0]; if (!c) return;
    const set = (n, v) => { const el = form.querySelector(`[name=${n}]`); if (el && v && !el.value) el.value = v; };
    if (c.phone) tel.value = c.phone;
    set('email', c.email); set('contact', c.name); set('name', c.name); set('who', c.name); if (!form.querySelector('[name=contact]')) set('client', c.name);
  };
}
export function empty(msg) { return `<p class="empty">${esc(msg)}</p>`; }
export function section(title, body, extra) { return `<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${extra || ''}</div>${body}</section>`; }
export function isRtl() { return lang() === 'he'; }
