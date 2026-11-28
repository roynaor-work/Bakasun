/** Island Pro Basketball v25.2 (QA scan of v25.1, 28/11/2026). Pure rules, no DOM. Each group has an address value that brings v25.1 back:
 *  ?hoopsMeterPos=old  the shot meter is 26 x 132 px, 44 px to the right of the shooter (58 px to the left on the right part of the screen) wherever the other
 *                      players stand, and the rebound cue is a large white ring that closes on the landing spot from the moment the ball leaves the hand.
 *                      Default: the meter is METER.scale of that size and stands beside the shooter on the side where no player and no button is; the rebound
 *                      cue keeps its small spot with the arrow (green = jump now) and loses the large ring
 *  ?hoopsBtnPos=old    the round "?" and kit buttons sit under the top bar on the right (72 px down), where the far basket is in the sideline camera.
 *                      Default (landscape): both are in the top row beside the score, above the backboard */
const read=search=>{try{return search instanceof URLSearchParams?search:new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export function hoopsV252Flags(search){
 const q=read(search);
 return Object.freeze({meterPos:q.get('hoopsMeterPos')==='old'?'old':'side',btnPos:q.get('hoopsBtnPos')==='old'?'old':'top'});
}
/** The meter of this round in px: scale of the v25.0 meter (26 x 132), the least gap between the shooter's middle and the meter's near edge, the screen margin. */
export const METER=Object.freeze({scale:.7,width:18,height:92,gap:24,margin:8});
const hit=(mx,my,o)=>Math.abs(o.x-mx)<26&&Math.abs(o.y-my)<METER.height/2+20;
const inside=(mx,my,r)=>mx+METER.width/2>r.x0&&mx-METER.width/2<r.x1&&my+METER.height/2>r.y0&&my-METER.height/2<r.y1;
/** Where the meter's centre goes. shooter = the projected middle of the shooter's body {x, y}; body = his height on the screen in px (the gap grows with it);
 * others = the projected middles of the other nine players; avoid = rectangles the meter must not cover (the stick, the action buttons); top = the lowest y the
 * meter's top may reach (under the score). Each side is scored: a covered button costs most, then a covered player, then being pushed back by the screen edge.
 * The right side wins a tie. Returns {x, y, side} (side 1 = right of the shooter). */
export function meterAnchor({shooter,others=[],width,height,body=0,top=METER.margin,avoid=[]}){
 const gap=Math.max(METER.gap,Math.min(60,body*.32))+METER.width/2,halfW=METER.width/2,halfH=METER.height/2;
 const clampX=x=>Math.max(METER.margin+halfW,Math.min(width-METER.margin-halfW,x));
 const y=Math.max(top+halfH,Math.min(height-METER.margin-halfH,shooter.y-body*.1));
 let best=null;
 for(const side of [1,-1]){
  const raw=shooter.x+side*gap,x=clampX(raw);
  const score=avoid.filter(r=>inside(x,y,r)).length*100+others.filter(o=>hit(x,y,o)).length*10+Math.min(9,Math.abs(raw-x)/4);
  if(!best||score<best.score)best={x:Math.round(x),y:Math.round(y),side,score};
 }
 return {x:best.x,y:best.y,side:best.side};
}
