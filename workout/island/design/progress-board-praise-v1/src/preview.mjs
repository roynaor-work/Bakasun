import {BADGES} from '../data/badges.mjs';
import {arcadeEvent, islandEvent, workoutEvent} from './events.mjs';
import {enabled} from './progress.mjs';
import {createMemoryStore} from './store.mjs';
import {mountBoard} from './view.mjs';

const host = document.querySelector('#progress-preview');
if (!enabled(location.search)) {
  const message = document.createElement('p');
  message.className = 'pb-preview-disabled';
  message.textContent = 'לוח ההתקדמות כבוי.';
  host.append(message);
} else {
  // בדיוני וקבוע, כדי שאותה תמונה תתקבל גם בתחילת השבוע.
  const demoDay = (day, hour = 10) => new Date(2026, 10, day, hour).getTime();
  const demoStore = createMemoryStore(undefined, () => demoDay(18, 12));
  const game = (day, score, stars, gameId = 'soccer') => islandEvent({
    runId: `d${day}-${gameId}`, gameId, at: demoDay(day, 10),
    result: {score, stars, stage: 1, outcome: 'win'},
  });
  const workout = (day, count, stars) => workoutEvent({
    id: `d${day}-workout`, programId: 'strength',
    items: ['press', 'squat', 'plank', 'balance'].map((exId, i) => ({exId, type: 'reps', target: 8, done: i < count ? 8 : 2})),
  }, {stars, label: 'אימון כוח', at: demoDay(day, 15)});
  const arcade = (day, score) => arcadeEvent({runId: `d${day}-arcade`, gameId: 'balance', label: 'משחק שיווי משקל',
    result: {score, stars: 2, completed: true}, at: demoDay(day, 17)});

  await demoStore.preferences({ageBand: '6-8', form: 'feminine'});
  for (const event of [game(12, 1, 1), workout(13, 2, 2), arcade(14, 3), game(15, 2, 2),
    workout(15, 3, 2), game(16, 2, 2), arcade(16, 4), game(17, 4, 3), workout(17, 4, 3), game(18, 5, 3)]) {
    await demoStore.record(event);
  }
  await mountBoard(host, demoStore, {demo: {
    newBadges: [BADGES.find(badge => badge.id === 'rescue-hand')],
    praise: {reason: 'rescue', slot: 0},
  }});
}
