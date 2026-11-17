import {Art,T} from './geometry.mjs';
const wood='#967354',lightwood='#d6b88b',cream='#fff0ce';
const seeded=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};

export function treeOak(){
  const a=new Art();a.cylinder([0,1.04,0],.14,.23,2.08,wood,7);
  a.tube([[0,1.20,0],[-.45,1.80,.07],[-.60,2.12,.08]],.10,wood,6);
  a.tube([[0,1.43,0],[.40,1.92,0],[.53,2.22,0]],.09,wood,6);
  for(const [p,s,c]of [
    [[0,2.43,0],[.92,.89,.83],'#6f944e'],[[-.66,2.18,.08],[.70,.64,.72],'#86a95d'],
    [[.66,2.24,.01],[.76,.67,.67],'#779e50'],[[.10,2.15,.60],[.79,.59,.65],'#91ad61'],
    [[.02,2.83,-.12],[.71,.53,.67],'#9bb96d']])a.sphere(p,s,c,8,4,1,true);
  return a;
}
export function treeBirch(){
  const a=new Art();a.cylinder([0,1.35,0],.085,.15,2.7,'#e7ddbc',7);
  for(let i=0;i<7;i++)a.box([i%2?.034:-.025,.32+i*.30,.122-i*.004],[.12,.036,.015],'#827f64',[0,0,.2]);
  for(const s of [-1,1])a.tube([[0,1.42,0],[s*.32,1.93,0],[s*.46,2.44,0]],.055,'#dbd5ad',5);
  for(const [i,p]of [[-.40,2.30,0],[.38,2.49,.02],[0,2.89,0],[0,2.25,.35]].entries())a.sphere(p,[.58,.76,.54],['#9ab56a','#aac575','#b0c982','#88aa5e'][i],7,4,1,true);
  return a;
}
export function treePine(){
  const a=new Art();a.cylinder([0,.64,0],.11,.17,1.28,wood,6);
  for(let i=0;i<3;i++)a.cylinder([0,1.24+i*.66,0],.055,.91-i*.20,1.45,['#5c8667','#6e9970','#89ac7c'][i],8,[0,i*.37,0]);
  return a;
}
export function bushRound(){
  const a=new Art();for(const [i,p]of [[-.34,.38,0],[.28,.43,-.05],[.02,.61,.13]].entries())a.sphere(p,[.50,.42,.43],['#7c9a4c','#91aa58','#a7ba67'][i],8,4,1,true);return a;
}
export function bushBerry(){
  const a=bushRound();for(let i=0;i<13;i++){
    const t=i*2.399,x=Math.cos(t)*(.24+seeded(i)*.27),z=Math.sin(t)*.40;
    a.sphere([x,.64+seeded(i+2)*.15,z],[.055,.055,.055],i%2?'#b06e78':'#d39590',5,3,1,true);
  }return a;
}
export function bushFern(){
  const a=new Art();for(let i=0;i<7;i++){
    const t=i/7*Math.PI*2,dir=new T.Vector3(Math.sin(t),0,Math.cos(t));
    a.tube([[0,.05,0],[dir.x*.18,.40,dir.z*.18],[dir.x*.55,.39,dir.z*.55]],.013,'#5d8b5c',4);
    for(let j=0;j<3;j++)for(const s of [-1,1]){
      const d=.15+j*.13,p=[dir.x*d+Math.cos(t)*s*.11,.25+j*.06,dir.z*d-Math.sin(t)*s*.11];
      a.add(new T.SphereGeometry(1,4,2),j%2?'#9bb86d':'#7ca363',p,[.075,.025,.18],[0,t+s*.64,0],1,true);
    }
  }return a;
}

