/** Placeholder contract: future parent limits can replace these functions without changing a minigame. */
export function canPlay() { return true; }
export function spendPlayTime() { return true; }

/** UI/voice adapters receive a text identifier; speech is intentionally not implemented. */
export function createNarrationHook() {
  let listener = null;
  return { subscribe(fn) { listener = fn; return () => { listener = null; }; }, announce(id, values = {}) { listener?.({ id, values }); } };
}
