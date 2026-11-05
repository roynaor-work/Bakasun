/** Front-ray/barycentric UV witnesses on actual decoded canonical-rest triangles. */
export function frontSurfaceUVSamples(positions, uv, indices, points, {minimumZ=.035,minimumNormalZ=.4,originZ=.3}={}){
  const results=[];
  for(const [x,y] of points){
    let hit=null;
    for(let t=0;t<indices.length;t+=3){
      const ia=indices[t],ib=indices[t+1],ic=indices[t+2];
      const ax=positions[ia*3],ay=positions[ia*3+1],az=positions[ia*3+2];
      const bx=positions[ib*3],by=positions[ib*3+1],bz=positions[ib*3+2];
      const cx=positions[ic*3],cy=positions[ic*3+1],cz=positions[ic*3+2];
      if(x<Math.min(ax,bx,cx)-1e-10||x>Math.max(ax,bx,cx)+1e-10||y<Math.min(ay,by,cy)-1e-10||y>Math.max(ay,by,cy)+1e-10)continue;
      const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(denominator)<1e-14)continue;
      const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/denominator;
      const b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/denominator,c=1-a-b;
      if(Math.min(a,b,c)<-1e-8)continue;
      const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const length=Math.hypot(nx,ny,nz),normalZ=nz/length,z=a*az+b*bz+c*cz;
      if(!Number.isFinite(normalZ)||normalZ<=minimumNormalZ||z<=minimumZ||z>originZ||hit&&z<=hit.position[2])continue;
      hit={triangle:t/3,vertexIndices:[ia,ib,ic],barycentric:[a,b,c],position:[x,y,z],normalZ,uv:[a*uv[ia*2]+b*uv[ib*2]+c*uv[ic*2],a*uv[ia*2+1]+b*uv[ib*2+1]+c*uv[ic*2+1]]};
    }
    results.push({origin:[x,y,originZ],direction:[0,0,-1],hit});
  }
  return results;
}

export function uvInRectangle(uv,region,tolerance=.001){
  return uv[0]>=region[0]-tolerance&&uv[1]>=region[1]-tolerance&&uv[0]<=region[2]+tolerance&&uv[1]<=region[3]+tolerance;
}
