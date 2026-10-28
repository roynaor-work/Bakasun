import {registerBuildingVisual} from './buildings.mjs?v=island-naval-aim-20261028-1';
import {primitive as part} from './environment.mjs?v=island-naval-aim-20261028-1';
const block=(g,c,p,s)=>part(g,'box',c,p,s);
for(const kind of ['library','mathLab','zoo','puzzleRoom'])registerBuildingVisual(kind,(g,v,w,d,h)=>{
  block(g,'#fff4dc',[0,.07,0],[w*.96,.14,d*.96]);
  block(g,v.color,[0,h*.5,0],[w*.8,h,d*.72]);
  block(g,v.roofColor,[0,h+.08,0],[w*.92,.18,d*.84]);
  block(g,'#335d73',[0,h*.28,d*.37],[.32,h*.53,.04]);
  for(const x of [-w*.25,w*.25])block(g,'#a7e3eb',[x,h*.6,d*.37],[w*.2,h*.3,.05]);
  if(kind==='library'){
    // A giant open book on the roof and colored book spines at the entrance.
    for(const side of [-1,1]){const cover=block(g,'#fff8df',[side*w*.17,h+.35,0],[w*.33,.08,d*.45]);cover.rotation.z=side*.22;}
    block(g,v.roofColor,[0,h+.36,0],[.06,.12,d*.47]);
    for(let i=0;i<5;i++)block(g,['#eb8e85','#edc761','#80c6bc'][i%3],[-w*.32+i*w*.08,h*.4,d*.42],[w*.05,h*.4,.05]);
  }else if(kind==='mathLab'){
    for(const x of [-w*.28,w*.28])block(g,'#fff4dc',[x,h+.3,0],[.05,.4,.06]);
    for(let row=0;row<3;row++){block(g,'#335d73',[0,h+.2+row*.12,0],[w*.58,.025,.03]);for(let i=0;i<4;i++)part(g,'sphere',['#ffcd67','#83c9ba','#ed8a9a'][row],[(i-1.5)*w*.12,h+.2+row*.12,0],[.09,.09,.09]);}
  }else if(kind==='zoo'){
    // Entrance arch and trees; animals are represented by bundled symbols in lessons.
    for(const x of [-w*.39,w*.39])block(g,v.roofColor,[x,h*.35,d*.4],[.1,h*.7,.1]);
    block(g,v.roofColor,[0,h*.72,d*.4],[w*.86,.15,.1]);
    for(const x of [-w*.33,w*.33]){block(g,'#a47752',[x,h+.25,0],[.09,.4,.09]);part(g,'sphere','#70b88b',[x,h+.57,0],[.48,.55,.48]);}
  }else{
    for(let i=0;i<4;i++){const x=(i%2-.5)*w*.32,z=(Math.floor(i/2)-.5)*d*.3;block(g,['#ed9b90','#8bbee4','#f0cd72','#92cdb4'][i],[x,h+.19,z],[w*.29,.22,d*.27]);part(g,'cylinder','#fff4dc',[x,h+.34,z],[.12,.08,.12]);}
  }
});
