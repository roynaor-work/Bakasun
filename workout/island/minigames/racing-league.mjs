/** Island racing league (racing-v9, option B chosen by Roy). The rules, validation and merge live in racing-league-core.mjs (loaded at boot);
 * this file adds the race setup that needs the track list and re-exports everything, so tests and tools keep one import. */
import {RACING_STAGES,createTrack} from './racing-tracks.mjs?v=island-v2-20261107-8';
import {SEASONS,DRIVERS,LONG,CIRCUITS,seasonCalendar,equipmentFor} from './racing-league-core.mjs?v=island-v2-20261107-8';
export * from './racing-league-core.mjs?v=island-v2-20261107-8';

/** racing-deep-m6: the six circuit lengths in metres (tier 0 stages; every tier reuses the same six circuits), measured once from the real track. */
export const CIRCUIT_LENGTHS = Object.freeze(Array.from({ length: CIRCUITS }, (_, i) => createTrack(i + 1).length));
/** The season's calendar with laps from the real circuit lengths (the core alone only knows the fallback). */
export function calendar(seasonId, { shortRaces = false } = {}) { return seasonCalendar(seasonId, { shortRaces, lengths: CIRCUIT_LENGTHS }); }

/** racing-deep-m6: a driver's form for one race, deterministic from season, race and grid slot (so the app and the simulation race the same field): ±0.012. */
export function formOf(season,race,index){let h=(season*7919+race*104729+index*1299709)>>>0;h^=h<<13;h>>>=0;h^=h>>>17;h^=h<<5;h>>>=0;return ((h%2001)/1000-1)*0.012;}
export const TIME_LABEL=Object.freeze({day:'יום',golden:'שעת זהב',sunset:'שקיעה',night:'לילה'});
export const VARIANT_LABEL=Object.freeze({normal:'',long:'מרוץ ארוך',short:'מרוץ קצר'});
/** Display facts of a calendar entry: circuit name, time of day, direction and the long/short tag. */
export function describeRace(entry){
  const base=RACING_STAGES[entry.stage-1];if(!base)return null;
  return {stage:entry.stage,race:entry.race,track:base.name,laps:entry.laps,timeOfDay:base.timeOfDay,time:TIME_LABEL[base.timeOfDay]||'',reverse:Boolean(base.reverse),variant:entry.variant,variantLabel:VARIANT_LABEL[entry.variant]||'',
    tags:[TIME_LABEL[base.timeOfDay]||'',base.reverse?'כיוון הפוך':'',VARIANT_LABEL[entry.variant]||''].filter(Boolean)};
}

/** The next race of the league as the session needs it. Null when the season is over.
 * racing-deep-m6 long league: all eleven computer drivers race and score (stageOverride.opponents = 11, extraRivals 0: racing-physics marks
 * scoring by stage.opponents and maps config.drivers by car index, so no physics change is needed). */
export function raceSetup(state) {
  const season = SEASONS[state.season - 1], entry = calendar(state.season, { shortRaces: Boolean(state.shortRaces) })[state.race];
  if (!season || !entry) return null;
  const base = RACING_STAGES[entry.stage - 1], laps = entry.laps, info = describeRace(entry);
  // drivers get the season's name and rating (plus a small race-by-race form in the long league), equipment follows the player's upgrades
  const drivers = DRIVERS.map((d, i) => ({ name: d.name, rating: d.rating + season.rating + (LONG ? formOf(state.season, state.race, i + 1) : 0) }));
  return { stage: entry.stage, laps, season: season.id, race: state.race, track: base.name, equipment: equipmentFor(state.upgrades), drivers,
    stageOverride: { laps, timeLimit: Math.min(295, Math.ceil(base.timeLimit / base.laps * laps)), ...(LONG ? { opponents: DRIVERS.length, aiCorner: +(base.aiCorner * (season.corner || 1)).toFixed(3) } : {}) },
    ...(LONG ? { extraRivals: 0, field: DRIVERS.length + 1 } : {}), timeOfDay: base.timeOfDay, reverse: Boolean(base.reverse), variant: entry.variant, distance: entry.distance, tags: info?.tags || [], total: seasonCalendar(state.season).length };
}
