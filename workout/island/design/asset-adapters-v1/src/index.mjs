/** Import only this entry point from a host. Pack modules stay lazy until requested. */
export const packs = Object.freeze({
  "hoops-realism-v2": {
    "game": "hoops",
    "flag": "?assetHoopsRealismV2=1",
    "bytes": 3722297,
    "available": true
  },
  "hoops-motion-v14": {
    "game": "hoops",
    "flag": "?assetHoopsMotionV14=1",
    "bytes": 12006563,
    "available": true
  },
  "hoops-arena-v2": {
    "game": "hoops",
    "flag": "?assetHoopsArenaV2=1",
    "bytes": 2184032,
    "available": true
  },
  "tennis-motion-v2": {
    "game": "tennis",
    "flag": "?assetTennisMotionV2=1",
    "bytes": 7213613,
    "available": true
  },
  "tennis-ui-v2": {
    "game": "tennis",
    "flag": "?assetTennisUiV2=1",
    "bytes": 293891,
    "available": true
  },
  "tennis-crowd-people-v2": {
    "game": "tennis",
    "flag": "?assetTennisCrowdPeopleV2=1",
    "bytes": 3210358,
    "available": true
  },
  "soccer-crowd-people-v2": {
    "game": "soccer",
    "flag": "?assetSoccerCrowdPeopleV2=1",
    "bytes": 2563087,
    "available": true
  },
  "soccer-run-cycles-v3": {
    "game": "soccer",
    "flag": "?assetSoccerRunCyclesV3=1",
    "bytes": 21883878,
    "available": true
  },
  "soccer-keeper-motion-v3": {
    "game": "soccer",
    "flag": "?assetSoccerKeeperMotionV3=1",
    "bytes": 16789355,
    "available": true
  },
  "soccer-celebrations-v1": {
    "game": "soccer",
    "flag": "?assetSoccerCelebrationsV1=1",
    "bytes": 12055471,
    "available": true
  },
  "soccer-kits-venues-v1": {
    "game": "soccer",
    "flag": "?assetSoccerKitsVenuesV1=1",
    "bytes": 42012,
    "available": false
  },
  "fire-multifloor-v2": {
    "game": "fire",
    "flag": "?assetFireMultifloorV2=1",
    "bytes": 4293883,
    "available": true
  },
  "fire-rescue-people-v2": {
    "game": "fire",
    "flag": "?assetFireRescuePeopleV2=1",
    "bytes": 5236481,
    "available": true
  },
  "fire-fx-v2": {
    "game": "fire",
    "flag": "?assetFireFxV2=1",
    "bytes": 433572,
    "available": true
  },
  "alpine-runner-v1": {
    "game": "alpine",
    "flag": "?assetAlpineRunnerV1=1",
    "bytes": 1732339,
    "available": true
  },
  "alpine-content-v1": {
    "game": "alpine",
    "flag": "?assetAlpineContentV1=1",
    "bytes": 1112009,
    "available": true
  },
  "aliens-weapons-v2": {
    "game": "alien",
    "flag": "?assetAliensWeaponsV2=1",
    "bytes": 945195,
    "available": true
  },
  "alien-hits-v1": {
    "game": "alien",
    "flag": "?assetAlienHitsV1=1",
    "bytes": 429283,
    "available": true
  },
  "alien-enemies-v2": {
    "game": "alien",
    "flag": "?assetAlienEnemiesV2=1",
    "bytes": 2923264,
    "available": true
  },
  "boars-weapons-v2": {
    "game": "boars",
    "flag": "?assetBoarsWeaponsV2=1",
    "bytes": 694540,
    "available": true
  },
  "boars-world-v1": {
    "game": "boars",
    "flag": "?assetBoarsWorldV1=1",
    "bytes": 1585048,
    "available": true
  },
  "catch-vehicles-v2": {
    "game": "catch",
    "flag": "?assetCatchVehiclesV2=1",
    "bytes": 3769619,
    "available": true
  },
  "catch-city-v1": {
    "game": "catch",
    "flag": "?assetCatchCityV1=1",
    "bytes": 681633,
    "available": true
  },
  "naval-sinking-v1": {
    "game": "naval",
    "flag": "?assetNavalSinkingV1=1",
    "bytes": 11189199,
    "available": true
  },
  "naval-sea-v2": {
    "game": "naval",
    "flag": "?assetNavalSeaV2=1",
    "bytes": 4779445,
    "available": true
  },
  "racing-themes-v1": {
    "game": "racing",
    "flag": "?assetRacingThemesV1=1",
    "bytes": 751218,
    "available": true
  },
  "racing-customize-v1": {
    "game": "racing",
    "flag": "?assetRacingCustomizeV1=1",
    "bytes": 1351057,
    "available": true
  },
  "racing-podium-v1": {
    "game": "racing",
    "flag": "?assetRacingPodiumV1=1",
    "bytes": 2154016,
    "available": true
  },
  "city-citizens-v1": {
    "game": "city",
    "flag": "?assetCityCitizensV1=1",
    "bytes": 5168586,
    "available": true
  },
  "city-buildings-v2": {
    "game": "city",
    "flag": "?assetCityBuildingsV2=1",
    "bytes": 2875633,
    "available": true
  },
  "avatar-customization-v1": {
    "game": "core",
    "flag": "?assetAvatarCustomizationV1=1",
    "bytes": 719486,
    "available": true
  },
  "coach-mascot-v1": {
    "game": "core",
    "flag": "?assetCoachMascotV1=1",
    "bytes": 1020471,
    "available": true
  },
  "ui-sounds-v1": {
    "game": "core",
    "flag": "?assetUiSoundsV1=1",
    "bytes": 358237,
    "available": true
  },
  "lighting-presets-v1": {
    "game": "core",
    "flag": "?assetLightingPresetsV1=1",
    "bytes": 72700,
    "available": true
  }
});

