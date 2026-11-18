// SPDX-License-Identifier: CC0-1.0
// Original analytical layout construction and validation, created for this package.
import {createTrack} from '../../minigames/racing-tracks.mjs';

export const SCALE = 1.65;
export const wrap = (s, length) => ((s % length) + length) % length;
export const angle = a => wrap(a + Math.PI, 2 * Math.PI) - Math.PI;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dist = (a, b) => Math.hypot(...sub(a, b));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Tangent circular fillets. Radii are never silently shrunk to fit an edge. */
export function fillet(vertices, radii) {
  const arcs = vertices.map((v, i) => {
    const prev = vertices[wrap(i - 1, vertices.length)], next = vertices[(i + 1) % vertices.length];
    const u = sub(v, prev).map(x => x / dist(v, prev)), w = sub(next, v).map(x => x / dist(next, v));
    const turn = angle(Math.atan2(w[1], w[0]) - Math.atan2(u[1], u[0]));
    const radius = radii[i], trim = radius * Math.tan(Math.abs(turn) / 2), sign = Math.sign(turn);
    const entry = [v[0] - u[0] * trim, v[1] - u[1] * trim];
    const exit = [v[0] + w[0] * trim, v[1] + w[1] * trim];
    const center = [entry[0] - u[1] * sign * radius, entry[1] + u[0] * sign * radius];
    return {entry, exit, center, radius, turn, trim, start: Math.atan2(entry[1] - center[1], entry[0] - center[0])};
  });
  for (let i = 0; i < arcs.length; i++) {
    if (arcs[i].trim + arcs[(i + 1) % arcs.length].trim > dist(vertices[i], vertices[(i + 1) % vertices.length]) - 4)
      throw new Error(`Fillets consume edge ${i}`);
  }
  return arcs;
}

export function makeLayout(spec) {
  let factor = 1, arcs;
  // Target the actual game's closed Catmull path, rather than just polygon perimeter.
  let result;
  for (let pass = 0; pass < 4; pass++) {
    const vertices = spec.vertices.map(p => p.map(v => v * factor));
    arcs = fillet(vertices, spec.radii); // preserve braking radii during length tuning
    const primitives = [], tags = [];
    // Start halfway along the last-to-first connector, with a tangent grid seam.
    const grid = mix(arcs.at(-1).exit, arcs[0].entry, .5);
    const line = (a, b) => primitives.push({length:dist(a,b),at:t=>mix(a,b,t)});
    line(grid, arcs[0].entry);
    arcs.forEach((a, i) => {
      primitives.push({length:Math.abs(a.turn)*a.radius,at:f=>{const t=a.start+a.turn*f;return [a.center[0]+a.radius*Math.cos(t),a.center[1]+a.radius*Math.sin(t)];}});
      const next = i === arcs.length - 1 ? grid : arcs[i + 1].entry;
      tags.push(a);
      line(a.exit, next);
    });
    const perimeter=primitives.reduce((sum,p)=>sum+p.length,0),count=Math.ceil(perimeter/4),step=perimeter/count;
    const path=[],cumulative=[];let primitive=0,offset=0;
    for(let i=0;i<count;i++){
      const s=i*step;
      while(s>=offset+primitives[primitive].length&&primitive<primitives.length-1){offset+=primitives[primitive++].length;}
      path.push(primitives[primitive].at((s-offset)/primitives[primitive].length));cumulative.push(s);
    }
    const points = path.map(([x, z], i) => {
      const f = cumulative[i] / perimeter;
      return [x - grid[0], spec.height + spec.elevation * (Math.sin(f * Math.PI * 2) + .25 * Math.sin(f * Math.PI * 4)), z - grid[1]].map(v=>+v.toFixed(6));
    });
    const definition = {id:spec.id,name:spec.name,theme:spec.theme,width:spec.width,landmark:spec.landmark,samples:8,points};
    const track = createTrack(definition), length = track.length;
    const locationS = q => track.project(q[0]-grid[0],q[1]-grid[1]).s;
    const corners = tags.map((a, i) => {
      const entryS=locationS(a.entry),exitS=locationS(a.exit);
      return {id:`T${i + 1}`,label:`פנייה ${i + 1}`,type:Math.abs(a.turn)>2.35?'hairpin':a.radius<=22&&Math.abs(a.turn)>=Math.PI/6?'sharp':'bend',hand:a.turn>0?'right':'left',s:wrap(entryS+wrap(exitS-entryS,length)/2,length),entryS,exitS,radius:a.radius,angleDeg:Math.abs(a.turn)*180/Math.PI};
    });
    const chicanes = [];
    for (let i=0;i<corners.length;i++) {
      const a=corners[i], b=corners[(i+1)%corners.length], gap=wrap(b.entryS-a.exitS,length);
      if (a.hand!==b.hand && gap<85 && a.angleDeg>20 && b.angleDeg>20) chicanes.push({corners:[a.id,b.id],gap});
    }
    const measuredStraights=arcs.map((a,i)=>({startS:locationS(a.exit),endS:locationS(arcs[(i+1)%arcs.length].entry),length:dist(a.exit,arcs[(i+1)%arcs.length].entry)}));
    result={definition,layout:{id:spec.id,targetLength:spec.length,length,corners,chicanes,straights:measuredStraights,vertices,radii:spec.radii}};
    factor *= spec.length / length;
  }
  return result;
}

