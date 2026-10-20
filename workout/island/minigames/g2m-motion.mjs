/** Velocity ramps take 150 ms from rest to full speed (and back). */
export function moveAlienPlayer(player,input,dt,balance,width){
 const axis=Number(Boolean(input.right))-Number(Boolean(input.left)),stick=Math.max(-1,Math.min(1,axis||input.moveX||0));
 const target=Number.isFinite(input.x)?Math.max(balance.playerRadius,Math.min(width-balance.playerRadius,input.x)):null;
 const desired=stick?Math.sign(stick)*stick*stick*balance.playerSpeed:target===null?0:Math.max(-balance.playerSpeed,Math.min(balance.playerSpeed,(target-player.x)/balance.movement.dragSeconds));
 const change=balance.playerSpeed/balance.movement.rampSeconds*dt;
 player.vx=(player.vx||0)+Math.max(-change,Math.min(change,desired-(player.vx||0)));
 const previous=player.x;player.x+=player.vx*dt;
 if(target!==null&&!stick&&(target-previous)*(target-player.x)<=0){player.x=target;player.vx=0;}
 player.x=Math.max(balance.playerRadius,Math.min(width-balance.playerRadius,player.x));
 if(player.x===balance.playerRadius||player.x===width-balance.playerRadius)player.vx=0;
 player.bank=player.vx/balance.playerSpeed;
}
