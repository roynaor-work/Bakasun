import { completeDailyRound, dailyStatus, questionsForAge, roundReward, STATIONS, syncLearningDay } from '../../../learning/state.mjs?v=island-v2-20261107-21';
import { createAdaptiveSelector } from './adaptive.mjs?v=island-v2-20261107-21';
import { loadBank } from './data.mjs?v=island-v2-20261107-21';

export const V2_STATIONS = Object.freeze({
  language: { ...STATIONS.language, domain: 'hebrew', title: 'עברית' },
  math: { ...STATIONS.math, domain: 'math', title: 'חשבון' },
  puzzles: { ...STATIONS.puzzles, domain: 'logic', title: 'היגיון' },
  general: { building: 'cityHall', icon: '🌍', domain: 'general', title: 'ידע כללי וגיאוגרפיה' },
  animals: { ...STATIONS.animals, domain: 'science', title: 'מדע וטבע' },
});

export const CITY_BUILD_REWARD = 12;
const validAge = age => Number.isInteger(age) && age >= 4 && age <= 12;
const invalid = () => ({ ok: false, reason: 'reason.invalid' });
const rewardId = typeId => 'learning-v2.building.' + typeId;
const busy = () => ({ ok: false, reason: 'reason.gameBusy' });

function buildingDomains(type) {
  const station = V2_STATIONS[type.learningStation];
  if (station) return [station.domain];
  if (type.id === 'park') return ['science'];
  if (type.category === 'sports') return ['math', 'logic'];
  if (type.category === 'services') return ['general', 'science'];
  return ['math', 'general'];
}

