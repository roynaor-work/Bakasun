const VERSION = 1;
const HISTORY_LIMIT = 64;
const identifier = value => typeof value === 'string' && /^[a-z][\w.-]{0,79}$/i.test(value);
const nonnegative = value => Number.isFinite(value) && value >= 0;
const natural = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createMissionState() {
  return {
    version: VERSION,
    startedAt: null,
    sequence: 0,
    active: null,
    next: null,
    recentRoutines: [],
    completedConstruction: [],
    lastEvent: null,
    lastEventAt: null,
    routinesSinceEvent: 0
  };
}

function validEntry(entry) {
  return record(entry) && identifier(entry.id)
    && (entry.target === undefined || identifier(entry.target))
    && (entry.gameId === undefined ? entry.stage === undefined
      : identifier(entry.gameId) && natural(entry.stage) && entry.stage > 0)
    && Number.isFinite(entry.amount) && entry.amount > 0
    && nonnegative(entry.progress) && entry.progress < entry.amount;
}

function validHistory(ids) {
  return Array.isArray(ids) && ids.length <= HISTORY_LIMIT && ids.every(identifier)
    && new Set(ids).size === ids.length;
}

export function validMissionState(state) {
  return record(state) && state.version === VERSION
    && (state.startedAt === null || nonnegative(state.startedAt))
    && natural(state.sequence) && natural(state.routinesSinceEvent)
    && (state.active === null || (validEntry(state.active) && state.sequence > 0
      && state.active.token === state.sequence))
    && (state.next === null || (validEntry(state.next) && state.next.token === undefined
      && state.next.progress === 0 && state.next.id !== state.active?.id))
    && validHistory(state.recentRoutines) && validHistory(state.completedConstruction)
    && !state.completedConstruction.includes(state.active?.id)
    && !state.completedConstruction.includes(state.next?.id)
    && (state.lastEvent === null ? state.lastEventAt === null
      : identifier(state.lastEvent) && nonnegative(state.lastEventAt));
}

/** Additive import keeps the local queue and remembers construction rewards from either save. */
export function mergeMissionSaves(local, incoming) {
  if (!validMissionState(incoming)) return local;
  if (!validMissionState(local)) return incoming;
  const completedConstruction = [...new Set([...local.completedConstruction, ...incoming.completedConstruction])]
    .slice(0, HISTORY_LIMIT);
  return {
    ...local,
    active: completedConstruction.includes(local.active?.id) ? null : local.active,
    next: completedConstruction.includes(local.next?.id) ? null : local.next,
    completedConstruction
  };
}

const isEvent = definition => definition?.event === true;
const isConstruction = definition => !isEvent(definition) && ['build', 'upgrade', 'connect'].includes(definition?.kind);
const ordinaryBuildings = buildings => buildings.filter(building => !['road', 'cityHall'].includes(building.typeId));
const randomFraction = random => Number.isFinite(random) && random >= 0 && random < 1 ? random : 0;

function offerable(state, definition) {
  return !isConstruction(definition)
    || (state.completedConstruction.length < HISTORY_LIMIT && !state.completedConstruction.includes(definition.id));
}

function cityEligible(definition, context) {
  return context.cityStage >= (definition.minCityStage ?? 0)
    && context.cityStage <= (definition.maxCityStage ?? Infinity)
    && (definition.minBuildings === undefined || ordinaryBuildings(context.buildings).length >= definition.minBuildings)
    && context.disconnectedCount >= (definition.minDisconnected ?? 0)
    && (definition.requiresTypes || []).every(type => context.buildings.some(building => building.typeId === type));
}

function eligibleStage(definition, context, gameId) {
  const highest = Object.hasOwn(context.games, gameId) ? context.games[gameId]?.stage : undefined;
  const minimum = definition.minGameStage ?? 1;
  if (!natural(highest) || highest < minimum) return null;
  return Math.max(minimum, highest + Math.min(0, definition.stageOffset ?? 0));
}

