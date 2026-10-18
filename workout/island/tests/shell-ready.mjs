import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {ui}=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8'));

/** Advance the mock clock through the shell's preparation, never the game.
 * Waiting on DOM/RAF alone cannot complete timers on a paused test clock. */
export async function waitForGameStart(page){
 // Flush pending press-feedback RAF before jumping across timer intervals.
 await page.clock.runFor(32);
 const step=ui.economyTickMs;
 for(let attempt=0;attempt<10;attempt++){
  if(await page.locator('.game-screen').getAttribute('data-starting')==='false')return;
  await page.clock.fastForward(step);
 }
 assert.equal(await page.locator('.game-screen').getAttribute('data-starting'),'false','shell countdown must finish before exercising the game');
}

/** Older standalone scenarios predate building-gated games. Use production
 * placement before entering them; menu-lock scenarios build their own fixtures. */
export async function prepareGameBuildings(page){
 await page.evaluate(()=>{
  const {engine:e}=window.__island;e.state.money=100000;
  for(const type of ['soccer','tennis','fireStation','airbase']){
   if(e.state.buildings.some(b=>b.typeId===type))continue;
   let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;
   if(!done)throw Error('cannot place fixture '+type);
  }
  if(!e.state.buildings.some(b=>b.typeId==='harbor')){e.place('road',0,7);if(!e.place('harbor',0,8).ok)throw Error('cannot place fixture harbor');}
 });
}

export async function waitForGameNavigation(page){
 for(let attempt=0;attempt<100;attempt++){
  if(!await page.evaluate(()=>window.__island.games.navigation.traversing))return;
  await page.clock.runFor(16);
 }
 assert.fail('game history did not settle');
}
