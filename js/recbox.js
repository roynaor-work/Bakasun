/* The bin next to the microphone: one tap deletes the whole recording; the "bin" button beside it holds what was
   deleted in the last hour, and any entry can be brought back. Saying only "delete" (מחקי / delete / efface) does
   the same as the tap. */
import { t } from './i18n.js';
import { esc, toast, dialog } from './ui.js';
import Office from './logic/office.js';
import { stash, peek, restore, minutesLeft, isDeleteCommand, isDoneCommand, stripDelete, stripDone, splitDone, isEmptyBinCommand, emptyBin, emptyAllBins } from './logic/trash.js';
import { confirmDialog } from './ui.js';
export { isDeleteCommand, isDoneCommand, stripDelete, stripDone, splitDone, isEmptyBinCommand };

/** "Empty the bin": asks once, then every deleted recording is gone for good. Returns true when emptied. */
export async function emptyBins() {
  if (!(await confirmDialog(t('emptyBinConfirm'), t('emptyBin')))) return false;
  const n = emptyAllBins(localStorage); toast(t('binEmptied', { n })); return true;
}

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';
const BIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l-1.5 13h-13zM9 7V4h6v3M9 12l6 4M15 12l-6 4"/></svg>';

/** box: the element holding the textarea `ta` and the #rec button. key: which bin ('cmd', 'lead'...). onChange(text) after delete/restore. */
export function wireDelete(box, ta, key, onChange) {
  const rec = box.querySelector('#rec'); if (!rec) return null;
  const del = document.createElement('button'); del.type = 'button'; del.className = 'btn del'; del.id = 'del'; del.title = t('deleteRec'); del.setAttribute('aria-label', t('deleteRec'));
  del.innerHTML = ICON + '<span>' + esc(t('deleteRec')) + '</span>';
  rec.insertAdjacentElement('afterend', del);
  const bin = document.createElement('button'); bin.type = 'button'; bin.className = 'btn del'; bin.id = 'bin'; bin.title = t('binBtn'); bin.setAttribute('aria-label', t('binBtn'));
  del.insertAdjacentElement('afterend', bin);
  const draw = () => {
    const list = peek(localStorage, key);
    bin.hidden = !list.length;
    bin.innerHTML = BIN + '<span>' + esc(t('binBtn')) + ' (' + list.length + ')</span>';
  };
  const putBack = text => {
    ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + text : text;
    onChange(ta.value); toast(t('recovered')); draw(); ta.focus();
  };
  bin.onclick = async () => {
    const list = peek(localStorage, key); if (!list.length) { draw(); return; }
    const html = `<p class="hint">${esc(t('binHint'))}</p>` + list.map((v, i) => `<label class="chk"><input type="radio" name="pick" value="${esc(v.id)}"${i === 0 ? ' checked' : ''}><span><span class="sub">${esc(new Date(v.at).toTimeString().slice(0, 5))} · ${esc(t('minutesLeft', { n: minutesLeft(v) }))}</span><br>${esc(v.text.length > 160 ? v.text.slice(0, 160) + '…' : v.text)}</span></label>`).join('')
      + `<div class="row end"><button type="button" class="btn danger sm" id="emptyBinBtn">${esc(t('emptyBin'))}</button></div>`;
    const r = await dialog(t('binTitle'), html, { ok: t('recoverRec') });
    draw();
    if (!r || !r.pick) return;
    const back = restore(localStorage, key, r.pick); if (back) putBack(back); else draw();
  };
  const doDelete = () => {
    if (!ta.value.trim()) { toast(t('nothingToDelete')); return false; }
    stash(localStorage, key, ta.value); ta.value = ''; onChange(''); toast(t('deletedRec'), 3500); draw(); return true;
  };
  del.onclick = doDelete;
  draw();
  return { doDelete, draw };
}

// the "empty the bin" button inside the bin dialog: one confirmation, then the dialog closes
document.addEventListener('click', async e => {
  if (e.target && e.target.id === 'emptyBinBtn') {
    const form = e.target.closest('form');
    if (await emptyBins()) { const c = form && form.querySelector('[data-x=cancel]'); if (c) c.click(); const b = document.querySelector('#bin'); if (b) { b.hidden = true; } }
  }
});