function availableTargets(definition, context) {
  switch (definition.kind) {
    case 'build': return context.buildTypes;
    case 'upgrade': return context.upgradeTypes;
    case 'collect': return context.resourcesEarnable;
    default: return [];
  }
}

function matchesDefinition(entry, definition) {
  return definition && entry.amount === (definition.amount ?? 1)
    && (definition.target === undefined || entry.target === definition.target)
    && (!definition.gameIds || definition.gameIds.includes(entry.gameId));
}

function reachable(entry, definition, context) {
  if (!matchesDefinition(entry, definition) || !cityEligible(definition, context)) return false;
  switch (definition.kind) {
    case 'build':
    case 'upgrade':
    case 'collect':
      return availableTargets(definition, context).includes(entry.target);
    case 'connect':
      return context.connectable && entry.target === definition.target
        && (entry.target === undefined || (context.disconnectedTypes?.includes(entry.target) ?? true));
    case 'play':
    case 'rescue':
      return eligibleStage(definition, context, entry.gameId) != null
        && entry.stage >= (definition.minGameStage ?? 1) && entry.stage <= context.games[entry.gameId].stage;
    default:
      return false;
  }
}

function selection(definition, context, random) {
  if (!cityEligible(definition, context)) return null;
  const entry = { id: definition.id, progress: 0, amount: definition.amount ?? 1 };
  switch (definition.kind) {
    case 'build':
    case 'upgrade':
    case 'collect':
      entry.target = definition.target ?? availableTargets(definition, context)[0];
      break;
    case 'connect':
      if (definition.target !== undefined) entry.target = definition.target;
      break;
    case 'play':
    case 'rescue': {
      const games = definition.gameIds.filter(id => eligibleStage(definition, context, id) != null);
      if (!games.length) return null;
      entry.gameId = games[Math.floor(random * games.length)];
      entry.stage = eligibleStage(definition, context, entry.gameId);
      break;
    }
  }
  return reachable(entry, definition, context) ? entry : null;
}

function chooseRoutine(state, catalog, context, excluded) {
  let chosen = null;
  let oldest = Infinity;
  for (const definition of catalog.missions) {
    if (isEvent(definition) || definition.id === excluded || !offerable(state, definition)) continue;
    const age = state.recentRoutines.indexOf(definition.id);
    if (age >= oldest) continue;
    const entry = selection(definition, context, randomFraction(context.random));
    if (!entry) continue;
    chosen = entry;
    oldest = age;
    if (age === -1) break;
  }
  return chosen;
}

function eventDue(state, pacing, context) {
  if (context.playSeconds < state.startedAt + pacing.firstEventAfter) return false;
  if (state.lastEventAt === null) return true;
  return context.playSeconds >= state.lastEventAt + pacing.eventCooldown
    && state.routinesSinceEvent >= pacing.minMissionsBetweenEvents;
}

function chooseEvent(state, catalog, context) {
  const choices = [];
  for (const definition of catalog.missions) {
    if (isEvent(definition) && definition.id !== state.lastEvent && selection(definition, context, 0)) {
      choices.push({ definition, weight: definition.weight ?? 1 });
    }
  }
  if (!choices.length) return null;
  // Reuse the fraction within the selected weight interval to pick its game.
  let draw = randomFraction(context.random) * choices.reduce((total, choice) => total + choice.weight, 0);
  for (const { definition, weight } of choices) {
    if (draw < weight) return selection(definition, context, draw / weight);
    draw -= weight;
  }
  return selection(choices.at(-1).definition, context, 0);
}