export function meadow(){
  const a=new Art(),n=48;
  // A flat play surface and a cutaway earth rim. The top is exactly y=0.
  const pos=[],col=[],rings=[0,.34,.69,1];
  const colors=['#a4bc68','#a1b964','#9ab45e'];
  const push=(p,c)=>{pos.push(...p);col.push(...c);};
  const verts=(ring,i)=>{const t=i/n*Math.PI*2,r=rings[ring];return [Math.sin(t)*8.5*r,0,Math.cos(t)*5.65*r];};
  for(let r=1;r<rings.length;r++)for(let i=0;i<n;i++){
    const c=new T.Color(colors[(r-1)]).multiplyScalar(.985+seeded(i+r)*.03).toArray();
    const p=verts(r-1,i),q=verts(r,i),s=verts(r,i+1),v=verts(r-1,i+1);
    for(const pt of r===1?[p,q,s]:[p,q,s,p,s,v])push(pt,c);
  }
  const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  // The explicit winding above is outward for +Y in X/Z coordinates.
  a.add(g,'#ffffff');a.c=col.flatMap((_,i)=>i%3===0?[...col.slice(i,i+3).map(v=>Math.round(v*255)),255]:[]);
  a.add(new T.CylinderGeometry(1,1,.46,48),'#a58761',[0,-.24,0],[8.5,1,5.65]);
  a.add(new T.CylinderGeometry(1.006,1.006,.13,48),'#86a34f',[0,-.08,0],[8.5,1,5.65]);
  // Small clover/flower groups are part of the ground mesh.
  for(let i=0;i<42;i++){
    const t=i*2.399,r=3.9+seeded(i)*2.9,x=Math.sin(t)*r,z=Math.cos(t)*r*.62;
    for(let k=0;k<3;k++)a.box([x+(k-1)*.055,.055,z],[.025,.11,.025],'#658a4c',[0,0,(k-1)*.26]);
    if(i%3===0){a.disc([x,.105,z],[.06,.06,1],i%2?'#f3daa1':'#e7dab9',5,[-Math.PI/2,0,0]);a.sphere([x,.12,z],[.025,.025,.025],'#d4ae5b',5,2,1,true);}
  }return a;
}

export function fence(){
  const a=new Art();for(const x of [-1,1]){
    a.box([x,.54,0],[.13,1.08,.14],wood);a.cylinder([x,1.13,0],0,.13,.16,lightwood,4,[0,Math.PI/4,0]);
  }
  for(const y of [.36,.77])a.box([0,y,0],[2.05,.12,.10],lightwood);
  for(const x of [-1,1])for(const y of [.36,.77])a.sphere([x,y,.055],[.022,.022,.012],'#856955',5,2);
  return a;
}

export function cabin(){
  const a=new Art(),wall='#e4c89b',beam='#9a7657',roof='#859794',roofEdge='#657b78';
  a.box([0,.12,0],[2.45,.24,1.97],'#c7b49a');a.box([0,.97,0],[2.22,1.74,1.78],wall);
  for(let i=0;i<8;i++)a.box([0,.20+i*.21,.899],[2.21,.017,.015],'#cbaa7c');
  for(const x of [-1.08,1.08])a.box([x,1.0,.92],[.13,1.85,.12],beam);
  for(const s of [-1,1]){
    a.box([s*.65,2.02,0],[1.51,.15,2.22],roof,[0,0,-s*.51]);
    a.box([s*1.30,1.70,0],[.10,.19,2.32],roofEdge);
  }
  // Front and rear gable triangles.
  for(const z of [-.89,.89]){
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-1.1,1.82,z,1.1,1.82,z,0,2.48,z],3));
    if(z<0){const v=g.attributes.position.array;[v[0],v[3]]=[v[3],v[0]];}g.computeVertexNormals();a.add(g,wall);
  }
  a.box([0,2.45,0],[.13,.12,2.26],roofEdge);
  a.box([-.43,.65,.917],[.66,1.19,.08],'#8b735b');a.box([-.43,1.29,.974],[.83,.105,.15],cream);
  a.sphere([-.20,.65,.97],[.035,.035,.018],'#dfc66e',6,3);
  a.box([.54,1.13,.932],[.62,.61,.06],cream);a.box([.54,1.13,.97],[.47,.46,.025],'#a6c1b7');
  a.box([.54,1.13,.991],[.046,.48,.015],beam);a.box([.54,1.13,.991],[.49,.045,.015],beam);
  a.box([.54,.77,1.01],[.77,.12,.26],beam);
  for(const x of [.30,.54,.78])a.sphere([x,.88,1.01],[.105,.11,.12],'#7f9f5e',6,3,1,true);
  a.box([-.43,.16,1.11],[.97,.13,.47],'#c5b59b');
  // A tiny pig-snout sign above the door, kept entirely as geometry.
  a.sphere([-.43,1.58,.94],[.20,.125,.035],'#e5aa94',8,3);
  for(const s of [-1,1])a.disc([-.43+s*.065,1.58,.978],[.022,.029,1],'#977e65',6);
  return a;
}

