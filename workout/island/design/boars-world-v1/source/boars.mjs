// Reduced and redesigned from the local CC0 defense-v7 boar silhouette.
// New faces, geometry, weighted skin and all four animations are authored here.
import {Art,T,quat} from './geometry.mjs';
export const variants=[
  {id:'boar-peach',name:'פיץ׳',personality:'חיוך גדול ולחיים סמוקות',skin:'#ed9b88',nose:'#f7b3a0',cheek:'#d96674',hoof:'#75575d',bulk:1,face:'smile',ears:0},
  {id:'boar-caramel',name:'טופי',personality:'גבה סקרנית ושן קטנטנה',skin:'#b98b55',nose:'#edc591',cheek:'#cb875e',hoof:'#645247',bulk:1.12,face:'curious',ears:.18},
  {id:'boar-lilac',name:'לולי',personality:'קריצה וציצית מתולתלת',skin:'#b2a3c4',nose:'#d5bedc',cheek:'#ce8faf',hoof:'#665b7b',bulk:.94,face:'wink',ears:-.16},
  {id:'boar-cream',name:'וניל',personality:'עיניים חולמניות ולשון בחוץ',skin:'#e7d9b0',nose:'#eab9a7',cheek:'#e0a394',hoof:'#7c7462',bulk:1.06,face:'dreamy',ears:.12},
  {id:'boar-cocoa',name:'קוקו',personality:'פרצוף מופתע וכתם קרם',skin:'#8b7162',nose:'#c7a28a',cheek:'#be8273',hoof:'#534b4e',bulk:.98,face:'surprised',ears:-.08}
];

export function makeRig(){
  const specs=[['Root',-1,[0,0,0]],['Body',0,[0,.73,0]],['Head',1,[0,.85,.50]],
    ['FrontLeft',1,[.27,.51,.37]],['FrontLeftLower',3,[.27,.28,.40]],
    ['FrontRight',1,[-.27,.51,.37]],['FrontRightLower',5,[-.27,.28,.40]],
    ['HindLeft',1,[.27,.51,-.39]],['HindLeftLower',7,[.27,.28,-.36]],
    ['HindRight',1,[-.27,.51,-.39]],['HindRightLower',9,[-.27,.28,-.36]],
    ['EarLeft',2,[.24,1.10,.49]],['EarRight',2,[-.24,1.10,.49]],['Tail',1,[0,.78,-.63]]];
  return specs.map(([name,parent,world])=>({name,parent,world,local:world.map((v,i)=>v-(parent<0?0:specs[parent][2][i]))}));
}

