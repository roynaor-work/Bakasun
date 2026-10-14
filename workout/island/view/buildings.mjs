import * as T from '../../../codex-lab/kid-full/vendor/three.module.js';
import { primitive as part, material, makeTree } from './environment.mjs';
import { batchMeshes } from './batch.mjs';

// A visual kind is an independent extension point. Building IDs never select
// geometry; two data records can share a visual, or register their own renderer.
const visuals=new Map();
export function registerBuildingVisual(kind, factory) {visuals.set(kind,factory);}
const C={cream:'#fff4dc',ink:'#356d76',glass:'#93d7d2',wood:'#c99a6a',path:'#e9d6aa',white:'#fffbed',line:'#fff9df'};
function block(g,c,p,s){return part(g,'box',c,p,s);}
function roof(g,color,w,d,y,h=.55) {
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute([-w/2,0,-d/2,w/2,0,-d/2,0,h,-d/2,-w/2,0,d/2,w/2,0,d/2,0,h,d/2],3));
  geo.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,material(color,{flatShading:true}));mesh.position.y=y;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.ownedGeometry=true;g.add(mesh);return mesh;
}
function windows(g,w,d,y,count=2,color=C.glass) {
  for(let i=0;i<count;i++){const x=(i-(count-1)/2)*w/(count+.5);block(g,C.cream,[x,y,d/2+.012],[.3,.36,.055]);block(g,color,[x,y,d/2+.045],[.23,.27,.02]);}
  for(let i=0;i<count;i++)block(g,color,[-w/2-.015,y,(i-(count-1)/2)*d/(count+.5)],[.035,.27,.24]);
}
function base(g,w,d,color=C.cream){block(g,color,[0,.055,0],[w*.96,.11,d*.96]);}
function house(g,v,w,d,h) {
  base(g,w,d);const bw=w*.78,bd=d*.75;block(g,v.color,[0,h/2+.08,0],[bw,h,bd]);roof(g,v.roofColor,bw+.18,bd+.22,h+.08,.5);
  windows(g,bw,bd,h*.58,Math.max(1,Math.floor(w)));
  block(g,C.wood,[bw*.24,.29,bd/2+.04],[.26,.52,.07]);block(g,C.cream,[bw*.24,.07,bd/2+.23],[.45,.12,.32]);
  block(g,C.cream,[-bw*.2,h+.46,-bd*.2],[.19,.45,.21]);
}
function civic(g,v,w,d,h,variant) {
  base(g,w,d);const bw=w*.82,bd=d*.78;block(g,v.color,[0,h/2+.1,0],[bw,h,bd]);
  block(g,v.roofColor,[0,h+.15,0],[bw+.18,.22,bd+.18]);windows(g,bw,bd,h*.58,Math.max(2,Math.floor(w)));
  block(g,C.cream,[0,.12,bd/2+.2],[bw*.6,.16,.45]);block(g,C.ink,[0,.36,bd/2+.04],[.38,.58,.07]);
  if(variant==='fireStation') {
    for(const x of [-bw*.25,bw*.25]) {block(g,'#fff0d6',[x,.42,bd/2+.06],[bw*.33,.67,.06]);for(let i=0;i<4;i++)block(g,'#c7dedb',[x,.19+i*.13,bd/2+.1],[bw*.29,.035,.02]);}
    part(g,'sphere','#ffbf63',[0,h+.35,0],[.32,.28,.32]);
  } else if(variant==='hospital') {
    block(g,C.white,[0,h*.9,bd/2+.05],[.65,.6,.06]);cross(g,'#eb887e',[0,h*.9,bd/2+.1],.42);
  } else if(variant==='school') {
    roof(g,v.roofColor,bw+.25,bd+.25,h+.22,.5);block(g,C.cream,[0,h+.35,bd/2+.12],[.58,.65,.18]);
    const clock=part(g,'cylinder','#f3c86c',[0,h+.43,bd/2+.24],[.38,.04,.38]);clock.rotation.x=Math.PI/2;block(g,C.ink,[0,h+.47,bd/2+.28],[.03,.11,.025]);block(g,C.ink,[.04,h+.42,bd/2+.28],[.1,.03,.025]);
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
  windows(g,w*.84,d*.78,h*.4,3,'#bedfe0');
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
  const boat=new T.Group();boat.position.set(w*.26,.13,d*.47);g.add(boat);part(boat,'sphere','#f6f1d4',[0,0,0],[.62,.32,1.2]);
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
registerBuildingVisual('house',house);
registerBuildingVisual('factory',factory);
registerBuildingVisual('farm',farm);
registerBuildingVisual('harbor',harbor);
registerBuildingVisual('park',park);
registerBuildingVisual('waterTower',waterTower);
registerBuildingVisual('road',(g,v,w,d)=>{base(g,w,d,'#c2b79d');block(g,v.color,[0,.08,0],[w*.88,.075,d*.88]);for(const x of [-.22,.22])block(g,v.roofColor,[x,.12,0],[.17,.01,.035]);});
for(const kind of ['fireStation','hospital','school','police','prison'])registerBuildingVisual(kind,(g,v,w,d,h)=>civic(g,v,w,d,h,kind));
for(const kind of ['soccer','tennis','basketball'])registerBuildingVisual(kind,(g,v,w,d)=>field(g,v,w,d,kind));
registerBuildingVisual('pool',pool);registerBuildingVisual('athletics',athletics);
for(const kind of ['wall','watchtower','shield','embassy'])registerBuildingVisual(kind,(g,v,w,d,h)=>defense(g,v,w,d,h,kind));
export function createBuilding(record,level=1) {
  const visual={kind:'house',color:'#efb99c',roofColor:'#d97e70',height:.85,...record.visual},[w,d]=record.footprint||[1,1],group=new T.Group();
  group.name=record.id;const factory=visuals.get(visual.kind)||house;factory(group,visual,w,d,visual.height*(1+(Math.max(1,level)-1)*.13));
  if(level>1){for(let i=0;i<Math.min(level-1,3);i++)part(group,'sphere','#f4d17d',[w*.36,.18+i*.16,d*.36],[.12,.12,.12]);}
  return batchMeshes(group);
}
export function disposeBuilding(root) {root.traverse(o=>{if(o.userData.ownedGeometry)o.geometry?.dispose();if(o.userData.ownedMaterial)o.material?.dispose();});}