function pointSegment(p, a, b) {
  const ab=sub(b,a), ap=sub(p,a), t=Math.max(0,Math.min(1,(ap[0]*ab[0]+ap[1]*ab[1])/(ab[0]**2+ab[1]**2)));
  return dist(p,mix(a,b,t));
}
export function segmentsIntersect(a,b,c,d) {
  const ab=sub(b,a), cd=sub(d,c), ac=sub(c,a), denominator=cross(ab,cd);
  if(Math.abs(denominator)<1e-10) return Math.abs(cross(ac,ab))<1e-8 && Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<1e-8;
  const t=cross(ac,cd)/denominator, u=cross(ac,ab)/denominator;
  return t>=0&&t<=1&&u>=0&&u<=1;
}
export function segmentDistance(a,b,c,d) {
  if(segmentsIntersect(a,b,c,d))return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}

/** All rendered spline segments, not only control vertices. No crossing exclusions.
 * Clearance excludes only the contiguous road neighbourhood (arc gap < 4 widths).
 * A literal dense i/i+2 test is impossible: those segments are a few cm apart.
 */
export function validateGeometry(definition) {
  const track=createTrack(definition), p=track.points, n=p.length;
  let minClearance=Infinity, crossings=0, maxGrade=0, maxCurvature=0, invertedRoadTriangles=0;
  const width=track.width, requiredClearance=3*width, localArcExclusion=4*width;
  const bounds=p.map((a,i)=>{const b=p[(i+1)%n];return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};});
  for(let i=0;i<n;i++) {
    const a=p[i],b=p[(i+1)%n], end=i===n-1?track.length:b.s;
    maxGrade=Math.max(maxGrade,Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z));
    for(let j=i+2;j<n;j++) {
      if(i===0&&j===n-1)continue;
      const c=p[j],d=p[(j+1)%n],bb=bounds[i],bc=bounds[j];
      const forward=c.s-end, backward=track.length-(j===n-1?track.length:d.s)+a.s;
      const nonlocal=Math.min(forward,backward)>=localArcExclusion;
      const boxGap=Math.hypot(Math.max(0,bb.minX-bc.maxX,bc.minX-bb.maxX),Math.max(0,bb.minZ-bc.maxZ,bc.minZ-bb.maxZ));
      if(boxGap>0&&!nonlocal)continue;
      if(nonlocal&&boxGap>=minClearance)continue;
      const distance=segmentDistance([a.x,a.z],[b.x,b.z],[c.x,c.z],[d.x,d.z]);
      if(distance<1e-8)crossings++;
      if(nonlocal)minClearance=Math.min(minClearance,distance);
    }
  }
  const steps=Math.ceil(track.length/1);
  for(let i=0;i<steps;i++) {
    const a=track.sample(i/steps*track.length), b=track.sample((i+1)/steps*track.length);
    maxCurvature=Math.max(maxCurvature,Math.abs(angle(b.heading-a.heading))/(track.length/steps));
    const left=q=>[q.x-q.normal.x*width/2,q.z-q.normal.z*width/2],right=q=>[q.x+q.normal.x*width/2,q.z+q.normal.z*width/2];
    const l=left(a),r=right(a),ln=left(b),rn=right(b);
    if(cross(sub(ln,l),sub(r,l))>=0||cross(sub(ln,r),sub(rn,r))>=0)invertedRoadTriangles++;
  }
  return {length:track.length,width,closed:dist([track.sample(0).x,track.sample(0).z],[track.sample(track.length).x,track.sample(track.length).z])<1e-8,crossings,minClearance,requiredClearance,localArcExclusion,maxGrade,maxCurvature,invertedRoadTriangles,passed:crossings===0&&minClearance>=requiredClearance&&maxGrade<=.08&&invertedRoadTriangles===0};
}
