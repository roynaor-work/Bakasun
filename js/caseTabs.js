/* Extra tabs on the event card, registered by feature modules (participants, history, contract, checklist...).
   Each entry: { key, label: () => string, render(body, caseRec, settings) }. The order here is the order on screen. */
export const CASE_TABS = [];
export function registerCaseTab(tab) { if (!CASE_TABS.some(x => x.key === tab.key)) CASE_TABS.push(tab); }
