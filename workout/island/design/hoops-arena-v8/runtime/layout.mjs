/** Metres, +Y up, X is the court's long axis. Original deterministic bowl. */
export const COURT = Object.freeze({length:28.65,width:15.24,rimHeight:3.048,rimX:12.75});
export const LOD_DISTANCES = Object.freeze([0,38,60]);
export const LOD_LABELS = Object.freeze(['קרוב','ביניים','רחוק']);
export const ASSETS = Object.freeze(['arena-lod0.glb','arena-lod1.glb','arena-lod2.glb']);
export const TRIANGLE_LIMIT = 35_000;
export const PALETTE = Object.freeze({teal:0x408e91,amber:0xe3ad65,ink:0x111b27,ivory:0xf2e6ce});
/** Shared layout is evaluated, never delivered as an uncompressed coordinate dump. */
export function seatingLayout(level=0) {
  const out=[];
  for(let tier=0;tier<2;tier++) {
    const rows=tier?5:7;
    for(let row=0;row<rows;row++) {
      const depth=(tier?6.1:0)+row*.88;
      const y=(tier?4.9:.38)+row*.51;
      const x=17.25+depth,z=10.65+depth;
      const step=level===2?2:1;
      // Aisles divide blocks; always keep the first row for a coherent silhouette.
      for(const side of [-1,1]) {
        for(let col=-23;col<=23;col+=step) {
          if(Math.abs(col)%12===0)continue;
          out.push({x:col*.68,y,z:side*z,angle:side>0?Math.PI:0,row,tier,id:out.length});
        }
        for(let col=-12;col<=12;col+=step) {
          if(Math.abs(col)%8===0)continue;
          out.push({x:side*x,y,z:col*.71,angle:side>0?-Math.PI/2:Math.PI/2,row,tier,id:out.length});
        }
      }
      // Curved corners use uniform angular spacing; no empty concrete wedges.
      for(const sx of [-1,1])for(const sz of [-1,1]) {
        const r=depth+.90,full=Math.max(2,Math.floor(r*1.9));
        const count=level===2?Math.max(1,Math.ceil(full/3)):level===1?Math.max(2,Math.ceil(full*.65)):full;
        for(let k=0;k<count;k++) {
          const a=(k+.5)/count*Math.PI/2;
          out.push({x:sx*(16.65+r*Math.cos(a)),y,z:sz*(10.05+r*Math.sin(a)),angle:Math.atan2(-sx*Math.cos(a),-sz*Math.sin(a)),row,tier,id:out.length});
        }
      }
    }
  }
  return out;
}
export function populationCount(level=0) { return seatingLayout(level).length; }
