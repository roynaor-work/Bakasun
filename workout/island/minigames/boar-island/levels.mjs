// Campaign data. Stages 1-20 come from the Codex patch (boars-levels-patches-v1):
// the existing waves on main with names, weather and small difficulty steps.
// Stages 21-40, the six weather looks and the 12 weapon upgrades are the real
// design package codex/boars-levels-v1 (levels-v1-data.mjs, generated).
// 20/11/2026 flags: `?boarsLevels=0` (in game.js) = the old endless waves;
// `?boarsLevels=20` = only the patch's 20 stages with its provisional upgrades.
import { enemyStats, fam, isBoss, wavePlan, waveWeather, WEATHER } from './chain.mjs';
import { BOARS_V1 } from './levels-v1-data.mjs';

export const PATCH_ONLY = (() => {
  try { return new URLSearchParams(globalThis.location?.search || '').get('boarsLevels') === '20'; } catch { return false; }
})();

export const WEATHERS = {
  ...WEATHER,
  heat: {
    name: 'חמסין',
    rule: 'המקלע וסליל הברק מתקררים לאט ב־15% בין מטחים',
    cooling: 0.85,
    chain: 0,
  },
  breeze: {
    name: 'בריזה ימית',
    rule: 'רוח מהים מקררת את המקלע ואת סליל הברק מהר ב־20% בין מטחים',
    cooling: 1.2,
    chain: 0,
  },
  // boars-levels-v1: snow, night and sunset play with the clear-sky rules (their look is the overlay).
  snow: { name: BOARS_V1.weather.snow.name, rule: '', cooling: 1, chain: 0 },
  night: { name: BOARS_V1.weather.night.name, rule: '', cooling: 1, chain: 0 },
  sunset: { name: BOARS_V1.weather.sunset.name, rule: '', cooling: 1, chain: 0 },
};

/** Full-screen light + texture layers per weather (boars-levels-v1), drawn over the 3D scene. */
export const WEATHER_LAYERS = Object.fromEntries(Object.entries(BOARS_V1.weather)
  .map(([id, { layers }]) => [id, layers.map(file => 'assets/boars-levels-v1/weather/' + file)]));

export const WEATHER_OVERRIDES = {
  heat: {
    base: 'clear', fog: '#e6c394', dens: 0.0046, sunCol: '#ffd698',
    top: '#73a8c0', mid: '#d2c19e', hor: '#f4d6ab',
    seaTop: '#72a6ad', seaHor: '#e4c9a4', mtn: '#ceb698', chop: 0.08,
  },
  breeze: {
    base: 'clear', fog: '#acdee2', hemiSky: '#daf7ff', sunCol: '#fff1cd',
    top: '#368fb2', mid: '#91d6df', hor: '#d6f1e8',
    seaTop: '#3b9eae', seaHor: '#c5e8df', chop: 0.52,
  },
  // Sky and sea tints under the boars-levels-v1 overlays (the overlay carries most of the look).
  sunset: {
    base: 'clear', fog: '#e7a978', sunCol: '#ffb36b', hemiSky: '#ffd7a8',
    top: '#4f6fa0', mid: '#e39a72', hor: '#ffc78f', seaTop: '#5b7ea0', seaHor: '#f0b88c', mtn: '#a7826e',
  },
  night: {
    base: 'clear', fog: '#1d2c47', dens: 0.0052, sunCol: '#9fb7ff', hemiSky: '#5d74a8',
    top: '#0c1630', mid: '#1c2d52', hor: '#2f4672', seaTop: '#13284a', seaHor: '#2b4469', mtn: '#26344f', chop: 0.18,
  },
  snow: {
    base: 'clear', fog: '#d9e6ef', dens: 0.0048, sunCol: '#eef6ff', hemiSky: '#eef6ff',
    top: '#8fb1cc', mid: '#c9dbe7', hor: '#e8f1f6', seaTop: '#6f96ad', seaHor: '#cfe0ea', mtn: '#e3edf3', chop: 0.14,
  },
};

// An omitted weather uses the original wave's weather. Each step adds 0.5%
// health, 0.2% speed and 0.3% damage and shortens the timeline by 0.2%,
// measured against that wave's existing stats and spawn times.
const campaign = [
  ['החוף הראשון'],
  ['עקבות בחול'],
  ['כנפיים מעל המפרץ', 'breeze'],
  ['שיירת הרפסודות'],
  ['מלך הברזל'],
  ['כרישים במים חמים', 'heat'],
  ['המצור על המזח'],
  ['משמר הרקיע', 'breeze'],
  ['שוניות הפלדה'],
  ['ספינת הכוורת'],
  ['מארב בערפל'],
  ['גשם על השריון'],
  ['מרוץ בחמסין', 'heat'],
  ['חזית הסערה'],
  ['צב המבצר'],
  ['צללים מעל המים'],
  ['סוללות המצור'],
  ['ים גועש'],
  ['החוף הנצור'],
  ['לווייתן הפלדה'],
];