export function makeBoar(v){
  const a=new Art(),b=v.bulk,ink='#34363c',cream='#fff3d9';
  const neck=([,,z])=>z>.22?[[1,.82],[2,.18]]:[[1,1]];
  a.sphere([0,.74,-.06],[.42*b,.42*b,.64],v.skin,12,6,neck,true);
  a.sphere([0,.83,.48],[.365,.345,.37],v.skin,10,5,2,true);
  // Soft cream muzzle, oval snout and two big nostrils read at phone size.
  a.sphere([0,.66,.78],[.265,.20,.19],v.nose,10,4,2);
  a.sphere([0,.685,.927],[.235,.143,.060],v.nose,8,3,2);
  for(const s of [-1,1]){
    a.disc([s*.088,.700,.984],[.034,.047,1],ink,7,[0,0,s*.2],2);
    a.disc([s*.28,.742,.711],[.055,.032,1],v.cheek,6,[0,s*.66,0],2);
    const y=.947+(v.face==='curious'&&s>0?.026:0),x=s*.196,z=.760;
    if(v.face==='wink'&&s<0){
      a.tube([[x-.066,y,z],[x,y-.025,z+.016],[x+.064,y+.012,z]],.013,ink,4,2);
    }else{
      const h=v.face==='dreamy'?.055:.095;
      a.sphere([x,y,z],[.080,h,.050],cream,8,3,2);
      const px=x+(v.face==='curious'?.014:s*.006),py=y+(v.face==='dreamy'?.012:-.006);
      a.disc([px,py,z+.052],[.033,v.face==='surprised'?.044:.040,1],ink,7,[0,0,0],2);
      a.disc([px-.010,py+.018,z+.054],[.011,.013,1],'#ffffff',5,[0,0,0],2);
    }
    if(v.face==='curious'||v.face==='surprised')a.tube([[x-.045,y+.13,z-.010],[x,y+.145+(s>0?.03:0),z+.006],[x+.043,y+.13,z-.01]],.012,v.hoof,4,2);
    // Closed, thick floppy ears; the inside is a smaller closed inset.
    const ear=s>0?11:12,angle=s*(.42+v.ears);
    a.add(new T.SphereGeometry(1,5,3),v.skin,[s*.29,1.135,.48],[.13,.235,.077],[.17,0,-angle],ear,true);
    a.add(new T.SphereGeometry(1,5,2),v.cheek,[s*.305,1.158,.545],[.072,.131,.014],[.17,0,-angle],ear,true);
    for(const [z,j]of [[.37,s>0?3:5],[-.39,s>0?7:9]]){
      const weights=([,y])=>{const lower=T.MathUtils.clamp((.45-y)/.21,0,1);return [[j,1-lower],[j+1,lower]];};
      a.cylinder([s*.27,.335,z+.025],.108,.081,.39,v.skin,5,[0,0,0],weights,2);
      a.box([s*.27,.078,z+.055],[.175,.156,.205],v.hoof,[0,0,0],j+1);
      // Cloven hoof mark is baked geometry, not a texture or a draw call.
      a.box([s*.27,.085,z+.159],[.014,.09,.003],v.nose,[0,0,0],j+1);
    }
  }
  const smile=v.face==='surprised'?[[0,.554,.939],[.031,.532,.935],[0,.507,.919],[-.031,.532,.935],[0,.554,.939]]:
    [[-.13,.551,.933],[-.075,.518,.925],[0,.507,.919],[.075,.518,.925],[.13,.551,.933]];
  a.tube(smile,.012,ink,4,2);
  if(v.face==='dreamy')a.sphere([.032,.495,.929],[.044,.052,.013],'#db8c96',6,2,2);
  if(v.face==='curious')a.box([-.060,.520,.938],[.034,.043,.017],cream,[0,0,0],2);
  const tail=[];for(let i=0;i<8;i++){const t=i/7*Math.PI*1.7;tail.push([Math.sin(t)*.065,.81+Math.cos(t)*.067,-.67-i*.022]);}
  a.tube(tail,.023,v.nose,4,13);
  if(v.face==='wink')a.tube([[0,1.11,.40],[-.06,1.28,.43],[.06,1.30,.46],[.07,1.22,.49]],.038,v.hoof,5,2);
  if(v.face==='surprised')a.sphere([.34,.96,-.10],[.09,.14,.25],'#e9d7b2',6,3,1,true);
  return a;
}

export const clipSpecs=[{name:'walk',duration:1.2,loop:true,speed:1.0},{name:'run',duration:.6,loop:true,speed:2.8},{name:'fall',duration:1.6,loop:false,speed:0},{name:'panic',duration:1.4,loop:false,speed:0}];
const smooth=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

