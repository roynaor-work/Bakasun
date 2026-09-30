/* "What can I say": every command, closing word and question, in her language. */
import { t, lang } from '../i18n.js';
import { esc, copyBtn } from '../ui.js';
import { HELP } from '../data/helpText.js';

export const noLive = true;
export function render({ root }) {
  const L = lang(); const list = HELP[L] || HELP.he;
  root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('help'))}</h1></header>
    <div class="stack sec">
      <p class="hint">${esc(t('helpIntro'))}</p>
      <div class="row"><a class="btn primary" href="#/assist">${esc(t('assist'))}</a><a class="btn" href="#/lead">${esc(t('newLead'))}</a></div>
      ${list.map(sec => `<div class="card"><div class="row between"><span class="title">${esc(sec.title)}</span>${copyBtn(sec.title + '\n' + sec.items.map(x => '• ' + x).join('\n'), { icon: true })}</div><ul class="help">${sec.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
    </div>`;
}