const PATCH_LEVELS = campaign.map(([name, weather], index) => ({
  id: index + 1,
  name,
  weather: weather ?? waveWeather(index + 1),
  difficulty: {
    hp: (1000 + 5 * index) / 1000,
    speed: (1000 + 2 * index) / 1000,
    damage: (1000 + 3 * index) / 1000,
    gap: (1000 - 2 * index) / 1000,
  },
}));

// Stages 21-40: multipliers against enemyStats(kind, 20); bossHp is absolute; three scripted attacks.
const V1_LEVELS = BOARS_V1.levels.map(level => ({
  id: level.stage,
  name: level.name,
  chapter: level.chapter,
  weather: level.weather,
  layout: level.layout,
  objective: level.objective,
  waves: level.waves,
  difficulty: { ...level.difficulty, gap: 1 },
  v1: true,
}));

export const LEVELS = PATCH_ONLY ? PATCH_LEVELS : [...PATCH_LEVELS, ...V1_LEVELS];
export const CHAPTERS = BOARS_V1.chapters;

export function levelFor(wave) {
  return Number.isInteger(wave) ? LEVELS[wave - 1] ?? null : null;
}

export function levelWeather(wave) {
  return levelFor(wave)?.weather ?? waveWeather(wave);
}

/** One event per unit in group order, `spawnGap` apart; the next attack starts `interWave` after the last unit of the one before.
 * Lanes come from the stage's layout ([x, z, half width] in metres). */
function v1Plan(level) {
  const { spawnGap, interWave } = level.difficulty, lanes = BOARS_V1.layouts[level.layout].lanes;
  const plan = [];
  let time = 0, last = 0;
  level.waves.forEach((groups, attack) => {
    if (attack) time = last + interWave;
    let first = true;
    for (const [kind, lane, count] of groups) for (let i = 0; i < count; i++) {
      const event = { kind, time: Math.round(time * 100) / 100, lane: lanes[lane] };
      if (attack && first) event.pulse = attack + 1;
      first = false;
      plan.push(event);
      last = time;
      time += spawnGap;
    }
  });
  return plan;
}

export function levelPlan(wave) {
  const level = levelFor(wave);
  if (level?.v1) return v1Plan(level);
  const plan = wavePlan(wave);
  if (!level || level.difficulty.gap === 1) return plan;
  return plan.map(event => ({
    ...event,
    time: Math.round(event.time * level.difficulty.gap * 100) / 100,
  }));
}

export function levelEnemyStats(kind, wave) {
  const level = levelFor(wave);
  const stats = enemyStats(kind, level?.v1 ? BOARS_V1.statReferenceWave : wave);
  if (!level) return stats;
  const { hp, speed, damage, bossHp } = level.difficulty;
  return {
    ...stats,
    hp: level.v1 && bossHp && isBoss(kind) ? bossHp : Math.round(stats.hp * hp),
    speed: stats.speed * speed,
    damage: Math.round(stats.damage * damage * 10) / 10,
  };
}

const PATCH_UPGRADES = [
  {
    id: 'mg-jacket', weapon: 'mg', name: 'מעטפת קירור', minLevel: 2, cost: 120,
    description: 'כל ירייה של מקלע מוסיפה 10% פחות חום.',
    stat: 'heatPerShot', multiplier: 0.9,
  },
  {
    id: 'shotgun-loader', weapon: 'shotgun', name: 'מטען מהיר', minLevel: 4, cost: 160,
    description: 'טעינת נשקי הרסס מתקצרת ב־12%.',
    stat: 'reload', multiplier: 0.88,
  },
  {
    id: 'cannon-radius', weapon: 'cannon', name: 'טבעת הדף', minLevel: 6, cost: 220,
    description: 'רדיוס הפיצוץ של פגזי התותח גדל ב־10%.',
    stat: 'splash', multiplier: 1.1,
  },
  {
    id: 'tesla-coil', weapon: 'tesla', name: 'סליל מרוכז', minLevel: 8, cost: 260,
    description: 'פגיעות משפחת הברק גורמות 8% יותר נזק.',
    stat: 'damage', multiplier: 1.08,
  },
  {
    id: 'mg-rounds', weapon: 'mg', name: 'תחמושת מחוזקת', minLevel: 10, cost: 320,
    description: 'פגיעות המקלעים גורמות 8% יותר נזק.',
    stat: 'damage', multiplier: 1.08,
  },
  {
    id: 'mg-sight', weapon: 'mg', name: 'מייצב קנה', minLevel: 11, cost: 340,
    description: 'פיזור הכדורים של המקלעים קטן ב־15%.',
    stat: 'spread', multiplier: 0.85,
  },
  {
    id: 'shotgun-mag', weapon: 'shotgun', name: 'מחסנית מורחבת', minLevel: 12, cost: 360,
    description: 'מחסניות נשקי הרסס מכילות ירייה נוספת.',
    stat: 'mag', add: 1,
  },
  {
    id: 'shotgun-pellet', weapon: 'shotgun', name: 'רסיס נוסף', minLevel: 14, cost: 395,
    description: 'כל ירייה של נשקי הרסס מפזרת רסיס אחד נוסף.',
    stat: 'pellets', add: 1,
  },
  {
    id: 'cannon-loader', weapon: 'cannon', name: 'מנגנון טעינה', minLevel: 15, cost: 410,
    description: 'טעינת התותחים מתקצרת ב־10%.',
    stat: 'reload', multiplier: 0.9,
  },
  {
    id: 'cannon-impact', weapon: 'cannon', name: 'פגז כבד', minLevel: 17, cost: 450,
    description: 'פגזי התותחים גורמים 8% יותר נזק.',
    stat: 'damage', multiplier: 1.08,
  },
  {
    id: 'tesla-sink', weapon: 'tesla', name: 'גוף קירור', minLevel: 18, cost: 480,
    description: 'כל ירייה של נשקי הברק מוסיפה 10% פחות חום.',
    stat: 'heatPerShot', multiplier: 0.9,
  },
  {
    id: 'tesla-bridge', weapon: 'tesla', name: 'גשר ברקים', minLevel: 20, cost: 550,
    description: 'הברק יכול לדלג לאויב סמוך אחד נוסף.',
    stat: 'chain', add: 1,
  },
];

