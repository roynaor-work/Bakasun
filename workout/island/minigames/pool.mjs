/** Fixed capacity, warmed at start; projectiles and particles reuse these records. */
export function createPool(capacity) {
  const free=Array.from({length:capacity},()=>({x:0,y:0,vx:0,vy:0,life:0,kind:0}));
  return {take(x,y,vx=0,vy=0,life=0,kind=0){const item=free.pop();if(!item)return null;item.x=x;item.y=y;item.vx=vx;item.vy=vy;item.life=life;item.kind=kind;return item;},release(item){free.push(item);},get available(){return free.length;}};
}
export function releaseAt(list,index,pool) {const item=list[index];list[index]=list[list.length-1];list.pop();pool.release(item);return item;}
