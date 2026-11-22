import {BADGES} from '../data/badges.mjs?v=island-v2-20261107-23';
import {complimentsByReason} from '../data/compliments.mjs?v=island-v2-20261107-23';

export const DAY_MS = 86_400_000;
export const COOLDOWN_MS = 15 * 60_000;
export const PRAISE_PER_DAY = 2;
export const LEVELS = Object.freeze([0, 8, 20, 40, 70, 110, 165, 230]);
const REPEAT_WINDOW = 8;
const RECENT_RESULTS = 6;
const ID = /^[a-z0-9][a-z0-9_.:/-]{0,127}$/i;
const TRACK = /^[a-z0-9][a-z0-9_.:/,=-]{0,4095}$/i;
const UNITS = ['points', 'targets', 'hits'];
const COUNTERS = new Set(BADGES.map(badge => badge.counter));

export function enabled(search = '') {
  return new URLSearchParams(search).get('progressBoard') !== '0';
}

export function localDay(at) {
  const date = new Date(at);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function weekStart(at) {
  return localDay(at) - new Date(at).getDay();
}

export function createState() {
  return {
    stars: 0, days: {}, activityCounts: {}, wins: {}, mastered: {}, tracks: {}, badges: {},
    stats: Object.fromEntries([...COUNTERS].map(key => [key, 0])),
    preferences: {ageBand: null, form: null},
    praise: {latest: null, recent: []},
    lastAt: 0,
  };
}

export function cleanLabel(value, fallback) {
  const text = typeof value === 'string'
    ? value.normalize('NFC').replace(/[^\p{Script=Hebrew}0-9 .,'״׳·()\-–־]/gu, ' ').replace(/\s+/g, ' ').trim()
    : '';
  return /[א-ת]/.test(text) ? text.slice(0, 90) : fallback;
}

export function normalizeEvent(event) {
  if (typeof event?.id !== 'string' || !ID.test(event.id) ||
      typeof event.activity !== 'string' || !ID.test(event.activity) ||
      !['workout', 'game', 'drill'].includes(event.kind) ||
      !['workout', 'island', 'arcade'].includes(event.source) ||
      !Number.isSafeInteger(event.at) || !Number.isFinite(localDay(event.at)) || event.at <= 0 ||
      !Number.isInteger(event.stars) || event.stars < 0 || event.stars > 3) return null;
  const {id, activity, kind, source, at, stars} = event;
  if ((source === 'workout') !== (kind === 'workout') ||
      (kind === 'drill' && source !== 'island') ||
      (source !== 'island' && stars === 0)) return null;
  const metric = event.metric;
  const validMetric = typeof metric?.key === 'string' && TRACK.test(metric.key) &&
    UNITS.includes(metric.unit) && Number.isSafeInteger(metric.value) && metric.value >= 0;
  const sameUnit = metric?.unit === {workout: 'targets', game: 'points', drill: 'hits'}[kind];
  const maximum = Number.isSafeInteger(metric?.maximum) && metric.maximum > 0 && metric.maximum >= metric.value ? metric.maximum : null;
  const islandGame = source === 'island' && kind === 'game';
  return {
    id, activity, kind, source, at, stars,
    fullWorkout: kind === 'workout' && stars === 3 && event.fullWorkout === true,
    hardFeedback: kind === 'workout' && event.hardFeedback === true,
    won: islandGame && typeof event.won === 'boolean' ? event.won : null,
    rescued: islandGame && event.rescued === true,
    helpMission: islandGame && event.won === true && event.helpMission === true,
    masteredStage: islandGame && event.won === true && stars === 3 &&
      typeof event.masteredStage === 'string' && ID.test(event.masteredStage) ? event.masteredStage : null,
    metric: validMetric && sameUnit ? {
      key: metric.key, unit: metric.unit, label: cleanLabel(metric.label, 'פעילות'),
      value: metric.value, maximum,
    } : null,
  };
}

function countBackward(days, day) {
  let length = 0;
  while (Object.hasOwn(days, day - length)) length++;
  return length;
}

function countThrough(days, day) {
  let end = day;
  while (Object.hasOwn(days, end + 1)) end++;
  return countBackward(days, end);
}

function addMetric(state, event) {
  const metric = event.metric;
  if (metric === null) return {improved: false, retry: false};
  const key = `${event.source}:${metric.key}`;
  let track = state.tracks[key];
  if (!track) {
    track = state.tracks[key] = {
      label: metric.label, unit: metric.unit, best: metric.value, maximum: metric.maximum,
      points: [], improved: false, lastOutcome: null, lastAt: 0,
    };
  }
  const chronological = event.at >= track.lastAt;
  const improved = track.points.length > 0 && chronological && metric.value > track.best;
  const retry = chronological && track.lastOutcome === false && event.won !== null &&
    localDay(event.at) - localDay(track.lastAt) <= 7;
  track.best = Math.max(track.best, metric.value);
  track.points.push({at: event.at, value: metric.value});
  track.points.sort((a, b) => a.at - b.at);
  track.points = track.points.slice(-RECENT_RESULTS);
  if (chronological) {
    track.lastAt = event.at;
    track.lastOutcome = event.won;
    track.label = metric.label;
  }
  if (improved) {
    state.stats.improvements++;
    if (event.kind === 'workout') state.stats.workoutImprovements++;
    if (event.kind === 'game') state.stats.gameImprovements++;
    if (!track.improved) state.stats.improvedTracks++;
    track.improved = true;
  }
  return {improved, retry};
}

function chooseReason(event, {stats, firstOfKind, newDay, streak, improved, retry, newBadges}) {
  if (event.helpMission && [1, 2].includes(stats.helpMissions)) return 'help-mission';
  if (event.rescued && [1, 3].includes(stats.rescueRounds)) return 'rescue';
  if (event.hardFeedback) return 'honest-feedback';
  if (improved) return {workout: 'workout-improve', game: 'game-improve', drill: 'drill-improve'}[event.kind];
  if (retry) return 'game-retry';
  if (newDay && [3, 7].includes(streak)) return 'streak';
  if (firstOfKind) return {workout: 'new-workout', game: 'new-game', drill: 'new-drill'}[event.kind];
  if (event.masteredStage && newBadges.some(badge => badge.group === 'expertise')) return 'game-mastery';
  if (event.kind === 'workout' && event.fullWorkout) return 'workout-goals';
  if (stats.activities % 3 !== 0) return null;
  return {workout: 'workout-effort', game: 'game-round', drill: null}[event.kind];
}

function earnPraise(state, reason, event, day) {
  if (!reason || day.praises >= PRAISE_PER_DAY ||
      (state.praise.latest && event.at - state.praise.latest.at < COOLDOWN_MS)) return null;
  const slots = complimentsByReason[reason]?.['6-8'];
  if (!slots?.length) return null;
  const slot = slots.findIndex((_, index) => !state.praise.recent.includes(`${reason}:${index}`));
  if (slot < 0) return null;
  const praise = {reason, slot, at: event.at};
  state.praise.latest = praise;
  state.praise.recent = [...state.praise.recent, `${reason}:${slot}`].slice(-REPEAT_WINDOW);
  day.praises++;
  return praise;
}

export function praiseCopy(praise, preferences) {
  const item = complimentsByReason[praise?.reason]?.[preferences.ageBand ?? '6-8']?.[praise.slot];
  if (!item) return null;
  const form = preferences.form;
  return {text: item[form]?.text ?? item.masculine.text, spoken: item[form]?.spoken ?? null};
}

// The storage transaction calls this once per validated event ID.
export function applyEvent(state, event) {
  const ordinal = localDay(event.at);
  const chronological = event.at >= state.lastAt;
  state.lastAt = Math.max(state.lastAt, event.at);
  const newDay = !Object.hasOwn(state.days, ordinal);
  const day = state.days[ordinal] ??= {stars: 0, praises: 0};
  const stats = state.stats;
  day.stars += event.stars;
  state.stars += event.stars;
  stats.activities++;
  if (newDay) {
    const longest = countThrough(state.days, ordinal);
    stats.activeDays++;
    stats.longestStreak = Math.max(stats.longestStreak, longest);
  }

  const activity = `${event.source}:${event.activity}`;
  const firstOfKind = !Object.hasOwn(state.activityCounts, activity);
  state.activityCounts[activity] = (state.activityCounts[activity] ?? 0) + 1;
  if (firstOfKind) {
    stats.activityKinds++;
    if (event.kind === 'workout') stats.workoutKinds++;
    if (event.kind === 'game') stats.gameKinds++;
  }
  if (event.won) {
    const wins = state.wins[activity] = (state.wins[activity] ?? 0) + 1;
    stats.mostWins = Math.max(stats.mostWins, wins);
  }
  if (event.masteredStage && !Object.hasOwn(state.mastered, event.masteredStage)) {
    state.mastered[event.masteredStage] = true;
    stats.masteredStages++;
  }
  if (event.rescued) stats.rescueRounds++;
  if (event.helpMission) stats.helpMissions++;
  if (event.hardFeedback) stats.hardFeedback++;
  const {improved, retry} = addMetric(state, event);
  if (retry) stats.retries++;

  const newBadges = BADGES.filter(badge => !Object.hasOwn(state.badges, badge.id) && stats[badge.counter] >= badge.minimum);
  for (const badge of newBadges) state.badges[badge.id] = event.at;
  const streak = countBackward(state.days, ordinal);
  const reason = chronological ? chooseReason(event, {stats, firstOfKind, newDay, streak, improved, retry, newBadges}) : null;
  return {newBadges, praise: earnPraise(state, reason, event, day), preferences: {...state.preferences}};
}

export function updatePreferences(state, values, onlyUnsetAge = false) {
  if (['6-8', '9-12'].includes(values.ageBand) && (!onlyUnsetAge || state.preferences.ageBand === null)) {
    state.preferences.ageBand = values.ageBand;
  }
  if ([null, 'masculine', 'feminine'].includes(values.form)) state.preferences.form = values.form;
  return {...state.preferences};
}

export function snapshot(state, at = Date.now()) {
  const today = localDay(at);
  const week = weekStart(at);
  let weeklyStars = 0;
  for (let day = week; day <= today; day++) weeklyStars += state.days[day]?.stars ?? 0;
  const streak = countBackward(state.days, Object.hasOwn(state.days, today) ? today : today - 1);
  const index = LEVELS.findLastIndex(threshold => state.stars >= threshold);
  const next = LEVELS[index + 1] ?? null;
  return {
    weeklyStars, streak, stars: state.stars,
    level: {number: index + 1, next, floor: LEVELS[index]},
    earned: Object.entries(state.badges).sort((a, b) => b[1] - a[1]).map(([id]) => id),
    tracks: Object.entries(state.tracks).filter(([, track]) => track.points.length >= 2)
      .sort((a, b) => b[1].lastAt - a[1].lastAt)
      .map(([id, track]) => ({id, label: track.label, unit: track.unit, maximum: track.maximum, points: track.points})),
    latest: state.praise.latest,
    preferences: {...state.preferences},
  };
}
