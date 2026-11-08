// SPDX-License-Identifier: CC0-1.0
// Original geometry and glTF 2.0 writer. No textures, decoders, or dependencies.
// The neutral preview athlete is a visualization fixture, not a real person.

const TAU = Math.PI * 2;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
const empty = () => ({positions: [], normals: [], indices: [], joints: [], weights: []});

function vertex(g, p, n, joint = null) {
  g.positions.push(...p); g.normals.push(...unit(n));
  if (joint !== null) { g.joints.push(joint,0,0,0); g.weights.push(1,0,0,0); }
  return g.positions.length / 3 - 1;
}

function ellipsoid(g, center, radii, joint, segments=16, rings=10) {
  const base = g.positions.length / 3;
  for (let j=0; j<=rings; j++) {
    const p = Math.PI * j / rings;
    for (let i=0; i<=segments; i++) {
      const t = TAU * i / segments;
      const v = [Math.sin(p)*Math.cos(t), Math.cos(p), Math.sin(p)*Math.sin(t)];
      vertex(g, add(center, v.map((n,k)=>n*radii[k])), v.map((n,k)=>n/radii[k]), joint);
    }
  }
  for (let j=0; j<rings; j++) for (let i=0; i<segments; i++) {
    const a=base+j*(segments+1)+i, b=a+segments+1;
    if(j>0) g.indices.push(a,a+1,b);
    if(j<rings-1) g.indices.push(a+1,b+1,b);
  }
}

function tube(g, a, b, r0, r1, joint=null, segments=12, caps=true) {
  const axis=unit(sub(b,a));
  const u=unit(cross(Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],axis));
  const v=cross(axis,u), len=Math.hypot(...sub(b,a)), base=g.positions.length/3;
  for(let row=0;row<2;row++) for(let i=0;i<=segments;i++) {
    const t=TAU*i/segments, radial=add(mul(u,Math.cos(t)),mul(v,Math.sin(t)));
    const normal=unit(add(radial,mul(axis,(r0-r1)/len)));
    vertex(g,add(row?b:a,mul(radial,row?r1:r0)),normal,joint);
  }
  for(let i=0;i<segments;i++) {
    const s=base+i,t=s+segments+1; g.indices.push(s,s+1,t,s+1,t+1,t);
  }
  if(caps) for(let row=0;row<2;row++) {
    const c=vertex(g,row?b:a,mul(axis,row?1:-1),joint);
    const starts=[];
    for(let i=0;i<=segments;i++) {
      const t=TAU*i/segments,radial=add(mul(u,Math.cos(t)),mul(v,Math.sin(t)));
      starts.push(vertex(g,add(row?b:a,mul(radial,row?r1:r0)),mul(axis,row?1:-1),joint));
    }
    for(let i=0;i<segments;i++) row?g.indices.push(c,starts[i],starts[i+1]):g.indices.push(c,starts[i+1],starts[i]);
  }
}

