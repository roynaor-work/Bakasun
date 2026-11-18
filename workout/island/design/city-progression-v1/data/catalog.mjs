// Times are foreground seconds. Yields are per active minute at each completed level.
export const DAY_SECONDS = 120;
export const CONSTRUCTION_STAGES = Object.freeze(['foundation', 'half-built', 'complete']);
export const STARTER_SUPPLIES = Object.freeze({ food: 2, materials: 4, energy: 2 });
export const RECOVERY_MONEY_PER_MINUTE = 18;
export const MONEY_SOFT_CAP = 115;
export const MONEY_ABOVE_CAP_FACTOR = 0.35;
export const UNLOCK_GRACE_DAYS = 2;

export const LAND_MILESTONES = Object.freeze([
  { day: 3, population: 8, parts: 5 },
  { day: 7, population: 20, parts: 12 },
]);

const stock = ([money, materials = 0, food = 0, energy = 0]) => ({ money, materials, food, energy });
const mapMetrics = effects => Object.freeze(effects);
const option = (title, day, stageSeconds, cost, production, supply) => ({
  title, day, stageSeconds, cost: stock(cost), yield: stock(production), supply,
});

function building({
  assetId, name, category, footprint, icon, day = 1, population = 0, requires = [],
  cost, stageSeconds, production, upgrades, radius = 0, effects = {}, supply,
}) {
  return {
    assetId, name, category, footprint, icon, day, population, requires,
    cost: stock(cost), stageSeconds, yield: stock(production),
    upgrades: upgrades.map(row => option(...row)), radius, effects: mapMetrics(effects), supply,
  };
}