const importers = Object.freeze({
  'hoops-realism-v2': () => import('./hoops-realism-v2.mjs'),
  'hoops-motion-v14': () => import('./hoops-motion-v14.mjs'),
  'hoops-arena-v2': () => import('./hoops-arena-v2.mjs'),
  'tennis-motion-v2': () => import('./tennis-motion-v2.mjs'),
  'tennis-ui-v2': () => import('./tennis-ui-v2.mjs'),
  'tennis-crowd-people-v2': () => import('./tennis-crowd-people-v2.mjs'),
  'soccer-crowd-people-v2': () => import('./soccer-crowd-people-v2.mjs'),
  'soccer-run-cycles-v3': () => import('./soccer-run-cycles-v3.mjs'),
  'soccer-keeper-motion-v3': () => import('./soccer-keeper-motion-v3.mjs'),
  'soccer-celebrations-v1': () => import('./soccer-celebrations-v1.mjs'),
  'soccer-kits-venues-v1': () => import('./soccer-kits-venues-v1.mjs'),
  'fire-multifloor-v2': () => import('./fire-multifloor-v2.mjs'),
  'fire-rescue-people-v2': () => import('./fire-rescue-people-v2.mjs'),
  'fire-fx-v2': () => import('./fire-fx-v2.mjs'),
  'alpine-runner-v1': () => import('./alpine-runner-v1.mjs'),
  'alpine-content-v1': () => import('./alpine-content-v1.mjs'),
  'aliens-weapons-v2': () => import('./aliens-weapons-v2.mjs'),
  'alien-hits-v1': () => import('./alien-hits-v1.mjs'),
  'alien-enemies-v2': () => import('./alien-enemies-v2.mjs'),
  'boars-weapons-v2': () => import('./boars-weapons-v2.mjs'),
  'boars-world-v1': () => import('./boars-world-v1.mjs'),
  'catch-vehicles-v2': () => import('./catch-vehicles-v2.mjs'),
  'catch-city-v1': () => import('./catch-city-v1.mjs'),
  'naval-sinking-v1': () => import('./naval-sinking-v1.mjs'),
  'naval-sea-v2': () => import('./naval-sea-v2.mjs'),
  'racing-themes-v1': () => import('./racing-themes-v1.mjs'),
  'racing-customize-v1': () => import('./racing-customize-v1.mjs'),
  'racing-podium-v1': () => import('./racing-podium-v1.mjs'),
  'city-citizens-v1': () => import('./city-citizens-v1.mjs'),
  'city-buildings-v2': () => import('./city-buildings-v2.mjs'),
  'avatar-customization-v1': () => import('./avatar-customization-v1.mjs'),
  'coach-mascot-v1': () => import('./coach-mascot-v1.mjs'),
  'ui-sounds-v1': () => import('./ui-sounds-v1.mjs'),
  'lighting-presets-v1': () => import('./lighting-presets-v1.mjs'),
});

const fallback = Object.freeze({
  load: async () => false,
  ready: () => false,
  get: (_name, existing = null) => existing,
  dispose: () => {},
});

/** A failed dynamic import or asset load resolves to a legacy-compatible adapter. */
export function createRegistry(loaders = importers) {
  return async function loadAdapter(id, options = {}) {
    let adapter;
    try {
      if (!Object.hasOwn(loaders, id) || typeof loaders[id] !== 'function') return fallback;
      const module = await loaders[id]();
      adapter = module.create(options);
      if (!['load', 'ready', 'get', 'dispose'].every(name => typeof adapter?.[name] === 'function')) throw new Error('Invalid adapter');
      if (await adapter.load()) return adapter;
    } catch { /* The host keeps using its existing asset. */ }
    try { await adapter?.dispose?.(); } catch { /* Keep failure silent. */ }
    return fallback;
  };
}

export const loadAdapter = createRegistry();
