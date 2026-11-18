import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {statSync} from 'node:fs';
import {PLACEMENTS,fitZ,standSeats} from '../workout/island/minigames/tennis-v12-stadium.mjs';

const root=new URL('../workout/island/',import.meta.url);
test('tennis v12 stadium: the layout matches the package scene (10 stands, 600 fans, 12 boards, 4 floodlights)',async()=>{
  const scene=JSON.parse(await readFile(new URL('design/tennis-stadium-v1/scene.json',root),'utf8').catch(()=>'{}')||'{}');
  const count=m=>PLACEMENTS.filter(p=>p.model===m).length;
  assert.equal(count('stand-10m'),10);assert.equal(count('ad-board'),12);assert.equal(count('floodlight'),4);assert.equal(count('player-bench'),2);assert.equal(count('umpire-chair'),1);assert.equal(count('scoreboard'),1);
  assert.equal(standSeats().length,60);assert.equal(10*standSeats().length,600);
  if(scene.placements)for(const model of ['stand-10m','ad-board','floodlight'])assert.equal(scene.placements.filter(p=>p.model===model).length,count(model));
});

test('tennis v12 stadium: z is pulled in by the missing length behind the baselines, the net-side stays',()=>{
  assert.equal(fitZ(0,9),0);assert.equal(fitZ(4,9),4);
  assert.ok(Math.abs(fitZ(-19.5,9)-(-16.615))<1e-9&&Math.abs(fitZ(13,9)-10.115)<1e-9);
});

test('tennis v12 stadium: assets are in the game folder, small, and CC0',async()=>{
  let total=0;
  for(const f of ['stand-10m.glb','ad-board.glb','umpire-chair.glb','player-bench.glb','scoreboard.glb','floodlight.glb','crowd-atlas.webp','evening-city.png','score-display.png','LICENSES.md']){const size=statSync(new URL('assets/tennis-stadium-v1/'+f,root)).size;assert.ok(size>0);total+=size;}
  assert.ok(total<=450000,'stadium assets '+total);
  assert.match(await readFile(new URL('assets/tennis-stadium-v1/LICENSES.md',root),'utf8'),/CC0/);
});
