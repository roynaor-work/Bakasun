import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const source = (path, line, detail) => ({path, line, detail});
const round = n => Math.round(n * 10000) / 10000;
const finite = n => typeof n === 'number' && Number.isFinite(n);

/** Independent structural checks. All imported model code comes from the
 * caller's isolated sourceRoot. Static boundaries are hypotheses, not win rates. */
export async function inspectAudit({sourceRoot, config}) {
  const load = p => import(pathToFileURL(join(sourceRoot, p)).href);
  const [soccer, racing, naval, boars, racingLeague, alpineCore, alpineStages, fire24, catchAssist, soccerFull] = await Promise.all([
    load('workout/island/minigames/soccer-campaign.mjs'),
    load('workout/island/minigames/racing-tracks.mjs'),
    load('workout/island/minigames/naval-campaign.mjs'),
    load('workout/island/minigames/boar-island/core.mjs'),
    load('workout/island/minigames/racing-league.mjs'),
    load('workout/island/minigames/alpine-league-core.mjs'),
    load('workout/island/minigames/alpine-league-stages.mjs'),
    load('workout/island/minigames/fire-v24.mjs'),
    load('workout/island/minigames/catch-assist.mjs'),
    load('workout/island/minigames/soccer-full.mjs')
  ]);
  const c = config.minigames;
  const levelArrays = Object.entries(c).filter(([, v]) => Array.isArray(v?.levels))
    .map(([id, v]) => ({id, configuredStages: v.levels.length}));
  const aliases = c.soccer.levels.map((_, i) => {
    const resolved = soccer.leagueMatch(c.soccer, i + 1);
    return {requestedStage: i + 1, selectable: i < resolved.total, resolvedStage: resolved.stage,
      tuning: resolved.tuning, difficulty: resolved.difficulty, keeper: resolved.keeper};
  });
  const staticBoundaries = [];
  const excluded = /^(difficulty|stage|winMoney|winParts|points|scoreLimit|rewardScoreLimit)$/;
  for (const [id, game] of Object.entries(c).filter(([, v]) => Array.isArray(v?.levels))) {
    for (let i = 1; i < game.levels.length; i++) {
      const previous = game.levels[i - 1], current = game.levels[i];
      for (const [key, value] of Object.entries(current)) {
        if (excluded.test(key) || !finite(value) || !finite(previous[key])) continue;
        const before = previous[key];
        const ratio = before === 0 ? null : value / before;
        if (value !== before && (before === 0 || value === 0 || ratio >= 1.3 || ratio <= .7)) {
          staticBoundaries.push({game: id, fromStage: i, toStage: i + 1,
            parameter: `minigames.${id}.levels[${i}].${key}`, before, after: value,
            ratio: ratio === null ? null : round(ratio)});
        }
      }
    }
  }
  const navalBudgets = c.navalDuel.levels.map((settings, i) => {
    const stage = i + 1, content = naval.navalCampaignStage(c.navalDuel, stage, 0);
    return {stage, mission: content.mission.id,
      ...naval.navalAmmoBudget(c.navalDuel, settings, content.fleet),
      interpretation: 'Conservative direct-hit damage capacity only; excludes misses, resupply, splash, mines, priority-target completion and paid upgrades.'};
  });
  const waveRows = Array.from({length: 30}, (_, i) => {
    const stage = i + 1, plan = boars.wavePlan(stage), counts = {};
    let totalHp = 0, armorAdjustedHp = 0;
    for (const row of plan) {
      counts[row.kind] = (counts[row.kind] || 0) + 1;
      const enemy = boars.enemyStats(row.kind, stage);
      totalHp += enemy.hp; armorAdjustedHp += enemy.hp / (1 - enemy.armor);
    }
    return {stage, authored: stage <= 20, weather: boars.waveWeather(stage), boss: boars.waveBoss(stage),
      enemyCount: plan.length, counts, lastSpawnSeconds: Math.max(...plan.map(p => p.time)),
      totalHp, armorAdjustedHp: round(armorAdjustedHp)};
  });
  return {
    schemaVersion: 1,
    purpose: 'Independent source audit; no human difficulty inference and no synthetic win rates.',
    inventory: {levelArrays, selectableSoccerStages: aliases.filter(r => r.selectable).length,
      racingBaseStages: racing.RACING_STAGES.length,
      racingLeagueRaces: racingLeague.SEASONS.reduce((n,s) => n + racingLeague.calendar(s.id).length, 0),
      alpineBaseStages: alpineCore.BASE_STAGES, alpineLeagueStages: alpineCore.STAGE_COUNT,
      boarAuthoredWaves: 20, boarGeneratedWaves: 'unbounded', boarAuditHorizon: 30,
      unavailableRequestedGames: []},
    defaultRuntimeModes: {
      soccer: {mode: '11v11 full pitch, v241 recovery, v23 control, league', configuredHalfSeconds: c.soccer.match.halfSeconds,
        effectiveHalfSeconds: soccerFull.SOCCER_FULL.halfSeconds,
        evidence: source('workout/island/minigames/soccer-full.mjs', 81, 'applySoccerFull overrides JSON match duration and pitch.')},
      racing: {league: racingLeague.LONG ? 'long' : 'short', seasons: racingLeague.SEASONS.length,
        raceCounts: racingLeague.SEASONS.map(s => racingLeague.calendar(s.id).length),
        evidence: source('workout/island/minigames/racing-league-core.mjs', 83, 'Default long-league calendar; game stages are reused circuit/tier IDs.')},
      alpine: {v241: Boolean(c.alpineRush.physics.v241), league: true,
        engineStages: alpineCore.BASE_STAGES + alpineCore.STAGE_COUNT,
        evidence: source('workout/island/minigames/alpine-league-core.mjs', 8, 'League stages run as engine4..33 after the original three.')},
      fire: {indoorStages: fire24.entryStages(c.fireRescue.levels.length),
        evidence: source('workout/island/minigames/fire.mjs', 118, 'Entry stages wrap street play with v24 interior flow; street-only trials are incomplete.')},
      catchCriminal: {stages: c.catchCriminal.levels.length, chase: 'chase6 with weapons7/assist7/elements7 and weaponsFix8',
        throwing: 'archery with levels7 and assistRelease',
        evidence: source('workout/island/minigames/catch-session6.mjs', 99, 'Actual browser defaults; canvas-free session skips the chase and must not represent shipped play.')}
    },
    nativeSemantics: {
      genericStars: {thresholds: c.starThresholds, rule: 'win: 1 + count(performance >= threshold), loss: 0',
        evidence: source('workout/island/minigames/result.mjs', 1, 'Shared alien, naval and fire settlement.')},
      soccerStars: {rule: 'Win clean sheet=3, otherwise winning margin>=2=2, otherwise win=1; loss=0 at settlement.',
        optionalObjectives: true, evidence: [source('workout/island/minigames/soccer-result.mjs', 13, 'Native settlement stars.'),
          source('workout/island/minigames/soccer-campaign.mjs', 150, 'Optional achievement is transient; loss can still teach an action.')]},
      fireCertificates: {distinctFromStageStars: true,
        evidence: source('workout/island/minigames/fire.mjs', 100, 'Performance determines stage stars; certificate generated separately.')},
      boars: {nativeStars: false, nativeFalls: false, infiniteCampaign: true,
        evidence: [source('workout/island/minigames/boar-island/core.mjs', 133, 'Generated wave fallback has no terminal stage.'),
          source('workout/island/minigames/boar-island/game.js', 777, 'Complete wave increments nextWave and opens shop; no stars.')]},
      alpineLeague: {rule: 'Place goal required to pass; stars count passed place, time, and clean/gate goals. Base stages use rank stars.',
        evidence: source('workout/island/minigames/alpine-league-core.mjs', 79, 'starsFor returns zero without the place goal.')},
      falls: 'Only report a native crash/fall counter where supplied. HP loss, missed shots, deaths, contacts and abandonment are not interchangeable with falls.'
    },
    guaranteedDurationFloors: [
      {game: 'soccer', nativeClockSeconds: 2 * soccerFull.SOCCER_FULL.halfSeconds,
        excludes: ['halftime', 'goals', 'restarts', 'optional bonus penalties'],
        evidence: source('workout/island/minigames/soccer-result.mjs', 11, 'Completed result must equal two halfSeconds.')},
      {game: 'streetSlam', profile: 'quick', nativeClockSeconds: 4 * c.streetSlam.rules.profiles.quick.quarterSeconds,
        excludes: ['pregame', 'dead ball', 'breaks', 'free throws', 'overtime'],
        evidence: [source('workout/island/minigames/hoops-franchise.mjs', 19, 'New club defaults quick/normal.'),
          source('workout/island/minigames/hoops-engine.mjs', 986, 'Live game clock decreases by dt, not accelerated time.')]}],
    soccerStageAliases: aliases,
    staticBoundaries,
    racingStages: racing.RACING_STAGES.map(s => ({stage: s.id, trackId: s.trackId, laps: s.laps,
      targetRank: s.targetRank, aiSpeed: s.aiSpeed, playerSpeed: s.playerSpeed,
      widthScale: s.widthScale, reverse: s.reverse, timeLimit: s.timeLimit, grid: s.grid})),
    racingLeagueCalendar: racingLeague.SEASONS.flatMap(s => racingLeague.calendar(s.id).map(e => ({season: s.id, ...e}))),
    alpineLeagueGoals: Array.from({length: alpineCore.STAGE_COUNT}, (_,i) => ({leagueStage: i+1,
      engineStage: alpineCore.engineStageOf(i+1), ...alpineCore.stageInfo(i+1), goals: alpineStages.stageGoals(c.alpineRush,i+1)})),
    catchEffectiveStages: catchAssist.levels7(c.catchCriminal).map((s,i) => ({stage: i+1, distance: s.dist,
      hits: s.hits || 1, crew: s.crew || 1, throws: s.throws || c.catchCriminal.throws,
      assistConeDegrees: catchAssist.ASSIST7.cone[i], pull: catchAssist.ASSIST7.pull[i],
      radiusScale: s.radiusScale, movement: s.zmove, chase: s.chase})),
    navalAmmoBudgets: navalBudgets,
    boarWaveInventory: waveRows,
    limitations: [
      'Static parameter changes can offset each other; this list is a review queue, not a claim of an observed difficulty spike.',
      'All fresh-equipment trials test stage requirements at fixed equipment; later-stage failures can reflect intended purchase/training progression.',
      'Native-completion rates must be separated from patience deadlines so a long mandatory match does not become a fabricated logic loss.',
      'An endless campaign cannot be exhaustively simulated; the finite wave horizon must be stated prominently.'
    ]
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--source-root');
  if (at < 0 || !args[at + 1]) throw new Error('Pass --source-root /absolute/path/to/isolated/repo-copy');
  const sourceRoot = resolve(args[at + 1]);
  const config = JSON.parse(await readFile(join(sourceRoot, 'workout/island/data/config.json'), 'utf8'));
  const audit = await inspectAudit({sourceRoot, config});
  const outputAt = args.indexOf('--output');
  const output = outputAt >= 0 ? resolve(args[outputAt + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../data/static-audit.json');
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({output, configuredGames: audit.inventory.levelArrays.length,
    staticBoundaries: audit.staticBoundaries.length, authoredBoarWaves: audit.inventory.boarAuthoredWaves}));
}
