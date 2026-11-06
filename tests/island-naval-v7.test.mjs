// Naval v7 hulls: runtime copies live under assets/naval-v7 (never design/), the off flag works, and the browser
// run proves both the v7 look and the silent fall back to the earlier boats when the v7 files cannot load.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {navalV7Enabled,NAVAL_V7} from '../workout/island/minigames/naval-v7.mjs';
const island=new URL('../workout/island/',import.meta.url);

test('naval v7: ?navalV7=0 and the adapter switch turn it off, everything else leaves it on',()=>{
  assert.equal(navalV7Enabled('?dev=1'),true);assert.equal(navalV7Enabled(''),true);
  assert.equal(navalV7Enabled('?navalV7=0'),false);assert.equal(navalV7Enabled('?x=1&navalV7=0'),false);assert.equal(navalV7Enabled('?navalV7=1'),true);
  assert.equal(navalV7Enabled('',{navalV7:false}),false);
});
test('naval v7: every runtime file exists under assets/naval-v7 and nothing points into design/',async()=>{
  const files=[...Object.values(NAVAL_V7.ships).map(s=>s.file),...Object.values(NAVAL_V7.fleets)];
  for(const f of files){assert.ok(f.startsWith('assets/naval-v7/'),f);assert.ok((await stat(new URL(f,island))).size>0,f);}
  assert.ok(existsSync(new URL('assets/naval-v7/textures/blank-1.png',island)));
  for(const f of ['minigames/naval-v7.mjs','minigames/naval-view.mjs'])assert.doesNotMatch(await readFile(new URL(f,island),'utf8'),/design\/naval-v7/);
  const all=JSON.parse(await readFile(new URL('verification/gpt-v7-naval-fire-defense/naval-assets.json',island),'utf8'));
  for(const row of all.files)assert.equal((await stat(new URL(row.path,island))).size,row.bytes,row.path);
});
test('naval v7: every kind maps to a shipped hull and the player has the articulated LOD0',()=>{
  for(const key of ['player',0,1,2,'boss'])assert.ok(NAVAL_V7.ships[NAVAL_V7.kinds[key]],String(key));
  assert.equal(NAVAL_V7.ships[NAVAL_V7.kinds.player].turret,true);
});
const chromium=process.env.CHROMIUM_PATH||'/usr/bin/chromium',browser=process.env.ISLAND_CSP_BROWSER==='1'&&existsSync(chromium); // opt-in like the other island browser checks: the plain CI test job has no playwright
for(const mode of ['on','blocked'])test('naval v7 browser ('+mode+'): '+(mode==='on'?'v7 hulls load under the real CSP':'blocked v7 files fall back silently to the earlier boats'),{skip:!browser,timeout:900000},()=>{
  const r=spawnSync(process.execPath,['workout/island/tests/naval-v7-browser.mjs'],{env:{...process.env,NAVAL_V7_MODE:mode,CHROMIUM_PATH:chromium},encoding:'utf8',cwd:new URL('..',import.meta.url)});
  assert.equal(r.status,0,(r.stdout||'').slice(-1500)+(r.stderr||'').slice(-1500));
});
