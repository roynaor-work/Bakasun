// 13/11/2026 fire v23: what make-sprites.mjs renders. One street camera is shared by the street background and every sprite that
// stands in the street (truck, firefighter), so the game can lay them over the background at their rendered pixel position.
const A='/workout/island/assets/',V7=A+'fire-v7/models/',CITY=A+'models/city/',TOOLS='/fire-tools/';
export const STREET_CAMERA={pos:[0,2.1,16.5],look:[0,5.05,0],fov:44};
const SW=2000,SH=900;
// The street: facades on z=0 facing +z, sidewalk to z=3.4, road beyond. Distant blocks give the skyline.
const street={
  prims:[
    {plane:[120,80],rot:[-Math.PI/2,0,0],pos:[0,-0.02,20],color:'#4b4f55',roughness:.95,castShadow:false},
    {box:[60,0.16,3.6],pos:[0,0.08,1.6],color:'#b9b4aa',roughness:.9,checker:{a:'#bdb8ae',b:'#b2ad a3'.replace(' ',''),count:16,repeat:[10,1]}},
    {box:[60,0.18,0.25],pos:[0,0.09,3.45],color:'#d8d4ca',roughness:.8},
    {box:[60,0.02,0.18],pos:[0,0.005,9.2],color:'#e9e6dc',roughness:.6,stripes:{color:'#4b4f55',count:30,dir:'v',width:.45,repeat:[1,1]}},
    // distant skyline (hazy)
    {box:[9,17,4],pos:[-19,8.5,-26],color:'#a9b9c8',castShadow:false,stripes:{color:'#9aabbd',count:14,width:.35}},{box:[7,24,4],pos:[-8,12,-30],color:'#b0bfcd',castShadow:false,stripes:{color:'#a0b1c2',count:20,width:.35}},{box:[10,14,4],pos:[4,7,-28],color:'#a6b6c6',castShadow:false,stripes:{color:'#97a9bb',count:12,width:.35}},
    {box:[8,20,4],pos:[14,10,-27],color:'#adbccb',castShadow:false,stripes:{color:'#9dafc0',count:16,width:.35}},{box:[9,12,4],pos:[24,6,-25],color:'#a5b5c5',castShadow:false,stripes:{color:'#96a8ba',count:10,width:.35}},
  ],
  models:[
    {name:'workshop',url:V7+'workshop-burning.glb',pos:[-13.2,0.16,-0.4]},
    {name:'row',url:V7+'row-house-burning.glb',pos:[-6.55,0.16,-0.3]},
    {name:'apartment',url:V7+'apartment-burning.glb',pos:[0,0.16,0],windows:{step:0.05,minArea:0.3}},
    {name:'store',url:V7+'corner-store-burning.glb',pos:[6.95,0.16,-0.35]},
    {name:'warehouse',url:V7+'warehouse-burning.glb',pos:[14.5,0.16,-0.6]},
    {name:'hydrant',url:V7+'hydrant.glb',pos:[3.9,0.16,2.6],height:0.85},
    {name:'lampL',url:CITY+'54-street-lamp.glb',pos:[-10,0.16,2.9],height:5.2},
    {name:'lampR',url:CITY+'54-street-lamp.glb',pos:[10.6,0.16,2.9],height:5.2},
    {name:'tree',url:CITY+'42-round-leafy-tree.glb',pos:[-17.5,0.16,2.2],height:5.5},
  ],
  points:{door:[0,1.25,3.0],roofLeft:[-2.6,9.5,0.3],roofRight:[2.4,9.5,0.3],roofCenter:[0,9.55,0.2],ground:[0,0.16,3.2],truckFront:[-4.6,0,8.2],truckBack:[-12.4,0,8.2],crewFeet:[-1.6,0,13.4],
    ledge3a:[-2.02,6.5,2.35],ledge3b:[0,6.5,2.35],ledge3c:[2.02,6.5,2.35],ledge2a:[-2.02,4.46,2.35],ledge2c:[2.02,4.46,2.35],storeRoof:[6.95,5.6,0],rowRoof:[-6.55,6.7,0],warehouseRoof:[14.5,5.4,-0.5]},
  lights:{sunPos:[-14,22,16],sun:2.6,hemi:1.25,shadowBox:24,sunTarget:[0,0,2]},
};
export const SPECS=[
  {name:'street',w:SW,h:SH,camera:STREET_CAMERA,sky:['#6f9fd0','#c9dbea','#e9dccb'],fog:['#cddbe7',24,60],exposure:1.02,quality:.82,...street},
  // the fire engine parked along the street (side view), same camera: the game draws it at its rendered place
  {name:'truck',w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,format:'webp',quality:.9,lights:street.lights,
    prims:[],models:[{name:'truck',url:A+'models/fire-truck-512.glb',pos:[-9.4,0,4.6],rotY:Math.PI/2,width:6.6}],points:{nose:[-4.7,1.2,8.2]}},
  ...[-0.55,-0.28,0,0.28,0.55].map((yaw,i)=>({name:'crew-'+i,w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,
    prims:[],models:[{name:'crew',url:V7+'crew-nozzle.glb',skinned:true,pose:'hose',poseTime:0.5,pos:[-1.9,0,11.0],rotY:Math.PI+yaw,height:1.85}],points:{}})),
];

