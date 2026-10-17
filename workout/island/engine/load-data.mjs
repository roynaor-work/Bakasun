import {DATA_VERSION,dataURL} from '../release.mjs?v=g7-20261018-1';
import { configureBuilding } from './registry.mjs?v=g7-20261018-1';

const FILES = ['config', 'buildings', 'categories', 'metrics', 'avatar', 'team', 'players', 'world', 'tutorial', 'featureFlags', 'sports', 'missions'];

/** Reads only local, bundled content. No CDN, analytics, account, or remote request. */
export async function loadData(base = new URL('../', import.meta.url), fetcher = globalThis.fetch) {
  const root = new URL(base, import.meta.url);
  const read = async path => {
    const response = await fetcher(dataURL(path, root));
    if (!response.ok) throw new Error('reason.data');
    return response.json();
  };
  const values = await Promise.all(FILES.map(name => read(`data/${name}.json`)));
  const data = Object.fromEntries(FILES.map((name, index) => [name, values[index]]));
  const [episodeManifest, extensionManifest] = await Promise.all([read('episodes/index.json'), read('data/extensions.json')]);
  data.extensions = extensionManifest.records || {};
  data.episodes = await Promise.all(episodeManifest.episodes.map(path => read(`episodes/${path}`)));
  data.extensionInstallers = [];
  for (const path of extensionManifest.modules) {
    const moduleUrl = new URL(path, root);
    if (moduleUrl.origin !== root.origin || !moduleUrl.pathname.startsWith(root.pathname)) throw new Error('reason.invalid');
    moduleUrl.searchParams.set('v',DATA_VERSION);
    const module = await import(moduleUrl.href);
    data.extensionInstallers.push(module.install || module.default);
  }
  data.buildings = data.buildings.map(row => configureBuilding(row, data.config));
  data.metrics = data.metrics.map(row => ({ ...row, ...data.config.metrics[row.id] }));
  data.players = data.players.map(row => ({ ...data.config.playerDefaults, ...row }));
  data.tutorial.steps = data.tutorial.steps.map(step => ({ ...step, reward: data.config.tutorialRewards[step.id] || {}, target: data.config.tutorialPlacements[step.id] }));
  data.missions = data.missions.map(row => ({ ...row, reward: data.config.missionReward }));
  return data;
}
