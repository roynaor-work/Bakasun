import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const games = [{
  id: 'catchCriminal', name: 'פושע', stages: Array.from({length: 10}, (_, i) => i + 1),
  sources: ['workout/island/extensions/catch-criminal.mjs', 'workout/island/minigames/catch-session6.mjs',
    'workout/island/minigames/catch-chase6.mjs', 'workout/island/minigames/catch-engine.mjs',
    'workout/island/minigames/catch-assist.mjs', 'workout/island/minigames/catch-weapons.mjs',
    'workout/island/tools/catch-sim7.mjs', 'workout/island/minigames/result.mjs'],
  notes: [
    'כל עשרת השלבים בברירת המחדל: מרדף chase6 עם כלי v7 ותיקון v8, ואחריו רשת קשת עם levels7, סיוע ו־close time. אין שימוש במסלול headless הישן שמדלג על המרדף.',
    'הבוטים משתמשים בבקרי הילד הקיימים kidDrive/kidThrow. הפרופיל משנה זמן תגובה, שגיאת כיוון והחמצת מכשול. שגיאת כיוון היא Gaussian עם סטיית תקן aimError×80 מעלות, וטווח ±20% לכל ניסיון.',
    'הבוט קורא את סמן ההובלה והכוונת שהמשחק מציג. אין חיפוש אחר תוצאת trajectory מושלמת, אין שינוי מצבי משחק ואין כפיית פגיעות.',
    'ציוד התחלתי, ללא בונוס מבני משטרה/כלא. ניצחון וכוכבים נקבעים מהתוצאה המקורית לאחר כל המרדף והזריקות; המרדף לבדו אינו ניצחון.',
    'זמן כולל שעון מרדף, ספירה לאחור, מעבר של שתי שניות ושעון זריקות. השהיות טעינה והאטת אנימציה קולנועית אינן כלולות. אין מונה נפילות; התנגשויות מדווחות בנפרד.'
  ]
}];
export const recommendations = [];
const cache = new Map();
async function modules(sourceRoot) {
  if (!cache.has(sourceRoot)) cache.set(sourceRoot, Promise.all([
    'workout/island/tools/catch-sim7.mjs', 'workout/island/minigames/catch-engine.mjs',
    'workout/island/minigames/catch-chase6.mjs', 'workout/island/minigames/catch-assist.mjs',
    'workout/island/minigames/result.mjs'
  ].map(p => import(pathToFileURL(join(sourceRoot, p)).href))));
  return cache.get(sourceRoot);
}

export async function runTrial({sourceRoot, config, stage, profile, seed}) {
  const [{kidDrive, kidThrow}, {createCatchEngine, seededRandom}, {createChaseEngine6}, {levels7}, {gameResult}] = await modules(sourceRoot);
  const balance = config.minigames.catchCriminal;
  const random = seededRandom((seed ^ 0x43ca7c17 ^ stage * 193) >>> 0);
  const sigma = profile.aimError * 80;
  const kid = {
    sigma: [sigma * .8, sigma * 1.2],
    rt: [profile.reactionSeconds * .9, profile.reactionSeconds * 1.1],
    think: [Math.max(.2, profile.reactionSeconds), Math.max(.4, profile.reactionSeconds * 2)],
    hazardMiss: profile.lapseProbability, slideComp: .85, tryOther: .18,
    brakeBehind: profile.id !== 'impatient', tapBlind: profile.id === 'impatient' ? 1.5 : 0
  };
  const chase = createChaseEngine6({balance, stage, seed, equipment: {},
    v7: {weapons: true, assist: true, elements: true}, v8: {weaponsFix: true}});
  const chased = kidDrive(chase, random, kid);
  if (chase.state.phase !== 'end') {
    return {outcome: 'timeout', seconds: chased.seconds + chase.C.countdownSeconds, stars: 0,
      falls: null, score: 0, reason: 'chase-safety-timeout', objectives: [],
      diagnostics: {phase: chase.state.phase, chase: chased, catch: null}};
  }
  const engine = createCatchEngine({balance: {...balance, levels: levels7(balance)}, stage, seed,
    equipment: {}, city: {}, v2: true, mods: chased.mods, feel: true, arch: true});
  const throwing = kidThrow(engine, random, stage, {assist: true, kid});
  const raw = engine.summary(), settled = engine.state.phase === 'done'
    ? gameResult(raw, {config: config.minigames, level: stage}, balance) : null;
  if (engine.state.phase === 'done' && !settled) throw new Error('catchCriminal: native result rejected');
  const seconds = chased.seconds + chase.C.countdownSeconds + 2 + engine.clock;
  const requiredHits = engine.hitsNeeded * raw.crew;
  return {
    outcome: settled?.outcome || 'timeout', seconds: +seconds.toFixed(4), stars: settled?.stars || 0,
    falls: null, score: settled?.score || 0,
    reason: settled ? raw.outcome === 'win' ? 'all-criminals-caught' : 'throws-exhausted' : 'throw-safety-timeout',
    objectives: [
      {id: 'capture', current: raw.catches, target: requiredHits, complete: raw.catches >= requiredHits, optional: false},
      {id: 'stop-car', current: Number(chased.caught), target: 1, complete: chased.caught, optional: true}
    ],
    diagnostics: {completedWithinPatience: seconds <= profile.patienceSeconds,
      withinPatience: seconds <= profile.patienceSeconds, nativePhase: engine.state.phase,
      version: 'chase6+weapons7+fix8+assist7', equipment: {}, cityBonuses: {}, kid,
      chase: {seconds: chased.seconds, how: chased.how, caught: chased.caught, closeness: chased.closeness,
        collisionCount: chased.hits, damage: chased.damage, scrapeSeconds: chased.scrape,
        shots: chased.shots, hits: chased.toolHits, byTool: chased.kid.byTool},
      throwing: {...throwing, seconds: engine.clock, throwsAvailable: engine.throwsTotal, requiredHits},
      rawResult: raw, performance: raw.performance}
  };
}
