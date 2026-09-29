/* Texts of the feature modules built in parallel (dashboard, calendar, participants, contracts). Each file exports {he, fr, en}. */
import { DASHBOARD } from './i18n/dashboard.js';
import { CALENDAR } from './i18n/calendar.js';
import { PARTICIPANTS } from './i18n/participants.js';
import { CONTRACTS } from './i18n/contracts.js';
export const EXTRA = { he: {}, fr: {}, en: {} };
[DASHBOARD, CALENDAR, PARTICIPANTS, CONTRACTS].forEach(d => Object.keys(EXTRA).forEach(k => Object.assign(EXTRA[k], (d && d[k]) || {})));
