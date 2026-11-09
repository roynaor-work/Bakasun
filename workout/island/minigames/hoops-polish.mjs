/** Island Pro Basketball — motion polish of 07/11 (hoops-v8-polish): the dunk reaches over the rim, defenders stand in a defensive stance
 * instead of idling, the layup is carried in at stride speed, the reception keeps the legs of the run. One switch for the view side:
 * `?hoopsPolish=0` returns every one of these to the 06/11 behaviour (the engine side is `shot.layupStride` in the config). */
export function polishEnabled(params){return params?.get?.('hoopsPolish')!=='0';}
/** The dunk clip authors a 1.14 m rise of the hips; the engine's dunk jump is 0.8 m and the view used to draw 85% of it, so the hands
 * (2.30 m over the standing pose) reached 2.98 m under a 3.05 m rim. The view now draws the dunk's jump at the authored rise. */
export const DUNK_RISE=1.136,DUNK_ENGINE_JUMP=0.8,PLAIN_LIFT=0.85;
export function visualLift(shotType,polish){return polish&&shotType==='dunk'?DUNK_RISE/DUNK_ENGINE_JUMP:PLAIN_LIFT;}
