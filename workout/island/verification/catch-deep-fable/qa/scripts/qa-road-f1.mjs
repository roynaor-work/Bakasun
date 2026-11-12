import {launch, newPage, BASE, SHOTS} from './common.mjs';
const errors = [], browser = await launch(), page = await newPage(browser, errors);
await page.goto(`${BASE}tools/catch-view6-harness.html?stage=3&seed=3&auto=1&manual=1`); await page.waitForFunction('window.done===true', null, {timeout: 180000});
const roadRatio = async () => page.evaluate(() => { const cv = document.getElementById('cv'); const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height; const c = g.getContext('2d'); c.drawImage(cv, 0, 0); const band = c.getImageData(0, Math.floor(g.height * .62), g.width, Math.floor(g.height * .3)).data; let dark = 0, n = 0; for (let i = 0; i < band.length; i += 16) { const r = band[i], gg = band[i + 1], b = band[i + 2]; n++; if (r < 120 && gg < 120 && b < 130 && Math.abs(r - gg) < 25 && Math.abs(gg - b) < 30) dark++; } return +(dark / n).toFixed(3); });
for (const tg of [45, 55, 59, 62.3, 64, 66, 69, 75]) {
  await page.evaluate(t => { while (chase.state.s < t - 6 && chase.state.phase !== 'end') stepN(6); while (chase.state.s < t && chase.state.phase !== 'end') stepN(1); stepN(1); }, tg);
  const info = await page.evaluate(() => ({s: +chase.state.s.toFixed(1), d: +chase.state.d.toFixed(2), v: +chase.state.v.toFixed(1), boosting: chase.state.boosting, fov: +view.camera.fov.toFixed(1), camY: +view.camera.position.y.toFixed(2), roadMeshes: view.scene.children.filter(o => o.isMesh && o.material?.map && o.geometry?.attributes?.uv && !o.userData?.wheels).map(o => ({vis: o.visible, n: o.geometry.attributes.position.count, bs: o.geometry.boundingSphere ? Math.round(o.geometry.boundingSphere.radius) : null, cull: o.frustumCulled}))}));
  const ratio = await roadRatio(); console.log(JSON.stringify({...info, ratio}));
  if (ratio < .6) await page.screenshot({path: `${SHOTS}0x-road-missing-stage3-s${Math.round(info.s)}.png`});
}
await browser.close();
