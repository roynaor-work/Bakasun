// Proof shots for the tyre gun of "תפוס את הפושע" v6 (agent B):
//   node workout/island/tools/catch-tyres-shots.mjs [outDir] [baseUrl]
// Needs the static server at the repo root (python3 -m http.server 8765) and Playwright under /opt/node-tools.
// Writes 8 frames (lock → shot → hit → flat → second shot → stop → skid → stopped) and a HUD shot inside the real
// v6 session (tools/catch-harness6.html, the lock forced by moving the thief 12 m ahead). tyres-sheet.png is composed by the caller (PIL).
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [,, outDir = 'workout/island/verification/catch-deep-fable/tyres', base = 'http://127.0.0.1:8765/workout/island/'] = process.argv;
const {chromium} = await import(process.env.ISLAND_PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
await mkdir(outDir, {recursive: true});
const browser = await chromium.launch({headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server']});
const context = await browser.newContext({viewport: {width: 844, height: 390}, deviceScaleFactor: 1, hasTouch: true});
await context.addInitScript(() => { localStorage.setItem('island.sound', 'off'); localStorage.setItem('island.catch.help2', '1'); localStorage.setItem('island.catch.help6', '1'); });
const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const log = {};
try {
  await page.goto(`${base}tools/catch-tyres-harness.html?manual=1&hit=1&gap=11`, {waitUntil: 'load'});
  await page.waitForFunction(() => window.done === true, null, {timeout: 120000});
  const stepN = n => page.evaluate(n => window.stepN(n), n);
  const shot = async (name, note) => { await page.waitForTimeout(80); await page.screenshot({path: join(outDir, name + '.png')}); log[name] = {...(await page.evaluate(() => window.state())), note}; console.log(name, JSON.stringify({gap: log[name].gap.toFixed(1), vC: log[name].vC.toFixed(1), locked: log[name].gun.locked, chance: log[name].gun.hitChance.toFixed(2), ammo: log[name].gun.ammo, flats: log[name].flats, ribbon: log[name].ribbon, reticle: log[name].reticle})); };
  await stepN(70); await shot('f1-lock', 'כוונת נעולה על הרכב הנמלט');
  await page.evaluate(() => window.fireNow()); await stepN(2); await shot('f2-shot', 'ירייה: הבזק בניידת וקו זוהר לגלגל');
  await stepN(5); await shot('f3-hit', 'פגיעה: ניצוצות וטבעת על הגלגל האחורי');
  await stepN(45); await shot('f4-flat', 'פנצ׳ר ראשון: גלגל שטוח, הרכב נוטה, עשן');
  await stepN(40); await page.evaluate(() => window.fireNow()); await stepN(3); await shot('f5-shot2', 'ירייה שנייה לגלגל השני');
  await stepN(25); await shot('f6-stopped', 'פנצ׳ר שני: הרכב מתחיל להחליק');
  await stepN(60); await shot('f7-skid', 'החלקה: שני פסי בלימה מאחורי הגלגלים האחוריים');
  await stepN(110); await shot('f8-stop', 'עצירה: פס ההחלקה שלם ופוף אבק');
  // close-ups of the rear-left wheel: before, the hit, the flat tyre with its flap and smoke, the skid ribbon
  await page.goto(`${base}tools/catch-tyres-harness.html?manual=1&hit=1&gap=8&cam=wheel`, {waitUntil: 'load'});
  await page.waitForFunction(() => window.done === true, null, {timeout: 120000});
  await stepN(70); await shot('d1-wheel', 'תקריב: הגלגל האחורי השמאלי לפני הירי');
  await page.evaluate(() => window.fireNow()); await stepN(4); await shot('d2-wheel-hit', 'תקריב: פגיעה, ניצוצות וטבעת');
  await stepN(50); await shot('d3-wheel-flat', 'תקריב: פנצ׳ר, גומי מתנפנף, הרכב נוטה, עשן');
  await stepN(10); await page.evaluate(() => window.fireNow()); await stepN(260); await shot('d4-wheel-skid', 'תקריב: פסי ההחלקה אחרי העצירה');
  // the HUD inside the real v6 session: stage 2, the thief forced 12 m ahead in line so the reticle locks
  const p2 = await context.newPage(); p2.setDefaultTimeout(180000); p2.on('pageerror', e => errors.push('session: ' + e.message));
  await p2.goto(`${base}tools/catch-harness6.html?stage=2&seed=3&dev=1`, {waitUntil: 'load'});
  await p2.waitForFunction(() => window.done === true, null, {timeout: 180000});
  await p2.waitForFunction(() => document.querySelectorAll('.catch-fire').length >= 1, null, {timeout: 30000});
  await p2.evaluate(() => { const s = window.session; for (let i = 0; i < 60 * 8 && s.chase.state.phase !== 'run'; i++) s.debug.stepChase(1 / 60); for (let i = 0; i < 60; i++) s.debug.stepChase(1 / 60); const c = s.chase; c.state.crim.s = c.state.s + 12; c.state.crim.d = c.state.d; c.state.stun = 0; for (let i = 0; i < 6; i++) s.debug.stepChase(1 / 60); });
  await p2.waitForTimeout(500);
  const hudState = await p2.evaluate(() => ({fireButtons: document.querySelectorAll('.catch-fire').length, fireVisible: [...document.querySelectorAll('.catch-fire')].map(b => b.offsetParent !== null && !b.hidden), ammo: document.querySelectorAll('.catch-ammo').length, reticleHidden: document.querySelector('.catch-reticle')?.hidden, locked: window.session.chase.gun.state.locked, chance: window.session.chase.gun.state.hitChance, styleInjected: Boolean(document.querySelector('style[data-catch-fire-hud]'))}));
  await p2.screenshot({path: join(outDir, 'hud-session-stage2.png')});
  const ammo0 = await p2.evaluate(() => window.session.chase.gun.state.ammo);
  await p2.locator('.catch-fire').dispatchEvent('pointerdown'); await p2.waitForTimeout(60); await p2.evaluate(() => { for (let i = 0; i < 3; i++) window.session.debug.stepChase(1 / 60); });
  const ammo1 = await p2.evaluate(() => window.session.chase.gun.state.ammo);
  await p2.waitForTimeout(150); await p2.screenshot({path: join(outDir, 'hud-session-stage2-after-shot.png')});
  log.session = {...hudState, ammo0, ammo1, note: 'ה-HUD של B בתוך הסשן האמיתי'}; console.log('session', JSON.stringify(log.session));
  await p2.close();
} finally {
  log.errors = errors; await writeFile(join(outDir, 'shots-log.json'), JSON.stringify(log, null, 1));
  await browser.close();
}
if (errors.length) { console.error('page errors:', errors); process.exitCode = 1; }
