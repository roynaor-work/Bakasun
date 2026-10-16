import {equipmentValues} from '../activity/equipment.mjs?v=g2h-20261017-1';
/** Stable seeded generator; every game uses ctx.random rather than Math.random. */
export function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function gameContext(engine, config, seed, gameId, stage) {
  const unlocked=engine.state.minigameProgress[gameId]?.stage||1;
  const level = stage??unlocked;
  const bonuses = {};
  for (const [id, bonus] of Object.entries(config.cityBonuses)) {
    const levels = engine.state.buildings.filter(b => b.typeId === bonus.buildingId).reduce((sum,b) => sum + b.level, 0);
    bonuses[id] = Math.min(bonus.maximum, levels * bonus.perBuildingLevel);
  }
  const upgradeLevel=engine.state.minigameLevels[gameId]||1;
  const power=engine.data.config.minigameLevels[gameId]?.[upgradeLevel-1]?.power||1;
  return { permanentUpgrades:{...engine.state.alienUpgrades},equipment:equipmentValues(engine.state,engine.data,gameId), level, difficulty:level, upgradeLevel, power, bonuses: Object.freeze(bonuses), random: seededRandom(seed), seed };
}
