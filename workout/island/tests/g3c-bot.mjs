// One fixed policy for every difficulty and seed; no score or difficulty inspection.
export function bot(game,config){const s=game.getState(),p=s.players[s.controlled],owner=s.ball.owner===null?null:s.players[s.ball.owner];
 if(s.phase==='restartReady'){const r=s.restart;return {moveX:r.type==='corner'?-s.attackDir:s.attackDir,moveZ:-Math.sign(r.z),passHeld:r.team===0&&r.age<config.restarts.readySeconds+.6};}
 const mine=s.ball.owner===p.id,dx=mine?s.attackDir*config.pitch.length/2-p.x:s.ball.x-p.x,dz=mine?-p.z:s.ball.z-p.z,l=Math.hypot(dx,dz)||1;
 return {moveX:dx/l,moveZ:dz/l,kickHeld:mine&&p.x*s.attackDir>config.pitch.length/2-7&&!s.charging,passPressed:owner?.team===1&&Math.hypot(p.x-s.ball.x,p.z-s.ball.z)<config.steal.reach,switchPlayer:!mine&&s.players.filter(q=>q.team===0).sort((a,b)=>Math.hypot(a.x-s.ball.x,a.z-s.ball.z)-Math.hypot(b.x-s.ball.x,b.z-s.ball.z))[0].id!==p.id};}