function box(g, center, size, joint=null) {
  const [x,y,z]=size.map(v=>v/2);
  const faces=[
    [[1,0,0],[[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]]],
    [[-1,0,0],[[-x,-y,z],[-x,y,z],[-x,y,-z],[-x,-y,-z]]],
    [[0,1,0],[[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]]],
    [[0,-1,0],[[-x,-y,z],[-x,-y,-z],[x,-y,-z],[x,-y,z]]],
    [[0,0,1],[[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]],
    [[0,0,-1],[[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]]],
  ];
  for(const [n,points] of faces) {
    const k=g.positions.length/3;
    for(const p of points) vertex(g,add(center,p),n,joint);
    g.indices.push(k,k+1,k+2,k,k+2,k+3);
  }
}

function ring(g, rx, ry, thickness, segments=40, sides=8) {
  for(let i=0;i<=segments;i++) {
    const a=TAU*i/segments, radial=unit([Math.cos(a)/rx,Math.sin(a)/ry,0]);
    const c=[rx*Math.cos(a),ry*Math.sin(a),0];
    for(let j=0;j<=sides;j++) {
      const b=TAU*j/sides,n=add(mul(radial,Math.cos(b)),[0,0,Math.sin(b)]);
      vertex(g,add(c,mul(n,thickness)),n);
    }
  }
  for(let i=0;i<segments;i++) for(let j=0;j<sides;j++) {
    const a=i*(sides+1)+j,b=a+sides+1;
    g.indices.push(a,b,a+1,a+1,b,b+1);
  }
}

function restPositions(bones) {
  const result=[];
  for(const b of bones) {
    const pi=b.parent===null?-1:bones.findIndex(v=>v.name===b.parent);
    result.push(add(pi<0?[0,0,0]:result[pi],b.restTranslationMeters));
  }
  return result;
}

function shirtTorso(g, bones, rest) {
  const hips=bones.findIndex(b=>b.name==='Hips'), spine=bones.findIndex(b=>b.name==='Spine'), chest=bones.findIndex(b=>b.name==='Chest');
  const y0=rest[hips][1], ys=rest[spine][1], yc=rest[chest][1];
  const profile=[[y0+.02,.14,.09],[y0+.07,.148,.094],[ys-.04,.153,.097],[ys+.035,.163,.10],[yc-.06,.179,.105],[yc+.015,.187,.105],[yc+.055,.168,.092],[yc+.078,.060,.052]];
  const segments=24,base=g.positions.length/3;
  for(let j=0;j<profile.length;j++) {
    const [y,rx,rz]=profile[j], lo=profile[Math.max(0,j-1)], hi=profile[Math.min(profile.length-1,j+1)];
    const drx=(hi[1]-lo[1])/(hi[0]-lo[0]), drz=(hi[2]-lo[2])/(hi[0]-lo[0]);
    const upper=y>ys,lowJoint=upper?spine:hips,highJoint=upper?chest:spine;
    const fraction=Math.max(0,Math.min(1,(y-(upper?ys:y0))/((upper?yc:ys)-(upper?ys:y0))));
    for(let i=0;i<=segments;i++) {
      const a=TAU*i/segments,c=Math.cos(a),s=Math.sin(a);
      vertex(g,[c*rx,y,s*rz],[c/rx,-drx*c*c/rx-drz*s*s/rz,s/rz],lowJoint);
      const n=g.joints.length-4;g.joints[n]=fraction===1?0:lowJoint;g.joints[n+1]=fraction===0?0:highJoint;g.weights[n]=1-fraction;g.weights[n+1]=fraction;
    }
  }
  for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){
    const a=base+j*(segments+1)+i,b=a+segments+1;g.indices.push(a,b,a+1,a+1,b,b+1);
  }
}

