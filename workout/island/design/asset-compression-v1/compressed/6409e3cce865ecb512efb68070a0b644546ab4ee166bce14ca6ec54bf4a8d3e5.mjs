/** Accelerate to full speed over the authored 150 ms. Releasing a flight input
 * stops immediately; reversing brakes quickly before accelerating away. */
export function moveAlienPlayer(player,input,dt,balance,width){
 const axis=Number(Boolean(input.right))-Number(Boolean(input.left)),stick=Math.max(-1,Math.min(1,axis||input.moveX||0));
 const target=Number.isFinite(input.x)?Math.max(balance.playerRadius,Math.min(width-balance.playerRadius,input.x)):null;
 if(input.flight&&target!==null&&!stick&&Math.abs(target-player.x)<.05){player.x=target;player.vx=0;player.bank=0;return;}
 const response=input.flight?.075:balance.movement.dragSeconds;
 const desired=stick?(input.flight?stick:Math.sign(stick)*stick*stick)*balance.playerSpeed:target===null?0:Math.max(-balance.playerSpeed,Math.min(balance.playerSpeed,(target-player.x)/response));
 if(desired===0){player.vx=0;player.bank=0;return;}
 const reversing=(player.vx||0)*desired<0,ramp=reversing?Math.min(.06,balance.movement.rampSeconds):balance.movement.rampSeconds;
 const change=balance.playerSpeed/ramp*dt;
 player.vx=(player.vx||0)+Math.max(-change,Math.min(change,desired-(player.vx||0)));
 const previous=player.x;player.x+=player.vx*dt;
 if(target!==null&&!stick&&(target-previous)*(target-player.x)<=0){player.x=target;player.vx=0;}
 player.x=Math.max(balance.playerRadius,Math.min(width-balance.playerRadius,player.x));
 if(player.x===balance.playerRadius||player.x===width-balance.playerRadius)player.vx=0;
 player.bank=player.vx/balance.playerSpeed;
}
