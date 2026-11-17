export function episodeAvailable(episode, state) {
  const condition = episode.unlock || {};
  if (condition.tutorialCompleted && !state.tutorial.completed) return false;
  if (condition.buildingId && !state.buildings.some(row => row.typeId === condition.buildingId)) return false;
  if (condition.parts && Object.values(state.parts).reduce((sum, count) => sum + count, 0) < condition.parts) return false;
  return true;
}

export function loadEpisode(data, id) {
  const episode = (data.episodes || []).find(row => row.id === id);
  if (!episode) return { ok: false, reason: 'reason.episode' };
  if (!episode.title || !episode.opponent?.nameId || !Array.isArray(episode.dialogues)) return { ok: false, reason: 'reason.invalid' };
  return { ok: true, episode: { ...episode, rewards: data.config.episodeRewards[episode.rewardId] || {} } };
}
