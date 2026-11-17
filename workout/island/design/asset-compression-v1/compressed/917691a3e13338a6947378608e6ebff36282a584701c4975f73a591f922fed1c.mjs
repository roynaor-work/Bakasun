// Shared layout contract. Metres, Y up, length along X, centre at the origin.
export const PITCH = Object.freeze({length:105, width:68, goalWidth:7.32, goalHeight:2.44});
export const NON_PLAYER_BUDGET = 40_000;
export const LOD_DISTANCES = Object.freeze([0, 115, 190]);
export const LEVELS = Object.freeze([
  Object.freeze({name:'LOD0', segments:96, lowerRows:16, upperRows:12, rowStep:1, cardStep:1, cardWidth:2.35}),
  Object.freeze({name:'LOD1', segments:64, lowerRows:8, upperRows:6, rowStep:2, cardStep:1.55, cardWidth:3.05}),
  Object.freeze({name:'LOD2', segments:32, lowerRows:4, upperRows:3, rowStep:4, cardStep:2.4, cardWidth:4.25}),
]);
export const TIERS = Object.freeze([
  Object.freeze({hx:60, hz:41, radius:12, y:1.4, rows:16, run:1.04, rise:.53}),
  Object.freeze({hx:79, hz:60, radius:31, y:12.6, rows:12, run:1.13, rise:.73}),
]);

/** Equal parameter divisions on 4 straight sides + 4 round corners; closed. */
export function bowlPoint(t, hx, hz, r) {
  const q=((t%1)+1)%1*8, s=Math.floor(q), u=q-s, a=u*Math.PI/2;
  switch(s) {
    case 0:return [-hx+r+2*(hx-r)*u,hz];
    case 1:return [hx-r+r*Math.sin(a),hz-r+r*Math.cos(a)];
    case 2:return [hx,hz-r-2*(hz-r)*u];
    case 3:return [hx-r+r*Math.cos(a),-hz+r-r*Math.sin(a)];
    case 4:return [hx-r-2*(hx-r)*u,-hz];
    case 5:return [-hx+r-r*Math.sin(a),-hz+r-r*Math.cos(a)];
    case 6:return [-hx,-hz+r+2*(hz-r)*u];
    default:return [-hx+r-r*Math.cos(a),hz-r+r*Math.sin(a)];
  }
}

export function bowlPerimeter(hx,hz,r){return 4*(hx+hz-2*r)+2*Math.PI*r;}

/** Convert actual arc distance to the shape parameter. Corner arcs and long
 * straight sides must not receive the same number of spectator cards. */
export function bowlParameterAtArcFraction(f,hx,hz,r){
  const corner=Math.PI*r/2,lengths=[2*(hx-r),corner,2*(hz-r),corner,2*(hx-r),corner,2*(hz-r),corner];
  let distance=((f%1)+1)%1*bowlPerimeter(hx,hz,r);
  for(let i=0;i<8;i++){
    if(distance<=lengths[i]||i===7)return (i+distance/lengths[i])/8;
    distance-=lengths[i];
  }
}

export function bowlArcPoint(f,hx,hz,r){return bowlPoint(bowlParameterAtArcFraction(f,hx,hz,r),hx,hz,r);}

/** Place cards on the same polygon used by the GLB, including coarse corners. */
export function bowlPolygonPoint(t,hx,hz,r,segments){
  const n=((t%1)+1)%1*segments,index=Math.floor(n),blend=n-index;
  const a=bowlPoint(index/segments,hx,hz,r),b=bowlPoint((index+1)/segments,hx,hz,r);
  return [a[0]+(b[0]-a[0])*blend,a[1]+(b[1]-a[1])*blend];
}

export function seeded(seed) {
  let n=seed>>>0;
  return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
}

/** Generate transforms, never triangle meshes for people. Shared by audit. */
export function crowdPlacements(level) {
  const random=seeded(88134), result=[];
  for(let ti=0;ti<TIERS.length;ti++) {
    const tier=TIERS[ti];
    for(let row=0;row<tier.rows;row+=level.rowStep) {
      // The back row of a collapsed group sits at the coarser tread height.
      // Anchoring its cards to the group's first row would bury the spectators.
      const shownRow=Math.min(row+level.rowStep-1,tier.rows-1);
      const offset=(shownRow+.62)*tier.run;
      const hx=tier.hx+offset,hz=tier.hz+offset,r=tier.radius+offset;
      const perimeter=bowlPerimeter(hx,hz,r);
      const count=Math.floor(perimeter/(2.45*level.cardStep));
      for(let col=0;col<count;col++) {
        const f=(col+.5+(shownRow%2)*.23)/count,t=bowlParameterAtArcFraction(f,hx,hz,r);
        // Eight accessible radial aisles; omitted cards never leave a hole in
        // the bank, because the continuous steps and stair ribbons stay below.
        const phase=(((f-.0123)*16)%1+1)%1;
        const aisleDistance=Math.min(phase,1-phase)*perimeter/16;
        if(aisleDistance<.8)continue;
        const [x,z]=bowlPolygonPoint(t,hx,hz,r,level.segments),[nx,nz]=bowlPolygonPoint(t+.0001,hx,hz,r,level.segments);
        const jitter=(random()-.5)*.24;
        result.push({x:x+jitter,y:tier.y+(shownRow+.82)*tier.rise,z:z+jitter,
          yaw:Math.atan2(-(nz-z),nx-x),variant:Math.floor(random()*16),phase:random()*Math.PI*2,
          width:level.cardWidth*(.94+random()*.12),height:1.55+random()*.16,
          section:Math.floor(t*8),tier:ti,row:shownRow});
      }
    }
  }
  return result;
}
