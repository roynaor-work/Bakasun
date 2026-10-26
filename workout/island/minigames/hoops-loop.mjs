/** Fixed-step driver shared by the session and the tests: real frame time in,
 * whole 1/60 s engine steps out. The frame rate never changes the steps. */
export function createFixedLoop({dt=1/60,maxFrame=.25,maxSteps=8}={}){
 let acc=0;
 return {
  advance(frameSeconds,step){
   acc+=Math.max(0,Math.min(maxFrame,frameSeconds));let n=0;
   // Tolerate float drift so 120 Hz frames land exactly on every other step.
   while(acc>=dt-1e-9&&n<maxSteps){if(step()===false){acc=0;break;}acc-=dt;n++;}
   if(n>=maxSteps)acc=Math.min(acc,dt);
   return n;
  },
  get alpha(){return Math.max(0,Math.min(1,acc/dt));},
  reset(){acc=0;},
 };
}
