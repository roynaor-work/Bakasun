import * as T from '../vendor/three.module.js';

/** Soccer character sets. `v4` is the shipped authored set (design/characters2,
 * 26K triangles, 20-bone rig). `v5` is the GPT cartoon set (design/soccer-v5, 12.5K
 * triangles, 18-bone rig, three hair looks). v5 runs from lightweight runtime
 * copies under assets/soccer-v5 (embedded clips and morph targets stripped, see
 * tools/soccer-v5-build.mjs) and falls back to v4 if anything fails to load.
 * Override for comparison: `?soccerChars=v4` or `?soccerChars=v5`. */
export const SOCCER_CHARACTER_SET_DEFAULT='v5';
export function soccerCharacterSet(search=globalThis.location?.search||''){
  const wanted=new URLSearchParams(search).get('soccerChars');
  return wanted==='v4'||wanted==='v5'?wanted:SOCCER_CHARACTER_SET_DEFAULT;
}
const asset=path=>new URL(`../assets/soccer-v5/${path}`,import.meta.url).href;
export const SOCCER_V5_FILES={outfield:['teal-quiff.glb','teal-curls.glb','teal-knot.glb'],keeper:'goalkeeper.glb'};
export const soccerV5Url=name=>asset(name);
export const SOCCER_V5_RIG_URL=new URL('../design/soccer-v5/rig.json',import.meta.url).href;

/** The v5 skeleton drops LeftShoulder/RightShoulder (arms hang from Chest, same
 * bind world transforms). The world-basis retarget is per target bone, so the
 * existing map applies with those two entries removed. */
export function soccerV5Map(map){
  return {...map,bones:map.bones.filter(b=>b.target!=='LeftShoulder'&&b.target!=='RightShoulder'),targetBoneCount:map.bones.length-2};
}

const REGION_NAMES=['preserve','skin','hair','shirt','shorts','socks','shoes','soles','gloves','accent','equipment','helmet'];
const SHIRT=[.019,.491,.418],SHORTS=[.009,.027,.067],SOCKS=[.847,.888,.723];
const outfield=(skin,hair)=>[{rgb:skin,region:'skin'},{rgb:hair,region:'hair',yMin:1.15},{rgb:SHIRT,region:'shirt',yMin:.6,yMax:1.08},{rgb:SHORTS,region:'shorts',yMin:.38,yMax:.68},{rgb:SOCKS,region:'socks',yMin:.05,yMax:.36}];
/** Baked source colours (linear RGB from the GLB) -> recolourable regions. Anything
 * not listed keeps its authored colour: boots, soles, trim, face features, gloves. */
export const SOCCER_V5_REGIONS={
  'teal-quiff.glb':outfield([.571,.262,.117],[.018,.033,.053]),
  'teal-curls.glb':outfield([.216,.080,.048],[.018,.014,.023]),
  'teal-knot.glb':outfield([.768,.418,.246],[.181,.053,.027]),
  'goalkeeper.glb':[{rgb:[.571,.262,.117],region:'skin'},{rgb:[.018,.033,.053],region:'hair',yMin:1.15},{rgb:[.799,.474,.047],region:'shirt',yMin:.6,yMax:1.08},{rgb:[.070,.054,.153],region:'shorts',yMin:.38,yMax:.68},{rgb:[.082,.063,.156],region:'socks',yMin:.05,yMax:.36}],
};
const TOLERANCE=.012;
/** Per-triangle region labels from the vertex colour of its first vertex and the
 * centroid height (bind space, metres). Draco quantises colour to 8 bits, hence
 * the tolerance. Writes the `soccerRegion` attribute the v4 path also uses. */
export function assignSoccerV5Regions(geometry,rules){
  const p=geometry.attributes.position,c=geometry.attributes.color,index=geometry.index,labels=new Uint8Array(p.count),counts={};
  for(let first=0;first<(index?.count||p.count);first+=3){
    const face=[0,1,2].map(k=>index?index.getX(first+k):first+k),y=(p.getY(face[0])+p.getY(face[1])+p.getY(face[2]))/3,v=face[0];
    let best=null,bestError=TOLERANCE;
    for(const rule of rules){
      if(rule.yMin!==undefined&&y<rule.yMin||rule.yMax!==undefined&&y>=rule.yMax)continue;
      const error=Math.max(Math.abs(c.getX(v)-rule.rgb[0]),Math.abs(c.getY(v)-rule.rgb[1]),Math.abs(c.getZ(v)-rule.rgb[2]));
      if(error<=bestError){best=rule;bestError=error;}
    }
    const region=best?best.region:'preserve',label=REGION_NAMES.indexOf(region);counts[region]=(counts[region]||0)+1;
    for(const vertex of face)labels[vertex]=label;
  }
  geometry.setAttribute('soccerRegion',new T.BufferAttribute(labels,1));
  return counts;
}
