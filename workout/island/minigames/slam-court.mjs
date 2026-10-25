/** Street Slam court geometry in metres (+Y up, +Z toward the near baseline).
 * One source for collision, scoring rules and the renderer's line drawing. */
export function slamCourt(config){
 const c=config.court;
 const hoops={home:{x:0,z:-c.hoopZ,sign:-1},away:{x:0,z:c.hoopZ,sign:1}};
 return Object.freeze({
  ...c,
  /** Team -> the hoop that team attacks. Home always attacks the far (-Z) hoop. */
  target(team){return team==='home'?hoops.home:hoops.away;},
  own(team){return team==='home'?hoops.away:hoops.home;},
  ring(team){const h=this.target(team);return {x:h.x,y:c.hoopHeight,z:h.z};},
  board(team){const h=this.target(team);return {z:h.sign*c.boardZ,x0:-c.boardWidth/2,x1:c.boardWidth/2,y0:c.boardBottom,y1:c.boardTop,t:c.boardThickness};},
  /** 3 points when released outside the arc drawn around (0, sign*threeCenterZ). */
  points(team,x,z){const h=this.target(team);const dz=z-h.sign*c.threeCenterZ;return Math.hypot(x,dz)>c.threeRadius?3:2;},
  clampPlayer(p){p.x=Math.max(-c.playerBounds.x,Math.min(c.playerBounds.x,p.x));p.z=Math.max(-c.playerBounds.z,Math.min(c.playerBounds.z,p.z));return p;},
 });
}
