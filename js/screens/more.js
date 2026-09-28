/* The "more" menu: clients, search, settings, and what comes in the next stages. */
import { t } from '../i18n.js';
import { esc } from '../ui.js';

export const noLive = true;
export function render({ root }) {
  const item = (href, label, d, soon) => `<a class="card tap row" href="${href}" ${soon ? 'aria-disabled="true" style="opacity:.55"' : ''}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg><span class="title grow">${esc(label)}</span>${soon ? `<span class="badge muted">${esc(t('soon'))}</span>` : ''}</a>`;
  root.innerHTML = `<header class="top"><h1>${esc(t('more'))}</h1></header><div class="list">
    ${item('#/clients', t('clients'), 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8')}
    ${item('#/search', t('search'), 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5')}
    ${item('#/quotes', t('quotes'), 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6')}
    ${item('#/suppliers', t('suppliers'), 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6')}
    ${item('#/assist', t('assist'), 'M12 3a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8')}
    ${item('#/notes', t('notes'), 'M4 4h13l3 3v13H4zM8 9h8M8 13h8M8 17h5')}
    ${item('#/receipts', t('receipts'), 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}
    ${item('#/money', t('money'), 'M3 7h18v10H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01')}
    ${item('#/settings', t('settings'), 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')}
  </div>`;
}
