import assert from 'node:assert/strict';

/** Advance the mock clock through the shell's preparation, never the game.
 * Waiting on DOM/RAF alone cannot complete timers on a paused test clock. */
export async function waitForGameStart(page){
 const step=await page.evaluate(()=>window.__island.data.config.ui.economyTickMs);
 for(let attempt=0;attempt<10;attempt++){
  if(await page.locator('.game-screen').getAttribute('data-starting')==='false')return;
  await page.clock.fastForward(step);
 }
 assert.equal(await page.locator('.game-screen').getAttribute('data-starting'),'false','shell countdown must finish before exercising the game');
}

export async function waitForGameNavigation(page){
 for(let attempt=0;attempt<100;attempt++){
  if(!await page.evaluate(()=>window.__island.games.navigation.traversing))return;
  await page.clock.runFor(16);
 }
 assert.fail('game history did not settle');
}