// ---- rooms: simple box dioramas (interim art until the Codex interior pack lands; same file names = drop-in swap) ----------------
export const ROOM_CAMERA={pos:[0,1.95,4.9],look:[0,1.18,-1.4],fov:44};
const RW=1600,RH=740;
const wall=(color)=>({color,roughness:.92});
function roomShell({floor,back,left,right,trim='#f2ede4',door=true,window:win}){
  const p=[
    {plane:[10,7],rot:[-Math.PI/2,0,0],pos:[0,0,0.2],...(floor.planks?{planks:floor.planks,color:'#ffffff'}:{color:floor.color}),roughness:.85,castShadow:false},
    {box:[10,3.2,0.2],pos:[0,1.6,-3.1],...wall(back)},
    {box:[0.2,3.2,7],pos:[-4.6,1.6,0.3],...wall(left)},
    {box:[0.2,3.2,7],pos:[4.6,1.6,0.3],...wall(right)},
    {box:[10,0.12,0.06],pos:[0,0.06,-2.97],color:trim},{box:[0.06,0.12,7],pos:[-4.47,0.06,0.3],color:trim},{box:[0.06,0.12,7],pos:[4.47,0.06,0.3],color:trim},
    {box:[10,0.08,0.12],pos:[0,3.16,-2.95],color:trim},
    {plane:[10,7],rot:[Math.PI/2,0,0],pos:[0,3.2,0.3],color:'#f4f1ea',roughness:1,castShadow:false},
  ];
  if(door)p.push({box:[1.25,2.3,0.06],pos:[3.25,1.15,-2.96],color:'#2b2622',roughness:.9},{box:[1.45,0.12,0.1],pos:[3.25,2.36,-2.94],color:trim},{box:[0.1,2.36,0.1],pos:[2.58,1.18,-2.94],color:trim},{box:[0.1,2.36,0.1],pos:[3.92,1.18,-2.94],color:trim});
  if(win){const [x,y,w,h]=win;p.push({box:[w,h,0.05],pos:[x,y,-2.97],color:'#9fd0ee',emissive:'#bfe6ff',emissiveIntensity:.55,roughness:.2},{box:[w+0.2,0.1,0.14],pos:[x,y-h/2-0.04,-2.92],color:trim},{box:[w+0.2,0.08,0.1],pos:[x,y+h/2+0.04,-2.94],color:trim},{box:[0.07,h,0.08],pos:[x,y,-2.93],color:trim},{box:[w,0.06,0.08],pos:[x,y,-2.93],color:trim});}
  return p;
}
const curtains=(x,y,w,h,color)=>[{box:[0.42,h+0.5,0.08],pos:[x-w/2-0.08,y-0.1,-2.82],color,roughness:.95,stripes:{color:'#00000014',count:9,dir:'v',width:.5}},{box:[0.42,h+0.5,0.08],pos:[x+w/2+0.08,y-0.1,-2.82],color,roughness:.95,stripes:{color:'#00000014',count:9,dir:'v',width:.5}},{cyl:[0.025,0.025,w+1.2,8],rot:[0,0,Math.PI/2],pos:[x,y+h/2+0.22,-2.8],color:'#6b5a48'}];
const living={
  prims:[
    ...roomShell({floor:{planks:{colors:['#b98a5e','#b2845a','#c09265','#ae8056'],count:10,repeat:[3,2]}},back:'#e8dcc8',left:'#dccfba',right:'#d9ccb6',window:[-1.3,1.75,1.9,1.25]}),
    ...curtains(-1.3,1.75,1.9,1.25,'#c4554a'),
    {box:[3.6,0.02,2.4],pos:[0.1,0.012,-0.3],color:'#7c8fa3',roughness:1,stripes:{color:'#6e8196',count:6,dir:'h',width:.25}},
    // sofa on the left wall, facing right
    {box:[1.0,0.45,2.4],pos:[-3.75,0.3,-0.6],color:'#3f6f8f'},{box:[0.3,0.62,2.4],pos:[-4.12,0.78,-0.6],color:'#3a6685'},{box:[1.0,0.62,0.28],pos:[-3.75,0.5,-1.92],color:'#3a6685'},{box:[1.0,0.62,0.28],pos:[-3.75,0.5,0.72],color:'#3a6685'},
    {box:[0.8,0.16,1.0],pos:[-3.65,0.6,-1.1],color:'#4a7fa1'},{box:[0.8,0.16,1.0],pos:[-3.65,0.6,-0.05],color:'#4a7fa1'},{box:[0.18,0.36,0.42],pos:[-3.95,0.85,-1.35],color:'#e8b04a'},
    // coffee table
    {box:[1.1,0.08,0.7],pos:[-1.4,0.46,-0.4],color:'#8a5a35'},...[[-1.88,-0.68],[-0.92,-0.68],[-1.88,-0.12],[-0.92,-0.12]].map(([x,z])=>({box:[0.07,0.42,0.07],pos:[x,0.21,z],color:'#70482a'})),
    {cyl:[0.09,0.07,0.14,16],pos:[-1.2,0.57,-0.45],color:'#e6e1d6'},
    // TV stand + TV on the right wall
    {box:[0.55,0.5,2.0],pos:[3.75,0.25,-1.5],color:'#5c4636'},{box:[0.08,0.95,1.6],pos:[3.87,1.15,-1.5],color:'#15171a',roughness:.35},{box:[0.02,0.82,1.46],pos:[3.82,1.15,-1.5],color:'#26313b',emissive:'#3b5d7a',emissiveIntensity:.35,roughness:.2},
    {box:[0.22,0.06,0.5],pos:[3.62,0.53,-0.65],color:'#f0f0ea'},{box:[0.16,0.1,0.1],pos:[3.62,0.6,-0.8],color:'#222'},
    // floor lamp, plant, picture
    {cyl:[0.18,0.22,0.04,20],pos:[-3.9,0.02,-2.55],color:'#333'},{cyl:[0.02,0.02,1.6,8],pos:[-3.9,0.82,-2.55],color:'#444'},{cone:[0.28,0.34,20],pos:[-3.9,1.72,-2.55],color:'#f3e3c0',emissive:'#ffd98a',emissiveIntensity:.25},
    {cyl:[0.22,0.17,0.38,16],pos:[2.0,0.19,-2.6],color:'#c96f4a'},{sphere:[0.42,14,10],pos:[2.0,0.72,-2.6],color:'#4f8a4b'},{sphere:[0.3,12,8],pos:[2.2,1.05,-2.55],color:'#5a9a55'},
    {box:[1.0,0.7,0.04],pos:[0.9,2.0,-2.98],color:'#f6f1e6'},{box:[0.86,0.56,0.02],pos:[0.9,2.0,-2.96],color:'#7aa6c9'},
  ],
  points:{sofa:[-3.8,0.9,-1.25],curtain:[-2.33,1.6,-2.7],tv:[3.78,1.2,-1.5],kid:[-2.55,0,0.85],kidTop:[-2.55,1.15,0.85],exitTop:[3.25,1.15,-2.6],door:[3.25,1.05,-2.9],exit:[3.25,0,-2.6],floor:[0,0,1.5],ceiling:[0,3.1,-2.9]},
};
const kitchen={
  prims:[
    ...roomShell({floor:{color:'#ffffff',planks:null},back:'#dfe9e4',left:'#d3e0da',right:'#cfdcd5',window:[1.4,1.95,1.5,0.95]}),
    {plane:[10,7],rot:[-Math.PI/2,0,0],pos:[0,0.003,0.2],color:'#ffffff',checker:{a:'#e9e5dc',b:'#d9d3c7',count:16,repeat:[3,2]},castShadow:false},
    {box:[10,0.9,0.02],pos:[0,1.35,-2.98],color:'#f4f6f3',checker:{a:'#f4f6f3',b:'#dfe7e3',count:20,repeat:[6,1]}},
    // counters along the back wall
    {box:[6.4,0.9,0.75],pos:[-0.5,0.45,-2.6],color:'#f3efe7'},{box:[6.5,0.06,0.8],pos:[-0.5,0.93,-2.58],color:'#3d3d40',roughness:.4},
    ...[-3.2,-2.2,-1.2,-0.2,0.8,1.8].map(x=>({box:[0.9,0.7,0.02],pos:[x+0.05,0.48,-2.215],color:'#e9e3d7'})),...[-3.2,-2.2,-1.2,-0.2,0.8,1.8].map(x=>({box:[0.25,0.03,0.03],pos:[x+0.05,0.75,-2.2],color:'#9a9a9a',metalness:.6})),
    // stove with oven
    {box:[0.95,0.04,0.7],pos:[-1.6,0.97,-2.6],color:'#1d1e21',roughness:.3},...[[-1.83,-2.45],[-1.37,-2.45],[-1.83,-2.75],[-1.37,-2.75]].map(([x,z])=>({cyl:[0.12,0.12,0.01,20],pos:[x,0.995,z],color:'#3a3a3e'})),
    {box:[0.85,0.6,0.02],pos:[-1.6,0.5,-2.21],color:'#2b2c30',roughness:.3},{box:[0.6,0.03,0.05],pos:[-1.6,0.84,-2.19],color:'#c8c8c8',metalness:.7},
    // the oil pot on the front-left burner
    {cyl:[0.2,0.18,0.24,24],pos:[-1.83,1.12,-2.45],color:'#8d8f94',metalness:.6,roughness:.35},{cyl:[0.21,0.21,0.02,24],pos:[-1.83,1.24,-2.45],color:'#a6a8ad',metalness:.6},{box:[0.3,0.03,0.05],pos:[-1.52,1.2,-2.45],color:'#222'},
    // sink + faucet
    {box:[0.8,0.02,0.5],pos:[1.4,0.965,-2.6],color:'#b9bdc2',metalness:.5,roughness:.3},{cyl:[0.02,0.02,0.32,8],pos:[1.4,1.12,-2.82],color:'#c9cdd2',metalness:.8},{box:[0.04,0.03,0.2],pos:[1.4,1.27,-2.73],color:'#c9cdd2',metalness:.8},
    // upper cabinets
    {box:[2.8,0.75,0.4],pos:[-2.0,2.45,-2.85],color:'#e9e3d7'},{box:[1.2,0.75,0.4],pos:[3.0,2.45,-2.85],color:'#e9e3d7'},
    // fridge on the right
    {box:[0.85,2.0,0.75],pos:[3.75,1.0,-2.55],color:'#e8ecef',roughness:.35},{box:[0.03,0.5,0.04],pos:[3.42,1.35,-2.15],color:'#9aa0a6',metalness:.6},{box:[0.03,0.3,0.04],pos:[3.42,0.55,-2.15],color:'#9aa0a6',metalness:.6},{box:[0.86,0.015,0.02],pos:[3.75,1.15,-2.17],color:'#c5cbd0'},
    // towel on the oven handle
    {box:[0.3,0.42,0.02],pos:[0.62,0.7,-2.2],color:'#d9534f',roughness:1,stripes:{color:'#f2f2f2',count:4,dir:'h',width:.3}},{box:[0.34,0.04,0.06],pos:[0.62,0.92,-2.2],color:'#b9b9b9',metalness:.5},
    // table + chairs (front-left) and trash bin
    {box:[1.5,0.07,0.9],pos:[-2.4,0.76,0.2],color:'#c58a52'},...[[-3.08,-0.18],[-1.72,-0.18],[-3.08,0.58],[-1.72,0.58]].map(([x,z])=>({box:[0.07,0.74,0.07],pos:[x,0.37,z],color:'#a8713f'})),
    {box:[0.5,0.06,0.5],pos:[-2.4,0.47,-0.65],color:'#b07a45'},{box:[0.5,0.55,0.05],pos:[-2.4,0.76,-0.9],color:'#b07a45'},...[[-2.62,-0.43],[-2.18,-0.43],[-2.62,-0.87],[-2.18,-0.87]].map(([x,z])=>({box:[0.05,0.45,0.05],pos:[x,0.22,z],color:'#9a6638'})),
    {cyl:[0.24,0.2,0.62,20],pos:[-0.55,0.31,-1.15],color:'#7f8a8f',metalness:.4,roughness:.5},{cyl:[0.25,0.25,0.04,20],pos:[-0.55,0.64,-1.15],color:'#6c767b',metalness:.4},
  ],
  points:{petTop:[-2.4,0.45,0.25],exitTop:[3.25,0.45,-2.6],pot:[-1.83,1.3,-2.45],towel:[0.62,0.72,-2.12],bin:[-0.55,0.75,-1.15],pet:[-2.4,0,0.25],door:[3.25,1.05,-2.9],exit:[3.25,0,-2.6],floor:[0,0,1.5],ceiling:[0,3.1,-2.9]},
  lights:{sunPos:[3,6,4],sun:1.8,hemi:1.5,sky:'#fbfaf5',points:[{color:'#ffe9c9',intensity:6,pos:[0,2.9,0],distance:12,decay:1.4}]},
};
const bedroom={
  prims:[
    ...roomShell({floor:{planks:{colors:['#c9a27a','#c29b73','#d0a982','#bd966f'],count:10,repeat:[3,2]}},back:'#d8d4ee',left:'#cdc8e4',right:'#cac5e1',window:[-1.9,1.8,1.5,1.15]}),
    ...curtains(-1.9,1.8,1.5,1.15,'#6f7fc6'),
    {cyl:[1.15,1.15,0.02,32],pos:[0.6,0.011,0.4],color:'#e9c46a',roughness:1},
    // bed against the back wall: frame, mattress, pillow, blanket
    {box:[1.9,0.32,2.3],pos:[1.0,0.24,-1.85],color:'#8c6239'},{box:[1.98,1.05,0.12],pos:[1.0,0.62,-2.98],color:'#7b5532'},{box:[1.8,0.24,2.2],pos:[1.0,0.52,-1.85],color:'#f4f1ea'},
    {box:[1.82,0.08,1.55],pos:[1.0,0.68,-1.5],color:'#4f7bd1',stripes:{color:'#5f8be0',count:8,dir:'h',width:.5}},{box:[1.3,0.16,0.45],pos:[1.0,0.72,-2.65],color:'#fafafa'},
    // under-bed shadow gap (dark) so the child can peek out
    {box:[1.7,0.1,2.1],pos:[1.0,0.05,-1.85],color:'#1c1a24',roughness:1},
    // wardrobe on the left wall
    {box:[0.75,2.3,1.6],pos:[-4.15,1.15,-1.4],color:'#a77d55'},{box:[0.02,2.1,0.02],pos:[-3.77,1.15,-1.4],color:'#6b4a2c'},{box:[0.04,0.25,0.04],pos:[-3.75,1.2,-1.5],color:'#d8c08a',metalness:.6},{box:[0.04,0.25,0.04],pos:[-3.75,1.2,-1.3],color:'#d8c08a',metalness:.6},
    // nightstand + lamp
    {box:[0.55,0.55,0.5],pos:[2.45,0.28,-2.7],color:'#9b7350'},{cyl:[0.08,0.1,0.25,12],pos:[2.45,0.68,-2.7],color:'#444'},{cone:[0.2,0.24,16],pos:[2.45,0.92,-2.7],color:'#fbe7b0',emissive:'#ffd98a',emissiveIntensity:.35},
    // toy box and a ball
    {box:[0.8,0.45,0.5],pos:[-1.4,0.23,0.9],color:'#e76f51'},{box:[0.84,0.06,0.54],pos:[-1.4,0.47,0.9],color:'#f4a261'},{sphere:[0.18,16,12],pos:[-0.6,0.18,1.3],color:'#2a9d8f'},
  ],
  points:{bed:[1.0,0.85,-1.6],wardrobe:[-4.0,1.35,-1.3],curtain:[-2.85,1.6,-2.75],kid:[2.45,0,-0.55],kidTop:[2.45,1.15,-0.55],exitTop:[3.25,1.15,-2.6],door:[3.25,1.05,-2.9],exit:[3.25,0,-2.6],floor:[0,0,1.5],ceiling:[0,3.1,-2.9],underBed:[1.0,0.1,-1.0]},
  lights:{sunPos:[-5,6,3],sun:1.7,hemi:1.4,sky:'#f1efff',points:[{color:'#fff0d8',intensity:5,pos:[0,2.9,0.5],distance:12,decay:1.4}]},
};
const roomLights={sunPos:[-4,7,5],sun:1.9,hemi:1.45,shadowBox:9,sunTarget:[0,0,-1],sky:'#fbf6ee',ground:'#6a5a49',points:[{color:'#ffeccc',intensity:6,pos:[0,2.9,0.5],distance:12,decay:1.4}]};
SPECS.push(
  {name:'room-living',w:RW,h:RH,camera:ROOM_CAMERA,bg:'#222',exposure:1.05,quality:.84,lights:roomLights,...living},
  {name:'room-kitchen',w:RW,h:RH,camera:ROOM_CAMERA,bg:'#222',exposure:1.05,quality:.84,...kitchen,lights:{...roomLights,...kitchen.lights}},
  {name:'room-bedroom',w:RW,h:RH,camera:ROOM_CAMERA,bg:'#222',exposure:1.05,quality:.84,...bedroom,lights:{...roomLights,...bedroom.lights}},
);
// probes for picking poses (not shipped): kid squats/stand/run at several times
export const PROBES=[1.8,2.1,2.4,2.7,3.0,3.3].flatMap(t=>[['squats',t],['lunges',t],['glute-bridge',t]]).map(([pose,t])=>({name:`probe-kid-${pose}-${t}`,w:300,h:400,bg:'#c8d2dc',camera:{pos:[0,0.75,3.2],look:[0,0.55,0],fov:30},trim:false,lights:{sunPos:[-3,6,5]},prims:[],models:[{name:'kid',url:A+'kid-full.glb',skinned:true,pose,poseTime:t,pos:[0,0,0],rotY:-0.5,height:1.15}],points:{}}));

