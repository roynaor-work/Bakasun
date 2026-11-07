// SPDX-License-Identifier: CC0-1.0
// Original CPU reconstruction of the existing road/verge/terrain triangulation.
import {buildScaledTrack} from './analysis.mjs';

const orient=(a,b,c)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
const box=t=>({x0:Math.min(...t.map(p=>p[0])),x1:Math.max(...t.map(p=>p[0])),z0:Math.min(...t.map(p=>p[2])),z1:Math.max(...t.map(p=>p[2]))});
const overlap=(a,b)=>a.x0<=b.x1&&a.x1>=b.x0&&a.z0<=b.z1&&a.z1>=b.z0;
function intersectionPolygon(subject,clip){
  let out=subject.map(p=>[...p]);const sign=Math.sign(orient(...clip));
  for(let edge=0;edge<3;edge++){
    const a=clip[edge],b=clip[(edge+1)%3],input=out;out=[];
    if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const c=input[i],d=input[(i+1)%input.length],fc=orient(a,b,c)*sign,fd=orient(a,b,d)*sign;
      if(fc>=-1e-9)out.push(c);
      if((fc>0&&fd<0)||(fc<0&&fd>0)){const t=fc/(fc-fd);out.push(c.map((v,k)=>v+(d[k]-v)*t));}
    }
  }
  return out;
}
function yAt(triangle,p){
  const [a,b,c]=triangle,denom=orient(a,b,c);
  const wa=orient(b,c,p)/denom,wb=orient(c,a,p)/denom;
  return wa*a[1]+wb*b[1]+(1-wa-wb)*c[1];
}
function polygonArea(p){let area=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];area+=p[i][0]*q[2]-q[0]*p[i][2];}return Math.abs(area)/2;}

/** Reproduce racing-view.mjs at its exact ceil(length/2) ribbon resolution.
 * projectedCover counts harmless grass below road separately from visible intrusion.
 */
export function checkRibbons(definition,{tier=0,terrain=true}={}){
  const track=buildScaledTrack(definition,{tier,reverse:tier===3});
  const steps=Math.ceil(track.length/2),width=track.width;
  const vergeHeight=(y,d)=>Math.max(-1.2,y-.07-Math.max(0,d-width/2-2.1)*.18);
  const samples=Array.from({length:steps+1},(_,i)=>track.sample(i/steps*track.length));
  function ribbon(left,right,berm=false){
    const rows=samples.map(p=>[left,right].map(l=>[p.x+p.normal.x*l,berm?vergeHeight(p.y,Math.abs(l)):p.y+.02,p.z+p.normal.z*l]));
    const triangles=[];for(let i=0;i<steps;i++)triangles.push([rows[i][0],rows[i+1][0],rows[i][1]],[rows[i][1],rows[i+1][0],rows[i+1][1]]);
    return triangles;
  }
  const road=ribbon(-width/2,width/2),grass=[...ribbon(-width/2-25,-width/2-2.1,true),...ribbon(width/2+2.1,width/2+25,true)];
  const roadBoxes=road.map(box),cells=new Map(),cellSize=16;
  function cellKeys(b){const out=[];for(let x=Math.floor(b.x0/cellSize);x<=Math.floor(b.x1/cellSize);x++)for(let z=Math.floor(b.z0/cellSize);z<=Math.floor(b.z1/cellSize);z++)out.push(`${x},${z}`);return out;}
  roadBoxes.forEach((b,i)=>{for(const k of cellKeys(b)){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);}});
  function check(triangles){
    let projectedCoverPairs=0,visibleIntrusionPairs=0,maxIntrusion=-Infinity;
    for(const t of triangles){
      const b=box(t),candidates=new Set(cellKeys(b).flatMap(k=>cells.get(k)||[]));
      for(const i of candidates){
        if(!overlap(b,roadBoxes[i]))continue;
        const poly=intersectionPolygon(t,road[i]);if(poly.length<3||polygonArea(poly)<1e-7)continue;
        projectedCoverPairs++;
        const penetration=Math.max(...poly.map(p=>yAt(t,p)-yAt(road[i],p)));
        maxIntrusion=Math.max(maxIntrusion,penetration);
        if(penetration>1e-5)visibleIntrusionPairs++;
      }
    }
    return {projectedCoverPairs,visibleIntrusionPairs,maxIntrusion:Number.isFinite(maxIntrusion)?maxIntrusion:null};
  }
  const result={roadTriangles:road.length,grassTriangles:grass.length,foldedRoadTriangles:road.filter(t=>orient(...t)>=0).length,foldedGrassTriangles:grass.filter(t=>orient(...t)>=0).length,grass:check(grass)};
  if(terrain){
    const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs)-50,maxX=Math.max(...xs)+50,minZ=Math.min(...zs)-50,maxZ=Math.max(...zs)+50;
    const rows=Array.from({length:65},(_,j)=>Array.from({length:65},(_,i)=>{
      const x=minX+(maxX-minX)*i/64,z=minZ+(maxZ-minZ)*j/64,p=track.project(x,z);
      return[x,vergeHeight(p.y,p.distance)-.08,z];
    }));
    const triangles=[];for(let j=0;j<64;j++)for(let i=0;i<64;i++)triangles.push([rows[j][i],rows[j+1][i],rows[j][i+1]],[rows[j][i+1],rows[j+1][i],rows[j+1][i+1]]);
    result.terrain=check(triangles);
  }
  result.passed=result.foldedRoadTriangles===0&&result.grass.visibleIntrusionPairs===0&&(!result.terrain||result.terrain.visibleIntrusionPairs===0);
  return result;
}
