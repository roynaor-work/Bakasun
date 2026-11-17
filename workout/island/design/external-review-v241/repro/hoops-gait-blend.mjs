/** Read-only diagnostic: actual createAvatarTall crossfade phase for v13 locomotion. Run from repo root. */
import fs from 'node:fs';
import * as T from '../../../vendor/three.module.js';
import {CANON_REST} from '../../../minigames/athlete-body.mjs';
import {decodeTallPack,buildTallClips,createAvatarTall} from '../../../minigames/hoops-tall.mjs';
import {prepareV13,hoopsV13Gaits} from '../../../minigames/hoops-motion-v13.mjs';
const island=new URL('../../../',import.meta.url);
const p=prepareV13(JSON.parse(fs.readFileSync(new URL('assets/hoops-v241/motion/motion-v13.json',island))),decodeTallPack);
const q=decodeTallPack(JSON.parse(fs.readFileSync(new URL('assets/hoops-tall/motion-v12.json',island))));
const clips=buildTallClips(p.pack,'canonical'),names=new Map();
for(const [name,data]of p.byGame){const c=clips.get(data.v13).clone();c.name=name;names.set(name,c);q.clips[name]=data;}
function avatar(){
 const root=new T.Group(),bones={};
 for(const b of CANON_REST){const n=new T.Bone();n.name=b.name;n.position.fromArray(b.restTranslationMeters);bones[b.name]=n;(b.parent?bones[b.parent]:root).add(n);}
 const body={root,mats:[],palms:{l:bones.LeftHand,r:bones.RightHand,lWrist:bones.LeftHand,rWrist:bones.RightHand},applyKit(){},dispose(){},setLod(){}};
 return createAvatarTall({bodies:{},pack:q,clipSets:{guard:names},posProfile:{PG:'guard'},baseHeights:{guard:178},bodyFactory:()=>body,gaits13:{guard:hoopsV13Gaits(p.pack,1,q.clips)}},{id:'review',number:1,pos:'PG'},null);
}
const av=avatar(),dt=1/60,p1={vx:0,vz:1.65,face:0,hasBall:false,dribbling:false};
for(let i=0;i<120;i++)av.pose(p1,{},dt);
const trace=[];
for(let i=0;i<16;i++){
 av.pose({...p1,vz:3.2},{},dt);
 trace.push({frame:i+1,selected:av.motionState,actions:Object.entries(av.actions).map(([name,a])=>({name,phase:+(a.time/a.getClip().duration).toFixed(4),weight:+a.getEffectiveWeight().toFixed(3)}))});
}
console.log(JSON.stringify(trace,null,2));