export function makeAnimations(rig,art){
  // Root height is baked from the actual weighted vertices after skinning.
  // This holds planted feet on the ground and keeps the soft fall above it.
  const bind=rig.map(b=>new T.Matrix4().makeTranslation(...b.world.map(x=>-x)));
  return clipSpecs.map(spec=>{
    const times=Array.from({length:Math.round(spec.duration*30)+1},(_,i)=>i/30),poses=[];
    for(const t of times){
      const u=t/spec.duration,r=rig.map(()=>[0,0,0]),p=rig.map(b=>[...b.local]);
      if(spec.name==='walk'||spec.name==='run'){
        const run=spec.name==='run',phase=u*Math.PI*2,amp=run?.67:.34;
        r[1]=[run?-.06:.01,Math.sin(phase)*.018,Math.sin(phase)*.025];
        r[2]=[Math.sin(phase*2)*.035,Math.sin(phase)*.045,Math.sin(phase+.4)*.035];
        for(const [i,j]of [3,5,7,9].entries()){
          // Four-beat walk; paired front/hind bounding for the faster run.
          const angle=phase+(run?(i<2?0:Math.PI):([0,Math.PI,Math.PI/2,Math.PI*1.5][i]));
          r[j][0]=Math.sin(angle)*amp;r[j+1][0]=Math.max(0,-Math.sin(angle))*(run?.8:.38);
        }
        r[11][2]=Math.sin(phase+.4)*.12;r[12][2]=Math.sin(phase-.4)*.12;r[13][1]=Math.sin(phase)*.3;
        p[1][1]+=(run?.10:.023)*(1-Math.cos(phase*2));
      }else if(spec.name==='fall'){
        // One gentle, readable flop. The terminal pose is held for 0.3 s.
        const slip=smooth((u-.12)/.43),settle=Math.sin(Math.min(1,(u-.53)/.29)*Math.PI)*.045;
        r[0][2]=-slip*1.40;r[0][1]=slip*.10;p[1][0]=slip*.32;
        r[2]=[-.10*slip,.08*slip,.18*slip];
        for(const j of [3,5,7,9]){r[j][0]=(j<7?-.55:.4)*slip;r[j+1][0]=.65*slip;}
        r[11][2]=-.40*slip;r[12][2]=.42*slip;r[13][1]=.8*slip;
        p[1][1]+=Math.max(0,settle);
      }else{
        const env=Math.sin(Math.PI*smooth(u)),hop=Math.max(0,Math.sin(u*Math.PI*4))*env;
        p[1][1]+=.26*hop;r[1]=[-.10*env,Math.sin(u*Math.PI*10)*.08*env,Math.sin(u*Math.PI*8)*.055*env];
        r[2]=[-.20*env,Math.sin(u*Math.PI*6)*.20*env,Math.sin(u*Math.PI*10)*.08*env];
        for(const [i,j]of [3,5,7,9].entries()){r[j][0]=Math.sin(u*Math.PI*8+i*Math.PI)*.45*env;r[j+1][0]=.6*env;}
        r[11][2]=-.45*env;r[12][2]=.45*env;r[13][1]=Math.sin(u*Math.PI*12)*.5*env;
      }
      const q=r.map(v=>quat(...v)),world=[];
      for(const [i,b]of rig.entries()){
        const local=new T.Matrix4().compose(new T.Vector3(...p[i]),new T.Quaternion(...q[i]),new T.Vector3(1,1,1));
        world.push(b.parent<0?local:world[b.parent].clone().multiply(local));
      }
      const skin=world.map((m,i)=>m.clone().multiply(bind[i]));let min=Infinity;
      const point=new T.Vector3(),weighted=new T.Vector3();
      for(let i=0;i<art.p.length/3;i++){
        weighted.set(0,0,0);for(let k=0;k<4;k++){const w=art.w[i*4+k]/255;if(!w)continue;
          point.fromArray(art.p,i*3).applyMatrix4(skin[art.j[i*4+k]]);weighted.addScaledVector(point,w);}
        min=Math.min(min,weighted.y);
      }
      const lift=spec.name==='run'?Math.max(0,Math.sin(u*Math.PI*4))*.10:spec.name==='panic'?Math.max(0,Math.sin(u*Math.PI*4))*Math.sin(Math.PI*smooth(u))*.12:0;
      p[0][1]+=-min+.006+lift;poses.push({q,p});
    }
    const channels=[];
    for(let j=0;j<rig.length;j++)channels.push({joint:j,path:'rotation',values:poses.flatMap(p=>p.q[j])});
    for(const j of [0,1])channels.push({joint:j,path:'translation',values:poses.flatMap(p=>p.p[j])});
    return {...spec,times,channels};
  });
}
