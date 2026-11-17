export function alienStack(campaign,id,rank){return(campaign.stackCurve[id]||[]).slice(0,rank).reduce((n,v)=>n+v,0);}
export function createAlienEntity(pool,balance,x,y,kind,level,phase=0,child=false,bossHp=0){
 const a=pool.take(x,y,0,0,0,kind);if(!a)return null;
 const type=balance.enemyTypes[kind],scale=child?balance.pickups.childScale:bossHp?balance.bossScale:1;
 Object.assign(a,{hp:bossHp||type.hp*(child?1:Math.min(1.5,1+(level-1)*balance.hpPerStage)),speed:type.speed,radius:balance.alienRadius*type.radius*scale,boss:bossHp>0,child,scale,baseX:x,baseY:y,age:0,phase,launched:0,launchTime:type.launchSeconds||0,attackPattern:0,attackTime:1,hitTime:0,formation:'rows',reward:child?0:1,tellTime:0,tellMax:0,attackKind:'shot',bossPhase:1,guardActive:false,guardRemaining:0,aimX:0,aimY:0,diveAge:-1,diveHit:false});a.maxHp=a.hp;return a;
}
export function separateAliens(aliens,formation){
 for(let pass=0;pass<formation.separationPasses;pass++){let changed=false;for(let i=0;i<aliens.length;i++)for(let j=i+1;j<aliens.length;j++){
  const a=aliens[i],b=aliens[j];
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),need=a.radius+b.radius+formation.collisionGap;if(d<need){const nx=d?dx/d:1,ny=d?dy/d:0,shift=(need-d)/2;a.x-=nx*shift;a.y-=ny*shift;b.x+=nx*shift;b.y+=ny*shift;changed=true;}
 }if(!changed)break;}
}
/** Earliest swept circle contact; shared by fast shots and incoming projectiles. */
export function segmentContact(x0,y0,x1,y1,cx,cy,radius,aspect=1){
 const dx=(x1-x0)*aspect,dy=y1-y0,ox=(x0-cx)*aspect,oy=y0-cy,a=dx*dx+dy*dy,c=ox*ox+oy*oy-radius*radius;
 if(c<=0)return 0;if(!a)return null;const b=2*(ox*dx+oy*dy),disc=b*b-4*a*c;if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
