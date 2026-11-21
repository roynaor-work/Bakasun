import {BADGES, BADGE_GROUPS} from '../data/badges.mjs?v=island-v2-20261107-21';
import {praiseCopy} from './progress.mjs?v=island-v2-20261107-21';

const assets = new URL('../art/', import.meta.url);
const badgeById = new Map(BADGES.map(badge => [badge.id, badge]));
const shortDate = new Intl.DateTimeFormat('he-IL', {month: 'numeric', day: 'numeric'});
const shortNumber = new Intl.NumberFormat('he-IL', {notation: 'compact', maximumFractionDigits: 1});
const number = new Intl.NumberFormat('he-IL');
const svgNS = 'http://www.w3.org/2000/svg';
const units = {points: 'ניקוד', targets: 'תרגילים שהושלמו', hits: 'פגיעות'};

function element(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.textContent = text;
  return node;
}

function button(text, action, cls = 'pb-control') {
  const node = element('button', cls, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function art(file, cls = '', size, title = '') {
  const node = element('img', cls);
  node.alt = title;
  if (size) node.width = node.height = size;
  node.src = new URL(file, assets).href;
  return node;
}

function badgeIcon(id, size = 60) {
  return art(`badges/${id}.svg`, 'pb-badge-icon', size);
}

function svg(tag, attrs = {}, text = '') {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.textContent = text;
  return node;
}

function glyph(kind) {
  const paths = {
    stars: 'm12 2 2.9 6 6.6.9-4.8 4.7 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.5 8.9 9.1 8Z',
    streak: 'M12 3c1 4-2 5-2 9 2 0 3-1 4-4 3 3 5 5 5 8a7 7 0 0 1-14 0c0-3 2-6 4-8l1 3',
    level: 'M3 19h18M5 18v-5h4v5m1-1V9h4v8m1 0V5h4v12',
    sound: 'M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    settings: 'M4 7h16M4 12h16M4 17h16M8 4v6m8-1v6m-7-1v6',
  };
  const icon = svg('svg', {viewBox: '0 0 24 24', 'aria-hidden': 'true', class: 'pb-glyph'});
  icon.append(svg('path', {d: paths[kind], 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
  return icon;
}

function starLabel(count) {
  return count === 1 ? 'כוכב אחד' : `${number.format(count)} כוכבים`;
}

function stat(kind, title, value, extra) {
  const box = element('div', `pb-stat pb-stat-${kind}`);
  const icon = element('span', 'pb-stat-icon');
  icon.append(glyph(kind));
  const label = element('div', 'pb-stat-copy');
  const count = element('strong', 'pb-stat-value', number.format(value));
  label.append(element('span', 'pb-stat-label', title), count);
  box.append(icon, label);
  if (extra) box.append(extra);
  return box;
}

function overview(board) {
  const row = element('div', 'pb-overview');
  const {level, stars} = board;
  const levelStatus = element('div', 'pb-level-status');
  const meter = element('progress', 'pb-level-meter');
  meter.max = level.next ? level.next - level.floor : 1;
  meter.value = level.next ? stars - level.floor : 1;
  meter.setAttribute('aria-label', 'התקדמות לרמה הבאה');
  const hint = level.next ? `עד רמה ${level.number + 1} · עוד ${starLabel(level.next - stars)}` : 'כל הרמות הושלמו';
  levelStatus.append(meter, element('span', '', hint));

  const streakLabel = board.streak === 1 ? 'יום ברצף' : 'ימים ברצף';
  row.append(stat('stars', 'כוכבים השבוע', board.weeklyStars), stat('streak', streakLabel, board.streak),
    stat('level', 'רמה', level.number, levelStatus));
  return row;
}

function plot(track) {
  const chart = svg('svg', {viewBox: '0 0 410 84', class: 'pb-plot', 'aria-hidden': 'true'});
  const {points, maximum} = track;
  const top = 16;
  const bottom = 62;
  const right = 373;
  const left = 29;
  const highest = Math.max(1, ...points.map(point => point.value));
  const limit = maximum ?? Math.ceil(highest / 2) * 2;
  const ticks = limit > 2 ? [0, Math.floor(limit / 2), limit] : [0, limit];
  const y = value => bottom - (bottom - top) * value / limit;
  for (const value of ticks) {
    chart.append(svg('line', {x1: 13, x2: right + 10, y1: y(value), y2: y(value), class: 'pb-grid-line'}));
    chart.append(svg('text', {x: 407, y: y(value) + 4, 'text-anchor': 'end', class: 'pb-plot-tick'}, shortNumber.format(value)));
  }

  const coordinates = points.map(({value}, i) => ({x: right - i * (right - left) / (points.length - 1), y: y(value)}));
  const line = coordinates.map(point => `${point.x},${point.y}`).join(' ');
  chart.append(svg('polygon', {points: `${right},${bottom} ${line} ${left},${bottom}`, class: 'pb-plot-area'}));
  chart.append(svg('polyline', {points: line, class: 'pb-plot-line', fill: 'none'}));

  coordinates.forEach(({x, y}, index) => {
    const last = index === coordinates.length - 1;
    if (last) chart.append(svg('circle', {cx: x, cy: y, r: 8, class: 'pb-point-halo'}));
    chart.append(svg('circle', {cx: x, cy: y, r: last ? 4.5 : 3.5, class: last ? 'pb-point-last' : 'pb-point'}));
    chart.append(svg('text', {x, y: y - 9, 'text-anchor': 'middle', class: 'pb-point-value'}, shortNumber.format(points[index].value)));
    chart.append(svg('text', {x, y: 80, 'text-anchor': 'middle', class: 'pb-plot-date'}, shortDate.format(points[index].at)));
  });

  const figure = element('figure', 'pb-figure');
  const values = element('ol', 'pb-sr');
  for (const point of points) values.append(element('li', '', `${shortDate.format(point.at)} · ${number.format(point.value)}`));
  figure.append(element('figcaption', 'pb-sr', units[track.unit]), chart, values);
  return figure;
}

function graph(board, selected, onSelect) {
  const card = element('section', 'pb-card pb-chart');
  const head = element('div', 'pb-card-head');
  const title = element('div', 'pb-chart-title');
  title.append(element('h2', '', 'השיפור שלי'));
  head.append(title);
  card.append(head);
  if (!board.tracks.length) {
    card.append(element('p', 'pb-empty', 'אחרי שתי תוצאות באותה פעילות יופיע כאן הגרף שלך.'));
    return card;
  }

  const current = board.tracks.find(track => track.id === selected) ?? board.tracks[0];
  title.append(element('span', 'pb-unit', units[current.unit]));
  if (board.tracks.length > 1) {
    const choices = element('select', 'pb-activity-select');
    choices.setAttribute('aria-label', 'פעילות לגרף');
    const labels = new Map();
    for (const track of board.tracks) {
      const seen = (labels.get(track.label) ?? 0) + 1;
      labels.set(track.label, seen);
      const option = element('option', '', seen === 1 ? track.label : `${track.label} · סדרה ${seen}`);
      option.value = track.id;
      choices.append(option);
    }
    choices.value = current.id;
    choices.onchange = () => onSelect(choices.value);
    head.append(choices);
  } else {
    head.append(element('span', 'pb-activity-label', current.label));
  }
  card.append(plot(current));
  return card;
}

function collection(board, showAll) {
  const card = element('section', 'pb-card pb-collection');
  const head = element('div', 'pb-card-head');
  const title = element('div', 'pb-collection-title');
  title.append(element('h2', '', 'התגים שלי'),
    element('span', 'pb-earned-count', `${board.earned.length} מתוך ${BADGES.length}`));
  const link = button('כל התגים', showAll, 'pb-control pb-collection-link');
  link.dataset.pbGallery = '';
  head.append(title, link);
  const medals = element('ul', 'pb-medals');
  for (const id of board.earned.slice(0, 4)) {
    const badge = badgeById.get(id);
    if (!badge) continue;
    const tile = element('li', 'pb-medal-tile');
    tile.append(badgeIcon(id, 52), element('span', '', badge.title));
    medals.append(tile);
  }
  card.append(head, medals.childElementCount ? medals : element('p', 'pb-empty', 'כאן יופיעו התגים שיתקבלו בדרך.'));
  return card;
}

function gallery(board) {
  const panel = element('div', 'pb-gallery');
  for (const [id, title] of BADGE_GROUPS) {
    const group = element('section', 'pb-badge-group');
    const list = element('ul', 'pb-badge-list');
    for (const badge of BADGES.filter(item => item.group === id)) {
      const unlocked = board.earned.includes(badge.id);
      const row = element('li', 'pb-badge-row');
      row.dataset.earned = String(unlocked);
      const copy = element('div');
      copy.append(element('strong', '', badge.title), element('span', '', badge.rule),
        element('small', 'pb-earned-state', unlocked ? 'התקבל' : 'עוד לא התקבל'));
      row.append(badgeIcon(badge.id, 48), copy);
      list.append(row);
    }
    group.append(element('h2', '', title), list);
    panel.append(group);
  }
  return panel;
}

function headphonesButton(copy, {speak, voiceEnabled, onPreferences}, status) {
  if (voiceEnabled && !voiceEnabled()) return null;
  if (!copy.spoken && !onPreferences) return null;
  const play = button(copy.spoken ? 'לשמוע' : 'בחירת לשון להקראה', () => {
    if (!copy.spoken) return onPreferences();
    status.textContent = speak(copy.spoken) ? '' : 'לא נמצא קול עברי זמין במכשיר.';
  }, 'pb-control pb-listen');
  play.prepend(glyph('sound'));
  return play;
}

export function speakHebrew(text) {
  try {
    const synth = window.speechSynthesis;
    const voice = synth?.getVoices().find(item => item.localService && /^(he|iw)(-|$)/i.test(item.lang));
    if (!voice || !window.SpeechSynthesisUtterance) return false;
    const line = new SpeechSynthesisUtterance(text);
    line.voice = voice;
    line.lang = 'he-IL';
    line.rate = 0.92;
    synth.speak(line);
    return true;
  } catch {
    return false;
  }
}

function animateAward(mark) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const frames = Array.from({length: 8}, (_, index) => {
    const image = art(`unlock/${String(index + 1).padStart(2, '0')}.svg`, 'pb-unlock-frame', 84);
    image.style.setProperty('--pb-frame', index);
    image.dataset.pbFrame = String(index + 1);
    return image;
  });
  Promise.all(frames.map(frame => frame.decode())).then(() => {
    if (!mark.isConnected) return;
    mark.prepend(...frames);
    mark.classList.add('pb-award-motion');
  }).catch(() => {});
}

export function ribbon({praise, preferences, newBadges = []}, options = {}) {
  const {animate = false} = options;
  const copy = praiseCopy(praise, preferences);
  // Show the most specific badge in the result. The collection receives every badge.
  const badge = newBadges.at(-1);
  if (!badge && !copy) return null;
  const panel = element('aside', 'pb-ribbon');
  panel.dir = 'rtl';
  panel.lang = 'he';
  const mark = element('div', 'pb-ribbon-mark');
  if (badge) {
    mark.append(badgeIcon(badge.id, 60));
    if (animate) animateAward(mark);
  } else {
    mark.append(art('praise-ribbon.svg', 'pb-ribbon-art'));
  }
  const text = element('div', 'pb-ribbon-copy');
  text.setAttribute('role', 'status');
  const date = options.archive && praise ? ` · ${shortDate.format(praise.at)}` : '';
  const heading = badge ? `תג חדש · ${badge.title}` : `המחמאה האחרונה${date}`;
  text.append(element('strong', '', heading));
  if (copy) text.append(element('p', '', copy.text));
  if (newBadges.length > 1) {
    const rest = element('span', 'pb-sr', `תגים נוספים התקבלו · ${newBadges.slice(0, -1).map(item => item.title).join(', ')}`);
    text.append(rest);
  }
  const status = element('span', 'pb-voice-status');
  status.setAttribute('role', 'status');
  const listen = copy && headphonesButton(copy, {...options, speak: options.speak ?? speakHebrew}, status);
  panel.append(mark, text);
  if (listen) panel.append(listen, status);
  return panel;
}

function preferenceForm(model, store, done) {
  const form = element('form', 'pb-form');
  const {preferences} = model;
  const age = [
    ['6-8', 'גילי 6–8'],
    ['9-12', 'גילי 9–12'],
  ];
  const forms = [
    ['', 'ללא בחירה'],
    ['masculine', 'לשון זכר'],
    ['feminine', 'לשון נקבה'],
  ];
  function field(title, name, choices, value) {
    const entry = element('div', 'pb-field');
    const label = element('label', '', title);
    const select = element('select', 'pb-select');
    select.id = `pb-preference-${name}`;
    label.htmlFor = select.id;
    select.name = name;
    for (const [key, text] of choices) {
      const option = element('option', '', text);
      option.value = key;
      select.append(option);
    }
    select.value = value;
    entry.append(label, select);
    return entry;
  }
  const submit = element('button', 'pb-control pb-primary', 'שמירה');
  submit.type = 'submit';
  const status = element('p', 'pb-voice-status');
  status.setAttribute('role', 'status');
  form.append(field('גיל', 'ageBand', age, preferences.ageBand ?? '6-8'),
    field('לשון פנייה להקראה', 'form', forms, preferences.form ?? ''), submit, status);
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    submit.disabled = true;
    try {
      await store.preferences({ageBand: values.get('ageBand'), form: values.get('form') || null});
      done();
    } catch {
      status.textContent = 'ההגדרות לא נשמרו. אפשר לנסות שוב.';
    } finally {
      submit.disabled = false;
    }
  };
  return form;
}

export function mountBoard(host, store, options = {}) {
  const root = element('section', 'pb-board');
  root.lang = 'he';
  root.dir = 'rtl';
  root.dataset.progressBoard = '';
  host.replaceChildren(root);
  let screen = 'board';
  let selected;
  let revision = 0;
  let demoAward = false;

  const go = (next, focus) => {
    screen = next;
    void refresh(focus);
  };

  async function refresh(focus) {
    const request = ++revision;
    let board;
    try {
      board = await store.read();
    } catch {
      if (root.isConnected && request === revision) root.replaceChildren(element('p', 'pb-empty', 'הלוח לא נטען. אפשר לפתוח אותו מחדש.'));
      return;
    }
    if (!root.isConnected || request !== revision) return;
    const header = element('header', 'pb-header');
    const titleGroup = element('div', 'pb-title-group');
    const title = element(options.heading ?? 'h1', 'pb-title',
      {board: 'ההתקדמות שלי', gallery: 'התגים שלי', preferences: 'הגדרות המחמאות'}[screen]);
    title.tabIndex = -1;
    titleGroup.append(title);
    if (options.demo && screen === 'board') titleGroup.append(element('small', 'pb-demo-label', 'תצוגה מקדימה · נתוני דוגמה'));
    header.append(titleGroup);
    const controls = element('div', 'pb-header-actions');
    if (screen === 'board') {
      if (options.demo) {
        controls.append(button('הדגמת קבלת תג', () => {
          demoAward = true;
          void refresh('[data-pb-demo]');
        }));
        controls.lastChild.dataset.pbDemo = '';
      }
      const settings = button('', () => go('preferences', '.pb-title'), 'pb-control pb-settings-toggle');
      settings.append(glyph('settings'));
      settings.setAttribute('aria-label', 'הגדרות המחמאות');
      settings.dataset.pbSettings = '';
      controls.append(settings);
    } else {
      const back = button('חזרה ללוח', () => go('board', screen === 'gallery' ? '[data-pb-gallery]' : '[data-pb-settings]'));
      controls.append(back);
    }
    header.append(controls);
    root.replaceChildren(header);
    if (screen === 'gallery') {
      root.append(gallery(board));
    } else if (screen === 'preferences') {
      root.append(preferenceForm(board, store, () => go('board', '[data-pb-settings]')));
    } else {
      const middle = element('div', 'pb-middle');
      middle.append(graph(board, selected, key => { selected = key; void refresh('.pb-activity-select'); }),
        collection(board, () => go('gallery', '.pb-title')));
      root.append(overview(board), middle);
      const demo = demoAward && options.demo;
      demoAward = false;
      const band = ribbon(demo ? {...demo, preferences: board.preferences} : {praise: board.latest, preferences: board.preferences},
        {...options, animate: Boolean(demo), archive: !demo, onPreferences: () => go('preferences', '.pb-title')});
      if (band) root.append(band);
      if (!store.persistent && !options.demo) root.append(element('p', 'pb-local-status', 'ההתקדמות נשמרת עד לסגירת הדף.'));
      if (options.more) root.append(button('תוצאות המשחקים באי', options.more, 'pb-control pb-more'));
    }
    if (focus) root.querySelector(focus)?.focus();
  }

  root.append(element('p', 'pb-empty', 'הלוח נטען'));
  return refresh();
}
