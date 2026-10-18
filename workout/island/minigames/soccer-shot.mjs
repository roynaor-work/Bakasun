const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** Charge and upward drag reinforce one another. AI retains its own shot style. */
export function shotLift(power,height,c){
 const k=c.shooting,q=clamp(power,0,1),loft=clamp(height||0,0,1);
 return k.lowLift+k.chargeLift*q**k.chargeExponent+k.dragLift*loft;
}
export function shotHeight(power,height,c){const v=shotLift(power,height,c);return c.physics.ballRadius+v*v/(2*c.ball.gravity);}
/** A tap may keep a sideways direction, but never target the player's own end. */
export function safeShotAim(aim,action,d,power,c){
 return !action?.manual&&power*c.physics.chargeSeconds<=c.physics.shortPressSeconds&&aim.x*d<0?{x:d,z:0}:aim;
}
