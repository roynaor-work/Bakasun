/* The bin next to the microphone: one tap deletes the whole recording, and for an hour a "bring it back" bar
   sits under the box. Saying only "delete" (מחקי / delete / efface) does the same as the tap. */
import { t } from './i18n.js';
import { esc, toast } from './ui.js';
import { stash, peek, restore, minutesLeft, isDeleteCommand } from './logic/trash.js';
export { isDeleteCommand };

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';

/** box: the element holding the textarea `ta` and the #rec button. key: which bin ('cmd', 'lead'...). onChange(text) after delete/restore. */
export function wireDelete(box, ta, key, onChange) {
  const rec = box.querySelector('#rec'); if (!rec) return null;
  const del = document.createElement('button'); del.type = 'button'; del.className = 'btn del'; del.id = 'del'; del.title = t('deleteRec'); del.setAttribute('aria-label', t('deleteRec'));
  del.innerHTML = ICON + '<span>' + esc(t('deleteRec')) + '</span>';
  rec.insertAdjacentElement('afterend', del);
  const bar = document.createElement('div'); bar.className = 'binbar'; bar.id = 'bin';
  const row = rec.closest('.row') || rec; row.insertAdjacentElement('afterend', bar);
  const draw = () => {
    const v = peek(localStorage, key);
    bar.hidden = !v;
    bar.innerHTML = v ? `<button type="button" class="btn sm" id="undel">↩ ${esc(t('recoverRec'))}</button><span class="sub">${esc(t('minutesLeft', { n: minutesLeft(v) }))}</span>` : '';
    const u = bar.querySelector('#undel'); if (u) u.onclick = () => {
      const back = restore(localStorage, key); if (!back) { draw(); return; }
      ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + back : back;
      onChange(ta.value); toast(t('recovered')); draw(); ta.focus();
    };
  };
  const doDelete = () => {
    if (!ta.value.trim()) { toast(t('nothingToDelete')); return false; }
    stash(localStorage, key, ta.value); ta.value = ''; onChange(''); toast(t('deletedRec'), 3500); draw(); return true;
  };
  del.onclick = doDelete;
  draw();
  return { doDelete, draw };
}
