/** Exact acceleration of racing-tracks.mjs project(), without changing a race rule.
 * The caller supplies a native track from the disposable source copy. We retain
 * its hinted segment window, fallback, scan order, interpolation and 1e-4 tie rule.
 *
 * One projection onto a segment INSIDE that same search domain supplies an upper
 * bound U. A segment farther than U + N*epsilon cannot influence the answer: an
 * epsilon tie can pass influence by less than epsilon per visited segment, and
 * there are at most N of them. AABB lower bounds conservatively discard only
 * those segments. The survivors are evaluated in their original order. The
 * additional floating-point guard grows with the segment count: subtraction
 * rounding can extend each epsilon tie by O(ulp(distanceSquared)). It makes
 * the bounds looser, never tighter.
 *
 * This is a query index over the original immutable points, not different car
 * physics, a coarser track or a replacement result model. verify=true compares
 * EVERY answer to the original function with Object.is and throws on any change.
 */
const EPSILON=.0001;
const wrap=(v,L)=>((v%L)+L)%L;
export function accelerateRacingProjection(track,{verify=false}={}){
 const native=track.project,points=track.points,N=points.length,L=track.length,width=track.width;
 if(typeof native!=='function'||!N||!(L>0))throw new Error('A native racing track is required');
 const aX=new Float64Array(N),aZ=new Float64Array(N),aS=new Float64Array(N),dx=new Float64Array(N),dz=new Float64Array(N),den=new Float64Array(N),ds=new Float64Array(N),minX=new Float64Array(N),maxX=new Float64Array(N),minZ=new Float64Array(N),maxZ=new Float64Array(N),distances=new Float64Array(N);
 let coordinateScale=1,lastIndex=0;
 for(let i=0;i<N;i++){
  const a=points[i],b=points[(i+1)%N];aX[i]=a.x;aZ[i]=a.z;aS[i]=a.s;distances[i]=a.s;
  dx[i]=b.x-a.x;dz[i]=b.z-a.z;den[i]=dx[i]*dx[i]+dz[i]*dz[i]||1;ds[i]=(i===N-1?L:b.s)-a.s;
  minX[i]=Math.min(a.x,b.x);maxX[i]=Math.max(a.x,b.x);minZ[i]=Math.min(a.z,b.z);maxZ[i]=Math.max(a.z,b.z);
  coordinateScale=Math.max(coordinateScale,a.x*a.x+a.z*a.z);
 }
 const windowCount=Math.min(N,Math.ceil(130/(L/N))+4),stats={queries:0,evaluated:0,discarded:0,fallbacks:0,verified:0};
 const segmentOf=s=>{let low=0,high=N;while(low+1<high){const mid=(low+high)>>1;if(distances[mid]<=s)low=mid;else high=mid;}return low;};
 function project(x,z,hint){
  if(!Number.isFinite(x+z))return native(x,z,hint);
  stats.queries++;
  let bestS=0,bestD=Infinity,bestH=Infinity,bestIndex=-1;
  const finiteHint=Number.isFinite(hint);
  const distanceAt=i=>{
   const t=Math.max(0,Math.min(1,((x-aX[i])*dx[i]+(z-aZ[i])*dz[i])/den[i]));
   const px=aX[i]+dx[i]*t,pz=aZ[i]+dz[i]*t;
   return (x-px)**2+(z-pz)**2;
  };
  const scan=(from,count,candidate)=>{
   // The candidate is always one of the domain's segments, including at wraparound.
   const guard=Number.EPSILON*Math.max(128,count*32)*(1+x*x+z*z+coordinateScale);
   const bound=distanceAt(candidate)+count*EPSILON+guard;
   for(let n=0;n<count;n++){
    let i=from+n;if(i>=N)i-=N;
    const bx=x<minX[i]?minX[i]-x:x>maxX[i]?x-maxX[i]:0;
    const bz=z<minZ[i]?minZ[i]-z:z>maxZ[i]?z-maxZ[i]:0;
    if(bx*bx+bz*bz>bound){stats.discarded++;continue;}
    const t=Math.max(0,Math.min(1,((x-aX[i])*dx[i]+(z-aZ[i])*dz[i])/den[i]));
    const px=aX[i]+dx[i]*t,pz=aZ[i]+dz[i]*t,d2=(x-px)**2+(z-pz)**2,s=aS[i]+ds[i]*t;
    const near=finiteHint?Math.abs(wrap(s-hint+L/2,L)-L/2):0;
    stats.evaluated++;
    if(bestIndex<0||d2<bestD-EPSILON||(Math.abs(d2-bestD)<EPSILON&&near<bestH)){bestS=wrap(s,L);bestD=d2;bestH=near;bestIndex=i;}
   }
   if(bestIndex<0)throw new Error('Projection bounds discarded their own valid candidate');
  };
  if(finiteHint){
   const from=segmentOf(wrap(hint-65,L)),centre=segmentOf(wrap(hint,L));
   const inside=(centre-from+N)%N<windowCount;
   scan(from,windowCount,inside?centre:(from+Math.floor(windowCount/2))%N);
   if(bestD>(width*1.6)**2){stats.fallbacks++;const candidate=bestIndex;bestIndex=-1;bestD=Infinity;bestH=Infinity;scan(0,N,candidate);}
  }else scan(0,N,lastIndex);
  lastIndex=bestIndex;
  const p=track.sample(bestS),lateral=(x-p.x)*p.normal.x+(z-p.z)*p.normal.z;
  const result={...p,lateral,distance:Math.sqrt(bestD)};
  if(verify){
   const expected=native(x,z,hint),keys=Object.keys(expected);
   const same=(a,b)=>typeof a==='object'&&a!==null?Object.keys(a).every(k=>same(a[k],b[k])):Object.is(a,b);
   if(!keys.every(k=>same(expected[k],result[k])))throw new Error(`Exact projection mismatch at ${JSON.stringify({x,z,hint,result,expected})}`);
   stats.verified++;
  }
  return result;
 }
 track.project=project;
 return {stats,restore(){if(track.project===project)track.project=native;},native};
}
