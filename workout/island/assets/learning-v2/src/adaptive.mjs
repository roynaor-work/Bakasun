import {DOMAINS, MIN_AGE, MAX_AGE} from './data.mjs?v=island-v2-20261107-26';

export const RECENT_LIMIT = 24;
const DIFFICULTIES = 3;
const STREAK_LIMIT = 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const tierFor = (age, difficulty) => (age - MIN_AGE) * DIFFICULTIES + difficulty - 1;
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/**
 * Keeps each subject's level independent and uses an age band of one year
 * on either side of the recommended age. State is JSON serializable.
 */
export function createAdaptiveSelector(bank, {age, state, random = Math.random} = {}) {
  if (!integerIn(age, MIN_AGE, MAX_AGE)) throw new RangeError('learning age');
  const min = tierFor(Math.max(MIN_AGE, age - 1), 1);
  const max = tierFor(Math.min(MAX_AGE, age + 1), DIFFICULTIES);
  const start = tierFor(age, 2);
  const byId = new Map(bank.map(question => [question.id, question]));
  const eligible = bank.filter(question => Math.abs(question.age - age) <= 1);
  const recent = Array.isArray(state?.recent)
    ? [...new Set(state.recent.filter(id => byId.has(id)).reverse())].slice(0, RECENT_LIMIT).reverse()
    : [];
  const subjects = Object.fromEntries(DOMAINS.map(domain => {
    const saved = state?.age === age ? state.subjects?.[domain] : null;
    const followUp = byId.get(saved?.followUp);
    return [domain, {
      tier: integerIn(saved?.tier, min, max) ? saved.tier : start,
      streak: integerIn(saved?.streak, 1 - STREAK_LIMIT, STREAK_LIMIT - 1) ? saved.streak : 0,
      followUp: followUp?.domain === domain ? followUp.id : null,
    }];
  }));
  const pending = new Set();

  return {
    select({domains = DOMAINS, followUp = true} = {}) {
      const available = eligible.filter(question => domains.includes(question.domain) && !recent.includes(question.id));
      if (!available.length) return null;

      const candidates = [...new Set(available.map(question => question.domain))];
      const lastSeen = domain => recent.findLastIndex(id => byId.get(id)?.domain === domain);
      const leastRecent = Math.min(...candidates.map(lastSeen));
      const tiedDomains = candidates.filter(domain => lastSeen(domain) === leastRecent);
      const domain = tiedDomains[Math.floor(random() * tiedDomains.length)];
      const profile = subjects[domain];
      const pool = available.filter(question => question.domain === domain);
      const distance = question => Math.abs(tierFor(question.age, question.difficulty) - profile.tier);
      const closest = Math.min(...pool.map(distance));
      const atLevel = pool.filter(question => distance(question) === closest);
      const followUpTopic = followUp ? byId.get(profile.followUp)?.topic : undefined;
      const related = followUpTopic ? atLevel.filter(question => question.topic === followUpTopic) : [];
      const exact = followUp ? atLevel.find(question => question.id === profile.followUp) : undefined;
      const choices = related.length ? related : atLevel;
      const question = exact ?? choices[Math.floor(random() * choices.length)];

      if (followUp || question.id === profile.followUp) profile.followUp = null;
      recent.push(question.id);
      if (recent.length > RECENT_LIMIT) pending.delete(recent.shift());
      pending.add(question.id);
      return question;
    },

    record(question, {correct, usedHint = false, skipped = false} = {}) {
      const selected = byId.get(question?.id);
      if (!selected || (!skipped && typeof correct !== 'boolean') || !pending.delete(selected.id)) return false;

      const profile = subjects[selected.domain];
      const unaided = correct && !usedHint && !skipped;
      profile.followUp = selected.followUps[unaided ? 'correct' : 'incorrect'];

      if (skipped) {
        profile.tier = Math.max(min, profile.tier - 1);
        profile.streak = 0;
        return true;
      }

      profile.streak = unaided ? Math.max(0, profile.streak) + 1 : Math.min(0, profile.streak) - 1;
      if (Math.abs(profile.streak) === STREAK_LIMIT) {
        profile.tier = clamp(profile.tier + Math.sign(profile.streak), min, max);
        profile.streak = 0;
      }
      return true;
    },

    snapshot() {
      return {age, recent: [...recent], subjects: structuredClone(subjects)};
    },
  };
}
