import {leagueEnabled,leagueSummary,stageSetup,applyStage,buyGear,stageInfo,STAGE_COUNT} from './alpine-league-core.mjs?v=island-v2-20261107-12';
import {createLeagueStore} from './alpine-league-store.mjs?v=island-v2-20261107-12';
import {alpineLeagueResult} from './alpine-league-result.mjs?v=island-v2-20261107-12';
import {stageGoals,courseFacts} from './alpine-league-stages.mjs?v=island-v2-20261107-12';

/** Ski league v23 on the island engine: `engine.alpineLeague`. The league state lives in its own key (alpine-league-store.mjs), so
 * nothing here reads or writes the island save. A league run starts through engine.startMinigame('alpineRush', {alpineLeague: n}) and
 * finishes through finish(): the result is checked (alpine-league-result.mjs) and applied to the league only. Changes are refused while
 * a game runs (busy), like the racing league. `?alpineLeague=0` (or the alpineRush / minigames flags off): enabled() is false and the
 * engine never builds a league run. */
export function installAlpineLeague(engine, {storage, config, flags = {}, busy = () => null, notify = () => {}}) {
  const base = config.minigames.alpineRush, store = createLeagueStore(storage);
  const api = {
    enabled: () => leagueEnabled() && !!flags.minigames && flags.alpineRush !== false && engine.registry.minigames.has('alpineRush'),
    get state() { return store.state; },
    status: () => store.status,
    summary: () => leagueSummary(store.state),
    /** Goals and course facts of a stage for the screens (any stage, open or not). */
    stage(n) { const info = stageInfo(n); return info ? {...info, goals: stageGoals(base, n), facts: courseFacts(base, n), best: store.state.best[n] || null, open: n <= store.state.stage} : null; },
    /** The setup of a run of stage n (the frontier when omitted), or null when the league is off or the stage is closed. */
    setup(n = store.state.stage) {
      if (!api.enabled()) return null;
      const s = stageSetup(store.state, n); if (!s) return null;
      return Object.freeze({...s, goals: stageGoals(base, s.n), total: STAGE_COUNT});
    },
    /** Checks and applies one finished league run. Null when the result does not add up (the engine then rejects it). */
    finish(raw, ctx) {
      const v = alpineLeagueResult(raw, ctx, base); if (!v) return null;
      let applied; try { applied = applyStage(store.state, v); } catch { return null; }
      const saved = store.save();
      return {...v, ...applied, saved: saved.ok, setup: ctx.alpineLeague};
    },
    buy(name) { const b = busy(); if (b) return b; const r = buyGear(store.state, name); if (r.ok) { store.save(); notify('alpine-league-gear', {name}); } return r; },
    reload: () => store.reload()
  };
  engine.alpineLeague = api;
  return api;
}
