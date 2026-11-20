import { kidUx, kidUxStyle } from '../kid-ux.mjs?v=island-v2-20261107-21';

kidUxStyle('008', `
  .modal.modal[data-kid-ux-result] {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: 100%;
    padding: 12px;
  }
  .modal.modal[data-kid-ux-result] > .modal-close {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: 8px;
    float: none;
  }
  .modal.modal[data-kid-ux-result] > h2 {
    display: flex;
    align-items: center;
    flex: none;
    min-height: 48px;
    margin-inline: 72px;
    padding-block: 0;
  }
  .modal[data-kid-ux-result] > .modal-subtitle {
    flex: none;
    margin-block: 6px;
    font-size: 14px;
  }
  .kid-ux-result-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .kid-ux-result-details {
    padding-inline: 5px;
    font-size: 14px;
  }
  .kid-ux-offer-details:not(:has([data-upgrade-offer])) { display: none; }
  .kid-ux-result-details summary {
    align-content: center;
    min-height: 44px;
    padding-inline: 8px;
    cursor: pointer;
  }
  .kid-ux-result-actions {
    display: flex;
    flex-wrap: wrap;
    flex: none;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #95b8b5;
    margin-top: 8px;
  }
  .modal.modal[data-kid-ux-result] .kid-ux-result-actions button {
    flex: 1 1 max-content;
    min-width: 44px;
    min-height: 44px;
    padding: 5px 10px;
    margin: 0;
    border: 1px solid #95b8b5;
    border-radius: 10px;
    background: #fff2cb;
    color: #173139;
    font-size: 14px;
    text-align: center;
  }
  .modal.modal[data-kid-ux-result] .kid-ux-result-actions button:first-child {
    background: #c7f5a9;
  }
`);

const navigation = [
  'game-next-stage', 'game-again', 'game-stages', 'fire-bonus-interior',
  'racing-league-go', 'racing-league-next-season', 'racing-league-restart', 'racing-league-back',
  'alpine-league-next', 'alpine-league-again', 'alpine-league-back',
  'soccer-training',
];

export function pinResultActions(dialog, onExit) {
  if (!kidUx('008')) return;
  const document = dialog.ownerDocument;
  const footer = document.createElement('footer');
  footer.className = 'kid-ux-result-actions';
  footer.setAttribute('aria-label', 'פעולות בסיום');
  for (const action of navigation) {
    const control = dialog.querySelector(`[data-action="${action}"]`);
    if (!control) continue;
    const wrapper = control.parentElement;
    footer.append(control);
    if (wrapper.classList.contains('ik-wrap')) wrapper.remove();
  }

  let exit = dialog.querySelector('[data-action="game-exit"]');
  if (!exit) {
    exit = document.createElement('button');
    exit.type = 'button';
    exit.dataset.action = 'game-exit';
    exit.onclick = onExit;
  }
  exit.textContent = 'לחזור לאי';
  footer.append(exit);

  const stats = dialog.querySelector('.game-result');
  if (stats) {
    const details = document.createElement('details');
    details.className = 'kid-ux-result-details';
    const heading = document.createElement('summary');
    heading.textContent = 'ניקוד ופרסים';
    stats.replaceWith(details);
    details.append(heading, stats);
  }
  const body = document.createElement('div');
  body.className = 'kid-ux-result-body';
  for (const child of [...dialog.children]) {
    if (!child.matches('h2, .modal-close, .modal-subtitle, .sound-toggle, link')) body.append(child);
  }
  dialog.dataset.kidUxResult = '';
  dialog.append(body, footer);
}

export function wrapResultOffer(host) {
  if (!kidUx('008')) return host;
  const document = host.ownerDocument;
  const details = document.createElement('details');
  details.className = 'kid-ux-result-details kid-ux-offer-details';
  const summary = document.createElement('summary');
  summary.textContent = 'הצעת שדרוג';
  details.append(summary, host);
  return details;
}

export function pinBoarResults(document, onExit) {
  if (!kidUx('008') || !document) return;
  const defeat = document.querySelector('#gameover .small-panel');
  const shop = document.querySelector('#shop .shop-footer');
  if (!defeat || !shop || defeat.querySelector('[data-kid-ux-boar-exit]')) return;

  const style = document.createElement('style');
  style.textContent = `
    #gameover .small-panel { max-height: 100%; padding: 12px 18px; overflow: auto; }
    #gameover #result { margin-block: 5px; line-height: 1.4; font-size: 14px; }
    .kid-ux-boar-actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
      position: sticky; bottom: -12px; border-radius: 10px; padding: 8px; background: #163743;
    }
    #gameover .kid-ux-boar-actions button {
      flex: 1 1 max-content; width: auto; margin: 0;
    }
    #gameover .kid-ux-boar-actions button, #shop:has(#perk-section:not([hidden])) .shop-footer button {
      min-width: 44px; min-height: 44px; padding: 5px 10px; font-size: 14px;
    }
    #shop:has(#perk-section:not([hidden])) .shop-footer {
      position: sticky; bottom: 0; background: #163743; z-index: 2;
    }
    #shop:not(:has(#perk-section:not([hidden]))) [data-kid-ux-boar-win-exit] { display: none; }
  `;
  document.head.append(style);

  const makeExit = () => {
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'secondary';
    exit.dataset.kidUxBoarExit = '';
    exit.textContent = 'לחזור לאי';
    exit.onclick = onExit;
    return exit;
  };
  const footer = document.createElement('footer');
  footer.className = 'kid-ux-boar-actions';
  footer.append(defeat.querySelector('#retry'), defeat.querySelector('#death-shop'), makeExit());
  defeat.append(footer);

  const winExit = makeExit();
  winExit.dataset.kidUxBoarWinExit = '';
  shop.append(winExit);
  const perks = document.querySelector('#perk-section');
  document.querySelector('#wave-stats').after(perks);
}
