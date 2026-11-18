import { INELIGIBLE_REASONS } from './scenario.mjs';

export function blockerCategory(reason = '') {
  const key = reason.toLowerCase();
  if (key.includes('money') || key.includes('afford') || key.includes('budget')) return 'money';
  if (key.includes('material') || key.includes('resource') || key.includes('food') || key.includes('energy')) return 'resources';
  if (key.includes('population') || key.includes('residents')) return 'population';
  if (key.includes('queue') || key.includes('construction') || key.includes('pending') || key.includes('project')) return 'construction';
  if (key.includes('district') || key.includes('stagelevel') || key.includes('tier') || key.includes('day')) return 'day-or-district';
  if (key.includes('require') || key.includes('prereq') || key.includes('order')) return 'prerequisite';
  if (key.includes('plot') || key.includes('road') || key.includes('shore') || key.includes('occup')) return 'placement';
  if (key.includes('cap') || key.includes('limit') || key.includes('maxlevel')) return 'limit';
  return 'other';
}

function blockers(decisions, onlyNoChoice) {
  const counts = new Map();
  for (const decision of decisions) {
    if (onlyNoChoice && decision.action) continue;
    const first = decision.failures.find(failure => !INELIGIBLE_REASONS.has(failure.reason));
    if (!first) continue;
    const label = `${first.reason}:${first.id}`;
    const sample = counts.get(label) ?? {
      target: first.id,
      reason: first.reason,
      category: blockerCategory(first.reason),
      occurrences: 0,
      firstDay: decision.calendarDay,
      firstActiveSeconds: decision.activeSeconds,
    };
    sample.occurrences++;
    sample.lastDay = decision.calendarDay;
    sample.lastActiveSeconds = decision.activeSeconds;
    counts.set(label, sample);
  }
  return [...counts.values()].sort((first, second) => second.occurrences - first.occurrences);
}

function longestNoProgressRun(days) {
  let longest = { sessionDays: 0 };
  let current = { sessionDays: 0 };
  let previousBuilds = 0;
  for (const day of days) {
    if (!day.sessionSeconds) continue;
    const progress = day.choices || day.stages || day.newUnlocks.length || day.upgrades || day.builds > previousBuilds;
    previousBuilds = day.builds;
    if (progress) {
      current = { sessionDays: 0 };
      continue;
    }
    current = { ...current, from: current.from ?? day.calendarDay, through: day.calendarDay, sessionDays: current.sessionDays + 1 };
    if (current.sessionDays > longest.sessionDays) longest = current;
  }
  return longest;
}

export function summarize(scenario) {
  const { profile, name, mode, days, decisions, events, assetTypesCompleted, incompleteGoals, goals, scriptCompleted, unbuiltAvailableTypes } = scenario;
  const last = days.at(-1);
  const first = kind => events.find(event => event.kind === kind) ?? null;
  const accepted = events.filter(event => event.kind === 'build-accepted');
  const idle = decisions.filter(row => !row.action && row.failures.some(failure => !INELIGIBLE_REASONS.has(failure.reason)));
  const missingTypes = [...new Set(decisions.flatMap(row => row.failures.filter(failure => failure.reason === 'sim.catalog').map(failure => failure.id)))];
  const missingUpgradeLevels = [...new Set(decisions.flatMap(row => row.failures.filter(failure => failure.reason === 'sim.levelUnavailable').map(failure => failure.id)))];
  return {
    profile, name, mode, days,
    totals: {
      calendarDays: days.length,
      sessionDays: days.filter(day => day.sessionSeconds).length,
      activeSeconds: last.activeSeconds,
      choices: decisions.filter(row => row.action).length,
      decisions: decisions.length,
      profileChoiceBlockedDecisions: idle.length,
      builds: last.builds,
      assetTypesBuilt: last.assetTypesBuilt,
      upgrades: days.reduce((sum, day) => sum + day.upgrades, 0),
      unlocks: last.unlocks,
      goals,
      unfinishedGoals: incompleteGoals.length,
    },
    firstBuildAccepted: first('build-accepted'),
    firstBuildCompleted: first('build-completed'),
    firstPackOpening: events.find(event => event.kind === 'build-completed' && assetTypesCompleted.includes(event.id)) ?? null,
    firstNewUnlock: first('unlocked'),
    firstUpgradeCompleted: first('upgrade-completed'),
    firstSixBuildings: accepted.slice(0, 6).map(event => event.id),
    longestNoProgressRun: longestNoProgressRun(days),
    scriptCompleted: scriptCompleted ?? null,
    assetTypesCompleted,
    unbuiltAvailableTypes,
    incompleteGoals,
    missingTypes,
    missingUpgradeLevels,
    preferredBlockers: blockers(decisions, false),
    noProfileChoiceBlockers: blockers(decisions, true),
  };
}

const CURVE_FIELDS = [
  'profile', 'mode', 'calendarDay', 'sessionSeconds', 'activeSeconds', 'cityDay', 'worldStage',
  'population', 'capacity', 'satisfaction', 'happiness', 'money', 'moneyPerMinute', 'materials', 'food', 'energy', 'builds', 'assetTypesBuilt',
  'upgrades', 'unlocks', 'newUnlocks', 'stages', 'choices', 'noProfileChoice',
];

export function curveCsv(scenarios) {
  const rows = scenarios.flatMap(({ profile, mode, days }) => days.map(day => ({ profile, mode, ...day })));
  return [
    CURVE_FIELDS.join(','),
    ...rows.map(row => CURVE_FIELDS.map(field => {
      const value = row[field];
      return Array.isArray(value) ? value.join('|') : value ?? '';
    }).join(',')),
  ].join('\n') + '\n';
}
