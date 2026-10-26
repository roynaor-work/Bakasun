/** A bounded, deterministic round-robin over the four city quarters. Adding a
 * large fixed grid no longer spends every lamp/tree on its first northern rows. */
export function distributedStreetSites(candidates,size,limit){
  const quarters=[[],[],[],[]],hash=p=>((Math.imul(p.x+17,73856093)^Math.imul(p.z+31,19349663))>>>0);
  for(const p of candidates)quarters[(p.x>=size/2?1:0)+(p.z>=size/2?2:0)].push(p);
  for(const q of quarters)q.sort((a,b)=>hash(a)-hash(b)||a.z-b.z||a.x-b.x);
  const result=[];let index=0;
  while(result.length<Math.max(0,limit)){
    let added=0;for(const q of quarters)if(q[index]&&result.length<limit){result.push(q[index]);added++;}
    if(!added)break;index++;
  }
  return result;
}
