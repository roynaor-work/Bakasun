/* Message templates screen (stub, filled by the templates agent). */
import { t } from '../i18n.js';
import { esc } from '../ui.js';
export function render(ctx) { ctx.root.innerHTML = `<header class="top"><h1>${esc(t('templatesTitle') || 'תבניות')}</h1></header>`; }
