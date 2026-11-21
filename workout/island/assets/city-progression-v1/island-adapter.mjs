import {BUILDINGS} from './catalog.mjs?v=island-v2-20261107-21';
import {
  advanceProgress, cancelProgressProject, constructionStage, initProgress, isOperational, operatingState,
  progressAvailability, progressIncome, progressMetrics, progressPartTarget, progressReport,
  secondsUntilProgressEvent, startProgressProject, upgradeProgressAvailability, validProgress,
} from './progression.mjs?v=island-v2-20261107-21';

export {cityProgressEnabled, cityProgressStorage} from './storage.mjs?v=island-v2-20261107-21';

const CATEGORIES = {
  basic: 'basic', commercial: 'basic', transport: 'basic', transit: 'basic', coastal: 'basic',
  education: 'services', services: 'services', emergency: 'services', health: 'services', civic: 'services',
  recreation: 'sports', sports: 'sports', culture: 'services', learning: 'learning', defense: 'defense',
};
const SLOT = 'assets/city-buildings-v2/';
const STAGES = new Set(['foundation', 'half-built', 'complete']);
const GOODS = ['materials', 'food', 'energy'];

export const progressStrings = {
  'progress.currentDay': 'יום {day} בעיר',
  'progress.day': 'נפתח ביום מתקדם יותר בעיר',
  'progress.population': 'דרושים עוד תושבים',
  'progress.materials': 'חסרים חומרי בנייה',
  'progress.food': 'חסר אוכל',
  'progress.energy': 'חסרה אנרגיה',
  'city.status.construction': 'בבנייה',
  'progress.satisfaction': 'שביעות רצון {value}%',
  'progress.foundation': 'יסודות',
  'progress.half-built': 'בנייה מתקדמת',
  'progress.complete': 'פתוח',
  'progress.remaining': 'עוד {seconds} שנ׳ לפתיחה',
  'progress.requirementDay': 'נפתח ביום {day}',
  'progress.requirementPopulation': 'נפתח ב־{population} תושבים',
  'progress.requirementBuilding': 'קודם פותחים את {building}',
  'progress.prerequisite': 'דרוש בניין נוסף',
  'progress.queue': 'אתרי הבנייה תפוסים',
  'progress.pending': 'הבנייה באתר עדיין מתקדמת',
  'metric.satisfaction': 'שביעות רצון',
};
for (const [id, row] of Object.entries(BUILDINGS)) {
  progressStrings[`progress.building.${id}`] = row.name;
  for (const [index, upgrade] of row.upgrades.entries()) {
    progressStrings[`progress.level.${id}.${index + 2}`] = upgrade.title;
  }
}

function resourceRates(yieldRow) {
  return Object.fromEntries(GOODS.filter(key => yieldRow?.[key]).map(key => [key, yieldRow[key]]));
}

function levelsFor(id, authored, previous = []) {
  const steps = [authored, ...authored.upgrades];
  return Array.from({length: Math.max(steps.length, previous.length)}, (_, index) => {
    const oldLevel = previous[index];
    const step = steps[index];
    if (!step) return oldLevel;
    return {
      ...oldLevel,
      cost: index === 0 ? 0 : step.cost.money,
      income: step.yield.money,
      resources: resourceRates(step.yield),
      ...(step.supply === undefined ? {} : {supply: step.supply}),
      ...(index === 0 ? {} : {title: `progress.level.${id}.${index + 1}`}),
    };
  });
}

/** Supplies the normal registry with progression records before save validation. */
export function prepareCityProgressData(data) {
  const records = new Map(data.buildings.map(row => [row.id, row]));
  const balance = {...data.config.buildings};
  for (const [id, authored] of Object.entries(BUILDINGS)) {
    const base = records.get(id);
    const key = base?.balanceId ?? id;
    const levels = levelsFor(id, authored, base?.levels);
    const record = {
      ...base,
      id,
      title: base?.title ?? `progress.building.${id}`,
      category: base?.category ?? CATEGORIES[authored.category] ?? 'services',
      icon: base?.icon ?? authored.icon,
      requiresRoad: base?.requiresRoad ?? true,
      requiresShore: base?.requiresShore ?? authored.assetId === 'lighthouse',
      footprint: base?.footprint ?? authored.footprint,
      limit: base?.limit ?? {kind: 'stageCap', maxCount: [2, 3, 4], reason: 'app.atLimit'},
      cost: authored.cost.money,
      radius: authored.radius ?? base?.radius ?? 0,
      population: base?.population ?? 0,
      income: authored.yield.money,
      resources: resourceRates(authored.yield),
      ...(authored.supply === undefined ? {} : {supply: authored.supply}),
      effects: Object.fromEntries(Object.entries(authored.effects ?? {}).filter(([id]) => data.metrics.some(metric => metric.id === id))),
      levels,
      maxLevelByStage: data.config.worldStages.map(() => levels.length),
      cityProgressAsset: authored.assetId,
    };
    records.set(id, record);
    balance[key] = {...balance[key], ...record};
  }
  data.config = {...data.config, buildings: balance};
  data.buildings = [...records.values()];
  data.cityProgress = {
    advance: advanceProgress, cancel: cancelProgressProject, init: initProgress, isOperational, operatingState,
    availability: progressAvailability, upgradeAvailability: upgradeProgressAvailability, start: startProgressProject,
    report: progressReport, income: progressIncome, metrics: progressMetrics, parts: progressPartTarget, valid: validProgress,
    model: progressBuildingModel,
    nextEvent: secondsUntilProgressEvent,
    isPending: (state, id) => Object.hasOwn(state.cityProgress?.projects ?? {}, id),
    managesUpgrade: (typeId, level) => Boolean(BUILDINGS[typeId]?.upgrades[level - 1]),
    gateText: progressGateText,
    costText: progressCostText,
  };
  return data;
}

/** The authored static GLBs use the island's stock, JavaScript GLTFLoader. */
export function progressBuildingModel(state, building, record) {
  const asset = record?.cityProgressAsset;
  if (!asset) return null;
  const stage = constructionStage(state, building.id);
  if (!STAGES.has(stage)) return null;
  const [width, depth] = record.footprint;
  return {stage, path: `${SLOT}${asset}-${stage}.glb`, rotationY: 0, scale: 1,
    fit: {box: {w: width * .98, d: depth * .98}}};
}

export function progressGateText(status, translate) {
  if (status.reason === 'progress.day' && Number.isFinite(status.day)) {
    return translate('progress.requirementDay', {day: status.day});
  }
  if (status.reason === 'progress.population' && Number.isFinite(status.population)) {
    return translate('progress.requirementPopulation', {population: status.population});
  }
  if (status.reason === 'progress.prerequisite' && status.requires?.length) {
    const required = status.requires.map(id => BUILDINGS[id]?.name ?? translate(`building.${id}`));
    return translate('progress.requirementBuilding', {building: required.join(' / ')});
  }
  return translate(status.reason);
}

function progressCostText(typeId, translate, level = 1) {
  const building = BUILDINGS[typeId];
  const terms = level === 1 ? building : building?.upgrades[level - 2];
  if (!terms) return '';
  return GOODS.filter(key => terms.cost[key]).map(key => `${terms.cost[key]} ${translate(`app.${key}`)}`).join(' · ');
}