export function mud(){
  const a=new Art();
  for(const [p,s,c]of [
    [[0,.014,0],[1.50,.025,.92],'#8c7259'],[[.05,.039,.02],[1.35,.016,.78],'#aa8870'],
    [[-.65,.057,-.16],[.42,.008,.20],'#b99b7b'],[[.58,.057,.24],[.36,.008,.15],'#bd9d7c']])a.sphere(p,s,c,18,3,1,true);
  for(let i=0;i<5;i++)a.sphere([-.9+i*.46,.048,Math.sin(i*2)*.48],[.08,.035,.065],'#85694f',6,3,1,true);
  return a;
}

export function rocks(kind){
  const a=new Art(),n=kind===0?1:kind===1?2:3;
  for(let i=0;i<n;i++)a.add(new T.DodecahedronGeometry(1),['#b1b5a1','#c9c7b0','#a3ac9c'][i],[(i-(n-1)/2)*.43,.24+i*.04,Math.sin(i*3)*.2],[.44-i*.06,.35+i*.03,.38],[i*.22,i*.8,.13],1,true);
  a.sphere([.12,.48,.08],[.23,.022,.16],'#92a16b',7,2,1,true);return a;
}

export const skies=[
  {id:'morning',name:'בוקר',top:'#9ec4ca',horizon:'#f4e2bc',sun:'#fff0c4',light:'#ffdfb0',intensity:2.1,ambient:1.55,sunPosition:[-10,15,9],cloud:'#f9edcf'},
  {id:'noon',name:'צהריים',top:'#85b8c9',horizon:'#d7dfc0',sun:'#fff6d5',light:'#fff1cf',intensity:2.5,ambient:1.65,sunPosition:[-8,20,12],cloud:'#fff5d9'},
  {id:'sunset',name:'שעת זהב',top:'#b4b7cd',horizon:'#efc5a0',sun:'#ffdc9c',light:'#ffd0a0',intensity:1.9,ambient:1.5,sunPosition:[-15,9,8],cloud:'#f3d6bd'}
];

export function sky(s){
  const a=new Art(),g=new T.SphereGeometry(62,24,12);g.scale(-1,1,1);a.add(g,'#ffffff');
  const top=new T.Color(s.top),bottom=new T.Color(s.horizon);
  for(let i=0;i<a.p.length/3;i++){
    const h=T.MathUtils.clamp(a.p[i*3+1]/50,0,1),c=bottom.clone().lerp(top,h).toArray();
    for(let k=0;k<3;k++)a.c[i*4+k]=Math.round(c[k]*255);
  }
  for(const [i,p]of [[-19,13,-28],[14,15,-33],[28,12,-19],[-30,17,-10]].entries())for(let k=0;k<3;k++)a.sphere([p[0]+(k-1)*2,p[1]+(k===1?1:0),p[2]],[3.5,1.2+(k===1?.7:0),1.9],s.cloud,8,4,1,true);
  // Two low cloud wisps stay visible above the meadow in the overview camera.
  for(const p of [[-4.5,4.2,-6],[5.5,3.1,-5.5]])for(let k=0;k<3;k++)a.sphere([p[0]+(k-1)*.72,p[1]+(k===1?.18:0),p[2]],[.95,k===1?.48:.32,.42],s.cloud,8,3,1,true);
  a.sphere([-18,s.id==='sunset'?7:19,-35],[2.4,2.4,2.4],s.sun,16,8);
  return a;
}

export const environment=[
  ['tree-oak','אלון עגלגל','tree',treeOak],['tree-birch','ליבנה בהיר','tree',treeBirch],['tree-pine','אורן רך','tree',treePine],
  ['bush-round','שיח עגלגל','bush',bushRound],['bush-berry','שיח פירות יער','bush',bushBerry],['bush-fern','שרך','bush',bushFern],
  ['meadow','אחו ירוק','ground',meadow],['fence','מקטע גדר','fence',fence],['cabin','בקתה','building',cabin],['mud-puddle','שלולית בוץ','mud',mud],
  ['rock-round','סלע עגול','rock',()=>rocks(0)],['rock-pair','זוג אבנים','rock',()=>rocks(1)],['rock-cluster','מקבץ אבנים','rock',()=>rocks(2)]
];
