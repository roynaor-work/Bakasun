// racing-v24 pit crew at the player's box (Codex package design/racing-pit-v1, CC0; assets/racing-pit-v1): four wheel changers, the jack operator and the light
// controller in the player's team colour (their _TEAM_MASK vertices), a stack of new tyres on the garage side and the exit light (red while the car stands, green
// to go). Loaded in the background after the race starts, only in a race with stops (3 laps and more), not on a weak device; ?racingPitCrew=0 never loads it.
// The package's clips run faster than its 21.8 s review sequence so they fit the game's 2-3 s stop (a real stop is that fast too):
//   car in the lane, 30 m from the box  -> rush_in (1 s), the crew steps up to the car (its baked 0.96 m is moved to the actor at the end, as the package asks)
//   stop                                 -> the jack operator jack_up
//   change (2 s, the tap)                -> remove_wheel, then mount_wheel, at the wheels; the light stays red
//   done                                 -> jack_down, thumbs_up, signal_release, the light turns green; step_back; idle again when the car has gone
import {pitLane} from './racing-v24.mjs?v=island-v2-20261107-24';
const read=search=>{try{return new URLSearchParams(search??globalThis.location?.search??'');}catch{return new URLSearchParams('');}};
export const pitCrewEnabled=search=>read(search).get('racingPitCrew')!=='0';
// the player's formula car: wheels at x +-0.85, front z 1.25, rear z -1.31 (racing-view formula.glb). The crew faces the car; +X is the side of the fast lane.
export const CREW=Object.freeze([
 {id:'wheel_front_left',x:2,z:1.25,face:-Math.PI/2,rush:true},{id:'wheel_rear_left',x:2,z:-1.31,face:-Math.PI/2,rush:true},
 {id:'wheel_front_right',x:-2,z:1.25,face:Math.PI/2,rush:true},{id:'wheel_rear_right',x:-2,z:-1.31,face:Math.PI/2,rush:true},
 {id:'jack_operator',x:0,z:3.15,face:Math.PI,rush:true},{id:'light_controller',x:2.7,z:3.4,face:Math.PI*.8,rush:false}
]);
const RUSH=.96,BACK=.64;
export async function loadPitCrew({T,GLTFLoader,track,lane=pitLane(track),boxIndex=0,count=12,team='#d93228',keep=x=>x,base=new URL('../assets/racing-pit-v1/models/',import.meta.url),version='island-v2-20261107-24'}){
 const loader=new GLTFLoader(),load=name=>loader.loadAsync(new URL(`${name}.glb?v=${version}`,base).href);
 const [crewGltf,stack,light]=await Promise.all([Promise.all(CREW.map(c=>load(c.id))),load('tire_stack'),load('pit_light_exit')]);
 const root=new T.Group();root.name='racing-pit-crew';const s=lane.boxS(boxIndex,count),q=track.sample(s);
 root.position.set(q.x+q.normal.x*lane.boxLat,q.y,q.z+q.normal.z*lane.boxLat);root.rotation.y=q.heading;root.visible=false;
 const teamLinear=new T.Color(team).convertSRGBToLinear(),own=o=>{o.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;keep(n.geometry);for(const m of [].concat(n.material))keep(m);}});return o;};
 const actors=crewGltf.map((g,i)=>{const spec=CREW[i],obj=g.scene;own(obj);
  // the team colour on the suit and the helmet stripe (COLOR_0 is linear RGB; _TEAM_MASK marks those vertices)
  obj.traverse(n=>{if(!n.isMesh)return;const mask=n.geometry.attributes._team_mask||n.geometry.attributes._TEAM_MASK,col=n.geometry.attributes.color;if(!mask||!col)return;for(let k=0;k<col.count;k++)if(mask.getX(k)>.5)col.setXYZ(k,teamLinear.r,teamLinear.g,teamLinear.b);col.needsUpdate=true;});
  const holder=new T.Group();holder.add(obj);root.add(holder);const mixer=new T.AnimationMixer(obj),clips=new Map(g.animations.map(a=>[a.name,a]));
  const home=new T.Vector3(spec.x,0,spec.z),fwd=new T.Vector3(Math.sin(spec.face),0,Math.cos(spec.face));holder.rotation.y=spec.face;
  return {spec,holder,obj,mixer,clips,home,fwd,state:'out',action:null};});
 const stackObj=own(stack.scene);stackObj.position.set(-3.4,0,-.4);stackObj.rotation.y=Math.PI/2;root.add(stackObj);
 const lightObj=own(light.scene);lightObj.position.set(3.3,0,4.6);lightObj.rotation.y=Math.PI;root.add(lightObj);
 const lamps={};lightObj.traverse(n=>{if(n.isMesh&&/Lamp(Red|Amber|Green)/.test(n.material?.name||'')){const m=keep(n.material.clone());n.material=m;lamps[/Red/.test(m.name)?'red':/Amber/.test(m.name)?'amber':'green']=m;}});
 const lamp=on=>{for(const [k,m] of Object.entries(lamps)){const lit=k===on;if(m.emissive){m.emissive.set(k==='red'?'#ff2a1a':k==='amber'?'#ffb020':'#2cff6a');m.emissiveIntensity=lit?2.4:.05;}}};lamp('red');
 const place=(a,offset)=>{a.holder.position.copy(a.home).addScaledVector(a.fwd,offset);};
 const play=(a,name,{speed=1,loop=false,fade=.12}={})=>{const clip=a.clips.get(name);if(!clip)return null;const act=a.mixer.clipAction(clip);act.reset();act.setLoop(loop?T.LoopRepeat:T.LoopOnce,loop?Infinity:1);act.clampWhenFinished=!loop;act.timeScale=speed;
  if(a.action&&a.action!==act)act.crossFadeFrom(a.action,fade,false);act.play();a.action=act;return act;};
 const out=a=>{place(a,a.spec.rush?-RUSH:0);play(a,'idle_wait',{loop:true,fade:0});a.state='out';};
 actors.forEach(out);
 let phase='',doneAt=-1,seen=false;
 return {root,actors,
  /** every frame: follow the player's stop (state.player.pit), advance the clips */
  update(state,dt){
   const p=state.player,P=p?.pit,ph=P?.phase||'';
   const toBox=P?P.box-p.routeS:Infinity,near=P&&(ph==='lane'&&toBox<30||['stop','change','leave'].includes(ph));
   root.visible=near||(doneAt>=0&&state.time-doneAt<4);if(!root.visible){if(seen){actors.forEach(out);lamp('red');seen=false;doneAt=-1;}phase='';return;}seen=true;
   if(dt>0)for(const a of actors)a.mixer.update(dt);   // the clips run only while the crew is on show
   for(const a of actors){
    // the rush in ends: its baked 0.96 m goes to the actor, then a standing clip
    if(a.state==='rushing'&&a.action&&!a.action.isRunning()){place(a,0);play(a,'idle_wait',{loop:true,fade:.05});a.state='in';}
    if(a.state==='back'&&a.action&&!a.action.isRunning()){place(a,a.spec.rush?-BACK:0);play(a,'idle_wait',{loop:true,fade:.05});a.state='rest';}
   }
   if(ph===phase&&!(ph==='change'&&P.t>(P.dur||2)/2&&!P.mounted))return;
   if(ph==='lane'&&phase!=='lane'){for(const a of actors)if(a.spec.rush&&a.state==='out'){play(a,'rush_in',{speed:2.8});a.state='rushing';}}
   if(ph==='stop'&&phase!=='stop'){const j=actors.find(a=>a.spec.id==='jack_operator');if(j){if(j.state==='rushing')place(j,0);play(j,'jack_up',{speed:4});j.state='in';}lamp('red');}
   if(ph==='change'){const d=(P.dur||2)/2,half=P.t>d;
    if(phase!=='change'){for(const a of actors)if(/^wheel_/.test(a.spec.id)){if(a.state==='rushing')place(a,0);play(a,'remove_wheel',{speed:3.2/d});a.state='in';}P.mounted=false;}
    else if(half&&!P.mounted){for(const a of actors)if(/^wheel_/.test(a.spec.id))play(a,'mount_wheel',{speed:3.2/d});P.mounted=true;}}
   if(ph==='leave'&&phase!=='leave'){doneAt=state.time;lamp('green');
    for(const a of actors){if(a.spec.id==='jack_operator')play(a,'jack_down',{speed:4});else if(a.spec.id==='light_controller')play(a,'signal_release',{speed:2});else{play(a,'step_back',{speed:2.4});a.state='back';}}}
   phase=ph;
  },
  metrics:()=>({actors:actors.length,visible:root.visible,phase,lamp:Object.entries(lamps).find(([,m])=>m.emissiveIntensity>1)?.[0]||null}),
  dispose(){root.removeFromParent();for(const a of actors)a.mixer.stopAllAction();}
 };
}
