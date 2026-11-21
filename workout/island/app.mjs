import {splash} from './ui/boot-splash-start.mjs?v=island-v2-20261107-22';
import {watchRelease} from './ui/release-watch.mjs?v=island-v2-20261107-22';
import './view/learning-buildings.mjs?v=island-v2-20261107-22';
import {LearningInterface} from './learning/interface.mjs?v=island-v2-20261107-22';
import {DATA_VERSION,dataURL} from './release.mjs?v=island-v2-20261107-22';
import {createTranslator} from './ui/translate.mjs?v=island-v2-20261107-22';
import { loadData } from './engine/load-data.mjs?v=island-v2-20261107-22';
import { createEngine } from './engine/engine.mjs?v=island-v2-20261107-22';
import { IslandView } from './view/island-view.mjs?v=island-v2-20261107-22';
import { IslandInterface } from './ui/interface.mjs?v=island-v2-20261107-22';
import {createActivity} from './activity/runtime.mjs?v=island-v2-20261107-22';
import {ActivityInterface} from './ui/activity.mjs?v=island-v2-20261107-22';
import {installPressFeedback} from './ui/press.mjs?v=island-v2-20261107-22';
import {installGameShell} from './ui/game-shell.mjs?v=island-v2-20261107-22';
import {CityAccess} from './ui/city-access.mjs?v=island-v2-20261107-22';
import {navigationActive} from './view/city-navigation.mjs?v=island-v2-20261107-22';
import {previewMode,readOnlyStorage,installCityPreview} from './ui/city-preview.mjs?v=island-v2-20261107-22';
import {registerOfflineWorker,startAutoDownload,prefetchRelease,v25On,switchRelease,packsForGames} from './ui/offline.mjs?v=island-v2-20261107-22';
import {startFpsProbe,isLowQuality,resetMeasured} from './ui/device-tier.mjs?v=island-v2-20261107-22';

