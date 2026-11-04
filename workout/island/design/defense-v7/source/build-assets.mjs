import {Art,T,P,fs,path,root,out} from './mesh.mjs';

await fs.mkdir(out,{recursive:true});
const inventory=[];
const q=(e)=>new T.Quaternion().setFromEuler(new T.Euler(...e)).toArray();
const circle=(r,y,n=40)=>Array.from({length:n+1},(_,i)=>[Math.sin(i/n*Math.PI*2)*r,y,Math.cos(i/n*Math.PI*2)*r]);
function engine(a,x,y,z,r=.16,lod=0){
  a.cylinder([x,y,z],r,r*1.2,'dark',[Math.PI/2,0,0],lod?10:18);
  a.ring([x,y,z-r*.65],r*.78,r*.13,'cream',[0,0,0],lod?16:24);
  a.sphere([x,y,z-r*.7],[r*.55,r*.55,.045],'glass',12,6,'emission');
}
function rivet(a,p,lod){if(!lod)a.sphere(p,[.028,.028,.028],'gold',8,4);}
function window(a,p,scale=[.1,.08,.055],lod=0){a.sphere(p,scale,'glass',lod?10:16,lod?5:8,'emission');}

function scout(lod){
  const a=new Art('alien-scout',lod),n=lod?20:40;
  a.sphere([0,0,0],[1.1,.24,1.1],'teal',n,lod?8:16);
  a.sphere([0,.08,0],[.97,.22,.97],'cream',n,lod?8:12);
  a.sphere([0,.3,0],[.58,.4,.58],'mint',n,lod?8:16);
  a.ring([0,.16,0],.60,.045,'dark',[Math.PI/2,0,0],n);
  a.ring([0,-.07,0],1.015,.045,'gold',[Math.PI/2,0,0],n);
  for(let i=0;i<8;i++){const t=i/8*Math.PI*2;
    window(a,[Math.sin(t)*1.02,-.015,Math.cos(t)*1.02],[.10,.065,.10],lod);
    if(!lod){a.tube([[Math.sin(t)*.72,.21,Math.cos(t)*.72],[Math.sin(t)*.91,.16,Math.cos(t)*.91]],.012,'dark',6);}
  }
  a.tube([[0,.59,0],[0,.90,0]],.028,'dark',8);a.sphere([0,.94,0],[.09,.09,.09],'coral',12,6);
  a.cylinder([0,-.26,0],.36,.20,'dark',[0,0,0],n,.27);window(a,[0,-.38,0],[.25,.05,.25],lod);
  return a.anchor('fire',[0,-.42,0]).anchor('hit',[0,.2,0]);
}
function manta(lod){
  const a=new Art('alien-manta',lod),seg=lod?16:28;
  a.sphere([0,.06,.12],[.40,.28,1.18],'lavender',seg,lod?8:12);
  a.fin([[0,-1.02],[.30,-.63],[1.60,.37],[1.72,.76],[.94,.55],[.38,.16],[0,.42]],.15,'cream');
  a.fin([[0,-1.02],[-.30,-.63],[-1.60,.37],[-1.72,.76],[-.94,.55],[-.38,.16],[0,.42]],.15,'cream');
  for(const s of [-1,1]){
    a.tube([[s*.39,.13,-.20],[s*.96,.17,-.12],[s*1.52,.14,-.64]],lod?.04:.06,'teal',8);
    a.sphere([s*.68,.05,-.38],[.20,.20,.54],'lavender',seg,8);engine(a,s*.68,.03,-.86,.18,lod);
    window(a,[s*.13,.27,.57],[.10,.06,.24],lod);
    a.tube([[s*.28,.10,.84],[s*.34,.07,1.31]],.035,'dark',8);
  }
  a.sphere([0,.25,.33],[.24,.18,.47],'glass',seg,8,'emission');
  return a.anchor('fire_left',[.34,.07,1.35]).anchor('fire_right',[-.34,.07,1.35]).anchor('hit',[0,.2,.2]);
}
function bomber(lod){
  const a=new Art('alien-beetle',lod),n=lod?16:28;
  a.sphere([0,0,0],[.88,.41,1.05],'dark',n,12);
  for(const s of [-1,1]){
    a.sphere([s*.42,.21,0],[.45,.32,.97],'coral',n,12);
    a.tube([[s*.72,.12,.60],[s*1.02,-.10,.18],[s*1.12,-.16,-.44]],.10,'cream',10);
    a.box([s*.92,-.22,.28],[.26,.16,.43],'gold',.04);
    engine(a,s*.50,-.03,-.91,.22,lod);
    for(let i=0;i<3;i++)window(a,[s*.47,.16,.98-i*.32],[.08,.06,.06],lod);
  }
  a.tube([[0,.54,-.65],[0,.55,.1],[0,.39,.72]],.028,'cream',8);
  a.sphere([0,.12,.88],[.42,.24,.32],'cream',n,10);window(a,[0,.28,1.05],[.24,.10,.06],lod);
  a.cylinder([0,-.36,.1],.24,.17,'gold',[0,0,0],18,.19);
  return a.anchor('bomb',[0,-.5,.1]).anchor('hit',[0,.2,0]);
}
function carrier(lod){
  const a=new Art('alien-carrier',lod),n=lod?28:56;
  a.ring([0,0,0],1.06,.26,'lavender',[Math.PI/2,0,0],n);
  a.ring([0,.13,0],1.08,.17,'cream',[Math.PI/2,0,0],n);
  a.ring([0,-.08,0],1.06,.055,'gold',[Math.PI/2,0,0],n);
  for(let i=0;i<6;i++){const t=i/6*Math.PI*2,x=Math.sin(t),z=Math.cos(t);
    a.tube([[x*.46,.17,z*.46],[x*.92,.13,z*.92]],.08,'teal',10);
    window(a,[x*1.27,.08,z*1.27],[.10,.08,.10],lod);
    if(!lod)rivet(a,[x*1.1,.33,z*1.1],0);
  }
  a.sphere([0,.17,0],[.50,.44,.50],'purple',n,12);
  a.sphere([0,.27,.18],[.34,.31,.34],'mint',n,12);
  a.cylinder([0,-.25,0],.34,.23,'dark',[0,0,0],20,.20);
  return a.anchor('deploy',[0,-.45,0]).anchor('hit',[0,.3,0]);
}
function harvester(lod){
  const a=new Art('alien-harvester',lod),n=lod?16:28;
  a.sphere([0,.04,0],[.62,.43,.62],'teal',n,12);a.sphere([0,.26,0],[.45,.37,.45],'cream',n,12);
  a.sphere([0,.36,.3],[.23,.20,.23],'gold',n,10,'emission');
  for(let i=0;i<3;i++){const t=i/3*Math.PI*2,dir=(r,y)=>[Math.sin(t)*r,y,Math.cos(t)*r];
    a.tube([dir(.35,.12),dir(.84,.12),dir(1.16,-.10),dir(1.19,-.43)], [.13,.14,.11,.07],'cream',n);
    a.sphere(dir(.83,.12),[.21,.19,.21],'coral',n,10);
    a.cylinder(dir(1.19,-.44),.11,.22,'dark',[0,0,0],12,.15);
    a.sphere(dir(1.19,-.57),[.085,.035,.085],'glass',12,6,'emission');
  }
  a.ring([0,-.30,0],.34,.05,'gold',[Math.PI/2,0,0],28);
  return a.anchor('tractor',[0,-.5,0]).anchor('hit',[0,.22,0]);
}
function boss(lod){
  const a=new Art('alien-boss',lod),n=lod?28:56;
  a.sphere([0,0,0],[1.64,.42,1.64],'purple',n,16);
  a.ring([0,.15,0],1.63,.16,'cream',[Math.PI/2,0,0],n);
  a.ring([0,-.10,0],1.48,.075,'gold',[Math.PI/2,0,0],n);
  a.sphere([0,.39,0],[.91,.46,.91],'cream',n,16);
  a.sphere([0,.53,0],[.63,.45,.63],'mint',n,16);
  for(let i=0;i<6;i++){const t=i/6*Math.PI*2;
    const x=Math.sin(t),z=Math.cos(t);
    a.tube([[x*.99,.13,z*.99],[x*1.44,.45,z*1.44],[x*1.55,.84,z*1.55]], [.18,.16,.08],'teal',12);
    a.sphere([x*1.56,.84,z*1.56],[.16,.16,.16],'gold',16,8);
    a.sphere([x*1.28,-.35,z*1.28],[.32,.23,.32],'dark',n,8);
    a.sphere([x*1.28,-.51,z*1.28],[.16,.07,.16],'coral',16,8,'emission');
    for(let j=0;j<3;j++){const u=t+(j-1)*.15;window(a,[Math.sin(u)*1.64,.03,Math.cos(u)*1.64],[.07,.075,.07],lod);}
  }
  a.cylinder([0,-.39,0],.41,.38,'gold',[0,0,0],n,.33);
  a.ring([0,-.60,0],.29,.04,'dark',[Math.PI/2,0,0],n);
  return a.anchor('beam',[0,-.65,0]).anchor('hit',[0,.4,0]);
}
function plane(lod){
  const a=new Art('defender-plane',lod),n=lod?16:32;
  a.sphere([0,0,0],[.26,.27,1.17],'cream',n,12);
  a.fin([[-.12,-.72],[-.53,-.48],[-1.36,.22],[-1.44,.44],[-.50,.22],[-.15,.11]],.10,'teal');
  a.fin([[.12,-.72],[.53,-.48],[1.36,.22],[1.44,.44],[.50,.22],[.15,.11]],.10,'teal');
  a.sphere([0,.22,.22],[.20,.21,.49],'dark',n,12);
  a.sphere([0,.26,.26],[.17,.18,.42],'glass',n,12,'emission');
  a.ring([0,.10,.49],.19,.023,'cream',[Math.PI/2,0,0],24);
  for(const s of [-1,1]){
    a.sphere([s*.43,-.10,-.40],[.14,.15,.49],'cream',n,10);engine(a,s*.43,-.10,-.85,.14,lod);
    a.box([s*.98,.04,-.11],[.14,.075,.36],'coral',.025);
    a.tube([[s*.53,-.03,.37],[s*.54,-.03,.72]],.032,'gold',8);
  }
  a.fin([[-.12,1.04],[-.73,1.0],[-.75,.77],[-.11,.69]],.08,'teal');
  a.fin([[.12,1.04],[.73,1.0],[.75,.77],[.11,.69]],.08,'teal');
  a.tube([[0,.13,-.67],[0,.54,-.91],[0,.56,-1.08]], [.08,.055,.035],'coral',10);
  a.sphere([0,-.015,1.05],[.19,.19,.22],'gold',n,10);
  return a.anchor('fire_left',[.54,-.03,.74]).anchor('fire_right',[-.54,-.03,.74]).anchor('engine_left',[.43,-.10,-.99]).anchor('engine_right',[-.43,-.10,-.99]).anchor('hit',[0,.12,0]);
}