function createAthlete(bones, rest) {
  const groups=Array.from({length:8},empty);
  const at = name => rest[bones.findIndex(b=>b.name===name)];
  const ji = name => bones.findIndex(b=>b.name===name);
  // Eight original unbranded palette materials: skin, shirt, shorts, white,
  // outsole, hair/eyes, fabric accent, racket frame. Character faces +Z.
  const skin=groups[0], shirt=groups[1], shorts=groups[2], white=groups[3], sole=groups[4], dark=groups[5], accent=groups[6];
  const hips=at('Hips'), spine=at('Spine'), chest=at('Chest'), neck=at('Neck'), head=at('Head');
  ellipsoid(shorts,add(hips,[0,-.015,0]),[.18,.13,.105],ji('Hips'));
  shirtTorso(shirt,bones,rest);
  tube(skin,add(neck,[0,-.05,0]),add(neck,[0,.055,0]),.045,.04,ji('Neck'));
  ellipsoid(skin,add(head,[0,.015,0]),[.102,.125,.098],ji('Head'),20,14);
  // Sculpted hairstyle, ears, nose, eyebrows and eyes (all original geometry).
  ellipsoid(dark,add(head,[0,.085,-.014]),[.105,.07,.094],ji('Head'));
  ellipsoid(skin,add(head,[.104,.015,0]),[.019,.034,.024],ji('Head'));
  ellipsoid(skin,add(head,[-.104,.015,0]),[.019,.034,.024],ji('Head'));
  ellipsoid(skin,add(head,[0,.01,.097]),[.019,.029,.025],ji('Head'));
  for(const side of [-1,1]) {
    ellipsoid(white,add(head,[side*.038,.039,.09]),[.018,.012,.009],ji('Head'),10,6);
    ellipsoid(dark,add(head,[side*.038,.039,.098]),[.007,.008,.004],ji('Head'),8,6);
    tube(dark,add(head,[side*.025,.063,.091]),add(head,[side*.053,.061,.087]),.004,.004,ji('Head'),6);
  }
  tube(dark,add(head,[-.022,-.041,.091]),add(head,[.022,-.041,.091]),.003,.003,ji('Head'),6);
  // Shirt panels; no symbols, text, logos or numbers.
  box(accent,add(chest,[0,-.025,.101]),[.025,.13,.008],ji('Chest'));
  for(const side of ['Left','Right']) {
    const arm=at(side+'Arm'),fore=at(side+'ForeArm'),hand=at(side+'Hand');
    tube(shirt,arm,add(arm,[0,-.105,0]),.072,.065,ji(side+'Arm'));
    ellipsoid(shirt,arm,[.075,.077,.075],ji(side+'Arm'));
    tube(skin,add(arm,[0,-.09,0]),fore,.054,.044,ji(side+'Arm'));
    ellipsoid(skin,fore,[.046,.046,.046],ji(side+'ForeArm'));
    tube(skin,fore,hand,.046,.032,ji(side+'ForeArm'));
    // Palm grip is at the Hand node origin. Fingers wrap this origin; the
    // racket handle grows along hand-local +Y, instead of floating past it.
    ellipsoid(skin,add(hand,[0,-.017,0]),[.04,.058,.03],ji(side+'Hand'));
    tube(white,add(fore,[0,-.185,0]),add(fore,[0,-.225,0]),.036,.034,ji(side+'ForeArm'));
    const thigh=at(side+'UpLeg'), knee=at(side+'Leg'),foot=at(side+'Foot');
    tube(shorts,thigh,add(thigh,[0,-.19,0]),.09,.077,ji(side+'UpLeg'));
    tube(accent,add(thigh,[0,-.18,0]),add(thigh,[0,-.2,0]),.078,.077,ji(side+'UpLeg'));
    tube(skin,add(thigh,[0,-.19,0]),knee,.069,.052,ji(side+'UpLeg'));
    ellipsoid(skin,knee,[.055,.057,.057],ji(side+'Leg'));
    tube(skin,knee,add(foot,[0,.105,0]),.053,.037,ji(side+'Leg'));
    tube(white,add(foot,[0,.13,0]),add(foot,[0,-.015,0]),.039,.036,ji(side+'Leg'));
    // The flat sole occupies [-.08,-.06] in foot-local Y. The shoe upper is
    // entirely above it, so all four corners use the exact same floor plane.
    box(sole,add(foot,[0,-.07,.047]),[.117,.02,.255],ji(side+'Foot'));
    box(white,add(foot,[0,-.034,.047]),[.11,.055,.245],ji(side+'Foot'));
    box(accent,add(foot,[0,-.006,.008]),[.095,.017,.10],ji(side+'Foot'));
    for(let l=0;l<3;l++) box(dark,add(foot,[0,-.002,.035+l*.025]),[.064,.006,.008],ji(side+'Foot'));
  }
  return groups;
}

