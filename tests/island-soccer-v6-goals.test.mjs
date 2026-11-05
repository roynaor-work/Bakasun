import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import {v6GoalsEnabled} from '../workout/island/minigames/soccer-design-scene.mjs';

const root=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.soccer;
const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'));

test('v6 goals: on by default, off by ?soccerV6=0 or config switch',()=>{
 assert.equal(v6GoalsEnabled(config,''),true);
 assert.equal(v6GoalsEnabled(config,'?soccerV6=0'),false);
 assert.equal(v6GoalsEnabled({...config,v6:{goals:false}},''),false);
 assert.equal(v6GoalsEnabled({},'?x=1'),true);
});

test('v6 goals runtime copy lives under assets/, is offline-listed, and no runtime code points at design/soccer-v6',async()=>{
 assert.ok((await stat(new URL('assets/soccer-v6/goals.glb',root))).size<30000);
 assert.ok(manifest.games.soccer.includes('assets/soccer-v6/goals.glb'));
 for(const file of await readdir(new URL('minigames/',root)))if(file.endsWith('.mjs')&&file.startsWith('soccer-'))
  assert.ok(!(await readFile(new URL('minigames/'+file,root),'utf8')).includes('design/soccer-v6'),file+' must not use the unpublished design/soccer-v6');
});
