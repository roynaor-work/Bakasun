import {watchRelease} from './ui/release-watch.mjs?v=island-alpine-20261026-1';
import './view/learning-buildings.mjs?v=island-alpine-20261026-1';
import {LearningInterface} from './learning/interface.mjs?v=island-alpine-20261026-1';
import {DATA_VERSION,dataURL} from './release.mjs?v=island-alpine-20261026-1';
import {createTranslator} from './ui/translate.mjs?v=island-alpine-20261026-1';
import { loadData } from './engine/load-data.mjs?v=island-alpine-20261026-1';
import { createEngine } from './engine/engine.mjs?v=island-alpine-20261026-1';
import { IslandView } from './view/island-view.mjs?v=island-alpine-20261026-1';
import { IslandInterface } from './ui/interface.mjs?v=island-alpine-20261026-1';
import {createActivity} from './activity/runtime.mjs?v=island-alpine-20261026-1';
import {ActivityInterface} from './ui/activity.mjs?v=island-alpine-20261026-1';
import {installPressFeedback} from './ui/press.mjs?v=island-alpine-20261026-1';
import {installGameShell} from './ui/game-shell.mjs?v=island-alpine-20261026-1';

const strings = await fetch(dataURL('./data/strings.he.json')).then(r => {
  if (!r.ok) throw new Error('strings');
  return r.json();
});
const t = createTranslator(strings);
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
  const activity=createActivity(engine,{blocked:()=>Boolean(ui.modalRoot.children.length),onLaunch:choice=>games.autoLaunch(choice)});
  const learning=new LearningInterface({ui,engine});
  const games=new ActivityInterface({ui,engine,activity,data,t});
  const stopShell=installGameShell({games,ui,t,countdownStepMs:data.config.ui.economyTickMs,orientationOf:id=>data.config.gameShell.games[id]?.orientation||'landscape'});
  const pressSamples=[];
  const stopPress=installPressFeedback({compatibilityClickMs:data.config.ui.compatibilityClickMs,onFrame:(milliseconds,action)=>{pressSamples.push({milliseconds,action});if(pressSamples.length>data.config.ui.pressSampleLimit)pressSamples.shift();}});
  const releaseWatch=watchRelease({version:DATA_VERSION,
    check:async()=>{const response=await fetch(new URL('./release.json?check='+Date.now(),import.meta.url),{cache:'no-store'});if(!response.ok)return null;return (await response.json()).version;},
    canRefresh:()=>!document.hidden&&!engine.isMinigameActive()&&!ui.modalRoot.children.length&&!ui.selected,
    save:()=>engine.save(),refresh:version=>{const url=new URL(location.href);url.searchParams.set('release',version);location.replace(url.href);},
    listen:check=>{const resume=()=>{if(!document.hidden)check();};document.addEventListener('visibilitychange',resume);return ()=>document.removeEventListener('visibilitychange',resume);}
  });
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
    if (!document.hidden) {activity.tick();games.render();engine.tick(data.config.ui.economyTickMs / 1000);releaseWatch.apply();}
  }, data.config.ui.economyTickMs);
  const persist = () => engine.save();
  document.addEventListener('visibilitychange', persist);
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', () => { clearInterval(tick);releaseWatch.dispose();stopShell();stopPress();stopGameShortcut();ui.cityManagement.dispose();learning.dispose();games.dispose();activity.dispose();persist();view.dispose(); }, { once: true });
  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.__island = { engine, view, ui, data, activity, games,learning,pressSamples };
  }
} catch (error) {
  root.className = 'load-error';
  root.textContent = t('error.load');
  console.error(error);
}