function createRacket() {
  const handle=empty(),frame=empty(),strings=empty();
  tube(handle,[0,-.015,0],[0,.225,0],.017,.015,null,12);
  for(let i=0;i<12;i++) {
    const y=.005+i*.017;
    tube(frame,[-.016,y,-.001],[.016,y+.006,.001],.0017,.0017,null,6);
  }
  tube(frame,[0,.21,0],[-.083,.361,0],.009,.009,null,10);
  tube(frame,[0,.21,0],[.083,.361,0],.009,.009,null,10);
  const hoop=empty(); ring(hoop,.128,.173,.012);
  // String grid follows the inner ellipse exactly and remains inside the rim.
  const rx=.118,ry=.161;
  for(let i=-5;i<=5;i++) {
    const x=i*.019, y=ry*Math.sqrt(1-x*x/(rx*rx));
    tube(strings,[x,-y,0],[x,y,0],.00085,.00085,null,5);
  }
  for(let i=-8;i<=8;i++) {
    const y=i*.018, x=rx*Math.sqrt(1-y*y/(ry*ry));
    tube(strings,[-x,y,0],[x,y,0],.00085,.00085,null,5);
  }
  return {handle,frame,hoop,strings};
}

const materialDefs = [
  ['skin',[.59,.33,.20,1],.82],
  ['shirt',[.045,.42,.40,1],.85],
  ['shorts',[.025,.07,.11,1],.85],
  ['white',[.88,.94,.91,1],.8],
  ['outsole',[.025,.035,.045,1],.9],
  ['hair-and-eyes',[.045,.025,.018,1],.8],
  ['accent',[.91,.39,.17,1],.75],
  ['racket-frame',[.13,.20,.25,1],.32],
];

