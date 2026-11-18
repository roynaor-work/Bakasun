/** Contact sheets for the shared athlete body, before (`flag=0`: previous body) and after (`flag=1`: Codex body v22), through the real game pipelines.
 *   PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node workout/island/tools/athletes/body-v22-shots.mjs <outDir> [flag=1|0] [soccer|hoops|all] [clipFilter]
 * Writes <outDir>/<flag>/<sport>-<body>-<clip>.png and info.json (clip lists, triangle metrics, foot-floor minima per frame). */
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {serveIsland} from '../../../../tests/helpers/island-browser.mjs';
const require = createRequire(import.meta.url), {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.argv[2], flag = process.argv[3] || '1', which = process.argv[4] || 'all', filter = process.argv[5] ? new RegExp(process.argv[5]) : null;
const SOCCER = ['v9_run', 'v9_sprint', 'kick', 'v9_walk', 'celebrate', 'catch', 'dribble_run', 'kick_power', 'slide_straight', 'throwIn', 'keeperThrow', 'v22_header_jump_goal'];
const HOOPS = ['run', 'sprint', 'dribble_crossover_left', 'jump_shot', 'dunk_two_hands', 'defensive_slide_left', 'pass_chest', 'idle'];
await mkdir(path.join(out, flag), {recursive: true});
const server = await serveIsland('/workout/island/');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await (await browser.newContext({viewport: {width: 1440, height: 300}})).newPage(), errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${server.url}tools/athletes/body-v22-sheets.html?athleteBodyV22=${flag}&athleteBody=1`, {waitUntil: 'load'});
await page.waitForFunction(() => window.ready === true, null, {timeout: 120000});
const result = {flag, errors, sheets: []};
const save = async (name, spec) => {
  const r = await page.evaluate(s => window.sheet(s), spec);
  await writeFile(path.join(out, flag, name + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
  result.sheets.push({name, minY: r.minY, height: r.height, duration: r.duration});
};
if (which === 'all' || which === 'soccer') {
  result.soccer = (await page.evaluate(() => window.getInfo('soccer'))).soccer;
  const names = new Set(result.soccer.clips);
  for (const clip of SOCCER) if (names.has(clip) && (!filter || filter.test(clip))) await save(`soccer-field-${clip}`, {sport: 'soccer', slot: clip.includes('keeper') || clip === 'catch' ? 2 : 0, clip});
}
if (which === 'all' || which === 'hoops') {
  result.hoops = (await page.evaluate(() => window.getInfo('hoops'))).hoops;
  const names = new Set(result.hoops.clips);
  for (const body of ['guard', 'wing', 'center']) for (const clip of HOOPS) if (names.has(clip) && (!filter || filter.test(clip))) await save(`hoops-${body}-${clip}`, {sport: 'hoops', body, clip, n: ['guard', 'wing', 'center'].indexOf(body) + 1});
}
for (const sport of which === 'all' ? ['soccer', 'hoops'] : [which]) {
  const png = await page.evaluate(sp => window.lineup({sport: sp}), sport);
  await writeFile(path.join(out, flag, `lineup-${sport}.png`), Buffer.from(png.split(',')[1], 'base64'));
}
result.errors = errors;
await writeFile(path.join(out, flag, 'info.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify({flag, sheets: result.sheets.length, errors: errors.slice(0, 5), soccer: result.soccer && {set: result.soccer.set, v22: result.soccer.v22, clips: result.soccer.clips.length}, hoops: result.hoops && {v22: result.hoops.v22, bodyVersion: result.hoops.bodyVersion, errors: result.hoops.errors, clips: result.hoops.clips.length}}));
await browser.close(); await server.close();
