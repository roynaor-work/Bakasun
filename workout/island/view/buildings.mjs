import * as T from '../vendor/three.module.js';
import { primitive as part, material, makeTree } from './environment.mjs?v=island-naval-aim-20261026-3';
import { batchMeshes } from './batch.mjs?v=island-naval-aim-20261026-3';

// A visual kind is an independent extension point. Building IDs never select
// geometry; two data records can share a visual, or register their own renderer.
const visuals=new Map();
export function registerBuildingVisual(kind, factory) {visuals.set(kind,factory);}
const C={cream:'#fff4dc',ink:'#356d76',glass:'#93d7d2',wood:'#c99a6a',path:'#e9d6aa',white:'#fffbed',line:'#fff9df'};
function block(g,c,p,s){return part(g,'box',c,p,s);}
// A single normalized wedge is reused by every pitched roof before batching.
const roofGeometry=new T.BufferGeometry();
roofGeometry.setAttribute('position',new T.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,0,1,-.5,-.5,0,.5,.5,0,.5,0,1,.5],3));
roofGeometry.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);
const roofFaces=roofGeometry.toNonIndexed();roofGeometry.copy(roofFaces);roofFaces.dispose();roofGeometry.computeVertexNormals();
function roof(g,color,w,d,y,h=.55) {
  const mesh=new T.Mesh(roofGeometry,material(color,{flatShading:true}));mesh.position.y=y;mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;
}
function facade(g,w,d,side) {
  const face=new T.Group(),angle=side*Math.PI/2;
  face.rotation.y=angle;face.position.set(Math.sin(angle)*w/2,0,Math.cos(angle)*d/2);g.add(face);return face;
}
function windows(g,w,d,y,count=2,color=C.glass,options={}) {
  // Each facade has the same recessed glass, frame, sill and reflected sky.
  // Local facade coordinates also keep narrow sides proportional to their wall.
  for(const side of options.sides||[0,1,2,3]) {
    const face=facade(g,w,d,side),span=side%2?d:w,columns=side%2?Math.max(1,Math.round(count*d/w)):count;
    face.scale.z=options.depthScale||1;
    const width=Math.min(.32,span/(columns+.5)*.66),height=options.height||.34;
    for(let i=0;i<columns;i++) {
      const x=(i-(columns-1)/2)*span/(columns+.5);
      if(side===0&&Number.isFinite(options.doorX)&&Math.abs(x-options.doorX)<(width+(options.doorWidth||.3))/2+.04)continue;
      block(face,'#40575b',[x,y,.018],[width+.055,height+.055,.045]);
      block(face,C.cream,[x,y,.046],[width,height,.025]);
      block(face,color,[x,y,.063],[width*.78,height*.8,.018]);
      block(face,C.cream,[x,y,.078],[.018,height*.8,.015]);
      block(face,C.cream,[x,y-height*.56,.073],[width+.08,.04,.105]);
      block(face,'#d4e9df',[x-width*.19,y+height*.2,.077],[width*.18,height*.18,.01]);
    }
  }
}
function roofTrim(g,color,w,d,y,h) {
  block(g,color,[0,y+h+.018,0],[.075,.055,d+.025]);
  for(const side of [-1,1]) {
    block(g,C.cream,[side*(w/2-.018),y-.018,0],[.055,.07,d]);
    for(const end of [-1,1]) {
      const beam=block(g,C.cream,[side*w*.25,y+h*.5,end*(d/2+.008)],[Math.hypot(w/2,h),.048,.04]);
      beam.rotation.z=-side*Math.atan2(h,w/2);
    }
  }
}
function base(g,w,d,color=C.cream){block(g,color,[0,.055,0],[w*.96,.11,d*.96]);}
function parapet(g,w,d,y,color) {
  for(const side of [-1,1]) {
    block(g,color,[0,y,side*d/2],[w,.16,.055]);
    block(g,color,[side*w/2,y,0],[.055,.16,d]);
  }
}
function house(g,v,w,d,h) {
  const design=v.design||'cabin',floors=v.floors||1;
  const bw=w*(design==='cabin'?.64:design==='gardenTower'?.68:.83),bd=d*(design==='balcony'?.62:.73);
  base(g,w,d);block(g,v.color,[0,h/2+.08,0],[bw,h,bd]);
  if(design==='apartments'||design==='gardenTower') {
    block(g,v.roofColor,[0,h+.12,0],[bw+.1,.13,bd+.1]);
    parapet(g,bw+.08,bd+.08,h+.26,v.roofColor);
  } else {roof(g,v.roofColor,bw+.18,bd+.22,h+.08,.5);roofTrim(g,v.roofColor,bw+.18,bd+.22,h+.08,.5);}
  for(let floor=0;floor<floors;floor++) {
    windows(g,bw,bd,.08+(floor+.56)*h/floors,design==='cabin'?1:design==='gardenTower'?3:2,v.windowColor||C.glass,{doorX:floor===0?bw*.24:undefined});
    if(floor)block(g,design==='gardenTower'?v.roofColor:C.cream,[0,.08+floor*h/floors,0],[bw+.04,.06,bd+.04]);
  }
  block(g,design==='gardenTower'?v.windowColor:C.wood,[bw*.24,.32,bd/2+.04],[.26,.48,.07]);
  block(g,C.cream,[bw*.24,.58,bd/2+.06],[.35,.055,.13]);block(g,'#e9c575',[bw*.29,.32,bd/2+.082],[.025,.035,.025]);
  block(g,C.cream,[bw*.24,.07,bd/2+.14],[.45,.12,.22]);
  if(design==='balcony') {
    block(g,C.cream,[0,h*.54,bd/2+.15],[bw*.85,.1,.35]);
    for(const x of [-bw*.39,0,bw*.39])block(g,v.roofColor,[x,h*.66,bd/2+.3],[.045,.48,.045]);
    block(g,v.roofColor,[0,h*.76,bd/2+.3],[bw*.85,.05,.05]);
    block(g,v.roofColor,[-bw*.25,h+.43,-bd*.18],[.22,.85,.24]);
    block(g,C.cream,[-bw*.25,h+.87,-bd*.18],[.29,.1,.3]);
  } else if(design==='apartments') {
    block(g,C.cream,[0,.7,bd/2+.105],[bw*.9,.08,.26]);
    for(const x of [-bw*.38,bw*.38])block(g,C.cream,[x,.4,bd/2+.2],[.07,.6,.07]);
  } else if(design==='gardenTower') {
    block(g,'#77ad71',[0,h+.21,0],[bw*.82,.06,bd*.82]);
    for(const x of [-bw*.29,bw*.29]) {
      block(g,'#b77f66',[x,h+.3,-bd*.22],[.3,.16,.42]);
      part(g,'sphere','#519e74',[x,h+.51,-bd*.22],[.34,.4,.43]);
    }
    for(const x of [-bw*.32,bw*.32])block(g,C.cream,[x,h+.43,bd*.25],[.045,.42,.045]);
    for(const z of [bd*.08,bd*.26,bd*.44])block(g,C.wood,[0,h+.66,z],[bw*.8,.06,.07]);
    // Shallow garden balconies add depth without extending the saved footprint.
    for(const side of [1,2,3]) {
      const face=facade(g,bw,bd,side),span=side%2?bd:bw;
      for(let floor=1;floor<floors;floor+=2) {
        const y=.08+floor*h/floors;
        block(face,C.cream,[0,y,.08],[span*.76,.055,.23]);
        block(face,v.roofColor,[0,y+.21,.18],[span*.76,.035,.035]);
        for(const x of [-span*.35,0,span*.35])block(face,v.roofColor,[x,y+.12,.18],[.025,.2,.025]);
      }
    }
  }
}
function civic(g,v,w,d,h,variant) {
  base(g,w,d);const bw=w*.82,bd=d*.78;block(g,v.color,[0,h/2+.1,0],[bw,h,bd]);
  block(g,v.roofColor,[0,h+.15,0],[bw+.18,.22,bd+.18]);windows(g,bw,bd,h*.64,Math.max(2,Math.floor(w)),v.windowColor||C.glass,{doorX:0,doorWidth:.42});
  block(g,C.cream,[0,.12,bd/2+.09],[bw*.6,.16,.24]);block(g,C.ink,[0,.36,bd/2+.04],[.38,.58,.07]);
  if(variant==='fireStation') {
    for(const x of [-bw*.25,bw*.25]) {block(g,'#fff0d6',[x,.42,bd/2+.06],[bw*.33,.67,.06]);for(let i=0;i<4;i++)block(g,'#c7dedb',[x,.19+i*.13,bd/2+.1],[bw*.29,.035,.02]);}
    part(g,'sphere','#ffbf63',[0,h+.35,0],[.32,.28,.32]);
  } else if(variant==='hospital') {
    block(g,C.white,[0,h*.9,bd/2+.05],[.65,.6,.06]);cross(g,'#eb887e',[0,h*.9,bd/2+.1],.42);
  } else if(variant==='school') {
    roof(g,v.roofColor,bw+.25,bd+.25,h+.22,.5);roofTrim(g,v.roofColor,bw+.25,bd+.25,h+.22,.5);block(g,C.cream,[0,h+.35,bd/2+.08],[.58,.65,.14]);
    const clockZ=Math.min(bd/2+.24,d/2-.055),clock=part(g,'cylinder','#f3c86c',[0,h+.43,clockZ],[.38,.04,.38]);
    clock.rotation.x=Math.PI/2;block(g,C.ink,[0,h+.47,clockZ+.035],[.03,.11,.025]);block(g,C.ink,[.04,h+.42,clockZ+.035],[.1,.03,.025]);
  } else if(variant==='police') {
    const badge=part(g,'sphere','#f5d079',[0,h*.95,bd/2+.1],[.4,.45,.09]);badge.rotation.z=Math.PI/5;
  } else if(variant==='prison') {
    for(const x of [-bw*.28,bw*.28])for(const k of [-1,0,1])block(g,'#9cacb0',[x+k*.065,h*.6,bd/2+.08],[.025,.27,.025]);
    for(const x of [-w*.44,w*.44])block(g,C.cream,[x,.35,d*.35],[.18,.6,.18]);
  }
}
function cross(g,c,[x,y,z],size) {block(g,c,[x,y,z],[size*.32,size,.035]);block(g,c,[x,y,z],[size,size*.32,.035]);}
function factory(g,v,w,d,h) {
  base(g,w,d);block(g,v.color,[0,h*.4,0],[w*.84,h*.8,d*.78]);
  for(let i=0;i<3;i++)roof(g,v.roofColor,w*.29,d*.85,h*.8,w*.12).position.x=(i-1)*w*.27;
  windows(g,w*.84,d*.78,h*.4,3,'#bedfe0',{doorX:w*.23,doorWidth:w*.34});
  for(let i=0;i<2;i++) {part(g,'cylinder',v.roofColor,[(i-.5)*w*.3,h*.95,-d*.2],[.29,h*.9,.29]);part(g,'cylinder',C.cream,[(i-.5)*w*.3,h*1.3,-d*.2],[.35,.14,.35]);}
  for(let i=0;i<2;i++)part(g,'cylinder','#e5bd7d',[-w*.34,.24,d*.33-i*.3],[.26,.43,.26]);
}
function farm(g,v,w,d,h) {
  base(g,w,d,'#b7c378');const bw=w*.44,bd=d*.48;
  const barn=new T.Group();barn.position.set(-w*.2,0,-d*.17);g.add(barn);house(barn,v,bw/.78,bd/.75,h*.68);
  for(let i=0;i<4;i++) {
    const x=w*.08+i*w*.1;block(g,'#ab8354',[x,.09,d*.08],[w*.065,.12,d*.73]);
    for(let k=0;k<5;k++)part(g,'sphere',i%2?'#72a64c':'#dcae62',[x,.2,-d*.23+k*d*.13],[.15,.25,.15]);
  }
  for(let i=0;i<5;i++)block(g,C.cream,[-w*.44,.3,-d*.39+i*d*.2],[.08,.45,.08]);block(g,C.cream,[-w*.44,.38,0],[.06,.06,d*.9]);
}
function harbor(g,v,w,d,h) {
  base(g,w,d,'#b7d0bf');
  for(let i=0;i<6;i++)block(g,C.wood,[(i-2.5)*w*.14,.17,d*.23],[w*.13,.12,d*.95]);
  for(const x of [-w*.43,w*.43])for(const z of [-d*.2,d*.65])part(g,'cylinder','#ad845b',[x,.2,z],[.13,.65,.13]);
  const hut=new T.Group();hut.position.set(-w*.18,.2,-d*.25);g.add(hut);house(hut,v,w*.6,d*.55,h*.62);
  if(v.deckExtension){
    const length=v.deckExtension,center=d/2+length/2;
    block(g,C.wood,[0,v.deckHeight,center],[w*.38,.16,length]);
    for(const z of [d/2+length*.4,d/2+length*.9])for(const x of [-w*.17,w*.17])part(g,'cylinder','#ad845b',[x,v.deckHeight-v.pierHeight/2,z],[.12,v.pierHeight,.12]);
    block(g,C.wood,[0,v.deckHeight,d/2+length],[w*.8,.16,.65]);
  }
  const boat=new T.Group();boat.position.set(w*.42,v.waterline??.13,v.deckExtension?d/2+v.deckExtension*.9:d*.47);g.add(boat);part(boat,'sphere','#f6f1d4',[0,0,0],[.62,.32,1.2]);
  block(boat,C.wood,[0,.45,0],[.06,.95,.06]);const sail=part(boat,'cone',v.color,[.18,.68,0],[.62,.7,.04]);sail.rotation.z=-.2;
}
function park(g,v,w,d,h) {
  base(g,w,d,v.color);block(g,C.path,[0,.12,0],[w*.18,.04,d*.9]);block(g,C.path,[0,.125,0],[w*.9,.04,d*.18]);
  for(const [x,z]of [[-w*.3,-d*.28],[w*.3,-d*.28],[-w*.3,d*.28]]) {const tree=makeTree(g,x,z,.5);tree.position.y=0;}
  part(g,'cylinder','#e9e1c8',[w*.21,.2,d*.23],[w*.32,.22,w*.32]);part(g,'cylinder','#82d5d4',[w*.21,.32,d*.23],[w*.26,.04,w*.26]);
  part(g,'cylinder',C.cream,[w*.21,.5,d*.23],[.09,.48,.09]);part(g,'sphere','#a5e8df',[w*.21,.74,d*.23],[.16,.18,.16]);
  for(const x of [-w*.25,w*.25]) {block(g,C.wood,[x,.24,d*.39],[.46,.09,.18]);block(g,C.wood,[x,.38,d*.46],[.46,.25,.05]);}
}
function waterTower(g,v,w,d,h) {
  base(g,w,d);for(const x of [-w*.24,w*.24])for(const z of [-d*.24,d*.24])block(g,'#e9e6d2',[x,h*.37,z],[.11,h*.74,.11]);
  part(g,'cylinder',v.color,[0,h*.76,0],[w*.8,h*.4,d*.8]);part(g,'cone',v.roofColor,[0,h*1.04,0],[w*.91,h*.22,d*.91]);
  part(g,'cylinder',C.cream,[0,h*.59,0],[w*.86,.12,d*.86]);
}
function linework(g,segments,color=C.line) {
  const geometry=new T.BufferGeometry().setFromPoints(segments.flatMap(([a,b])=>[new T.Vector3(...a),new T.Vector3(...b)]));
  const line=new T.LineSegments(geometry,new T.LineBasicMaterial({color}));line.userData.ownedGeometry=true;line.userData.ownedMaterial=true;g.add(line);return line;
}
function rectangleLines(x,z,w,d,y=.145) {return [[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2]],[[x+w/2,y,z-d/2],[x+w/2,y,z+d/2]],[[x+w/2,y,z+d/2],[x-w/2,y,z+d/2]],[[x-w/2,y,z+d/2],[x-w/2,y,z-d/2]]];}
function circleLines(x,z,r,y=.15,segments=32) {return Array.from({length:segments},(_,i)=>[[x+Math.cos(i/segments*Math.PI*2)*r,y,z+Math.sin(i/segments*Math.PI*2)*r],[x+Math.cos((i+1)/segments*Math.PI*2)*r,y,z+Math.sin((i+1)/segments*Math.PI*2)*r]]);}
function field(g,v,w,d,kind) {
  base(g,w,d,'#f4e6c3');const fw=w*.88,fd=d*.86;block(g,v.color,[0,.1,0],[fw,.08,fd]);const lines=rectangleLines(0,0,fw*.91,fd*.88);
  if(kind==='soccer') {
    for(let i=0;i<5;i++)block(g,i%2?'#7bb88b':v.color,[0,.143,(i-2)*fd/5],[fw,.006,fd/5]);
    lines.push([[-fw*.455,.15,0],[fw*.455,.15,0]],...circleLines(0,0,Math.min(fw,fd)*.15));
    for(const side of [-1,1]) {
      lines.push(...rectangleLines(0,side*fd*.34,fw*.48,fd*.2));
      const goal=new T.Group();goal.position.set(0,.15,side*fd*.48);g.add(goal);
      for(const x of [-fw*.18,fw*.18])block(goal,C.white,[x,.26,0],[.055,.52,.055]);block(goal,C.white,[0,.52,0],[fw*.36,.05,.055]);
      for(let k=0;k<5;k++)block(goal,'#b9d5bd',[(k-2)*fw*.075,.25,side*.16],[.016,.46,.02]);
    }
  } else if(kind==='tennis') {
    lines.push([[-fw*.455,.15,0],[fw*.455,.15,0]],...rectangleLines(0,0,fw*.65,fd*.88));
    for(const z of [-fd*.25,fd*.25])lines.push([[-fw*.325,.15,z],[fw*.325,.15,z]]);
    block(g,'#f3e6c9',[0,.46,0],[fw*.96,.045,.045]);
    for(let i=0;i<12;i++)block(g,'#e9efd5',[(i-5.5)*fw/12,.31,0],[.014,.28,.018]);
    for(const x of [-fw*.48,fw*.48])block(g,C.ink,[x,.32,0],[.055,.48,.055]);
  } else if(kind==='basketball') {
    lines.push([[-fw*.455,.15,0],[fw*.455,.15,0]],...circleLines(0,0,Math.min(fw,fd)*.15));
    for(const side of [-1,1]) {
      lines.push(...rectangleLines(0,side*fd*.3,fw*.38,fd*.27),...circleLines(0,side*fd*.16,fw*.16));
      block(g,v.roofColor,[0,.6,side*fd*.49],[.06,.95,.06]);block(g,C.white,[0,.98,side*fd*.43],[fw*.3,.33,.05]);
      const ring=new T.Mesh(new T.TorusGeometry(.12,.018,4,16),material('#e7946a'));ring.rotation.x=Math.PI/2;ring.position.set(0,.86,side*fd*.36);ring.userData.ownedGeometry=true;g.add(ring);
    }
    block(g,v.roofColor,[-fw*.52,.32,0],[.12,.5,fd]);
    for(const z of [-fd*.35,0,fd*.35])block(g,'#f0cf94',[fw*.53,.25,z],[.2,.3,fd*.2]);
  }
  linework(g,lines);
}
function pool(g,v,w,d) {
  base(g,w,d,'#f2e4c4');block(g,'#e7f3de',[0,.15,0],[w*.86,.2,d*.85]);block(g,v.color,[0,.265,0],[w*.75,.045,d*.73]);
  for(let i=0;i<4;i++){const x=(i-1.5)*w*.16;block(g,'#b5eee4',[x,.293,0],[.025,.008,d*.7]);for(let k=0;k<7;k++)block(g,k%2?'#f3e8b6':'#e78f78',[x+w*.08,.3,(k-3)*d*.095],[.035,.025,.035]);}
  for(let i=0;i<3;i++) {block(g,C.white,[(i-1)*w*.2,.38,-d*.42],[.24,.2,.28]);block(g,'#85bfc3',[(i-1)*w*.2,.49,-d*.42],[.25,.025,.29]);}
  for(const x of [-w*.32,w*.32]){block(g,C.white,[x,.48,d*.35],[.035,.5,.035]);block(g,C.white,[x+.14,.48,d*.35],[.035,.5,.035]);}
}
function athletics(g,v,w,d) {
  base(g,w,d,'#87b98a');
  const track=new T.Mesh(new T.RingGeometry(.56,1,48),material(v.color,{side:T.DoubleSide}));track.rotation.x=-Math.PI/2;track.position.y=.13;track.scale.set(w*.46,d*.46,1);track.userData.ownedGeometry=true;g.add(track);
  const lines=[];for(const r of [.65,.78,.91])for(let i=0;i<48;i++)lines.push([[(Math.cos(i/48*Math.PI*2)*r*w*.46),.145,Math.sin(i/48*Math.PI*2)*r*d*.46],[(Math.cos((i+1)/48*Math.PI*2)*r*w*.46),.145,Math.sin((i+1)/48*Math.PI*2)*r*d*.46]]);
  for(const r of [.62,.7,.78,.86,.94])lines.push([[0,.15,r*d*.46],[w*.12,.15,r*d*.46]]);linework(g,lines);
  for(let i=0;i<3;i++)block(g,'#ead09c',[-w*.47,.18+i*.08,(i-1)*d*.18],[.16,.14,d*.13]);
}
function defense(g,v,w,d,h,kind) {
  base(g,w,d);
  if(kind==='wall'){block(g,v.color,[0,h/2,0],[w*.95,h,d*.6]);for(let i=0;i<3;i++)block(g,v.roofColor,[(i-1)*w*.32,h+.12,0],[w*.18,.25,d*.65]);}
  else if(kind==='watchtower'){part(g,'cylinder',v.color,[0,h*.45,0],[w*.65,h*.9,d*.65]);part(g,'cone',v.roofColor,[0,h,0],[w*.95,h*.4,d*.95]);}
  else if(kind==='shield'){part(g,'sphere',v.color,[0,h*.5,0],[w*.7,h,d*.4]);cross(g,v.roofColor,[0,h*.5,d*.2],h*.55);}
  else{civic(g,v,w,d,h,'embassy');block(g,C.cream,[w*.34,h+.6,0],[.05,1.2,.05]);block(g,v.roofColor,[w*.34+.26,h+.95,0],[.52,.35,.055]);}
}
function flag(g,x,y,z,color) {
  block(g,C.cream,[x,y+.36,z],[.035,.72,.035]);
  block(g,color,[x+.17,y+.57,z],[.34,.22,.045]);
}
function levelDetails(g,v,w,d,h) {
  const tier=v.tier||1;if(tier===1||v.kind==='house')return;
  const civicKinds=['school','hospital','fireStation','police','prison'];
  if(civicKinds.includes(v.kind)) {
    // A low side wing breaks the original rectangular silhouette.
    block(g,v.roofColor,[-w*.34,h*.25,d*.12],[w*.28,h*.5,d*.72]);
    block(g,C.cream,[-w*.34,h*.51,d*.12],[w*.32,.09,d*.74]);
    const wing=new T.Group();wing.position.set(-w*.34,0,d*.12);g.add(wing);
    windows(wing,w*.28,d*.72,h*.28,1,v.windowColor,{height:.25,sides:[0,3],depthScale:Math.min(1,Math.min(w,d)*.02/.13)});
    if(tier===3) {
      if(v.kind==='hospital') {
        block(g,C.ink,[0,h+.29,0],[w*.54,.04,d*.55]);
        // Roof landing mark: two bars and a crossbar, no texture or new light.
        for(const x of [-w*.12,w*.12])block(g,C.white,[x,h+.32,0],[.07,.02,d*.3]);
        block(g,C.white,[0,h+.32,0],[w*.24,.02,.07]);
      } else {
        block(g,v.roofColor,[w*.29,h*.75,-d*.16],[w*.27,h*1.5,d*.35]);
        block(g,C.cream,[w*.29,h*1.52,-d*.16],[w*.32,.12,d*.4]);
        if(v.kind==='fireStation')for(let i=0;i<3;i++)block(g,C.ink,[w*.29,h*(.7+i*.2),d*.02],[w*.14,.13,.035]);
        flag(g,w*.29,h*1.58,-d*.16,v.color);
      }
    }
  } else if(v.kind==='waterTower') {
    block(g,v.roofColor,[0,h*.58,0],[w*.98,.1,d*.98]);
    parapet(g,w*.94,d*.94,h*.72,C.cream);
    for(let i=0;i<6;i++)block(g,C.ink,[-w*.35,h*.1+i*h*.08,d*.35],[.23,.035,.04]);
    if(tier===3) {
      block(g,v.roofColor,[0,h*.19,0],[w*.72,h*.38,d*.7]);
      block(g,C.cream,[0,h*.18,d*.36],[w*.23,h*.3,.05]);
      flag(g,0,h*1.18,0,v.roofColor);
    }
  } else if(v.kind==='farm') {
    block(g,'#a1d8cc',[w*.22,h*.28,-d*.25],[w*.36,h*.55,d*.36]);
    const greenhouseRoof=roof(g,'#ddf0d1',w*.4,d*.4,h*.55,h*.22);greenhouseRoof.position.set(w*.22,h*.55,-d*.25);
    for(const x of [w*.08,w*.22,w*.36])block(g,C.cream,[x,h*.28,-d*.06],[.035,h*.55,.035]);
    if(tier===3) {
      part(g,'cylinder',v.roofColor,[-w*.35,h*.66,d*.24],[w*.22,h*1.3,d*.22]);
      part(g,'cone',C.cream,[-w*.35,h*1.4,d*.24],[w*.26,h*.25,d*.26]);
    }
  } else if(v.kind==='factory') {
    block(g,v.roofColor,[w*.31,h*.25,d*.2],[w*.35,h*.5,d*.5]);
    for(let i=0;i<3;i++)block(g,C.cream,[w*.31,h*(.12+i*.1),d*.46],[w*.24,.04,.025]);
    if(tier===3) {
      part(g,'cylinder',C.cream,[-w*.3,h*.8,d*.22],[w*.18,h*1.6,d*.18]);
      for(const y of [.7,1,1.3])part(g,'cylinder',v.roofColor,[-w*.3,h*y,d*.22],[w*.19,.11,d*.19]);
    }
  } else if(v.kind==='harbor') {
    for(let i=0;i<tier;i++)block(g,i%2?v.roofColor:v.color,[w*.26,.37+i*.18,-d*.26],[w*.28,.18,d*.3]);
    if(tier===3) {
      block(g,v.roofColor,[-w*.37,h*.65,d*.15],[.14,h*1.3,.14]);
      block(g,v.roofColor,[-w*.12,h*1.3,d*.15],[w*.62,.14,.14]);
      block(g,C.ink,[w*.14,h*.97,d*.15],[.025,h*.65,.025]);
      block(g,C.wood,[w*.14,h*.63,d*.15],[.18,.09,.12]);
    }
  } else if(v.kind==='park') {
    for(const x of [w*.12,w*.4])for(const z of [-d*.4,-d*.12])block(g,C.wood,[x,.52,z],[.055,.85,.055]);
    if(tier===2) {
      const cover=roof(g,v.roofColor,w*.45,d*.43,.95,.28);cover.position.set(w*.26,.95,-d*.26);
    } else {
      for(let i=0;i<5;i++)block(g,v.roofColor,[w*.26,.95,-d*.43+i*d*.085],[w*.43,.08,.06]);
      for(const x of [-w*.35,-w*.15])for(const z of [-d*.3,0,d*.3]) {
        block(g,'#bd8d68',[x,.18,z],[.22,.13,.26]);
        part(g,'sphere','#f1b2c4',[x,.32,z],[.22,.2,.22]);
      }
    }
  } else if(['soccer','tennis','basketball','pool','athletics'].includes(v.kind)) {
    // Stands are already level-driven; add a scoreboard, then a canopy and flags.
    for(const x of [-w*.17,w*.17])block(g,C.ink,[x,.55,-d*.44],[.05,.9,.05]);
    block(g,C.ink,[0,1,-d*.44],[w*.48,.38,.07]);
    for(const x of [-w*.12,w*.12])block(g,'#f9df8f',[x,1,-d*.395],[w*.07,.2,.025]);
    if(tier===3) {
      for(const z of [-d*.3,d*.3])block(g,v.roofColor,[-w*.45,.73,z],[.05,1.15,.05]);
      block(g,v.roofColor,[-w*.4,1.32,0],[w*.24,.1,d*.76]);
      flag(g,w*.42,.5,-d*.3,v.roofColor);flag(g,w*.42,.5,d*.3,v.roofColor);
    }
  }
}
function architecture(g,v,w,d,h){
  if(!['house','school','police','prison','cityHall','factory'].includes(v.kind))return;
  const home=v.kind==='house',bw=w*(home?(v.design==='cabin'?.64:v.design==='gardenTower'?.68:.83):v.kind==='cityHall'?.8:v.kind==='factory'?.84:.82),bd=d*(home?(v.design==='balcony'?.62:.73):v.kind==='cityHall'?.7:.78);
  const wallHeight=h*(v.kind==='cityHall'?.7:v.kind==='factory'?.8:1),bottom=v.kind==='factory'?0:.08;
  // Grounded plinths and corner piers carry the same scale around every side.
  // Their geometry becomes part of the building's single shared-material batch.
  block(g,'#a99e84',[0,.16,0],[bw+.035,.12,bd+.035]);
  block(g,C.cream,[0,.26,0],[bw+.045,.045,bd+.045]);
  for(const x of [-1,1])for(const z of [-1,1])block(g,home?'#eedfbd':C.cream,[x*(bw/2-.025),wallHeight/2+bottom,z*(bd/2-.025)],[.07,wallHeight,.07]);
  if(v.kind==='house'&&v.design==='balcony'){
    for(let i=-4;i<=4;i++)block(g,v.roofColor,[i*bw*.085,h*.65,bd/2+.3],[.018,.43,.025]);
    for(const side of [-1,1]) {
      block(g,v.roofColor,[side*bw*.4,h*.76,bd/2+.15],[.035,.045,.3]);
      block(g,C.cream,[side*bw*.37,h*.27,bd/2+.23],[.055,h*.5,.055]);
    }
    for(const side of [-1,1])block(g,'#c6b79a',[side*(bw/2+.065),h+.08,0],[.055,.075,bd+.24]);
    // A timber gate and planted side strip distinguish the small family home.
    for(const side of [-1,1])for(let i=0;i<4;i++)block(g,C.wood,[side*w*.45,.23,-d*.3+i*d*.16],[.045,.31,.05]);
    for(const side of [-1,1])block(g,C.wood,[side*w*.45,.32,-d*.06],[.05,.045,d*.52]);
  }
  if(v.kind==='house'&&v.design==='gardenTower'){
    // Solar panels sit in the gap between the roof garden and pergola.
    for(const x of [-bw*.21,bw*.21]) {
      block(g,'#405c71',[x,h+.29,-bd*.025],[bw*.31,.035,bd*.19]);
      for(const stripe of [-1,0,1])block(g,'#7892a0',[x+stripe*bw*.075,h+.311,-bd*.025],[.012,.008,bd*.17]);
    }
    block(g,v.roofColor,[bw*.24,.7,bd/2+.12],[bw*.43,.06,.27]);
    for(const x of [-bw*.38,-bw*.12]){block(g,'#ba846e',[x,.2,bd/2+.13],[.22,.18,.2]);part(g,'sphere','#5d8c67',[x,.36,bd/2+.13],[.27,.25,.25]);}
  }
  if(['school','police','prison'].includes(v.kind)){
    block(g,C.cream,[0,h*.79,0],[bw+.05,.065,bd+.05]);
    block(g,v.roofColor,[0,.88,bd/2+.07],[.66,.065,.28]);
    for(const x of [-.27,.27])block(g,C.cream,[x,.47,bd/2+.17],[.045,.78,.045]);
    if(v.kind==='school') {
      // Eaves and a rear flag make the school readable when the camera turns.
      flag(g,w*.36,h+.45,-d*.28,v.roofColor);
      for(const x of [-bw*.31,bw*.31])block(g,'#d8c197',[x,.21,bd/2+.11],[.3,.12,.22]);
    } else {
      parapet(g,bw+.1,bd+.1,h+.34,v.roofColor);
      block(g,C.cream,[-bw*.22,h+.38,-bd*.2],[bw*.25,.24,bd*.27]);
      for(let i=-1;i<=1;i++)block(g,'#6d8b89',[-bw*.22+i*bw*.06,h+.51,-bd*.2],[.025,.018,bd*.22]);
      if(v.kind==='police') {
        block(g,'#576774',[bw*.25,h+.57,-bd*.2],[.025,.74,.025]);
        for(const y of [h+.73,h+.88])block(g,'#687b85',[bw*.25,y,-bd*.2],[.24,.023,.023]);
        block(g,'#d9e4de',[0,h*.8,bd/2+.055],[bw*.5,.035,.04]);
      }
    }
  }
  if(v.kind==='factory'){
    block(g,'#405b68',[w*.23,.4,d*.4],[w*.34,.67,.065]);
    block(g,'#708b94',[w*.23,.38,d*.42],[w*.3,.6,.04]);
    for(let i=0;i<5;i++)block(g,'#a9bbc1',[w*.23,.15+i*.1,d*.45],[w*.28,.018,.025]);
    block(g,'#ccbb97',[w*.23,.1,d*.43],[w*.38,.12,.22]);
    for(const side of [-1,1])for(const z of [-d*.34,d*.34])block(g,'#ddcfac',[side*w*.42,h*.36,z],[.055,h*.72,.065]);
    for(let i=0;i<3;i++) {
      const x=(i-1)*w*.27,light=block(g,'#a1c7cd',[x+w*.065,h*.8+w*.067,0],[w*.12,.025,d*.57]);
      light.rotation.z=-Math.atan2(w*.12,w*.145);
      block(g,'#4d6972',[x,h*.8+w*.12+.02,0],[.055,.055,d*.87]);
    }
    // Loading-bay canopy and striped bollards remain within the industrial lot.
    block(g,v.roofColor,[w*.23,.79,d*.42],[w*.42,.06,.23]);
    for(const x of [w*.05,w*.41]){block(g,'#edcc74',[x,.24,d*.46],[.055,.34,.055]);block(g,'#4d5c60',[x,.29,d*.46],[.058,.07,.058]);}
  }
}
registerBuildingVisual('house',house);
registerBuildingVisual('factory',factory);
registerBuildingVisual('farm',farm);
registerBuildingVisual('harbor',harbor);
registerBuildingVisual('cityHall',(g,v,w,d,h)=>{
  base(g,w,d);block(g,v.color,[0,h*.38,0],[w*.8,h*.7,d*.7]);
  roof(g,v.roofColor,w*.94,d*.86,h*.74,.28);
  roofTrim(g,v.roofColor,w*.94,d*.86,h*.74,.28);
  windows(g,w*.8,d*.7,h*.44,1,C.glass,{sides:[1,2,3],height:.26,depthScale:.65});
  block(g,C.cream,[0,h*.72,d*.39],[w*.78,.07,.16]);
  for(const x of [-w*.31,-w*.16,w*.16,w*.31]) {
    block(g,C.white,[x,h*.37,d*.4],[.055,h*.68,.07]);
    block(g,C.cream,[x,h*.7,d*.4],[.09,.06,.1]);
    block(g,C.cream,[x,.1,d*.4],[.09,.1,.1]);
  }
  block(g,C.wood,[0,.25,d*.36],[.2,.4,.05]);
  block(g,v.roofColor,[0,h+.18,0],[.04,.5,.04]);block(g,C.white,[.13,h+.32,0],[.26,.17,.035]);
});
registerBuildingVisual('airbase',(g,v,w,d,h)=>{
  base(g,w,d,'#6d8390');block(g,C.cream,[0,.12,d*.16],[w*.85,.025,.045]);
  block(g,v.color,[-w*.18,h*.35,-d*.12],[w*.48,h*.7,d*.55]);
  roof(g,v.roofColor,w*.54,d*.61,h*.7,.25);
  block(g,'#355464',[-w*.18,h*.22,d*.17],[w*.36,h*.42,.04]);
  block(g,v.color,[w*.3,h*.55,-d*.25],[w*.18,h*1.1,d*.2]);
  block(g,C.glass,[w*.3,h*1.05,-d*.25],[w*.25,.2,d*.27]);
});
registerBuildingVisual('park',park);
registerBuildingVisual('waterTower',waterTower);
registerBuildingVisual('powerPlant',(g,v,w,d,h)=>{
  base(g,w,d,'#bdc6bc');
  const room=new T.Group();room.position.set(-w*.2,0,-d*.06);g.add(room);
  block(room,v.color,[0,h*.36,0],[w*.42,h*.72,d*.63]);
  block(room,v.roofColor,[0,h*.76,0],[w*.46,.09,d*.68]);
  windows(room,w*.42,d*.63,h*.42,2,C.glass,{doorX:0});
  // Transformers, ceramic insulators and solar collectors give the utility a
  // distinct silhouette while sharing the existing architectural mesh batch.
  for(const z of [-d*.22,d*.19]){
    block(g,'#6b8290',[w*.22,.35,z],[w*.3,.55,d*.27]);
    for(let i=-2;i<=2;i++)block(g,'#b3c0bb',[w*.22+i*w*.045,.35,z+d*.15],[.035,.43,.055]);
    for(const x of [w*.15,w*.3]){
      part(g,'cylinder','#e2e4cf',[x,.72,z],[.085,.25,.085]);
      for(const y of [.65,.72,.79])part(g,'cylinder','#a4b8bb',[x,y,z],[.12,.028,.12]);
    }
  }
  for(let i=0;i<2+(v.tier||1);i++){
    const x=-w*.38+i*w*.065;
    block(g,'#33556e',[x,h*.84,-d*.06],[w*.055,.035,d*.49]);
    for(const z of [-d*.2,0,d*.17])block(g,'#829fad',[x,h*.862,z],[w*.053,.009,.014]);
  }
  block(g,C.cream,[-w*.2,.34,d*.27],[.28,.49,.045]);
  block(g,'#d4b861',[-w*.2,.36,d*.3],[.16,.16,.02]);
});
// Connected lane markings, sidewalks and crossings belong to CityStreets.
registerBuildingVisual('road',(g,v,w,d)=>{base(g,w,d,'#bbc4bb');block(g,'#45545b',[0,.08,0],[w*.88,.075,d*.88]);});
for(const kind of ['fireStation','hospital','school','police','prison'])registerBuildingVisual(kind,(g,v,w,d,h)=>civic(g,v,w,d,h,kind));
registerBuildingVisual('shop',(g,v,w,d,h)=>{civic(g,v,w,d,h,'shop');block(g,v.roofColor,[0,h*.58,d*.43],[w*.88,.1,.4]);});
for(const kind of ['soccer','tennis','basketball'])registerBuildingVisual(kind,(g,v,w,d)=>field(g,v,w,d,kind));
registerBuildingVisual('pool',pool);registerBuildingVisual('athletics',athletics);
for(const kind of ['wall','watchtower','shield','embassy'])registerBuildingVisual(kind,(g,v,w,d,h)=>defense(g,v,w,d,h,kind));
export function createBuilding(record,level=1,models) {
  const modeled=models?.create(record.levels?.[level-1]?.model??record.model);
  if(modeled){modeled.name=record.id;modeled.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return modeled;}
  const levelVisual=record.levels?.[level-1]?.visual;
  const visual={kind:'house',color:'#efb99c',roofColor:'#d97e70',height:.85,...record.visual,...levelVisual},[w,d]=record.footprint||[1,1],group=new T.Group();
  const height=visual.height*(levelVisual?.height?1:1+(Math.max(1,level)-1)*.13);
  group.name=record.id;const factory=visuals.get(visual.kind)||house;factory(group,visual,w,d,height);
  architecture(group,visual,w,d,height);
  levelDetails(group,visual,w,d,height);
  for(let tier=0;tier<(visual.stands||0);tier++)for(const side of [-1,1])block(group,visual.roofColor,[side*w*.45,.22+tier*.2,0],[w*.09,.18,d*.65]);
  if(level>1){for(let i=0;i<Math.min(level-1,3);i++)part(group,'sphere','#f4d17d',[w*.36,.18+i*.16,d*.36],[.12,.12,.12]);}
  return batchMeshes(group);
}
export function disposeBuilding(root) {root.traverse(o=>{if(o.userData.ownedGeometry)o.geometry?.dispose();if(o.userData.ownedMaterial)o.material?.dispose();});}
