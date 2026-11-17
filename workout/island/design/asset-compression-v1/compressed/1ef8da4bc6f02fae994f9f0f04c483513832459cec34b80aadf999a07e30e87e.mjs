/** Contract demonstration only: this launches no gameplay and grants no result automatically. */
export function install(registry, data) {
  registry.registerMinigame({ ...data.extensions.minigame, start(ctx) { return { status: 'ready', canPlay: ctx.canPlay() }; }, onResult(result, ctx) { return { accepted: Boolean(result?.completed), playerId: ctx.player?.id || null }; } });
}
