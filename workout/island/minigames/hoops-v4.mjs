/** Island Pro Basketball — the hoops v4 assets (design/hoops-v4, 02/11): five bodies by position
 * (PG 1.78, SG 1.88, SF 1.99, PF 2.09, C 2.20 m, one 52-bone Mixamo rig) and the venue with a 3D crowd.
 * The game ships the reduced skins from tools/hoops-build-v4-lod.mjs (design/hoops/lod-v4, about 5.3K
 * triangles instead of 27-29K), keeps the v3 motion clips and the procedural hand layers, and falls back
 * to the v3 bodies and arena when anything fails to load. Pure helpers are free of three.js so node tests
 * can run them. */
export const V4_ROLES=Object.freeze(['PG','SG','SF','PF','C']);
export const v4RoleKey=pos=>V4_ROLES.includes(pos)?pos:'SF';
/** ?hoopsV4=0 forces the v3 bodies and arena (before/after captures), ?hoopsV4=1 forces v4 even when the
 * config switch is off. Anything else follows the config. */
export function v4Enabled(cfg,params){
 const q=params?.get?.('hoopsV4');
 if(q==='0')return false;if(q==='1')return !!cfg?.v4;
 return !!(cfg?.v4&&cfg.v4.enabled!==false);
}
/** The venue with the 3D crowd is heavier than v3 (static, one draw call, about 190K triangles): it is
 * shown from the quality level the config names (default 2, the broadcast level). */
export function v4ArenaEnabled(cfg,quality,params){
 if(!v4Enabled(cfg,params))return false;
 return quality>=(cfg.v4.arenaMinQuality??2)&&!!cfg.v4.arena;
}
/** Planar jersey UVs for the colour-only v4 jersey, laid out like the v3 jersey sheet: the front on the
 * left half of the sheet (x 0..0.5), the back mirrored on the right half, the v axis from the neckline down.
 * `positions` is a flat xyz array in bind space, `normals` likewise. Returns a Float32Array of uv pairs. */
export function jerseyUVs(positions,normals){
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 const count=positions.length/3;
 for(let i=0;i<count;i++){const x=positions[i*3],y=positions[i*3+1];if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
 const cx=(minX+maxX)/2,half=Math.max(1e-6,(maxX-minX)/2),height=Math.max(1e-6,maxY-minY),uv=new Float32Array(count*2);
 for(let i=0;i<count;i++){
  const front=normals[i*3+2]>=0,t=Math.max(-1,Math.min(1,(positions[i*3]-cx)/half)),v=(maxY-positions[i*3+1])/height;
  // the model faces +Z: its left side is at -X from the front, so the front sheet runs left to right and the
  // back is mirrored; the panels on the sheet edges (u 0, 0.5, 1) land on the side seams
  uv[i*2]=front?0.25+t*0.25:0.75-t*0.25;uv[i*2+1]=Math.max(0,Math.min(1,v));
 }
 return uv;
}
/** Shorts colours for a team look: the v4 shorts are colour-only (team_secondary base, team_trim piping). */
export function shortsColors(look){return {base:look.shortsBase||look.primary,trim:look.secondary||look.trim||'#ffffff'};}
