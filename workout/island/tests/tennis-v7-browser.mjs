// Real-app run of Island Tennis through the shell (menu, HUD, joystick, CSP monitor), for the v7 connection:
//   LABEL=before|after node workout/island/tests/tennis-v7-browser.mjs
// "before" turns the v7 switch off in the loaded config (the previous court and crowd), "after" is the shipped default. Writes
// <label>-844x390-app.png and <label>-app.json into verification/gpt-v7-ski-tennis-racing/tennis/; the CSP monitor's record lands in
// app-<label>/verification.json. Chromium + SwiftShader. The shell plays tennis in landscape only (a portrait phone gets the
// "rotate your device" gate), so the portrait pictures come from tools/tennis-shots.mjs on the view-only page.
import {verify} from './night-browser.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../verification/gpt-v7-ski-tennis-racing/tennis/',import.meta.url)),label=process.env.LABEL||'after',v7=label!=='before';
await mkdir(directory,{recursive:true});
const rows=[];
await verify('gpt-v7-ski-tennis-racing/tennis/app-'+label,[{width:844,height:390}],async({page,viewport,tick,snap,start,exit,assert})=>{
 await page.evaluate(v7=>{const t=window.__island.data.config.minigames.tennis;t.render.slowFrameMs=100000;/* keep SwiftShader timings from changing the tier */t.environment.v7.enabled=v7;},v7);
 const requests=[];page.on('request',r=>{const p=new URL(r.url()).pathname;if(/tennis-v7|adult-|palm-tree/.test(p))requests.push(p.replace(/^.*\/island\//,''));});
 await start('tennis');
 await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.characterLoaded);await tick(900);
 const s=await snap(),m=s.renderMetrics,tag=`${viewport.width}x${viewport.height}`;
 assert.equal(m.tennisV7,v7);assert.deepEqual(m.v7Fallbacks,[]);
 const stick=await page.locator('.soccer-stick-zone').boundingBox();assert.ok(stick.x+stick.width/2<viewport.width/2,'joystick on the left in '+tag);
 await page.screenshot({path:`${directory}${label}-${tag}-app.png`});
 rows.push({viewport:tag,tennisV7:m.tennisV7,surface:m.surface??null,crowd:m.crowd,triangles:m.triangles,drawCalls:m.drawCalls,quality:m.quality,stickCentreX:Math.round(stick.x+stick.width/2),requests:[...new Set(requests)]});
 await exit();
 return {};
});
await writeFile(`${directory}${label}-app.json`,JSON.stringify(rows,null,1)+'\n');
console.log(JSON.stringify(rows));