// characters and tools (interim: the island kid, a Kenney CC0 pet face copied by the game data, the Codex fire tools)
const kidAt=(name,camera,pos,rotY,pose,t,lights)=>({name,w:RW,h:RH,camera,trim:true,pad:4,quality:.9,lights,prims:[],models:[{name:'kid',url:A+'kid-full.glb',skinned:true,pose,poseTime:t,pos,rotY,height:1.15}],points:{}});
for(const [room,pos,face,run] of [['living',[-2.55,0,0.85],0.55,1.75],['bedroom',[2.45,0,-0.55],-0.6,2.6]]){
  SPECS.push(kidAt('kid-'+room,ROOM_CAMERA,pos,face,'lunges',2.4,roomLights));
  [0,0.18,0.36,0.54].forEach((t,i)=>SPECS.push(kidAt(`kidrun-${room}-${i}`,ROOM_CAMERA,pos,run,'run',t,roomLights)));
}
const tool=(name,url,rot,height)=>({name,w:700,h:700,camera:{pos:[0,0.55,2.0],look:[0,0.3,0],fov:30},trim:true,pad:6,quality:.9,format:'png',lights:{sunPos:[-2,5,4],hemi:1.5},prims:[],models:[{name,url,pos:[0,0,0],rotY:rot[1],rotX:rot[0],rotZ:rot[2],height}],points:{}});
SPECS.push(
  tool('tool-extinguisher',TOOLS+'fire-extinguisher.glb',[0,-0.9,0],0.6),
  tool('tool-blanket',TOOLS+'fire-blanket.glb',[0.5,0.4,0],0.14),
  tool('tool-hose',TOOLS+'foam-hose.glb',[0,Math.PI*0.85,0],0.3),
  {name:'victory-kid',w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,prims:[],models:[{name:'kid',url:A+'kid-full.glb',skinned:true,pose:'stand',poseTime:0.2,pos:[1.5,0.16,4.4],rotY:-0.25,height:1.2}],points:{}},
  {name:'victory-crew',w:SW,h:SH,camera:STREET_CAMERA,trim:true,pad:4,quality:.9,lights:street.lights,prims:[],models:[{name:'crew',url:V7+'crew-nozzle.glb',skinned:true,pose:'command',poseTime:0.6,pos:[-1.2,0.16,4.6],rotY:0.35,height:1.85}],points:{}},
);
