/** Sprint stamina meter (pure, unit-tested). The simulation calls it once per fixed step.
 * - drains at a constant rate while the sprint button is held and the player moves;
 * - regenerates only after `regenDelaySeconds` without sprinting;
 * - empty locks the meter until it climbs back to `minToStart`.
 * The button is the only trigger: `requested` is the live held state of that frame. */
export function sprintMeterStep(meter,c,dt,{requested=false,moving=true,available=true,regen=1}={}){
  if(meter.locked&&meter.value>=c.minToStart)meter.locked=false;
  meter.active=Boolean(requested&&moving&&available&&!meter.locked&&meter.value>0);
  if(meter.active){
    meter.value=Math.max(0,meter.value-c.drainPerSecond*dt);meter.regenDelay=c.regenDelaySeconds;
    if(!meter.value){meter.active=false;meter.locked=true;}
  }
  else if(meter.regenDelay>0)meter.regenDelay=Math.max(0,meter.regenDelay-dt);
  else meter.value=Math.min(meter.capacity,meter.value+c.regenPerSecond*regen*dt);
  return meter;
}
/** Seconds from full to empty / from empty back to full (for the HUD and tests). */
export function sprintMeterTimes(c,capacity=c.capacity){
  return {drainSeconds:capacity/c.drainPerSecond,regenSeconds:capacity/c.regenPerSecond,delaySeconds:c.regenDelaySeconds};
}
