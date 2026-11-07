/** Island racing league (racing-v9, option B chosen by Roy). The rules, validation and merge live in racing-league-core.mjs (loaded at boot);
 * this file adds the race setup that needs the track list and re-exports everything, so tests and tools keep one import. */
import {RACING_STAGES} from './racing-tracks.mjs?v=island-v2-20261107-2';
import {SEASONS,DRIVERS,seasonStages,equipmentFor} from './racing-league-core.mjs?v=island-v2-20261107-2';
export * from './racing-league-core.mjs?v=island-v2-20261107-2';

/** The next race of the league as the session needs it. Null when the season is over. */
export function raceSetup(state) {
  const season = SEASONS[state.season - 1], stages = seasonStages(state.season), stageId = stages[state.race];
  if (!season || stageId === undefined) return null;
  const base = RACING_STAGES[stageId - 1], laps = season.laps;
  // drivers get the season's name and rating, equipment follows the player's upgrades
  return { stage: stageId, laps, season: season.id, race: state.race, track: base.name, equipment: equipmentFor(state.upgrades), drivers: DRIVERS.map(d => ({ name: d.name, rating: d.rating + season.rating })),
    stageOverride: { laps, timeLimit: Math.min(295, Math.ceil(base.timeLimit / base.laps * laps)) } };
}