function actionProgress(entry, definition, signal) {
  switch (definition.kind) {
    case 'build':
    case 'upgrade':
      return signal.type === definition.kind && signal.target === entry.target ? 1 : 0;
    case 'collect':
      return signal.type === 'collect' && signal.target === entry.target && nonnegative(signal.amount) ? signal.amount : 0;
    case 'connect': {
      if (signal.type !== 'connect') return 0;
      let count = signal.amount ?? 1;
      if (entry.target !== undefined && signal.connected) {
        count = signal.connected[entry.target];
      } else if (entry.target !== undefined && signal.target !== entry.target) {
        return 0;
      }
      return natural(count) ? count : 0;
    }
    case 'play':
    case 'rescue':
      return signal.type === 'game' && signal.token === entry.token && signal.gameId === entry.gameId
        && signal.stage === entry.stage
        && (signal.outcome === 'win' || (definition.kind === 'play' && signal.outcome === 'lose')) ? 1 : 0;
    default:
      return 0;
  }
}

function activate(state, entry, definition, context) {
  if (!entry || state.sequence === Number.MAX_SAFE_INTEGER) return state;
  const sequence = state.sequence + 1;
  const active = { ...entry, token: sequence };
  if (isEvent(definition)) {
    return { ...state, sequence, active, next: null, lastEvent: entry.id,
      lastEventAt: context.playSeconds, routinesSinceEvent: 0 };
  }
  const recentRoutines = [...state.recentRoutines.filter(id => id !== entry.id), entry.id].slice(-HISTORY_LIMIT);
  return { ...state, sequence, active, next: null, recentRoutines };
}

/** Apply one real island action and reconcile two slots. The action can only
 * count for the active mission from before the call. Time and randomness are
 * supplied by the caller. Keep the returned state and reward in one save. */
export function advanceMissions(state, catalog, context, signal = { type: 'sync' }) {
  if (!context.ready || !nonnegative(context.playSeconds)) return { state, reward: null };
  const definitionFor = entry => entry && catalog.missions.find(row => row.id === entry.id);
  let current = state.startedAt === null ? { ...state, startedAt: context.playSeconds } : state;
  let reward = null;

  if (current.active) {
    const entry = current.active;
    const definition = definitionFor(entry);
    const allowed = offerable(current, definition);
    const increment = allowed && matchesDefinition(entry, definition) ? actionProgress(entry, definition, signal) : 0;
    const progress = entry.progress + increment;
    const finished = progress >= entry.amount;
    const skipped = signal.type === 'skip' && (signal.token === undefined || signal.token === entry.token);
    if (finished || skipped || !allowed || !reachable(entry, definition, context)) {
      current = { ...current, active: null };
      if (isEvent(definition)) {
        // A long game or an event left open still leaves a quiet interval after it ends.
        current.lastEventAt = context.playSeconds;
        current.lastEvent = entry.id;
      }
      if (finished) {
        reward = { ...definition.reward };
        if (!isEvent(definition)) {
          current.routinesSinceEvent = Math.min(Number.MAX_SAFE_INTEGER, current.routinesSinceEvent + 1);
        }
        // The island's Undo refunds construction costs and keeps earned awards.
        if (isConstruction(definition)) current.completedConstruction = [...current.completedConstruction, entry.id];
      }
    } else if (increment > 0) {
      current = { ...current, active: { ...entry, progress } };
    }
  }

  const due = eventDue(current, catalog.pacing, context);
  const nextDefinition = definitionFor(current.next);
  const validNext = current.next && offerable(current, nextDefinition) && reachable(current.next, nextDefinition, context)
    && (!isEvent(nextDefinition) || (due && current.next.id !== current.lastEvent));
  let next = validNext ? current.next : null;
  if (!current.active) {
    next = next || (due ? chooseEvent(current, catalog, context) : null) || chooseRoutine(current, catalog, context);
    current = activate(current, next, definitionFor(next), context);
    next = null;
  }

  if (isEvent(definitionFor(current.active))) {
    if (isEvent(definitionFor(next))) next = null;
  } else if (due && !isEvent(definitionFor(next))) {
    next = chooseEvent(current, catalog, context) || next;
  }
  if (!next && current.active) next = chooseRoutine(current, catalog, context, current.active.id);
  if (next !== current.next) current = { ...current, next };
  return { state: current, reward };
}
