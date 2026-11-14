// 13/11/2026 fire v23: what make-sprites.mjs renders. The street camera is shared by the street and every sprite that stands in it
// (engine, firefighter, falling targets, victory friends), so the game lays them over the background at their rendered pixel position.
// The rooms use the camera authored in the Codex room GLBs (camera_game, orthographic), the rescue friends stand on its rescue_spot.
// Sources: Codex packs under /design/ (fire-building-v1, fire-rooms-v1, fire-rescue-v1, fire-tools), island assets under /workout/island/assets/.
const A='/workout/island/assets/',V7=A+'fire-v7/models/',CITY=A+'models/city/',D='/design/';
const B=D+'fire-building-v1/',R=D+'fire-rooms-v1/',F=D+'fire-rescue-v1/',TOOLS=D+'fire-tools/';
export const STREET_CAMERA={pos:[0,3.4,19.5],look:[0,6.7,0],fov:47};
const SW=2000,SH=900,HERO='hero',DOOR_Z=3.44; // the residential building's door sits on the sidewalk line (z=0)
const street={
  prims:[
    {plane:[140,90],rot:[-Math.PI/2,0,0],pos:[0,-0.02,20],color:'#4b4f55',roughness:.95,castShadow:false},
    {box:[80,0.16,3.6],pos:[0,0.08,1.6],color:'#b9b4aa',roughness:.9,checker:{a:'#c2bdb3',b:'#b3aea4',count:16,repeat:[14,1]}},
    {box:[80,0.18,0.25],pos:[0,0.09,3.45],color:'#d8d4ca',roughness:.8},
    {box:[80,0.02,0.18],pos:[0,0.005,9.2],color:'#e9e6dc',roughness:.6,stripes:{color:'#4b4f55',count:40,dir:'v',width:.45}},
    {box:[11,19,4],pos:[-21,9.5,-26],color:'#a9b9c8',castShadow:false,stripes:{color:'#9aabbd',count:16,width:.35}},{box:[8,26,4],pos:[-6,13,-32],color:'#b0bfcd',castShadow:false,stripes:{color:'#a0b1c2',count:22,width:.35}},
    {box:[12,16,4],pos:[7,8,-30],color:'#a6b6c6',castShadow:false,stripes:{color:'#97a9bb',count:14,width:.35}},{box:[10,22,4],pos:[24,11,-28],color:'#adbccb',castShadow:false,stripes:{color:'#9dafc0',count:18,width:.35}},
  ],
  models:[
    {name:'left',url:B+'private-2f.glb',raw:true,pos:[-12.6,0.16,-3.14],ops:[{op:'hide',match:'^target_'}]},
    {name:HERO,url:B+'residential-3f.glb',raw:true,pos:[0,0.16,-DOOR_Z],ops:[{op:'hide',match:'^target_'}]},
    {name:'right',url:B+'highrise-5f.glb',raw:true,pos:[13.4,0.16,-3.64],ops:[{op:'hide',match:'^target_'}]},
    {name:'hydrant',url:V7+'hydrant.glb',pos:[-4.9,0.16,2.6],height:0.85},
    {name:'lampL',url:CITY+'54-street-lamp.glb',pos:[-6.4,0.16,2.9],height:5.2},
    {name:'lampR',url:CITY+'54-street-lamp.glb',pos:[6.8,0.16,2.9],height:5.2},
  ],
  points:{ground:[0,0.16,3.2],skyLeft:[-6.2,13.6,0],skyRight:[6.4,14.2,0]},
  lights:{sunPos:[-14,24,18],sun:2.5,hemi:1.3,shadowBox:28,sunTarget:[0,0,0]},
};
const heroNode=node=>({model:HERO,node});
const windows=Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n=>['win_'+n,heroNode('win_'+n)]));
export const TARGETS=['target_bin_green','target_bin_ash','target_crate','target_barrel','target_crate_small'];
export const SPECS=[
  {name:'street',w:SW,h:SH,camera:STREET_CAMERA,sky:['#6f9fd0','#c9dbea','#e9dccb'],fog:['#cddbe7',30,75],exposure:1.02,quality:.82,...street,
    nodes:{door:heroNode('door_main'),roof1:heroNode('fire_roof_1'),roof2:heroNode('fire_roof_2'),roof3:heroNode('fire_roof_3'),
      ...Object.fromEntries(TARGETS.map(t=>[t,{model:HERO,node:t,offset:[0,0.5,0]}]))},
    extras:Object.fromEntries(TARGETS.map(t=>[t+'_fallen',{model:HERO,node:t,state:'fallen'}])),
    boxes:{...windows,doorBox:heroNode('door_main'),hero:heroNode('building_shell')},
    overlays:[...[1,2,3,4,5,6,7,8,9].map(n=>({name:'burnt-win-'+n,model:HERO,ops:[{op:'swap',intact:`win_${n}_intact`,burnt:`win_${n}_burnt`}],undo:[{op:'unswap',intact:`win_${n}_intact`,burnt:`win_${n}_burnt`}]})),
      {name:'door-open',model:HERO,ops:[{op:'state',node:'door_main',state:'open'}],undo:[{op:'state',node:'door_main',state:'closed'}]}]},
  // the engine parked along the street, the firefighter with the hose in five aims, each target on its own (same camera)
  {name:'truck',w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,models:[{name:'truck',url:A+'models/fire-truck-512.glb',pos:[-10.6,0,4.6],rotY:Math.PI/2,width:6.6}]},
  ...[-0.55,-0.28,0,0.28,0.55].map((yaw,i)=>({name:'crew-'+i,w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,
    models:[{name:'crew',url:V7+'crew-nozzle.glb',skinned:true,pose:'hose',poseTime:0.5,pos:[-1.9,0,12.8],rotY:Math.PI+yaw,height:1.85}]})),
  ...TARGETS.map(t=>({name:t.replace('target_','target-').replace(/_/g,'-'),w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:3,quality:.92,lights:street.lights,
    models:[{name:HERO,url:B+'residential-3f.glb',raw:true,pos:[0,0.16,-DOOR_Z],ops:[{op:'only',nodes:[t]}]}]})),
  // the rescued friends wave on the street at the end
  ...[['victory-girl','girl',-0.2,[1.2,0.16,4.6]],['victory-cat','cat',-0.4,[2.3,0.16,4.9]],['victory-dog','dog',0.3,[0.2,0.16,5.0]]].map(([name,who,yaw,pos])=>({name,w:SW,h:SH,camera:STREET_CAMERA,lights:street.lights,
    models:[{name:who,url:F+who+'.glb',skinned:true,raw:true,pos,rotY:yaw,frames:true}],frames:{model:who,clip:'wave',times:[0,.33,.67,1,1.33,1.67],loop:true}})),
  {name:'victory-crew',w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,models:[{name:'crew',url:V7+'crew-nozzle.glb',skinned:true,pose:'command',poseTime:0.6,pos:[-1.4,0.16,4.4],rotY:0.35,height:1.85}]},
];

