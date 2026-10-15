/** Fixed capacity, warmed at start; projectiles and particles reuse these records. */
export function createPool(capacity) {
  const free=Array.from({length:capacity},(_,slot)=>({slot,damage:1,formation:'rows',hitLo:0,hitHi:0,x:0,y:0,vx:0,vy:0,life:0,kind:0,hp:0,maxHp:0,speed:0,radius:0,boss:false,child:false,scale:1,baseX:0,baseY:0,age:0,phase:0,launchTime:0,launched:0,reward:0,id:0,lastHit:-1}));
  return {take(x,y,vx=0,vy=0,life=0,kind=0){const item=free.pop();if(!item)return null;item.x=x;item.y=y;item.vx=vx;item.vy=vy;item.life=life;item.kind=kind;return item;},release(item){free.push(item);},get available(){return free.length;}};
}
export function releaseAt(list,index,pool) {const item=list[index];list[index]=list[list.length-1];list.pop();pool.release(item);return item;}
