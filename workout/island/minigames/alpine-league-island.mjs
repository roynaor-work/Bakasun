import {leagueEnabled,leagueSummary,stageSetup,applyStage,buyGear,stageInfo,engineStageOf,STAGE_COUNT} from './alpine-league-core.mjs?v=island-v2-20261107-23';
import {createLeagueStore} from './alpine-league-store.mjs?v=island-v2-20261107-23';
import {alpineLeagueResult} from './alpine-league-result.mjs?v=island-v2-20261107-23';
import {stageGoals,courseFacts} from './alpine-league-stages.mjs?v=island-v2-20261107-23';
import {balanceForPage} from './alpine-v241.mjs?v=island-v2-20261107-23';
import {generateCourse} from './alpine-track.mjs?v=island-v2-20261107-23';
import {loadRecords,recordRun,alpineRunBalance,alpineHistoryStorage} from './alpine-records.mjs?v=island-v2-20261107-23';

/** Ski league v23 on the island engine: `engine.alpineLeague`. The league state lives in its own key (alpine-league-store.mjs), so
 * nothing here reads or writes the island save. A league run starts through engine.startMinigame('alpineRush', {alpineLeague: n}) and
 * finishes through finish(): the result is checked (alpine-league-result.mjs) and applied to the league only. Changes are refused while
 * a game runs (busy), like the racing league. `?alpineLeague=0` (or the alpineRush / minigames flags off): enabled() is false and the
 * engine never builds a league run. */
export function installAlpineLeague(engine, {storage, config, flags = {}, busy = () => null, notify = () => {}}) {
  // v24.1: ?alpineV241=0 gives the league its v24 courses, rivals and goals (the session strips the same way).
  const base = balanceForPage(config.minigames.alpineRush), store = createLeagueStore(storage);
  const search = globalThis.location?.search || '', scopedTimes = !!base.physics.v241 && new URLSearchParams(search).get('alpineHistoryFix') !== '0', spaces = new Map();
  function timingSpace(n) {
    if (!spaces.has(n)) {
      const balance = alpineRunBalance(base, n, search), level = balance.levels[engineStageOf(n) - 1], track = {...balance.tracks[level.trackId], id: level.trackId};
      spaces.set(n, {balance, trackId: level.trackId, storage: alpineHistoryStorage(storage, balance, generateCourse(track, balance.physics), search)});
    }
    return spaces.get(n);
  }
  function stageBest(n) {
    const previous = store.state.best[n] || null;
    if (!scopedTimes) return previous;
    const space = timingSpace(n), current = loadRecords(space.storage, space.balance.records).data.best[space.trackId];
    return previous ? {...previous, ms: current?.ms || 0} : current ? {stars: 0, ms: current.ms, place: current.rank} : null;
  }
  const api = {
    enabled: () => leagueEnabled() && !!flags.minigames && flags.alpineRush !== false && engine.registry.minigames.has('alpineRush'),
    get state() { return store.state; },
    status: () => store.status,
    summary: () => leagueSummary(store.state),
    /** Goals and course facts of a stage for the screens (any stage, open or not). */
    stage(n) { const info = stageInfo(n); return info ? {...info, goals: stageGoals(base, n), facts: courseFacts(base, n), best: stageBest(n), open: n <= store.state.stage} : null; },
    /** The setup of a run of stage n (the frontier when omitted), or null when the league is off or the stage is closed. */
    setup(n = store.state.stage) {
      if (!api.enabled()) return null;
      const s = stageSetup(store.state, n); if (!s) return null;
      return Object.freeze({...s, goals: stageGoals(base, s.n), total: STAGE_COUNT});
    },
    /** Checks and applies one finished league run. Null when the result does not add up (the engine then rejects it). */
    finish(raw, ctx) {
      const v = alpineLeagueResult(raw, ctx, base); if (!v) return null;
      const previousMs = store.state.best[v.n]?.ms || 0;
      let applied; try { applied = applyStage(store.state, v); } catch { return null; }
      if (scopedTimes) {
        // Stars, gear and progression keep their history. v24's timing field stays
        // available to rollback; current times live beside the session's ghost.
        store.state.best[v.n].ms = previousMs;
        const space = timingSpace(v.n);
        recordRun(space.storage, space.balance.records, loadRecords(space.storage, space.balance.records), raw.alpine);
      }
      const saved = store.save();
      return {...v, ...applied, saved: saved.ok, setup: ctx.alpineLeague};
    },
    buy(name) { const b = busy(); if (b) return b; const r = buyGear(store.state, name); if (r.ok) { store.save(); notify('alpine-league-gear', {name}); } return r; },
    reload: () => store.reload()
  };
  engine.alpineLeague = api;
  return api;
}
