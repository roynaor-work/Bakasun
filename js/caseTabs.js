/* Extra tabs on the event card, registered by feature modules (participants, history, contract, checklist...).
   Each entry: { key, label: () => string, render(body, caseRec, settings) }. The order here is the order on screen. */
export const CASE_TABS = [];
/* The modules load in any order (each one when the event card opens), so the order on screen is fixed here, not by who registers first. */
const ORDER = ['workgroup', 'history', 'participants', 'contract', 'checklist', 'budget', 'runsheet', 'files'];
const rank = k => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
export function registerCaseTab(tab) {
  if (CASE_TABS.some(x => x.key === tab.key)) return;
  CASE_TABS.push(tab); CASE_TABS.sort((a, b) => rank(a.key) - rank(b.key)); // stable: tabs outside the list keep their registration order
}