const rows = {
  park: {
    assetId: 'park', name: 'פארק', category: 'basic', footprint: [2, 2], icon: '🌳',
    cost: [60, 2], stageSeconds: 18, production: [4], radius: 4, effects: { happiness: 16, fun: 12 },
    upgrades: [['גינת השכונה', 2, 24, [75, 5], [6]], ['פארק עירוני', 5, 36, [125, 10, 2, 3], [9]]],
  },
  fireStation: {
    assetId: 'fire-station', name: 'תחנת כיבוי', category: 'services', footprint: [2, 2], icon: '🚒',
    cost: [95, 3], stageSeconds: 24, production: [2], radius: 5, supply: 40, effects: { security: 26, happiness: 5 },
    upgrades: [['צוות תגובה', 2, 30, [110, 6, 0, 2], [3], 75], ['מרכז חילוץ', 6, 42, [180, 14, 0, 6], [5], 130]],
  },
  grocery: {
    assetId: 'grocery', name: 'מכולת', category: 'basic', footprint: [2, 2], icon: '🛒',
    cost: [75, 3], stageSeconds: 18, production: [6, 0, 4], radius: 3, effects: { happiness: 6, health: 3 },
    upgrades: [['מכולת שכונתית', 2, 24, [95, 6, 4], [10, 0, 6]], ['מכולת מרכזית', 5, 36, [150, 11, 8, 3], [15, 0, 9]]],
  },
  library: {
    assetId: 'library', name: 'ספרייה', category: 'learning', footprint: [2, 2], icon: '📚',
    cost: [60, 2], stageSeconds: 18, production: [1], radius: 4, effects: { education: 15, happiness: 4 },
    upgrades: [['ספריית השכונה', 2, 24, [70, 5], [3]], ['מרכז קריאה', 5, 36, [130, 10, 0, 4], [6]]],
  },
  busStop: {
    assetId: 'bus-stop', name: 'תחנת אוטובוס', category: 'basic', footprint: [2, 1], icon: '🚏',
    cost: [55, 2], stageSeconds: 15, production: [3], radius: 4, effects: { happiness: 8 },
    upgrades: [['תחנה מוצלת', 2, 21, [65, 4, 0, 2], [5]], ['מסוף שכונתי', 5, 27, [110, 8, 0, 4], [8]]],
  },
  bakery: {
    assetId: 'bakery', name: 'מאפייה', category: 'basic', footprint: [2, 2], icon: '🥖',
    day: 2, population: 4, requires: ['grocery', 'farm'],
    cost: [115, 5, 3], stageSeconds: 24, production: [9, 0, 5], radius: 4, effects: { happiness: 8 },
    upgrades: [['מאפייה שכונתית', 3, 30, [130, 9, 7, 2], [14, 0, 8]], ['מאפייה עירונית', 6, 42, [200, 16, 11, 6], [21, 0, 11]]],
  },
  playground: {
    assetId: 'playground', name: 'גן שעשועים', category: 'basic', footprint: [3, 3], icon: '🛝',
    day: 2, population: 4, requires: ['park', 'flowerGarden'],
    cost: [105, 6], stageSeconds: 24, production: [3], radius: 5, effects: { fun: 22, happiness: 10 },
    upgrades: [['גן משחקים מוצל', 3, 27, [95, 8, 0, 2], [5]], ['מתחם משחקים', 6, 39, [165, 14, 0, 5], [8]]],
  },
  police: {
    assetId: 'police-station', name: 'תחנת משטרה', category: 'services', footprint: [2, 2], icon: '🛡️',
    day: 2, population: 4,
    cost: [120, 5], stageSeconds: 24, production: [2], radius: 5, supply: 40, effects: { security: 22 },
    upgrades: [['תחנה שכונתית', 3, 27, [120, 8, 0, 2], [3], 75], ['מטה עירוני', 6, 39, [185, 14, 0, 6], [5], 130]],
  },
  school: {
    assetId: 'school', name: 'בית ספר', category: 'services', footprint: [3, 2], icon: '🎒',
    day: 3, population: 8, requires: ['library', 'park'],
    cost: [155, 7, 0, 2], stageSeconds: 27, production: [3], radius: 6, supply: 32, effects: { education: 31, happiness: 6 },
    upgrades: [['בית ספר שכונתי', 4, 33, [145, 10, 0, 4], [5], 60], ['קמפוס עירוני', 7, 45, [230, 18, 0, 8], [8], 110]],
  },
  hospital: {
    assetId: 'hospital', name: 'בית חולים', category: 'services', footprint: [3, 2], icon: '🏥',
    day: 3, population: 8, requires: ['waterTower', 'fireStation'],
    cost: [170, 8, 0, 3], stageSeconds: 30, production: [3], radius: 6, supply: 48, effects: { health: 32, happiness: 3 },
    upgrades: [['מרפאות מומחים', 4, 33, [165, 12, 0, 6], [5], 85], ['מרכז רפואי', 7, 45, [245, 20, 0, 9], [8], 150]],
  },
  pool: {
    assetId: 'swimming-pool', name: 'בריכת שחייה', category: 'sports', footprint: [3, 3], icon: '🏊',
    day: 3, population: 8, requires: ['playground', 'park', 'waterTower'],
    cost: [165, 8, 0, 4], stageSeconds: 30, production: [6], radius: 5, effects: { fun: 20, health: 14 },
    upgrades: [['בריכה שכונתית', 4, 36, [155, 10, 0, 6], [9]], ['מרכז שחייה', 7, 48, [245, 19, 0, 10], [15]]],
  },
  lighthouse: {
    assetId: 'lighthouse', name: 'מגדלור', category: 'defense', footprint: [2, 2], icon: '🗼',
    day: 3, population: 4,
    cost: [100, 6, 0, 2], stageSeconds: 24, production: [3, 0, 0, 2], radius: 5, effects: { happiness: 7, security: 8 },
    upgrades: [['אור לחוף', 4, 30, [95, 8, 0, 4], [5, 0, 0, 3]], ['מגדלור אזורי', 7, 42, [155, 14, 0, 6], [8, 0, 0, 4]]],
  },
  patisserie: {
    assetId: 'patisserie', name: 'קונדיטוריה', category: 'basic', footprint: [2, 2], icon: '🍰',
    day: 4, population: 8, requires: ['bakery', 'grocery'],
    cost: [150, 7, 8, 2], stageSeconds: 27, production: [12, 0, 3], radius: 4, effects: { happiness: 12, fun: 6 },
    upgrades: [['בית קפה', 5, 33, [150, 10, 12, 4], [17, 0, 5]], ['קונדיטוריה עירונית', 8, 45, [215, 16, 16, 7], [23, 0, 8]]],
  },
  sportsPark: {
    assetId: 'sports-park', name: 'ספורטק', category: 'basic', footprint: [4, 3], icon: '🏃',
    day: 4, population: 12, requires: ['playground', 'pool', 'soccer'],
    cost: [205, 12, 0, 4], stageSeconds: 36, production: [7], radius: 6, effects: { fun: 26, health: 15 },
    upgrades: [['מסלול ומגרשים', 5, 39, [170, 14, 0, 5], [10]], ['מרכז ספורט', 8, 51, [270, 23, 0, 9], [16]]],
  },
  harbor: {
    assetId: 'harbor', name: 'נמל', category: 'defense', footprint: [3, 2], icon: '⚓',
    day: 4, population: 8, requires: ['lighthouse', 'busStop'],
    cost: [205, 10, 0, 3], stageSeconds: 33, production: [14, 4], radius: 4, effects: { happiness: 9 },
    upgrades: [['רציף מסחר', 5, 39, [185, 14, 0, 5], [19, 6]], ['נמל אזורי', 8, 51, [280, 22, 0, 10], [28, 9]]],
  },
  market: {
    assetId: 'market', name: 'שוק', category: 'basic', footprint: [3, 3], icon: '🧺',
    day: 5, population: 12, requires: ['grocery', 'bakery', 'harbor'],
    cost: [200, 12, 8, 2], stageSeconds: 33, production: [15, 0, 5], radius: 5, effects: { happiness: 13, fun: 5 },
    upgrades: [['שוק מקורה', 6, 39, [185, 15, 12, 4], [21, 0, 8]], ['שוק אזורי', 9, 51, [280, 24, 18, 8], [30, 0, 12]]],
  },
  cinema: {
    assetId: 'cinema', name: 'קולנוע', category: 'basic', footprint: [3, 2], icon: '🎬',
    day: 5, population: 12, requires: ['park', 'patisserie'],
    cost: [190, 10, 0, 6], stageSeconds: 33, production: [11], radius: 5, effects: { fun: 25, happiness: 7 },
    upgrades: [['אולם נוסף', 6, 36, [170, 13, 0, 8], [16]], ['מרכז קולנוע', 9, 48, [265, 21, 0, 13], [23]]],
  },
  museum: {
    assetId: 'museum', name: 'מוזיאון', category: 'basic', footprint: [3, 3], icon: '🏛️',
    day: 6, population: 16, requires: ['library', 'school'],
    cost: [230, 14, 0, 5], stageSeconds: 39, production: [8], radius: 6, effects: { education: 25, fun: 12, happiness: 8 },
    upgrades: [['אגף תערוכות', 7, 42, [200, 17, 0, 8], [13]], ['מוזיאון אזורי', 10, 54, [305, 26, 0, 12], [20]]],
  },
  trainStation: {
    assetId: 'train-station', name: 'תחנת רכבת', category: 'basic', footprint: [4, 2], icon: '🚉',
    day: 7, population: 20, requires: ['busStop', 'market', 'harbor'],
    cost: [290, 18, 0, 8], stageSeconds: 45, production: [17, 3], radius: 7, effects: { happiness: 16 },
    upgrades: [['רציף נוסף', 8, 48, [245, 21, 0, 11], [23, 5]], ['תחנה מרכזית', 11, 60, [350, 29, 0, 16], [32, 7]]],
  },
  theatre: {
    assetId: 'theatre', name: 'תיאטרון', category: 'basic', footprint: [3, 3], icon: '🎭',
    day: 8, population: 24, requires: ['cinema', 'museum', 'school'],
    cost: [280, 17, 0, 8], stageSeconds: 45, production: [14], radius: 7, effects: { fun: 26, education: 14, happiness: 10 },
    upgrades: [['במה מורחבת', 9, 48, [230, 20, 0, 11], [20]], ['היכל תרבות', 12, 60, [340, 29, 0, 15], [29]]],
  },
};

export const BUILDINGS = Object.freeze(Object.fromEntries(
  Object.entries(rows).map(([id, definition]) => [id, Object.freeze(building(definition))]),
));
