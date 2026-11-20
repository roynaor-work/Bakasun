import assert from 'node:assert/strict';

export function assertAimRun({trials, summary, final, errors}, expectedTrials){
  assert.ok(Number.isInteger(expectedTrials)&&expectedTrials>0,'a positive number of trials is required');
  assert.equal(trials.length,expectedTrials,'all requested boar trials must run');
  assert.deepEqual(errors,[],'the browser must report no page errors');
  const shots=final.shotsBy||{};
  const otherShots=Object.entries(shots).filter(([source,count])=>source!=='button'&&count!==0);
  assert.deepEqual(otherShots,[],'only the fire button may shoot');
  assert.ok(shots.button>0 && summary.all?.shots>0,'the trials must exercise shooting');
  assert.ok(summary.all?.reached>0,'the bot must acquire a target');
  assert.ok(summary.all?.hits>0,'the bot must hit a boar');
}