// The real upgrades (boars-levels-v1): two per V2 weapon, each for that weapon only, from stage 21.
const V1_UPGRADES = BOARS_V1.upgrades.map(upgrade => ({ ...upgrade, icon: 'assets/boars-levels-v1/icons/' + upgrade.icon }));
export const WEAPON_UPGRADES = PATCH_ONLY ? PATCH_UPGRADES.map(upgrade => ({ ...upgrade, family: true, requiredWeaponLevel: 1 })) : V1_UPGRADES;

const upgradesById = new Map(WEAPON_UPGRADES.map(upgrade => [upgrade.id, upgrade]));

function counter(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function sanitizeProgress(raw, save) {
  // Linear stages imply all previous victories. Merge both legacy counters and
  // campaign evidence so an older save or a replay cursor cannot relock a stage.
  const cleared = Array.isArray(raw?.cleared) ? raw.cleared : [];
  const lastClear = cleared.reduce((max, id) => levelFor(id) ? Math.max(max, id) : max, 0);
  const count = Math.min(LEVELS.length, Math.max(
    counter(save?.bestWave), counter(save?.nextWave) - 1,
    Math.min(counter(raw?.unlocked), LEVELS.length) - 1, lastClear,
  ));
  const purchases = new Set(Array.isArray(raw?.upgrades) ? raw.upgrades : []);
  return {
    unlocked: Math.min(count + 1, LEVELS.length),
    cleared: LEVELS.slice(0, count).map(level => level.id),
    upgrades: WEAPON_UPGRADES.filter(upgrade => purchases.has(upgrade.id)).map(upgrade => upgrade.id),
  };
}

export function completeLevel(progress, level) {
  if (!levelFor(level) || progress.unlocked !== level || progress.cleared.includes(level)) return false;
  progress.cleared.push(level);
  progress.unlocked = Math.min(level + 1, LEVELS.length);
  return true;
}

export function upgradeStatus(progress, save, id) {
  const upgrade = upgradesById.get(id);
  if (!upgrade) return 'locked';
  if (progress.upgrades.includes(id)) return 'owned';
  if (progress.unlocked < upgrade.minLevel || !((save.weapons?.[upgrade.weapon] ?? 0) >= upgrade.requiredWeaponLevel)) return 'locked';
  return Number.isFinite(save.coins) && save.coins >= upgrade.cost ? 'available' : 'funds';
}

export function buyLevelUpgrade(progress, save, id) {
  if (upgradeStatus(progress, save, id) !== 'available') return false;
  save.coins -= upgradesById.get(id).cost;
  progress.upgrades.push(id);
  return true;
}

export function applyWeaponUpgrades(stats, progress, key) {
  const family = stats.family ?? fam(key);
  const result = { ...stats };
  for (const id of progress.upgrades) {
    const upgrade = upgradesById.get(id);
    // Provisional (patch) upgrades act on the whole family; the real ones on their own weapon.
    if (!upgrade || (upgrade.family ? upgrade.weapon !== family : upgrade.weapon !== key)) continue;
    const stat = upgrade.stat;
    result[stat] = result[stat] * (upgrade.multiplier ?? 1) + (upgrade.add ?? 0);
  }
  return result;
}
