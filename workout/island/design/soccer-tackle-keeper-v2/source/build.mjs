// SPDX-License-Identifier: CC0-1.0
// Rebuild only files owned by this additive asset package.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fieldClips} from './field.mjs';
import {animationGLB} from './glb-writer.mjs';
import {bones,fk,rotate,add,sub,mul,slerp} from './rig.mjs';
import {loadSkinProbe} from './measure.mjs';
const root=new URL('../',import.meta.url),runtime=new URL('runtime/',root);
const rig=JSON.parse(await readFile(new URL('rig.json',import.meta.url)));
const keeper=process.argv.includes('--field')?[]:await (await import('./keeper.mjs')).keeperClips();
const clips=[...await fieldClips(),...keeper];
const skins={field:await loadSkinProbe(),keeper:await loadSkinProbe('runtime/keeper-open.glb'),keeperFist:await loadSkinProbe('runtime/keeper.glb')};
await mkdir(new URL('clips/',runtime),{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const catalog={schemaVersion:1,id:'soccer-tackle-keeper-v2',license:'CC0-1.0',fps:30,units:'meters',axes:{up:'+Y',forward:'+Z',anatomicalLeft:'+X'},rotationSpace:'parent-local',quaternionOrder:'xyzw',rootMotion:false,
  model:'reference/idle_relaxed.glb',keeperModel:'keeper-open.glb',idleReference:{id:'idle_relaxed',asset:'reference/idle_relaxed.glb'},runReference:{id:'run',asset:'reference/run.glb'},
  transitions:{idleBlendSeconds:.20,runBlendSeconds:.30,clearanceLiftMeters:.065,curve:'C1 Hermite; preserve currently displayed pose and its velocity',bridgeModule:'player.mjs',seams:'action to next recovery joins directly; never blend a standing pose into a grounded recovery'},
  interaction:{contactSource:'slide_tackle/contact',tacklerReadySeconds:1.6,nonFoulPreferredReaction:'stumble_light',optionalSoftFall:{activeMotionSeconds:.7,getupSeconds:.4,minimumVictimReadyAfterTacklerSeconds:.1,holdPolicy:'Hold the side contact pose before getup_soft until max(fallEnd, tacklerReady + .1 - getupDuration), then play getup_soft. Example: fallEnd=.8, holdUntil=1.3, victimReady=1.7, tacklerReady=1.6. This is game scheduling, not extra baked recovery motion.'},events:'presentation-only; game collision/foul/ball ownership remains authoritative'},clips:[]};
for(const clip of clips){
  clip.fps=30;clip.loop=false;clip.rootMotion=false;
  if(clip.id==='punch')clip.model='keeper.glb';
  if(clip.id==='getup_keeper_left')clip.preceding='dive_left';
  if(clip.id==='getup_keeper_right')clip.preceding='dive_right';
  // A single quiet interval at either edge gives the serialized LINEAR tracks
  // genuinely matching velocities, not just an analytic zero tangent pre-bake.
  if(clip.frames.length>3){
    clip.frames[1]={...structuredClone(clip.frames[0]),time:1/30};
    clip.frames[clip.frames.length-2]={...structuredClone(clip.frames.at(-1)),time:(clip.frames.length-2)/30};
  }
  // Native skinned shoe/glove/clothing surfaces, not joint-centre proxies.
  const skin=skins[clip.id==='punch'?'keeperFist':clip.role];
  for(const p of clip.frames){const y=skin.probe(p).minimumY;if(y<.001)p.hips[1]+=.001-y;}
  // Bound the undershoot of slerp between native samples. Raise both adjacent
  // samples conservatively; no hidden runtime floor adjustment is required.
  for(let pass=0;pass<3;pass++)for(let i=1;i<clip.frames.length;i++){
    const a=clip.frames[i-1],b=clip.frames[i];let extra=0;
    for(let j=1;j<8;j++){
      const u=j/8,p={hips:a.hips.map((v,k)=>v+(b.hips[k]-v)*u),rotations:Object.fromEntries(bones.map(n=>[n.name,slerp(a.rotations[n.name],b.rotations[n.name],u)]))};
      extra=Math.max(extra,.0005-skin.probe(p).minimumY);
    }
    if(extra>0){a.hips[1]+=extra;b.hips[1]+=extra;}
  }
  clip.surfaceClearance='Baked against all vertices of the declared model, with eight substeps per native interval. No runtime correction.';
  if(clip.frames.length!==Math.round(clip.duration*30)+1)throw new Error(`${clip.id}: not 30Hz`);
  for(const [i,p]of clip.frames.entries()){
    if(Math.abs(p.time-i/30)>1e-9)throw new Error(`${clip.id}: time ${i}`);
    if(bones.some(b=>!p.rotations[b.name]))throw new Error(`${clip.id}: missing bone`);
    if(p.rotations.Root.some((x,j)=>Math.abs(x-[0,0,0,1][j])>1e-12))throw new Error(`${clip.id}: root rotation`);
    for(const [n,q]of Object.entries(p.rotations)){
      const norm=Math.hypot(...q);p.rotations[n]=q.map(x=>x/norm);
      if(i&&q.reduce((sum,x,j)=>sum+x*clip.frames[i-1].rotations[n][j],0)<0)p.rotations[n]=p.rotations[n].map(x=>-x);
    }
  }
  // The demonstration ball is an independent short trajectory. It crosses the
  // effector at the declared instant; it is never parented to a glove or foot.
  const contact=(clip.events??[]).find(e=>e.type==='contact'&&e.bone);
  if(contact){
    const frame=clip.frames.reduce((a,f)=>Math.abs(f.time-contact.time)<Math.abs(a.time-contact.time)?f:a);
    contact.local??=/Foot/.test(contact.bone)?[0,-.035,.12]:[0,-.06,.03];
    const effector=fk(frame)[contact.bone],surface=add(effector.position,rotate(effector.rotation,contact.local)),radius=.11;
    // A low foot save must meet a ball resting above the turf, not a sphere
    // whose centre follows the boot marker below its own radius.
    const normalY=Math.min(.99,Math.max(0,(radius+.001-surface[1])/radius));
    const normal=[0,normalY,Math.sqrt(1-normalY*normalY)],center=add(surface,mul(normal,radius));
    const at=Math.max(0,Math.min(clip.duration,contact.time));
    const incoming=t=>add(center,[0,0,(at-t)*2.4]);
    let samples=[{time:0,position:incoming(0)},{time:at,position:center}];
    if(clip.id.startsWith('catch_')){
      // Bake a separate held-ball track: gather between the two gloves, then
      // carry it down to the chest through the side landing. The preview ball
      // remains a scene object, never a child of either hand.
      for(const f of clip.frames.filter(f=>f.time>at+1e-8)){
        const world=fk(f),left=add(world.LeftHand.position,rotate(world.LeftHand.rotation,[0,-.045,.065])),right=add(world.RightHand.position,rotate(world.RightHand.rotation,[0,-.045,.065]));
        const held=add(left.map((v,i)=>(v+right[i])/2),rotate(world.Chest.rotation,[0,0,.055]));
        const u=Math.min(1,(f.time-at)/.12),w=u*u*(3-2*u);
        samples.push({time:f.time,position:center.map((v,i)=>v+(held[i]-v)*w)});
      }
    }else{
      const sign=clip.id.includes('left')?1:-1,velocity=clip.id==='punch'?[0,2.8,2.4]:clip.id==='slide_tackle'?[1.5,.15,1.8]:[sign*1.4,.35,2.0];
      samples.push({time:clip.duration,position:add(center,mul(velocity,clip.duration-at))});
    }
    clip.ball={radius,samples,note:clip.id.startsWith('catch_')?'Authored presentation trajectory: independent approach, then baked two-glove gather/chest carry. No hand parenting and no game physics.':'Independent piecewise demonstration trajectory with an outgoing deflection at contact; not game physics and not an attached ball.'};
    clip.ballContacts=[{bone:contact.bone,start:at,end:at,local:contact.local}];
  }
  const poses=clip.frames.map(f=>({t:f.time,translations:{Hips:f.hips},rotations:f.rotations}));
  const {frames,...entry}=clip;
  const asset=`clips/${clip.id}.glb`,bytes=animationGLB({rig,poses,name:clip.id,extras:{version:catalog.id,...entry}});
  await writeFile(new URL(asset,runtime),bytes);
  catalog.clips.push({...entry,asset,frameCount:frames.length,bytes:bytes.length,sha256:digest(bytes),compression:'none',checkHingeDirection:true,locomotion:false,referenceTravelKnown:false});
}
await writeFile(new URL('motions.json',runtime),JSON.stringify({schemaVersion:1,license:'CC0-1.0',fps:30,rootMotion:false,skeleton:rig,clips})+'\n');
await writeFile(new URL('catalog.json',runtime),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({clips:clips.length,frames:clips.reduce((s,c)=>s+c.frames.length,0),durations:Object.fromEntries(clips.map(c=>[c.id,c.duration]))}));
