import {arcadeEvent, islandEvent, workoutEvent} from './events.mjs?v=island-v2-20261107-23';

let runtime;
let styles;

function loadRuntime() {
  return runtime ??= Promise.all([import('./store.mjs?v=island-v2-20261107-23'), import('./view.mjs?v=island-v2-20261107-23')])
    .then(async ([storage, view]) => ({store: await storage.createStore(), view}))
    .catch(error => {
      runtime = null;
      throw error;
    });
}

function loadStyles() {
  return styles ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('./board.css?v=island-v2-20261107-23', import.meta.url).href;
    css.onload = resolve;
    css.onerror = () => {
      css.remove();
      reject(new Error('style'));
    };
    document.head.append(css);
  }).catch(error => {
    styles = null;
    throw error;
  });
}

async function record(event, target, options, getRuntime = loadRuntime) {
  if (!event) return;
  try {
    const {store, view} = await getRuntime();
    const earned = await store.record(event);
    if (!earned || (!earned.praise && !earned.newBadges.length)) return;
    const host = await target;
    if (!host?.isConnected) return;
    await loadStyles();
    if (!host.isConnected) return;
    const panel = view.ribbon(earned, {...options, animate: true});
    if (!panel) return;
    const before = host.querySelector('.modal-subtitle');
    if (before) before.after(panel);
    else host.prepend(panel);
  } catch {
    // The host app still finishes its result if this feature cannot load or persist.
  }
}

export function connectIsland({ui, cityAccess, games}) {
  const shortcut = cityAccess.bar.querySelector('[data-action="quick-scores"]');
  const options = {voiceEnabled: () => !games.sound.muted};
  if (shortcut) {
    const scores = shortcut.onclick;
    const oldLabel = shortcut.getAttribute('aria-label');
    const name = shortcut.querySelector('strong');
    const oldText = name.textContent;
    name.textContent = 'ההתקדמות שלי';
    shortcut.setAttribute('aria-label', name.textContent);
    shortcut.onclick = async event => {
      cityAccess.prepare();
      const modal = ui.openModal('access.scores', 'access.scoresHint');
      const wasPaused = ui.view.paused;
      ui.view.paused = true;
      ui.modalCleanup = () => { ui.view.paused = wasPaused; };
      modal.classList.add('pb-island-modal');
      const heading = modal.querySelector('h2');
      heading.textContent = 'ההתקדמות שלי';
      modal.querySelector('.modal-subtitle').remove();
      const host = document.createElement('div');
      const loading = document.createElement('p');
      loading.className = 'pb-island-loading';
      loading.setAttribute('role', 'status');
      loading.textContent = 'הלוח נטען';
      host.append(loading);
      modal.append(host);
      try {
        const [{store, view}] = await Promise.all([loadRuntime(), loadStyles()]);
        if (!modal.isConnected) return;
        heading.classList.add('pb-sr');
        await view.mountBoard(host, store, {heading: 'h2', ...options, more: () => cityAccess.scores()});
      } catch {
        name.textContent = oldText;
        shortcut.setAttribute('aria-label', oldLabel);
        shortcut.onclick = scores;
        if (modal.isConnected) scores.call(shortcut, event);
      }
    };
  }

  return {
    record(input, host) {
      const {played, result} = input;
      if (!played && !result.drill && !(result.score > 0) && result.outcome !== 'win' &&
          !(input.fireSummary?.rescued > 0) && result.certificate?.rescue !== true) return;
      return record(islandEvent(input), host, options);
    },
  };
}

export function connectWorkout(options) {
  let runtime;
  function getRuntime() {
    return runtime ??= loadRuntime().then(async current => {
      const age = options.profileAge?.();
      if (Number.isInteger(age) && age >= 6 && age <= 12) {
        await current.store.preferences({ageBand: age <= 8 ? '6-8' : '9-12'}, true);
      }
      return current;
    }).catch(error => {
      runtime = null;
      throw error;
    });
  }
  return {
    async mount(host) {
      if (!host?.isConnected) return;
      try {
        const [{store, view}] = await Promise.all([getRuntime(), loadStyles()]);
        if (host.isConnected) await view.mountBoard(host, store, {heading: 'h2', ...options});
      } catch {
        if (host.isConnected) host.textContent = 'הלוח לא נטען. אפשר לפתוח אותו מחדש.';
      }
    },
    recordWorkout(session, summary, host) {
      return record(workoutEvent(session, summary), host, options, getRuntime);
    },
    recordArcade(input, host) {
      return record(arcadeEvent(input), host, options, getRuntime);
    },
  };
}
