/* Texts of the feature modules built in parallel (dashboard, calendar, participants, contracts). Each file exports {he, fr, en}. */
import { DASHBOARD } from './i18n/dashboard.js';
import { CALENDAR } from './i18n/calendar.js';
import { PARTICIPANTS } from './i18n/participants.js';
import { CONTRACTS } from './i18n/contracts.js';
import { BUDGET } from './i18n/budget.js';
import { RUNSHEET } from './i18n/runsheet.js';
import { CASEFILES } from './i18n/casefiles.js';
import { RULES } from './i18n/rules.js';
import { BOARD } from './i18n/board.js';
import { TASKS2 } from './i18n/tasks2.js';
import { PERSONAL } from './i18n/personal.js';
import { VOICE2 } from './i18n/voice2.js';
import { WORKGROUP } from './i18n/workgroup.js';
export const EXTRA = { he: {}, fr: {}, en: {} };
[DASHBOARD, CALENDAR, PARTICIPANTS, CONTRACTS, BUDGET, RUNSHEET, CASEFILES, RULES, BOARD, TASKS2, PERSONAL, VOICE2, WORKGROUP].forEach(d => Object.keys(EXTRA).forEach(k => Object.assign(EXTRA[k], (d && d[k]) || {})));
