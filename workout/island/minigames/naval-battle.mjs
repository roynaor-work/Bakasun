/** Resolve the browser switch when a game session starts. */
export function navalBattleEnabled(search = globalThis.location?.search) {
  return new URLSearchParams(search).get('navalBattle') !== '0';
}

/** Use the resolved fleet, priority objectives and reward settings from the campaign. */
export function navalBattleCampaign(campaign, balance, stage) {
  const level = Math.max(1, Math.min(balance.levels.length, Number.isInteger(stage) ? stage : 1));
  const tuning = balance.battleV1;
  const stageOverrides = tuning?.profiles?.find(row => level <= row.throughStage);
  if (!stageOverrides) return campaign;
  const profile = {...tuning.defaults, ...stageOverrides};

  const {settings, mission} = campaign;
  const moving = campaign.fleet.filter(row => row.behavior !== 'base').length;
  const extra = mission.id === 'fleet' ? profile.extraFleetShips : Math.max(0, profile.openingShips - moving);
  const escorts = Array.from({length: extra}, () => ({kind: profile.escortKind, behavior: 'patrol', boss: false}));
  const boundary = campaign.fleet.findIndex(row => row.boss || row.behavior === 'base');
  const fleet = [...campaign.fleet];
  fleet.splice(boundary < 0 ? fleet.length : boundary, 0, ...escorts);
  const concurrent = Math.min(moving + extra, Math.max(settings.concurrent, profile.openingShips));
  const tactics = settings.enemyTactics || {telegraphSeconds: 1.8, fireSeconds: 10, speedScale: 1};
  return {
    ...campaign,
    fleet,
    battle: profile,
    settings: {
      ...settings,
      waves: fleet.length,
      concurrent,
      enemyLives: settings.enemyLives * profile.enemyHpScale,
      seconds: Math.round(settings.seconds * profile.timerScale),
      enemyTactics: {...tactics, fireSeconds: tactics.fireSeconds * profile.fireIntervalScale},
    },
  };
}

export function navalBattlePriority(mission, row) {
  return (mission.id === 'flagship' && row.boss)
    || (mission.id === 'intercept' && row.behavior === 'flank')
    || (mission.id === 'subhunt' && row.behavior === 'dive');
}