function boar(kind,lod){
  const id=['boar-amber','boar-ash','boar-striped'][kind],a=new Art(id,lod),n=lod?12:24,small=kind===2,skin=['brown','ash','piglet'][kind];
  const bulk=kind===1?1.12:1;
  a.sphere([0,.70,0],[.38*bulk,.42*bulk,.63],skin,n,lod?6:12);
  a.sphere([0,.78,.49],[.33,.34,.42],skin,n,12);
  a.sphere([0,.67,.78],[.24,.20,.29],small?'coral':'sand',n,10);
  a.sphere([0,.66,1.0],[.20,.14,.047],small?'coral':'brown',n,8);
  for(const s of [-1,1]){
    a.sphere([s*.075,.68,1.04],[.035,.025,.016],'eye',10,6);
    a.sphere([s*.267,.84,.68],[.070,.075,.056],'cream',12,8);
    a.sphere([s*.323,.85,.720],[.034,.040,.022],'eye',12,8);
    if(!lod)a.sphere([s*.344,.868,.734],[.009,.011,.007],'white',8,4);
    a.tube([[s*.24,.96,.47],[s*.35,1.20,.40],[s*.36,1.22,.55],[s*.21,1.02,.58]], [.13,.05,.023,.06],skin,10);
    a.tube([[s*.25,1.02,.51],[s*.31,1.14,.46],[s*.32,1.15,.54]], [.06,.035,.009],'coral',8);
    if(!small)a.tube([[s*.21,.56,.83],[s*.30,.56,.91],[s*.34,.66,.94],[s*.33,.76,.94]], [.065,.055,.035,.003],'white',12);
    for(const [z,g]of [[.36,'front'],[-.39,'back']]){
      const group=g+(s>0?'_left':'_right');
      a.pivot(group,[s*.24,.58,z]);
      a.tube([[s*.24,.58,z],[s*.25,.30,z+.03],[s*.26,.12,z+.07]], [.13,.10,.085],skin,10,group);
      a.box([s*.26,.085,z+.11],[.18,.17,.24],'dark',.035,group);
      if(!lod)a.tube([[s*.26,.10,z+.235],[s*.26,.18,z+.235]],.008,'sand',6,group);
    }
  }
  a.tube([[0,.77,-.56],[.06,.78,-.76],[.13,.83,-.80],[.14,.91,-.75],[.09,.91,-.72]], [.045,.035,.028,.023,.01],skin,8);
  if(kind===1){
    for(let i=0;i<8;i++)a.tube([[0,1.03,-.53+i*.13],[0,1.25-i*.015,-.49+i*.13]], [.08,.003],'dark',8);
  }else if(small){
    for(const s of [-1,1])for(let j=0;j<3;j++){
      const x=s*(.16+j*.07),y=1.055-j*.09;
      a.tube([[x,y,-.46],[x*1.2,y+.022,-.1],[x,y,.26]], [.018,.031,.014],'cream',8);
    }
  }else for(let i=0;i<5;i++)a.tube([[0,1.07,-.45+i*.16],[0,1.17,-.40+i*.16]], [.045,.002],'wood',6);
  a.anchor('hit',[0,.7,.1]).anchor('ground',[0,0,0]).anchor('nose',[0,.66,1.05]);
  const times=Array.from({length:9},(_,i)=>i*.1),channels=[];
  for(const g of ['front_left','front_right','back_left','back_right']){
    const sign=['front_left','back_right'].includes(g)?1:-1;
    const angles=times.map(t=>Math.sin(t/.8*Math.PI*2)*sign*.17),pivot=a.pivots.get(g);
    channels.push({node:g,path:'rotation',values:angles.flatMap(v=>q([v,0,0]))});
    const positions=angles.flatMap(angle=>{
      let min=Infinity;
      for(const part of a.parts.filter(p=>p.group===g)){
        const p=part.geo.attributes.position;
        for(let i=0;i<p.count;i++)min=Math.min(min,pivot[1]+Math.cos(angle)*(p.getY(i)-pivot[1])-Math.sin(angle)*(p.getZ(i)-pivot[2]));
      }
      return [pivot[0],pivot[1]+Math.max(0,-min),pivot[2]];
    });
    channels.push({node:g,path:'translation',values:positions});
  }
  return {art:a,animation:{name:'trot',times,channels}};
}

