/* The signature pad: a canvas in a modal, finger or mouse (pointer events), sharp on high-DPI screens, with clear / undo.
   signaturePad(opts) resolves to {png, name, save} (png = PNG data URL, cropped to the strokes) or null on cancel.
   opts: {title, hint, askName, name, saved (a PNG data URL she saved before: offers "use my saved signature"), offerSave}. */
import { t } from './i18n.js';
import { esc } from './ui.js';

const INK = '#17120F';
const WIDTH = 2.4;

export function signaturePad(opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal sig-modal';
    wrap.innerHTML = `<div class="modal-card sig-card" role="dialog" aria-label="${esc(opts.title || t('ctSigTitleClient'))}">
      <h2>${esc(opts.title || t('ctSigTitleClient'))}</h2>
      ${opts.hint ? `<p class="hint">${esc(opts.hint)}</p>` : ''}
      ${opts.askName ? `<label class="f"><span>${esc(t('sigName'))}</span><input name="name" type="text" value="${esc(opts.name || '')}" autocomplete="name"></label>` : ''}
      <div class="sig-frame"><canvas class="sig-canvas" aria-label="${esc(t('ctSigHint'))}"></canvas><span class="sig-line"></span><span class="sig-hint">${esc(t('ctSigHint'))}</span></div>
      <div class="row between">
        <div class="row"><button type="button" class="btn sm ghost" data-x="clear">${esc(t('sigClear'))}</button><button type="button" class="btn sm ghost" data-x="undo">${esc(t('sigUndo'))}</button></div>
        ${opts.saved ? `<button type="button" class="btn sm" data-x="saved">${esc(t('sigUseSaved'))}</button>` : ''}
      </div>
      ${opts.offerSave ? `<label class="chk"><input type="checkbox" name="save"><span>${esc(t('sigSaveMine'))}</span></label>` : ''}
      <div class="row end"><button type="button" class="btn ghost" data-x="cancel">${esc(t('cancel'))}</button><button type="button" class="btn primary" data-x="ok">${esc(t('sigOk'))}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const canvas = wrap.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const strokes = []; // [[{x,y}...], ...] in CSS pixels
    let cur = null, dpr = 1, w = 0, h = 0;

    function setup() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.max(1, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function style(c) { c.lineWidth = WIDTH; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; }
    function drawStroke(c, s) {
      if (!s.length) return;
      c.beginPath();
      if (s.length === 1) { c.arc(s[0].x, s[0].y, WIDTH / 2, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); return; }
      c.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) { const p = s[i - 1], q = s[i]; c.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      c.lineTo(s[s.length - 1].x, s[s.length - 1].y); c.stroke();
    }
    function redraw() { ctx.clearRect(0, 0, w, h); style(ctx); strokes.forEach(s => drawStroke(ctx, s)); wrap.classList.toggle('has-ink', strokes.length > 0); }
    function pos(ev) { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    canvas.addEventListener('pointerdown', ev => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); cur = [pos(ev)]; strokes.push(cur); redraw(); });
    canvas.addEventListener('pointermove', ev => {
      if (!cur) return; ev.preventDefault();
      const pts = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      pts.forEach(p => cur.push(pos(p)));
      // draw only the tail, no full redraw on every move
      style(ctx); const n = cur.length; if (n >= 2) { const p = cur[n - 2], q = cur[n - 1]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    });
    const end = () => { if (cur) { cur = null; redraw(); } };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);
    window.addEventListener('resize', setup);

    /** The strokes as a PNG, cropped to what was drawn (with a margin), transparent background, 2x for print. */
    function exportPng() {
      const all = strokes.flat(); if (!all.length) return '';
      const pad = 10;
      const x0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.x)) - pad)), y0 = Math.max(0, Math.floor(Math.min(...all.map(p => p.y)) - pad));
      const x1 = Math.min(w, Math.ceil(Math.max(...all.map(p => p.x)) + pad)), y1 = Math.min(h, Math.ceil(Math.max(...all.map(p => p.y)) + pad));
      const scale = 2;
      const out = document.createElement('canvas'); out.width = Math.max(1, (x1 - x0) * scale); out.height = Math.max(1, (y1 - y0) * scale);
      const c = out.getContext('2d'); c.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale); style(c);
      strokes.forEach(s => drawStroke(c, s));
      return out.toDataURL('image/png');
    }
    const done = v => { window.removeEventListener('resize', setup); wrap.remove(); resolve(v); };
    const nameOf = () => { const i = wrap.querySelector('input[name=name]'); return i ? i.value.trim() : ''; };
    const saveOf = () => { const i = wrap.querySelector('input[name=save]'); return !!(i && i.checked); };
    wrap.addEventListener('click', ev => {
      const b = ev.target.closest('[data-x]'); if (!b) { if (ev.target === wrap) done(null); return; }
      const x = b.dataset.x;
      if (x === 'cancel') done(null);
      else if (x === 'clear') { strokes.length = 0; redraw(); }
      else if (x === 'undo') { strokes.pop(); redraw(); }
      else if (x === 'saved') done({ png: opts.saved, name: nameOf(), save: false, fromSaved: true });
      else if (x === 'ok') { const png = exportPng(); if (!png) { wrap.querySelector('.sig-frame').classList.add('shake'); setTimeout(() => wrap.querySelector('.sig-frame').classList.remove('shake'), 500); return; } done({ png, name: nameOf(), save: saveOf() }); }
    });
    wrap.addEventListener('keydown', ev => { if (ev.key === 'Escape') done(null); });
    requestAnimationFrame(setup);
  });
}
