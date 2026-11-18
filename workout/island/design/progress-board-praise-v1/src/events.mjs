const slug = /^[a-z0-9][a-z0-9_.-]{0,78}$/i;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => nonnegative(n) && n > 0;
const gameLabels = Object.freeze({
  soccer: 'כדורגל',
  tennis: 'טניס',
  streetSlam: 'כדורסל',
  islandRacing: 'מרוצים',
  alpineRush: 'מרוץ גלישה',
  fireRescue: 'כיבוי וחילוץ',
  alienDefense: 'הגנת האי',
  navalDuel: 'משחק ספינות',
  boarDefense: 'הגנת החווה',
  catchCriminal: 'מרדף בעיר',
});
const drillLabels = Object.freeze({targets: 'בעיטות למטרות', penalties: 'בעיטות עונשין', cones: 'מסלול הכדורגל'});

export function workoutEvent(session, {stars, label, at = Date.parse(session?.date)} = {}) {
  if (typeof session?.id !== 'string' || !slug.test(session.id) || !positive(stars) || stars > 3) return null;
  const items = Array.isArray(session.items) ? session.items : [];
  const program = typeof session.programId === 'string' && slug.test(session.programId) ? session.programId : 'workout';
  const validPlan = items.length > 0 && items.every(item => typeof item?.exId === 'string' &&
    slug.test(item.exId) && ['time', 'reps'].includes(item.type) && positive(item.target));
  const plan = validPlan ? items.map(item => `${item.exId}:${item.type}=${item.target}`).join(',') : '';
  const variant = session.together ? 'together' : 'solo';
  const activity = `${program}:${variant}`;
  const achieved = items.filter(item => item && !item.skipped && positive(item.target) &&
    Number.isFinite(item.done) && item.done >= item.target).length;
  return {
    id: `workout:${session.id}`, source: 'workout', kind: 'workout', activity, at, stars,
    fullWorkout: items.length > 0 && achieved === items.length,
    hardFeedback: session.feedback === 'hard',
    metric: validPlan ? {key: `${activity}:${plan}`, label, unit: 'targets', value: achieved, maximum: items.length} : null,
  };
}

export function arcadeEvent({runId, gameId, label, seconds = 0, result, at = Date.now()}) {
  if (typeof runId !== 'string' || !slug.test(runId) || typeof gameId !== 'string' || !slug.test(gameId) || result?.completed !== true ||
      !positive(result.stars) || result.stars > 3 || !nonnegative(result.score) || !nonnegative(seconds)) return null;
  return {
    id: `arcade:${runId}`, source: 'arcade', kind: 'game', activity: gameId, at, stars: result.stars,
    metric: {
      key: `${gameId}:${seconds}`,
      label: seconds ? `${label} · ${seconds} שניות` : label,
      unit: 'points', value: result.score,
    },
  };
}

export function islandEvent({runId, gameId, result, at = Date.now(), eventId, resolvedFireEvent, fireSummary, drillAttempts,
  tennisDifficulty, equipmentLevel, hoopsProfile}) {
  if (typeof runId !== 'string' || !slug.test(runId) || !Object.hasOwn(gameLabels, gameId) ||
      result?.cancelled || !['win', 'lose'].includes(result?.outcome)) return null;
  const common = {id: `island:${runId}`, source: 'island', at};
  if (result.drill) {
    const {kind, hits, attempts} = result.drill;
    if (gameId !== 'soccer' || !Object.hasOwn(drillLabels, kind) ||
        !positive(attempts) || attempts !== drillAttempts || !nonnegative(hits) || hits > attempts) return null;
    return {
      ...common, kind: 'drill', activity: `soccer-drill:${kind}`, stars: 1,
      metric: {key: `soccer-drill:${kind}:${attempts}`, label: drillLabels[kind], unit: 'hits', value: hits, maximum: attempts},
    };
  }
  if (!positive(result.stage) || !nonnegative(result.score) || !nonnegative(result.stars) || result.stars > 3) return null;

  const won = result.outcome === 'win';
  // League and bonus scores follow distinct result contracts. Keep them out of the regular stages.
  let mode = eventId ? 'emergency' : 'stage';
  let label = `${gameLabels[gameId]} · שלב ${result.stage}`;
  if (result.league) {
    const track = typeof result.league.track === 'string' && slug.test(result.league.track) ? result.league.track : 'track';
    mode = `league-${result.league.race}-${track}-${result.league.laps}`;
    label = `ליגת מרוצים · מרוץ ${result.league.race + 1}`;
  } else if (result.alpineLeague) {
    mode = 'league';
    label = `ליגת גלישה · שלב ${result.stage}`;
  } else if (result.fireBonus) {
    mode = `bonus-${result.fireBonus.mode}-${result.fireBonus.level}`;
    const title = result.fireBonus.mode === 'interior' ? 'כיבוי במבנה' : 'תרגול כיבוי';
    label = `${title} · שלב ${result.fireBonus.level}`;
  } else if (eventId) {
    label = `${label} · משימת עיר`;
  }
  const regular = mode === 'stage' || mode === 'emergency';
  const rules = result.difficulty ?? (gameId === 'tennis' ? tennisDifficulty : result.hoops?.profile ?? hoopsProfile);
  const variant = typeof rules === 'string' && slug.test(rules) ? rules : 'default';
  const upgraded = positive(equipmentLevel) ? equipmentLevel : 1;

  return {
    ...common, kind: 'game', activity: gameId, stars: result.stars, won,
    masteredStage: regular && won && result.stars === 3 ? `${gameId}:${result.stage}` : null,
    rescued: gameId === 'fireRescue' && regular && (positive(fireSummary?.rescued) || result.certificate?.rescue === true),
    helpMission: gameId === 'fireRescue' && regular && Boolean(eventId) && resolvedFireEvent === true && won,
    metric: {
      key: `${gameId}:${mode}:${result.stage}:${variant}:${upgraded}`,
      label, unit: 'points', value: result.score,
    },
  };
}
