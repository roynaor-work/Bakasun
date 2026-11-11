import {splash} from './ui/boot-splash-start.mjs?v=island-v2-20261107-9';
import {watchRelease} from './ui/release-watch.mjs?v=island-v2-20261107-9';
import './view/learning-buildings.mjs?v=island-v2-20261107-9';
import {LearningInterface} from './learning/interface.mjs?v=island-v2-20261107-9';
import {DATA_VERSION,dataURL} from './release.mjs?v=island-v2-20261107-9';
import {createTranslator} from './ui/translate.mjs?v=island-v2-20261107-9';
import { loadData } from './engine/load-data.mjs?v=island-v2-20261107-9';
import { createEngine } from './engine/engine.mjs?v=island-v2-20261107-9';
import { IslandView } from './view/island-view.mjs?v=island-v2-20261107-9';
import { IslandInterface } from './ui/interface.mjs?v=island-v2-20261107-9';
import {createActivity} from './activity/runtime.mjs?v=island-v2-20261107-9';
import {ActivityInterface} from './ui/activity.mjs?v=island-v2-20261107-9';
import {installPressFeedback} from './ui/press.mjs?v=island-v2-20261107-9';
import {installGameShell} from './ui/game-shell.mjs?v=island-v2-20261107-9';
import {CityAccess} from './ui/city-access.mjs?v=island-v2-20261107-9';
import {navigationActive} from './view/city-navigation.mjs?v=island-v2-20261107-9';
import {previewMode,readOnlyStorage,installCityPreview} from './ui/city-preview.mjs?v=island-v2-20261107-9';
import {registerOfflineWorker,startAutoDownload,prefetchRelease} from './ui/offline.mjs?v=island-v2-20261107-9';
import {startFpsProbe,isLowQuality,resetMeasured} from './ui/device-tier.mjs?v=island-v2-20261107-9';

const strings = await fetch(dataURL('./data/strings.he.json')).then(r => {
  if (!r.ok) throw new Error('strings');
  return r.json();
});
const t = createTranslator(strings);
document.title = t('app.title');
const root = document.querySelector('#interface');
root.textContent = t('app.loading');
splash.text(t('app.loading'));
try {
  const data = await loadData();
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('storage'); }, setItem() { throw new Error('storage'); } }; }
  const cityPreview = previewMode();
  if (cityPreview) storage = readOnlyStorage(storage);
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
  splash.end();
  if (cityPreview) window.__cityPreview = installCityPreview({ view, engine, mode: cityPreview });
  const activity=createActivity(engine,{blocked:()=>Boolean(ui.modalRoot.children.length||navigationActive(view)||ui.cityAccess?.mapPanel?.hidden===false),onLaunch:choice=>games.autoLaunch(choice)});
  const learning=new LearningInterface({ui,engine});
  const games=new ActivityInterface({ui,engine,activity,data,t});
  const cityAccess=new CityAccess({ui,engine,games,learning});
  ui.cityAccess=cityAccess;
  const stopShell=installGameShell({games,ui,t,countdownStepMs:data.config.ui.economyTickMs,orientationOf:id=>data.config.gameShell.games[id]?.orientation||'landscape'});
  const pressSamples=[];
  const stopPress=installPressFeedback({compatibilityClickMs:data.config.ui.compatibilityClickMs,onFrame:(milliseconds,action)=>{pressSamples.push({milliseconds,action});if(pressSamples.length>data.config.ui.pressSampleLimit)pressSamples.shift();}});
  const releaseWatch=watchRelease({version:DATA_VERSION,onPending:version=>{prefetchRelease(version).catch(()=>{});},
    check:async()=>{const response=await fetch(new URL('./release.json?check='+Date.now(),import.meta.url),{cache:'no-store'});if(!response.ok)return null;return (await response.json()).version;},
    canRefresh:()=>!document.hidden&&!engine.isMinigameActive()&&!ui.modalRoot.children.length&&!ui.selected&&!navigationActive(view)&&ui.cityAccess?.mapPanel?.hidden!==false,
    save:()=>engine.save(),refresh:version=>{const url=new URL(location.href);url.searchParams.set('release',version);location.replace(url.href);},
    listen:check=>{const resume=()=>{if(!document.hidden)check();};document.addEventListener('visibilitychange',resume);return ()=>document.removeEventListener('visibilitychange',resume);}
  });
  // Every open: look for a newer release at once, keep the asset worker registered and
  // fill the device cache in the background (skipped on a data saver, paused during a game).
  releaseWatch.poll();if(!cityPreview)registerOfflineWorker();
  // The frame-rate probe samples the first 10 seconds in the city (not during a game); a weak device downloads only by the button.
  if(new URLSearchParams(location.search).get('quality')==='auto')resetMeasured();
  if(!cityPreview)startFpsProbe({busy:()=>engine.isMinigameActive()||Boolean(ui.modalRoot.children.length)});
  const stopAutoDownload=cityPreview?()=>{}:startAutoDownload({canRun:()=>!engine.isMinigameActive()&&!ui.modalRoot.children.length&&!document.hidden,allowed:()=>!isLowQuality(),idleMs:Number(new URLSearchParams(location.search).get('autoIdleMs'))>=0&&new URLSearchParams(location.search).has('autoIdleMs')?Number(new URLSearchParams(location.search).get('autoIdleMs')):60000,onState:state=>{window.__offlineState=state;}});
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
  window.addEventListener('beforeunload', () => { clearInterval(tick);releaseWatch.dispose();stopAutoDownload();stopShell();stopPress();stopGameShortcut();cityAccess.dispose();ui.cityManagement.dispose();learning.dispose();games.dispose();activity.dispose();persist();view.dispose(); }, { once: true });
  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.__island = { engine, view, ui, data, activity, games,learning,pressSamples };
  }
} catch (error) {
  splash.end();
  root.className = 'load-error';
  root.textContent = t('error.load');
  console.error(error);
}
