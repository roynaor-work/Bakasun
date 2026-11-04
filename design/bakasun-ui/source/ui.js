// Review-only interactions; no product imports, network calls, or business writes.
const themeButton = document.querySelector('[data-theme-toggle]');
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה');
  themeButton.title = themeButton.getAttribute('aria-label');
}
updateThemeButton();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('bakasun-design-theme', theme); } catch (_) {}
  updateThemeButton();
  // Keep local file navigation consistent even where file: storage is isolated.
  for (const link of document.querySelectorAll('a[href$=".html"],a[data-local-page]')) {
    link.dataset.localPage = 'true';
    link.href = link.getAttribute('href').split('?')[0] + '?theme=' + theme;
  }
});
for (const link of document.querySelectorAll('a[href$=".html"]')) {
  link.dataset.localPage = 'true';
  link.href += '?theme=' + document.documentElement.dataset.theme;
}

const dialog = document.querySelector('dialog');
let opener;
for (const button of document.querySelectorAll('[data-preview]')) {
  button.addEventListener('click', () => {
    opener = button;
    dialog.querySelector('h2').textContent = button.dataset.preview;
    dialog.querySelector('[data-dialog-body]').textContent = button.dataset.description || 'כאן תיפתח הפעולה מתוך תיק האירוע. זוהי תצוגת עיצוב בלבד, וכל הנתונים בה בדויים.';
    dialog.showModal();
  });
}
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => opener?.focus());
dialog.addEventListener('click', e => { if (e.target === dialog) {
  const r = dialog.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
}});

for (const check of document.querySelectorAll('[data-check]')) {
  check.addEventListener('click', () => {
    const done = check.getAttribute('aria-pressed') !== 'true';
    check.setAttribute('aria-pressed', String(done));
    const toast = document.querySelector('[role="status"]');
    toast.textContent = done ? 'כך נראית משימה שהושלמה · תצוגה בלבד' : 'המשימה שוב פתוחה · תצוגה בלבד';
    toast.hidden = false;
    clearTimeout(window.designToast);
    window.designToast = setTimeout(() => { toast.hidden = true; }, 2600);
  });
}

const filters = document.querySelector('[data-filters]');
if (filters) {
  let selected = filters.dataset.initial || 'all';
  if (filters.dataset.mode === 'board' && matchMedia('(max-width: 760px)').matches) selected = 'won';
  for (const filter of filters.querySelectorAll('button')) filter.setAttribute('aria-pressed', String(filter.dataset.filter === selected));
  const search = document.querySelector('[data-search]');
  const kind = document.querySelector('select[data-kind]');
  const apply = () => {
    const query = (search?.value || '').trim();
    let visible = 0;
    for (const item of document.querySelectorAll('[data-item]')) {
      const stateMatch = selected === 'all' || item.dataset.state === selected;
      const kindMatch = !kind || kind.value === 'all' || item.dataset.kind === kind.value;
      const textMatch = item.textContent.includes(query);
      // On phones, the board's selected column controls state visibility.
      const match = (filters.dataset.mode === 'board' || stateMatch) && kindMatch && textMatch;
      item.hidden = !match;
      if (match && stateMatch) visible++;
    }
    for (const column of document.querySelectorAll('[data-column]')) {
      const active = selected === 'all' || column.dataset.column === selected;
      column.dataset.mobileActive = String(active);
      column.hidden = !active;
      const count = [...column.querySelectorAll('[data-item]')].filter(x => !x.hidden).length;
      column.querySelector('[data-column-count]').textContent = count;
      column.querySelector('[data-column-empty]').hidden = count > 0;
    }
    const empty = document.querySelector('[data-empty]');
    if (empty) empty.hidden = visible > 0;
  };
  for (const filter of filters.querySelectorAll('button')) {
    filter.addEventListener('click', () => {
      selected = filter.dataset.filter;
      for (const sibling of filters.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === filter));
      apply();
    });
  }
  search?.addEventListener('input', apply);
  kind?.addEventListener('change', apply);
  apply();
}

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', e => {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    e.preventDefault();
    const index = tabs.indexOf(tab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : (index + (e.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    activateTab(tabs[next]);
  });
}
