/** Native modal semantics plus explicit Tab cycling and input suspension. */
export function connectDialog(dialog, { controls, fallbackFocus } = {}) {
  if (!(dialog instanceof HTMLDialogElement)) throw new TypeError('A native dialog element is required');
  const abort = new AbortController();
  let opener;
  let destroyed = false;
  const focusables = () => [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]'));
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) { event.preventDefault(); dialog.focus(); return; }
    const first = items[0]; const last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault(); first.focus();
    }
  }, { signal: abort.signal });
  function restore() {
    // A previous dialog can dispatch close after its successor has already opened.
    if (dialog.getRootNode().querySelector('dialog[open]')) return;
    controls?.setEnabled(true);
    const target = opener?.isConnected && opener.getClientRects().length ? opener : fallbackFocus;
    target?.focus({ preventScroll: true });
  }
  dialog.addEventListener('close', restore, { signal: abort.signal });
  return {
    open() {
      if (destroyed || dialog.open) return;
      opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      controls?.setEnabled(false);
      dialog.showModal();
      (dialog.querySelector('[autofocus]') || focusables()[0] || dialog).focus({ preventScroll: true });
    },
    close() { dialog.close(); },
    destroy() {
      if (destroyed) return;
      const wasOpen = dialog.open;
      if (wasOpen) dialog.close();
      abort.abort(); destroyed = true;
      if (wasOpen) restore();
    },
  };
}
