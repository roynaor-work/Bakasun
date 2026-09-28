/* Labels for values that are stored in Hebrew and shown in the chosen language. */
import { lang, t } from './i18n.js';
import { SUPPLIER_TYPE_L, UNIT_L, CATEGORY_L } from './data/catalog.js';
import { GROUP_KIND_L } from './logic/groups.js';

const pick = (map, v) => { const L = lang(); if (!v || L === 'he') return v || ''; const m = map[v]; return (m && m[L]) || v; };
export const supplierTypeLabel = v => pick(SUPPLIER_TYPE_L, v);
export const unitLabel = v => pick(UNIT_L, v);
export const categoryLabel = v => pick(CATEGORY_L, v);
export const groupKindLabel = v => pick(GROUP_KIND_L, v);
export const linkStatusLabel = v => (v ? t('ls_' + v) : '');
export const printStatusLabel = v => (v ? t('pr_' + v) : '');
export const quoteStatusLabel = v => (v ? t('qs_' + v) : '');
export const payStatusLabel = v => (v ? t('ps_' + v) : '');
export const stars = n => { const k = Math.max(0, Math.min(5, Math.round(+n || 0))); return '★'.repeat(k) + '☆'.repeat(5 - k); };