/** Write a glTF 2.0 GLB with an 18-joint skinned athlete and fixed palm racket. */
export function buildGlb(skeleton, clip) {
  const bones=skeleton.bones;
  if(!Array.isArray(bones)||bones.length!==18) throw new Error('Expected canonical 18-bone skeleton');
  if(!clip.keyframes?.length) throw new Error('Clip has no keyframes');
  const rest=restPositions(bones), chunks=[], views=[], accessors=[];
  let offset=0;
  const doc={asset:{version:'2.0',generator:'Original tennis-motion-v1 CC0 writer',copyright:'CC0-1.0'},scene:0,scenes:[{nodes:[0,18]}],nodes:[],meshes:[],skins:[],materials:materialDefs.map(([name,baseColorFactor,roughnessFactor])=>({name,pbrMetallicRoughness:{baseColorFactor,roughnessFactor,metallicFactor:0}})),bufferViews:views,accessors,buffers:[{byteLength:0}],animations:[]};
  const componentTypes={Float32Array:5126,Uint16Array:5123,Uint32Array:5125};
  function accessor(data,type,target=null,minmax=false) {
    const buffer=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    const padding=(4-offset%4)%4;
    if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
    const view={buffer:0,byteOffset:offset,byteLength:buffer.length};
    if(target!==null)view.target=target;
    const vi=views.push(view)-1;chunks.push(buffer);offset+=buffer.length;
    const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[type];
    const a={bufferView:vi,componentType:componentTypes[data.constructor.name],count:data.length/n,type};
    if(minmax){a.min=Array(n).fill(Infinity);a.max=Array(n).fill(-Infinity);for(let i=0;i<data.length;i++){const k=i%n;a.min[k]=Math.min(a.min[k],data[i]);a.max[k]=Math.max(a.max[k],data[i]);}}
    return accessors.push(a)-1;
  }
  function primitive(g,material) {
    const attributes={POSITION:accessor(new Float32Array(g.positions),'VEC3',34962,true),NORMAL:accessor(new Float32Array(g.normals),'VEC3',34962)};
    if(g.joints.length){attributes.JOINTS_0=accessor(new Uint16Array(g.joints),'VEC4',34962);attributes.WEIGHTS_0=accessor(new Float32Array(g.weights),'VEC4',34962);}
    return {attributes,indices:accessor(g.positions.length/3>65535?new Uint32Array(g.indices):new Uint16Array(g.indices),'SCALAR',34963),material};
  }
  doc.nodes=bones.map(b=>({name:b.name,translation:[...b.restTranslationMeters],rotation:[0,0,0,1],children:[]}));
  bones.forEach((b,i)=>{if(b.parent!==null){const p=bones.findIndex(v=>v.name===b.parent);if(p<0)throw new Error('Unknown parent '+b.parent);doc.nodes[p].children.push(i);}});
  const athlete=createAthlete(bones,rest);
  doc.meshes.push({name:'Original neutral tennis athlete',primitives:athlete.map((g,i)=>g.indices.length?primitive(g,i):null).filter(Boolean)});
  doc.nodes.push({name:'AthleteMesh',mesh:0,skin:0});
  const bind=[];
  for(const p of rest)bind.push(1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1);
  doc.skins.push({name:'motion2 canonical 18 joints',inverseBindMatrices:accessor(new Float32Array(bind),'MAT4'),joints:bones.map((_,i)=>i),skeleton:0});
  const racketIndex=doc.nodes.length;
  doc.nodes.push({name:'Racket',translation:[0,0,0],rotation:[0,0,0,1],children:[racketIndex+1,racketIndex+2],extras:{gripSocket:'RightHand',gripLocalMeters:[0,0,0],stringBedLocalMeters:[0,.50,0],lengthMeters:.685,license:'CC0-1.0'}});
  doc.nodes[bones.findIndex(b=>b.name==='RightHand')].children.push(racketIndex);
  const racket=createRacket();
  doc.meshes.push({name:'Racket handle and throat',primitives:[primitive(racket.handle,4),primitive(racket.frame,7)]});
  doc.meshes.push({name:'Racket head and strings',primitives:[primitive(racket.hoop,7),primitive(racket.strings,3)]});
  doc.nodes.push({name:'RacketHandle',mesh:1});
  doc.nodes.push({name:'RacketHead',translation:[0,.50,0],mesh:2,extras:{contactLocalMeters:[0,0,0],normal:[0,0,1]}});
  for(const n of doc.nodes)if(n.children?.length===0)delete n.children;
  const anim={name:clip.id??clip.name??'tennis',channels:[],samplers:[],extras:{sampleRateHz:30,events:clip.events??[],contactPointNode:'RacketHead'}};
  const time=accessor(new Float32Array(clip.keyframes.map(f=>f.time*clip.durationSeconds)),'SCALAR',null,true);
  function track(node,path,values,type){const output=accessor(new Float32Array(values),type);const sampler=anim.samplers.push({input:time,output,interpolation:'LINEAR'})-1;anim.channels.push({sampler,target:{node,path}});}
  bones.forEach((b,i)=>track(i,'rotation',clip.keyframes.flatMap(f=>f.rotations[b.name]),'VEC4'));
  const root=bones.findIndex(b=>b.name==='Root'),hips=bones.findIndex(b=>b.name==='Hips');
  track(root,'translation',clip.keyframes.flatMap(f=>f.referenceRootTranslationMeters??[0,0,0]),'VEC3');
  track(hips,'translation',clip.keyframes.flatMap(f=>add(bones[hips].restTranslationMeters,f.hipsOffsetMeters??[0,0,0])),'VEC3');
  doc.animations.push(anim);
  const binaryPadding=(4-offset%4)%4;
  if(binaryPadding){chunks.push(Buffer.alloc(binaryPadding));offset+=binaryPadding;}
  doc.buffers[0].byteLength=offset;
  let json=Buffer.from(JSON.stringify(doc));
  if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,0x20)]);
  const bin=Buffer.concat(chunks),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);
  jsonHeader.writeUInt32LE(json.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);
  binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonHeader,json,binHeader,bin]);
}
