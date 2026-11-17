/** Presentation coordinates only; these shores are outside the playable channel. */
export const NAVAL_SHORES=Object.freeze([
  Object.freeze({x:-54,z:-94,rx:21,rz:14,height:5.9,phase:.8,palms:[[-7,-2,7.2],[1,-4,8.4],[8,1,6.6]]}),
  Object.freeze({x:77,z:-108,rx:38,rz:26,height:12.8,phase:2.6,palms:[[-9,-1,9.8],[5,-5,10.7],[15,0,8.6]]}),
  Object.freeze({x:-12,z:-188,rx:18,rz:13,height:7.4,phase:4.2,palms:[]}),
]);

export function navalShoreRadius(angle,phase){
  return 1+Math.sin(angle*3+phase)*.095+Math.sin(angle*5-phase*.8)*.043+Math.sin(angle*9+phase*2)*.018;
}

export function navalShoreHeight(radius,angle,shore){
  const edge=Math.max(0,1-radius),hill=Math.pow(Math.max(0,1-radius*1.16),1.45);
  return -.22+Math.min(1,edge*8)*.98+shore.height*hill*(.72+.18*Math.sin(angle*2+shore.phase)+.1*Math.cos(angle*3-shore.phase));
}
