/** Island Pro Basketball — court geometry (metres). One source for rules, AI and view.
 * x runs along the length (baskets at ±x), z across the width, y up. A team "attacks
 * side s" (s = +1 or -1) when it shoots at the basket at x = s·rimX. */
export function createCourt(c){
 const L=c.length,W=c.width,hx=L/2,hz=W/2,rimX=hx-c.rimFromBaseline;
 const cornerAlong=-Math.sqrt(Math.max(0,c.threeRadius**2-c.threeCornerZ**2));
 return {
  L,W,hx,hz,rimX,rimY:c.rimHeight,rimR:c.rimRadius,ballR:c.ballRadius,
  boardX:hx-c.boardFromBaseline,boardW:c.boardWidth,boardH:c.boardHeight,boardBottom:c.boardBottom,boardT:c.boardThickness,
  threeR:c.threeRadius,threeCornerZ:c.threeCornerZ,keyW:c.keyWidth,ftDist:c.freeThrowFromBaseline,
  restrictedR:c.restrictedRadius,centerR:c.centerRadius,cornerAlong,
  rim(side){return {x:side*rimX,y:c.rimHeight,z:0};},
  /** Points for a field goal released at (x,z) at the basket of `side`. */
  points(side,x,z){
   if(side*x<0)return 3;                                 // released from the backcourt
   const along=side*(x-side*rimX);                       // >0 behind the rim, <0 towards mid-court
   if(along>=cornerAlong)return Math.abs(z)>=c.threeCornerZ?3:2;
   return Math.hypot(x-side*rimX,z)>=c.threeRadius?3:2;
  },
  inPaint(side,x,z){return Math.abs(z)<=c.keyWidth/2&&side*x>=hx-c.freeThrowFromBaseline&&side*x<=hx;},
  inBounds(x,z,margin=0){return Math.abs(x)<=hx-margin&&Math.abs(z)<=hz-margin;},
  frontcourt(side,x){return side*x>0;},
  distToRim(side,x,z){return Math.hypot(x-side*rimX,z);},
  /** Free-throw shooter spot for the basket of `side`. */
  ftSpot(side){return {x:side*(hx-c.freeThrowFromBaseline-0.15),z:0};},
 };
}
