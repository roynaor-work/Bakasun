/* Mail/paste import screen (stub, filled by the import agent). */
import { t } from '../i18n.js';
import { esc } from '../ui.js';
export function render(ctx) { ctx.root.innerHTML = `<header class="top"><h1>${esc(t('importTitle') || 'ייבוא')}</h1></header>`; }
