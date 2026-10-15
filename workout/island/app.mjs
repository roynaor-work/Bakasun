import { loadData } from './engine/load-data.mjs';
import { createEngine } from './engine/engine.mjs';
import { IslandView } from './view/island-view.mjs';
import { IslandInterface } from './ui/interface.mjs';
import {createActivity} from './activity/runtime.mjs';
import {ActivityInterface} from './ui/activity.mjs';

const strings = await fetch(new URL('./data/strings.he.json', import.meta.url)).then(r => {
  if (!r.ok) throw new Error('strings');
  return r.json();
});
const t = (id, values = {}) => Object.entries(values).reduce((s, [key, value]) => s.replaceAll(`{${key}}`, String(value)), strings[id] ?? id);
document.title = t('app.title');
const root = document.querySelector('#interface');
root.textContent = t('app.loading');
try {
  const data = await loadData();
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('storage'); }, setItem() { throw new Error('storage'); } }; }
  const engine = createEngine(data, { storage });
  let ui;
  const view = new IslandView({
    canvas: document.querySelector('#world'), data: { ...data, registry: engine.registry },
    onCell: cell => ui?.onCell(cell),
    onHover: cell => ui?.onHover(cell),
    onSelect: id => ui?.showInfo(id),
    onReady: () => { document.documentElement.dataset.ready = 'true'; },
    onError: id => { if (ui) ui.toast(id); else root.textContent = t(id); }
  });
  ui = new IslandInterface({ root, engine, view, data, t });
  const activity=createActivity(engine,{blocked:()=>Boolean(ui.modalRoot.children.length)});
  const games=new ActivityInterface({ui,engine,activity,data,t});
  let openedGames=false;
  const requestedGames=new URLSearchParams(location.search).get('games')==='1';
  const openRequestedGames=()=>{
    if(requestedGames&&data.featureFlags.minigames&&!openedGames&&engine.state.avatar.created&&!ui.modalRoot.children.length){openedGames=true;games.menu();}
  };
  const stopGameShortcut=requestedGames?engine.subscribe((_,event)=>{if(event.type==='avatar')queueMicrotask(openRequestedGames);}):()=>{};
  queueMicrotask(openRequestedGames);
  window.islandApi = Object.freeze({
    grantParts: (groupId, count) => engine.grantParts(groupId, count),
    canPlay: () => engine.canPlay(),
    spendPlayTime: minutes => engine.spendPlayTime(minutes),
    onNarrate: null
  });
  const tick = setInterval(() => {
    if (!document.hidden) {activity.tick();games.render();engine.tick(data.config.ui.economyTickMs / 1000);}
  }, data.config.ui.economyTickMs);
  const persist = () => engine.save();
  document.addEventListener('visibilitychange', persist);
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', () => { clearInterval(tick);stopGameShortcut();games.dispose();activity.dispose();persist();view.dispose(); }, { once: true });
  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.__island = { engine, view, ui, data, activity, games };
  }
} catch (error) {
  root.className = 'load-error';
  root.textContent = t('error.load');
  console.error(error);
}