export function installLearningV2(engine, { changed, load = loadBank, random = Math.random }) {
  const { state } = engine;
  let bank, selector, session, permit;
  const age = () => validAge(state.learning.v2?.age) ? state.learning.v2.age : state.learning.age;
  const legacySetAge = engine.setLearningAge;
  const profile = () => {
    if (!validAge(state.learning.v2?.age)) state.learning.v2 = { age: age() };
    return state.learning.v2;
  };
  const getSelector = () => selector ??= createAdaptiveSelector(bank, { age: age(), state: profile().adaptive, random });
  const persist = (type, detail) => {
    profile().adaptive = getSelector().snapshot();
    changed(type, detail);
  };
  const needsBuildingQuestion = typeId => {
    const type = engine.registry.buildings.get(typeId);
    return age() >= 6 && Boolean(type && !type.isRoad && typeId !== 'cityHall'
      && !state.buildings.some(building => building.typeId === typeId)
      && !state.claimedRewards.includes(rewardId(typeId)));
  };
  const access = (typeId, x, z, automatic) => {
    if (automatic || !needsBuildingQuestion(typeId)) return { ok: true };
    if (permit?.typeId !== typeId || permit.x !== x || permit.z !== z) {
      return { ok: false, reason: 'learning.v2.cityQuestion' };
    }
    permit = null;
    return { ok: true, reward: { id: rewardId(typeId), money: CITY_BUILD_REWARD } };
  };
  const setAge = value => {
    if (!validAge(value)) return invalid();
    if (value === age()) return { ok: true };
    cancel();
    profile().age = value;
    selector = null;
    if (value <= 5 && value !== state.learning.age) return legacySetAge(value);
    changed('learning-v2-settings');
    return { ok: true };
  };
  engine.learningStatus = () => dailyStatus({ ...state.learning, age: age() }, engine.now());

  function select(followUp) {
    const question = getSelector().select({ domains: session.domains, followUp });
    if (!question) {
      session = null;
      return { ok: false, reason: 'learning.v2.noQuestion' };
    }
    Object.assign(session, { question, attempts: 0, usedHint: false, tried: new Set(), feedback: null });
    persist('learning-v2-question', { questionId: question.id });
    return { ok: true };
  }
  function startRound(station) {
    if (!bank || age() < 6 || !Object.hasOwn(V2_STATIONS, station)) return invalid();
    if (engine.isMinigameActive() || session) return busy();
    const record = V2_STATIONS[station];
    if (!state.buildings.some(building => building.typeId === record.building)) return invalid();
    syncLearningDay(state.learning, engine.now());
    session = { mode: 'round', station, domains: [record.domain], index: 0, total: questionsForAge(age()), firstTry: 0, retried: 0, startedAt: engine.now() };
    return select(false);
  }
  function startBuild({ typeId, x, z, plotId }) {
    if (!bank || !needsBuildingQuestion(typeId)) return invalid();
    if (engine.isMinigameActive() || session) return busy();
    const validation = engine.validatePlacement(typeId, x, z);
    if (!validation.ok) return validation;
    if (plotId !== undefined) {
      const plot = engine.readyPlots().find(row => row.id === plotId);
      if (!plot?.ok || plot.typeId !== typeId || plot.x !== x || plot.z !== z) return invalid();
    }
    session = { mode: 'city', domains: buildingDomains(engine.registry.buildings.get(typeId)), target: { typeId, x, z, plotId } };
    return select(false);
  }
  function answer(index) {
    if (!session || session.feedback?.resolved || !Number.isInteger(index) || !Object.hasOwn(session.question.options, index) || session.tried.has(index)) return invalid();
    const { question } = session;
    const correct = index === question.answer;
    session.tried.add(index);
    session.attempts++;
    if (!correct && session.attempts === 1) {
      session.usedHint = true;
      return session.feedback = { ok: true, correct: false, resolved: false };
    }
    if (correct && session.mode === 'round') {
      if (session.usedHint) session.retried++;
      else session.firstTry++;
    }
    session.feedback = { ok: true, correct, resolved: true };
    getSelector().record(question, { correct, usedHint: session.usedHint });
    persist('learning-v2-answer', { questionId: question.id });
    return session.feedback;
  }
  function advance() {
    if (!session?.feedback?.resolved) return invalid();
    if (session.mode === 'city') return session.feedback.correct ? invalid() : select(true);
    if (++session.index < session.total) return select(true);
    const { station, firstTry, retried, total } = session;
    const result = { ...roundReward(firstTry, retried, total), station, firstTry, retried, total };
    session = null;
    state.money += result.money;
    if (station === 'general') {
      const stars = profile().generalStars;
      profile().generalStars = Math.min(Number.MAX_SAFE_INTEGER, (Number.isSafeInteger(stars) && stars >= 0 ? stars : 0) + result.stars);
    } else {
      const stats = state.learning.stations[station];
      stats.stars = Math.min(Number.MAX_SAFE_INTEGER, stats.stars + result.stars);
    }
    const day = dailyStatus({ ...state.learning, age: age() }, engine.now());
    completeDailyRound(state.learning, engine.now(), day.target);
    changed('learning-complete', { result });
    return { ok: true, done: true, result };
  }
  function useHint() {
    if (!session || session.feedback?.resolved) return false;
    session.usedHint = true;
    return true;
  }
  function cancel() {
    const previous = session;
    session = null;
    if (previous && !previous.feedback?.resolved && (previous.attempts || previous.usedHint)) {
      getSelector().record(previous.question, { correct: false, usedHint: previous.usedHint, skipped: true });
      persist('learning-v2-answer', { questionId: previous.question.id });
    }
  }
  function commitBuild() {
    if (session?.mode !== 'city' || !session.feedback?.correct) return invalid();
    const { target } = session;
    if (target.plotId !== undefined) {
      const plot = engine.readyPlots().find(row => row.id === target.plotId);
      if (!plot?.ok || plot.typeId !== target.typeId || plot.x !== target.x || plot.z !== target.z) return invalid();
    }
    permit = target;
    session = null;
    try {
      return target.plotId === undefined
        ? engine.place(target.typeId, target.x, target.z)
        : engine.buildReadyPlot(target.plotId);
    } finally {
      permit = null;
    }
  }
  engine.subscribe((_, event) => {
    if (event.type === 'reset' || event.type === 'import') {
      session = null;
      selector = null;
      permit = null;
    }
  });
  return {
    age, setAge, access, needsBuildingQuestion, startRound, startBuild,
    prepare: async () => { bank ??= await load(); },
    current: () => session, answer, useHint, advance, commitBuild, cancel,
  };
}