function fence(lod){
  const a=new Art('farm-fence',lod);
  for(const x of [-1,1]){a.box([x,.64,0],[.15,1.28,.18],'wood',lod?0:.025);a.box([x,1.27,0],[.21,.12,.24],'cream',lod?0:.025);}
  for(const y of [.42,.91])a.box([0,y,0],[2.1,.14,.13],'cream',lod?0:.02);
  if(!lod)for(const x of [-1,1])for(const y of [.42,.91])a.sphere([x,y,.078],[.026,.026,.013],'gold',8,4);
  return a.anchor('left',[-1,0,0]).anchor('right',[1,0,0]);
}
function gate(lod){
  const a=new Art('farm-gate',lod);for(const s of [-1,1]){a.box([s*1.2,.78,0],[.21,1.56,.23],'wood',.03);a.box([s*1.2,1.57,0],[.28,.12,.3],'cream',.03);}
  for(const y of [.3,.7,1.1])a.box([0,y,0],[2.16,.12,.12],'cream',.025);
  a.tube([[-1.04,.3,0],[1.04,1.1,0]],.055,'wood',10);
  a.box([.91,.77,.11],[.18,.18,.10],'gold',.025);
  return a.anchor('hinge',[-1.2,0,0]).anchor('latch',[1.2,.77,0]);
}
function bell(lod){
  const a=new Art('alarm-bell',lod);
  for(const x of [-.43,.43])a.box([x,1.14,0],[.12,2.28,.13],'wood',.02);
  a.box([0,2.24,0],[1.08,.16,.18],'cream',.03);
  a.tube([[0,2.19,0],[0,1.95,0]],.025,'dark',8);
  const points=[[.05,0],[.14,-.04],[.20,-.23],[.27,-.37],[.29,-.40],[.29,-.43],[.23,-.43],[.20,-.31],[.15,-.12],[.05,-.09]].map(([x,y])=>new T.Vector2(x,y));
  a.add(new T.LatheGeometry(points,lod?16:32),'gold',[0,1.94,0],[0,0,0],[1,1,1],'bell');
  a.sphere([0,1.55,0],[.05,.08,.05],'dark',12,8,'bell');
  a.pivot('bell',[0,1.94,0]);
  a.tube([[.05,1.55,.08],[.03,1.22,.13],[.08,.87,.17]],.014,'cream',8,'bell');
  a.box([.55,1.28,.02],[.15,.27,.18],'dark',.035);
  a.sphere([.55,1.47,.02],[.09,.09,.09],'coral',16,8,'emission');
  return a.anchor('clapper',[0,1.55,0]).anchor('light',[.55,1.47,.02]);
}
function shelter(lod){
  const a=new Art('farm-shelter',lod);
  for(const x of [-1.45,1.45])for(const z of [-.96,.96])a.box([x,1.12,z],[.15,2.24,.15],'wood',.02);
  a.box([0,.72,-.96],[2.9,1.4,.12],'cream',.04);
  for(let i=0;i<9;i++)a.box([-1.3+i*.325,.72,-.88],[.24,1.32,.045],i%2?'cream':'sand',.02);
  for(const s of [-1,1]){
    const g=new T.BoxGeometry(1.96,.13,2.56);g.rotateZ(s*-.32);a.add(g,'coral',[s*.90,2.32,0]);
    if(!lod)for(let j=0;j<9;j++)a.tube([[s*.04,2.62,-1.15+j*.28],[s*1.78,2.04,-1.15+j*.28]],.016,'wood',6);
  }
  a.box([0,.12,0],[3.26,.24,2.3],'sand',.08);a.box([0,.27,.77],[1.1,.23,.45],'wood',.05);
  a.box([0,.29,.77],[.93,.12,.3],'glass',.03);
  return a.anchor('door',[0,0,1.2]).anchor('roof',[0,2.7,0]);
}
function watch(lod){
  const a=new Art('guard-station',lod);
  a.box([0,.12,0],[1.8,.24,1.8],'sand',.07);
  for(const x of [-.67,.67])for(const z of [-.67,.67])a.box([x,1.12,z],[.15,2.24,.15],'wood',.025);
  a.box([0,2.26,0],[1.9,.18,1.9],'teal',.06);
  a.box([0,.87,-.65],[1.35,1.2,.14],'cream',.04);
  a.box([-.65,.87,.1],[.13,1.2,1.1],'cream',.04);
  a.box([.65,.87,.1],[.13,1.2,1.1],'cream',.04);
  a.box([0,1.08,0],[.74,.10,.48],'wood',.035);
  a.box([0,1.27,-.06],[.45,.28,.10],'dark',.035);
  a.box([0,1.29,.005],[.36,.18,.015],'glass',.015,'emission');
  a.cylinder([.85,2.44,0],.09,.19,'gold');a.sphere([.85,2.59,0],[.10,.12,.10],'coral',16,8,'emission');
  return a.anchor('guard',[0,0,.9]).anchor('lamp',[.85,2.6,0]);
}
function palm(lod){
  const a=new Art('island-palm',lod),n=lod?8:12;
  a.tube([[0,0,0],[.06,.9,.02],[.17,1.8,0],[.26,2.65,.05]],[.18,.15,.12,.10],'wood',n);
  if(!lod)for(let i=0;i<10;i++)a.ring([.02+i*.023,.24+i*.24,.02],.168-i*.006,.022,'sand',[Math.PI/2,0,0],12);
  for(let i=0;i<(lod?6:8);i++){
    const t=i/(lod?6:8)*Math.PI*2;
    const points=[[.26,2.65,.05],[.26+Math.sin(t)*.56,2.99,.05+Math.cos(t)*.56],[.26+Math.sin(t)*1.1,2.82,.05+Math.cos(t)*1.1],[.26+Math.sin(t)*1.5,2.35,.05+Math.cos(t)*1.5]];
    a.tube(points,[.08,.19,.16,.005],i%2?'grass':'green',lod?4:6);
  }
  for(let i=0;i<3;i++)a.sphere([.2+Math.sin(i*2)*.15,2.55,.05+Math.cos(i*2)*.15],[.13,.16,.13],'brown',12,6);
  return a;
}
function cloud(lod){
  const a=new Art('island-cloud',lod);
  for(const [x,y,z,s]of [[-.8,0,0,.55],[-.25,.2,.1,.7],[.42,.05,0,.72],[.94,-.10,0,.46]])a.sphere([x,y,z],[s,s*.6,s*.7],'white',lod?12:20,lod?6:10);
  return a;
}
function planet(kind,lod){
  const a=new Art(kind?'planet-ring':'planet-moon',lod),n=lod?20:40;
  a.sphere([0,0,0],[1,1,1],kind?'coral':'lavender',n,lod?12:24);
  if(kind){a.ring([0,0,0],1.65,.06,'sand',[1.15,0,.2],lod?32:64);a.ring([0,0,0],1.45,.025,'cream',[1.15,0,.2],lod?32:64);}
  else for(const [x,y,z,s]of [[-.38,.35,.83,.17],[.33,-.4,.83,.24],[.45,.52,.65,.14],[-.23,-.3,.92,.10]])a.sphere([x,y,z],[s,s,s*.16],'purple',lod?12:20,8);
  return a;
}

for(const build of [scout,manta,bomber,carrier,harvester,boss,plane,fence,gate,bell,shelter,watch,palm,cloud]){
  for(const lod of [0,1]){const a=build(lod);inventory.push(await a.write({lod}));}
}
for(const kind of [0,1,2])for(const lod of [0,1]){
  const {art,animation}=boar(kind,lod);inventory.push(await art.write({lod,texture:true,animations:[animation]}));
}
for(const kind of [0,1])for(const lod of [0,1])inventory.push(await planet(kind,lod).write({lod}));
await fs.writeFile(path.join(root,'verification/authored.json'),JSON.stringify(inventory,null,2));
console.log(JSON.stringify(inventory.map(({id,lod,triangles,bytes})=>({id,lod,triangles,bytes})),null,2));