const strings = await fetch(dataURL('./data/strings.he.json')).then(r => {
  if (!r.ok) throw new Error('strings');
  return r.json();
});
// strings-patches-v1 (v24.7): ?strings=v246 puts the previous wording of the catalog back (online only; the overlay holds only the changed keys).
if (new URLSearchParams(location.search).get('strings') === 'v246') {
  try { Object.assign(strings, await fetch(dataURL('./data/strings.he.v246.json')).then(r => r.ok ? r.json() : {})); } catch {}
}
let t = createTranslator(strings);
document.title = t('app.title');
const root = document.querySelector('#interface');
root.textContent = t('app.loading');
splash.text(t('app.loading'));
try {
  const cityPreview = previewMode();
  const query = new URLSearchParams(location.search);
  // City packages (v24.7). Each one is optional: a failed load or its URL flag leaves the older city.
  // ?cityMissions=0 brings back the older missions and events; ?cityProgression=1 turns the staged city on (opt-in: it forks the save into its own copy).
  const optional = (on, load) => on ? load().catch(error => { console.warn(error); return undefined; }) : undefined;
  const missions = optional(!cityPreview && query.get('cityMissions') !== '0',
    () => import('./assets/city-missions-v1/runtime.mjs?v=island-v2-20261107-22'));
  const progression = optional(!cityPreview && (query.get('cityProgression') === '1' || query.get('cityProgress') === '1'),
    () => import('./assets/city-progression-v1/island-adapter.mjs?v=island-v2-20261107-22'));
  const [data, missionsModule, cityProgress] = await Promise.all([loadData(), missions, progression]);
  let createCityMissions;
  try { createCityMissions = missionsModule?.loadCityMissions(); } catch (error) { console.warn(error); }
  if (createCityMissions || cityProgress) t = createTranslator({...strings, ...(createCityMissions ? missionsModule.missionStrings : {}), ...cityProgress?.progressStrings});
  cityProgress?.prepareCityProgressData(data);
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('storage'); }, setItem() { throw new Error('storage'); } }; }
  if (cityPreview) storage = readOnlyStorage(storage);
  const learningV2 = query.get('learningV2') === '0' ? null
    : await import('./assets/learning-v2/src/integration.mjs?v=island-v2-20261107-22').catch(() => null);
  if (cityProgress) storage = cityProgress.cityProgressStorage(storage);
  const engine = createEngine(data, { storage, createCityMissions, installLearningV2: learningV2?.installLearningV2 });
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
  const activity=createActivity(engine,{scheduling:!engine.cityMissions,blocked:()=>Boolean(ui.modalRoot.children.length||navigationActive(view)||ui.cityAccess?.mapPanel?.hidden===false),onLaunch:choice=>games.autoLaunch(choice)});
  const Learning = learningV2?.LearningV2Interface ?? LearningInterface;
  const learning=new Learning({ui,engine});
  const games=new ActivityInterface({ui,engine,activity,data,t});
  const cityAccess=new CityAccess({ui,engine,games,learning});
  ui.cityAccess=cityAccess;
  const stopCityMissions=engine.cityMissions?.announceRewards(ui);
  if (!cityPreview && query.get('progressBoard') !== '0') {
    const progress = import('./assets/progress-board-v1/src/integration.mjs?v=island-v2-20261107-22')
      .then(({connectIsland}) => connectIsland({ui, cityAccess, games})).catch(() => null);
    games.onProgressResult = (result, target) => {
      void progress.then(board => board?.record(result, target));
    };
  }
  const stopShell=installGameShell({games,ui,t,countdownStepMs:data.config.ui.economyTickMs,orientationOf:id=>data.config.gameShell.games[id]?.orientation||'landscape'});
  const pressSamples=[];
  const stopPress=installPressFeedback({compatibilityClickMs:data.config.ui.compatibilityClickMs,onFrame:(milliseconds,action)=>{pressSamples.push({milliseconds,action});if(pressSamples.length>data.config.ui.pressSampleLimit)pressSamples.shift();}});
  // Offline v25 (`?offlineV25=0` restores v24): a new release is first prepared on the device (only the
  // changed files are downloaded, the rest copied from the current cache), and only then, from an idle
  // island, its worker takes over and the page reloads; the old cache is dropped by the new worker.
  const offlineV25=v25On();let pendingRelease=null,readyRelease=null;
  const releaseWatch=watchRelease({version:DATA_VERSION,onPending:version=>{pendingRelease=version;prefetchRelease(version,{gate:async()=>!engine.isMinigameActive()}).then(r=>{window.__releasePrefetch=r;},()=>{}).finally(()=>{readyRelease=version;});},
    check:async()=>{const response=await fetch(new URL('./release.json?check='+Date.now(),import.meta.url),{cache:'no-store'});if(!response.ok)return null;return (await response.json()).version;},
    canRefresh:()=>!document.hidden&&!engine.isMinigameActive()&&!ui.modalRoot.children.length&&!ui.selected&&!navigationActive(view)&&ui.cityAccess?.mapPanel?.hidden!==false&&(!offlineV25||readyRelease===pendingRelease),
    save:()=>engine.save(),refresh:version=>{const url=new URL(location.href);url.searchParams.set('release',version);if(offlineV25)switchRelease(version).then(ok=>{window.__releaseSwitch=ok;});else location.replace(url.href);},
    listen:check=>{const resume=()=>{if(!document.hidden)check();};document.addEventListener('visibilitychange',resume);return ()=>document.removeEventListener('visibilitychange',resume);}
  });
  // Every open: look for a newer release at once, keep the asset worker registered and
  // fill the device cache in the background (skipped on a data saver, paused during a game).
  releaseWatch.poll();if(!cityPreview)registerOfflineWorker();
  // The frame-rate probe samples the first 10 seconds in the city (not during a game); a weak device downloads only by the button.
  if(new URLSearchParams(location.search).get('quality')==='auto')resetMeasured();
  if(!cityPreview)startFpsProbe({busy:()=>engine.isMinigameActive()||Boolean(ui.modalRoot.children.length)});
  const stopAutoDownload=cityPreview?()=>{}:startAutoDownload({canRun:()=>!engine.isMinigameActive()&&!ui.modalRoot.children.length&&!document.hidden,allowed:()=>!isLowQuality(),idleMs:Number(new URLSearchParams(location.search).get('autoIdleMs'))>=0&&new URLSearchParams(location.search).has('autoIdleMs')?Number(new URLSearchParams(location.search).get('autoIdleMs')):60000,onState:state=>{window.__offlineState=state;},selectPacks:()=>packsForGames([...(engine.state.instructionsSeen||[]),...Object.keys(engine.state.minigameWins||{})])});
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
  window.addEventListener('beforeunload', () => { clearInterval(tick);stopCityMissions?.();releaseWatch.dispose();stopAutoDownload();stopShell();stopPress();stopGameShortcut();cityAccess.dispose();ui.cityManagement.dispose();learning.dispose();games.dispose();activity.dispose();persist();view.dispose(); }, { once: true });
  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.__island = { engine, view, ui, data, activity, games,learning,pressSamples };
  }
} catch (error) {
  splash.end();
  root.className = 'load-error';
  root.textContent = t('error.load');
  console.error(error);
}
