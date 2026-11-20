import { WEAPONS } from './chain.mjs';
import { LEVELS, WEATHERS, WEAPON_UPGRADES, upgradeStatus } from './levels.mjs';

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function levelButton(level, progress, selected, onSelect) {
  const locked = level.id > progress.unlocked;
  const cleared = progress.cleared.includes(level.id);
  const button = element('button', 'levels-choice');
  button.type = 'button';
  button.dataset.level = level.id;
  button.disabled = locked;
  if (level.id === selected) button.setAttribute('aria-current', 'true');

  const header = element('span', 'levels-card-header');
  const status = locked ? 'נעול' : cleared ? 'הושלם' : 'פתוח';
  header.append(element('span', '', `שלב ${level.id}`), element('span', 'levels-state', status));
  button.append(header, element('strong', 'levels-name', level.name),
    element('span', 'levels-weather', level.chapter ? `${level.chapter} · ${WEATHERS[level.weather].name}` : WEATHERS[level.weather].name));

  const strength = Math.round((level.difficulty.hp - 1) * 1000) / 10;
  const difficulty = strength === 0 ? 'עמידות אויבים רגילה' : `עמידות האויבים ${strength > 0 ? 'גבוהה' : 'נמוכה'} ב־${Math.abs(strength)}%`;
  button.append(element('span', 'levels-detail', difficulty));
  if (!locked) button.addEventListener('click', () => onSelect(level.id));
  return button;
}

function upgradeCard(upgrade, progress, save, onBuy) {
  const weapon = WEAPONS[upgrade.weapon].name;
  const status = upgradeStatus(progress, save, upgrade.id);
  const price = upgrade.cost.toLocaleString('he-IL');
  const card = element('article', 'upgrade-card levels-upgrade');
  card.tabIndex = -1;
  const title = element('h3', '', upgrade.name);
  title.id = `boar-upgrade-${upgrade.id}-title`;
  card.setAttribute('aria-labelledby', title.id);
  const header = element('div', 'levels-card-header');
  header.append(element('span', '', weapon), element('span', '', `${price} מטבעות`));
  if (upgrade.icon) {
    const icon = element('img', 'levels-upgrade-icon');
    icon.alt = '';
    icon.width = icon.height = 48;
    icon.src = new URL('../../' + upgrade.icon, import.meta.url).href;
    icon.onerror = () => icon.remove();
    card.append(icon);
  }
  card.append(header, title, element('p', '', upgrade.description));

  let label = 'רכישה';
  if (status === 'locked') {
    const requirements = [];
    if (progress.unlocked < upgrade.minLevel) requirements.push(`שלב ${upgrade.minLevel}`);
    if (!save.weapons[upgrade.weapon]) requirements.push(weapon);
    label = `נדרש לפתוח את ${requirements.join(' ואת ')}`;
  } else if (status === 'funds') {
    label = `חסרים ${(upgrade.cost - save.coins).toLocaleString('he-IL')} מטבעות`;
  } else if (status === 'owned') {
    label = 'נרכש';
  }
  const button = element('button', '', label);
  button.type = 'button';
  button.dataset.upgrade = upgrade.id;
  button.disabled = status !== 'available';
  button.setAttribute('aria-label', `${upgrade.name} · ${label} · ${price} מטבעות`);
  if (!button.disabled) button.addEventListener('click', () => onBuy(upgrade.id));
  card.append(button);
  return card;
}

export function createLevelsUI({ onSelect, onBuy, onClose }) {
  let dialog, panel, title, summary, wallet, grid, close;

  function mount() {
    if (dialog) return;
    const sheet = element('link');
    sheet.rel = 'stylesheet';
    sheet.href = new URL('./levels-ui.css', import.meta.url).href;
    document.head.append(sheet);

    dialog = element('dialog', 'overlay panel-screen');
    dialog.id = 'boar-levels-panel';
    dialog.hidden = true;
    dialog.setAttribute('aria-labelledby', 'boar-levels-title');
    dialog.setAttribute('aria-describedby', 'boar-levels-summary');
    panel = element('div', 'panel shop-panel');
    const heading = element('div', 'panel-heading');
    const headingText = element('div');
    title = element('h2');
    title.id = 'boar-levels-title';
    summary = element('p');
    summary.id = 'boar-levels-summary';
    summary.setAttribute('aria-live', 'polite');
    headingText.append(title, summary);
    wallet = element('span', 'shop-wallet levels-wallet');
    heading.append(headingText, wallet);
    grid = element('div', 'levels-grid');
    close = element('button', 'secondary');
    close.type = 'button';
    close.id = 'boar-levels-close';
    close.textContent = 'חזרה';
    close.addEventListener('click', onClose);
    const footer = element('div', 'shop-footer');
    footer.append(close);
    panel.append(heading, grid, footer);
    dialog.append(panel);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      onClose();
    });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    document.getElementById('game').append(dialog);
  }

  function show(view, heading, description, cards) {
    dialog.dataset.view = view;
    title.textContent = heading;
    summary.textContent = description;
    grid.replaceChildren(...cards);
    if (!dialog.open) {
      grid.scrollTop = 0;
      dialog.hidden = false;
      dialog.showModal();
    }
  }

  function showLevels(progress, selected, endlessWave) {
    mount();
    wallet.hidden = true;
    const cards = LEVELS.map(level => levelButton(level, progress, selected, onSelect));
    const complete = progress.cleared.length === LEVELS.length;
    if (Number.isInteger(endlessWave) && endlessWave > LEVELS.length) {
      const endless = element('button', 'levels-survival primary', `המשיכו לגל ${endlessWave} במצב הישרדות ←`);
      endless.type = 'button';
      endless.dataset.level = endlessWave;
      if (endlessWave === selected) endless.setAttribute('aria-current', 'true');
      endless.addEventListener('click', () => onSelect(endlessWave));
      cards.unshift(endless);
    }
    const hint = complete ? 'אפשר לחזור לכל שלב.' : 'השלימו שלב כדי לפתוח את הבא.';
    show('levels', 'בחירת שלב', `השלמתם ${progress.cleared.length} מתוך ${LEVELS.length} שלבים. ${hint}`, cards);
    (grid.querySelector('[aria-current="true"]:enabled') || grid.querySelector('button:enabled') || close).focus();
  }

  function showUpgrades(progress, save) {
    mount();
    const focusedId = document.activeElement?.dataset.upgrade;
    wallet.textContent = `${save.coins.toLocaleString('he-IL')} מטבעות`;
    wallet.hidden = false;
    const cards = WEAPON_UPGRADES.map(upgrade => upgradeCard(upgrade, progress, save, onBuy));
    const bought = WEAPON_UPGRADES.find(upgrade => upgrade.id === focusedId && progress.upgrades.includes(upgrade.id));
    const description = bought ? `השדרוג נרכש · ${bought.name}` : 'התקדמו בשלבים כדי לפתוח שדרוגים חדשים לנשקים שלכם.';
    show('upgrades', 'שדרוגי נשק', description, cards);
    const previous = [...grid.querySelectorAll('button')].find(button => button.dataset.upgrade === focusedId);
    const target = previous?.disabled ? previous.closest('article') : previous;
    (target || grid.querySelector('button:enabled') || close).focus();
  }

  function hide() {
    if (!dialog?.open) return;
    dialog.close();
    dialog.hidden = true;
  }

  return { showLevels, showUpgrades, hide };
}