// ---- rooms: the Codex room GLBs with their own camera. Each fire spot gets a "burnt" overlay cut from a second render. ---------------
export const ROOMS={
  living:{file:'living-room.glb',spots:['sofa','television','rug'],friend:'dog',spot:[1.77,0,1.08]},
  kitchen:{file:'kitchen.glb',spots:['oil_pot','kitchen_table','power_strip'],friend:'cat',spot:[2.18,0,1.32]},
  bedroom:{file:'bedroom.glb',spots:['mattress','wardrobe','curtain_left'],friend:'girl',spot:[0.15,0,1.55]},
};
const RW=1600,RH=1200,roomLights={sunPos:[-4,8,7],sun:1.9,hemi:1.55,shadowBox:9,sunTarget:[0,0,0],sky:'#fbf6ee',ground:'#6a5a49'};
const roomCamera=room=>({node:'camera_game',model:room});
for(const [id,r] of Object.entries(ROOMS)){
  const model={name:id,url:R+r.file,raw:true,pos:[0,0,0]};
  SPECS.push({name:'room-'+id,w:RW,h:RH,camera:roomCamera(id),exposure:1.05,quality:.86,lights:roomLights,models:[model],
    nodes:{...Object.fromEntries(r.spots.map(s=>[s,{model:id,node:'fire_'+s}])),rescue:{model:id,node:'rescue_spot'},rescueTop:{model:id,node:'rescue_spot',offset:[0,0.95,0]},exit:{model:id,node:'door_exit'},
      leave:{model:id,node:'rescue_spot',offset:[0,0,3.2]},ceiling:{model:id,node:'door_exit',offset:[0,3.0,0]}},
    overlays:r.spots.map(s=>({name:'burnt-'+s,model:id,ops:[{op:'swap',intact:'intact_'+s,burnt:'burnt_'+s}],undo:[{op:'unswap',intact:'intact_'+s,burnt:'burnt_'+s}]}))});
  // the friend on the rescue spot: scared (loop), rescued (once), walk_out (once, walks toward the front and out of the room)
  for(const [clip,times,loop] of [['scared',[0,.25,.5,.75,1,1.25],true],['rescued',[0,.3,.6,.9,1.2,1.5],false],['walk_out',[0,.25,.5,.75,1,1.25,1.5],false]])
    SPECS.push({name:`friend-${id}-${clip.replace('_','')}`,w:RW,h:RH,camera:roomCamera(id),lights:roomLights,
      models:[{...model,ops:[{op:'only',nodes:[]}]},{name:r.friend,url:F+r.friend+'.glb',skinned:true,raw:true,pos:r.spot,frames:true}],frames:{model:r.friend,clip,times,loop}});
}
// tools in hand (Codex fire-tools)
const tool=(name,url,rot,height)=>({name,w:700,h:700,camera:{pos:[0,0.55,2.0],look:[0,0.3,0],fov:30},trim:true,pad:6,quality:.9,format:'png',lights:{sunPos:[-2,5,4],hemi:1.5},models:[{name,url,pos:[0,0,0],rotY:rot[1],height}]});
SPECS.push(tool('tool-extinguisher',TOOLS+'fire-extinguisher.glb',[0,-0.9,0],0.6),tool('tool-blanket',TOOLS+'fire-blanket.glb',[0.5,0.4,0],0.14),tool('tool-hose',TOOLS+'foam-hose.glb',[0,Math.PI*0.85,0],0.3));
export const PROBES=[];
