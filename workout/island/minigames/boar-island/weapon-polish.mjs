// Coastal weapon polish v0.1. Original additive artwork. Call once, before the game compacts weapon meshes.
import * as THREE from './vendor/three.module.js';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
const cache=new Map(),mats=new Map(),TAU=Math.PI*2;
const shape=(id,fn)=>{if(!cache.has(id))cache.set(id,fn());return cache.get(id);};
const material=(c,metal=.6,rough=.35,glow=null)=>{const id=[c,metal,rough,glow].join();if(!mats.has(id))mats.set(id,new THREE.MeshStandardMaterial({color:c,metalness:metal,roughness:rough,...(glow?{emissive:glow,emissiveIntensity:2.2}:{})}));return mats.get(id);};
const C={white:material('#c6d0cc',.42,.32),dark:material('#172b35',.8,.35),steel:material('#6e9098',.9,.25),orange:material('#e38138',.35,.38),black:material('#07141c',.2,.66),copper:material('#a86a40',.9,.3),cyan:material('#54e5ee',.2,.2,'#30bdd4'),red:material('#ff9d50',.15,.2,'#ff7c28')};
function add(p,g,m,pos=[0,0,0],rot=null){const o=new THREE.Mesh(g,m);o.position.set(...pos);if(rot)o.rotation.set(...rot);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;}
const rounded=(p,s,pos,m=C.white,r=.06,rot)=>add(p,shape(`r${s}-${r}`,()=>new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(n=>n/2-.001)))),m,pos,rot);
const ball=(p,s,pos,m=C.steel)=>{const o=add(p,shape('ball',()=>new THREE.SphereGeometry(1,20,14)),m,pos);o.scale.set(...s);return o;};
const tube=(p,r,h,pos,m=C.steel,rot=[Math.PI/2,0,0],r2=r)=>add(p,shape(`c${r}-${r2}-${h}`,()=>new THREE.CylinderGeometry(r,r2,h,20)),m,pos,rot);
const ring=(p,r,t,pos,m=C.steel,rot=null)=>add(p,shape(`t${r}-${t}`,()=>new THREE.TorusGeometry(r,t,8,32)),m,pos,rot);
function fin(p,points,depth,pos,m=C.white,rot=null){const id=JSON.stringify(points)+depth;return add(p,shape(id,()=>{const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,steps:1});}),m,pos,rot);}
function connector(p,a,b,r=.045,m=C.steel){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const o=tube(p,r,d.length(),av.add(bv).multiplyScalar(.5).toArray(),m,[0,0,0]);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
function hose(p,points,r=.04,m=C.dark){const pts=points.map(q=>new THREE.Vector3(...q));const id='hose'+JSON.stringify(points)+r;return add(p,shape(id,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,r,6,false)),m);}
function bolts(p,coords,r=.035){for(const v of coords){tube(p,r,.025,v,C.steel,[Math.PI/2,0,0]);rounded(p,[r*.8,.008,.008],[v[0],v[1],v[2]+.014],C.black,.002);}}
function label(p,text,pos,size=[.55,.2],color='#c4e1e3',rot=null,he=false,small=false){if(typeof document==='undefined')return;const cv=document.createElement('canvas');cv.width=512;cv.height=192;const x=cv.getContext('2d');x.fillStyle='#0b202a';x.fillRect(0,0,512,192);x.strokeStyle='#6c9299';x.lineWidth=3;x.strokeRect(12,12,488,168);if(he){x.direction='rtl';x.fillStyle=color;x.font=`bold ${small?72:60}px Heebo, Arial, sans-serif`;x.textAlign='center';x.fillText(text,256,small?118:94);if(!small){x.font='26px Heebo, Arial, sans-serif';x.fillStyle='#79a6b0';x.fillText('מערכות חוף · דגם 3',256,150);}}else{x.fillStyle=color;x.font='bold 62px monospace';x.textAlign='center';x.fillText(text,256,94);x.font='22px monospace';x.fillStyle='#79a6b0';x.fillText('COASTAL SYSTEMS / MK.III',256,150);}const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.3});return add(p,new THREE.PlaneGeometry(...size),m,pos,rot);}

// layout 'v02' (default) is the original package behaviour. layout 'v03' fits Claude's v0.3 models: it moves parts that
// would collide with the new geometry, mounts the muzzle sleeve on the rotating barrels and the cannon brake on the
// recoiling barrel, and writes the operator labels in Hebrew.
export function refineWeapons(models,opts={}){
  const v3=opts.layout==='v03';
  const names=v3?{mg:'מקלע חוף',shotgun:'רסס סערה',cannon:'תותח נפץ',tesla:'סליל ברק'}:{mg:'TWIN VIPER',shotgun:'BREACH-08',cannon:'LEVIATHAN',tesla:'ARC / 900'};
  const backZ=v3?{mg:.78,shotgun:.78,cannon:.73,tesla:.73}:null;
  for(const [key,model] of Object.entries(models)){
    const g=model.group;if(g.userData.coastalWeaponPolishV1)continue;g.userData.coastalWeaponPolishV1=true;const originalChildren=new Set(g.children);
    const bz=v3?backZ[key]:.718;
    // Layered receiver, cutout service panels and recessed screws.
    for(const s of [-1,1]){
      rounded(g,[.38,.47,1.15],[s*(v3?.66:.64),-.02,.08],key==='tesla'?C.steel:C.white,.1,[0,0,s*.12]);
      rounded(g,[.04,.13,.8],[s*(v3?.87:.85),.05,.08],C.dark,.018);
      rounded(g,[.055,.06,.5],[s*(v3?.9:.88),.07,.05],C.orange,.012);
      for(let i=0;i<5;i++)rounded(g,[.15,.025,.11],[s*.63,.26,.39-i*.18],C.dark,.008);
      tube(g,.115,.12,[s*.81,-.25,.36],C.steel,[0,0,Math.PI/2]);
      hose(g,[[s*.77,-.18,.45],[s*.97,-.48,-.25],[s*.8,-.32,-1.3]],.04,C.black);
    }
    if(!(v3&&key==='cannon'))label(g,names[key],[0,v3&&key==='cannon'?-.12:.25,bz],[.79,.28],undefined,null,v3);
    else label(g,names[key],[0,-.25,bz],[.6,.2],undefined,null,v3);
    bolts(g,[[-.42,.17,bz+.012],[.42,.17,bz+.012],[-.42,-.16,bz+.012],[.42,-.16,bz+.012]],.03);
    // A readable illuminated telemetry screen facing the operator.
    rounded(g,[.4,.23,.05],[.39,.36,v3?bz-.22:.47],C.black,.025);
    label(g,key==='tesla'?(v3?'900 וולט':'900 V'):(v3?'מוכן':'READY'),[.39,.36,v3?bz-.188:.502],[.34,.17],'#6ce4dc',null,v3,true);
    for(let i=0;i<3;i++)ball(g,[.018,.018,.012],[.7,.39-i*.055,v3?bz+.015:.73],i<2?C.cyan:C.orange);
    if(!(v3&&key==='mg'))for(let i=0;i<6;i++)rounded(g,[.16,.035,.065],[0,.49,.1-i*.12],C.steel,.008);
    // Reflex sight with transparent tinted lens and a floating luminous reticle (v0.3: the machine gun and the shotgun keep their own sights).
    if(!(v3&&(key==='mg'||key==='shotgun'))){
      const sight=new THREE.Group();sight.position.set(0,.72,-.12);g.add(sight);
      rounded(sight,[.42,.035,.11],[0,.2,0],C.dark,.015);for(const s of [-1,1])rounded(sight,[.035,.35,.1],[s*.2,.05,0],C.dark,.012);
      const glass=new THREE.MeshPhysicalMaterial({color:'#5bc8d1',transparent:true,opacity:.15,metalness:.1,roughness:.08,side:THREE.DoubleSide,depthWrite:false});add(sight,shape('sightglass',()=>new THREE.PlaneGeometry(.35,.3)),glass,[0,.04,0]);
      ring(sight,.066,.004,[0,.06,.008],C.cyan);rounded(sight,[.004,.12,.006],[0,.06,.012],C.cyan,.001);rounded(sight,[.12,.004,.006],[0,.06,.012],C.cyan,.001);
    }
    if(key==='mg'){
      for(const s of [-1,1]){
        tube(g,.34,.12,[s*.4,.05,-1.45],C.white);tube(g,.29,.045,[s*.4,.05,-1.53],C.orange);
        for(let j=0;j<8;j++){const a=j/8*TAU;rounded(g,[.05,.09,.53],[s*.4+Math.cos(a)*.265,.05+Math.sin(a)*.265,-1.12],C.steel,.015,[0,0,a]);}
        if(v3&&model.spinners){ // sleeve turns with the six barrels; shorter so the hot barrel tips stay visible
          const sp=model.spinners[s<0?0:1];const z0=-2.62;
          tube(sp,.3,.24,[0,0,z0],C.white);tube(sp,.32,.06,[0,0,z0-.15],C.steel);tube(sp,.245,.015,[0,0,z0-.188],C.black);
          for(let j=0;j<6;j++){const a=j/6*TAU;tube(sp,.05,.03,[Math.cos(a)*.12,Math.sin(a)*.12,z0-.2],C.black);}
        }else{
          tube(g,.3,.42,[s*.4,.05,-2.95],C.white);tube(g,.32,.06,[s*.4,.05,-3.17],C.steel);
          tube(g,.245,.015,[s*.4,.05,-3.208],C.black);
          for(let j=0;j<3;j++){const a=j/3*TAU;tube(g,.06,.03,[s*.4+Math.cos(a)*.12,.05+Math.sin(a)*.12,-3.225],C.black);}
        }
        if(v3&&s<0)continue; // v0.3 keeps its animated belt and ammunition can on the left
        tube(g,.35,.42,[s*1.05,-.14,.16],C.dark,[0,0,Math.PI/2]);tube(g,.3,.045,[s*1.28,-.14,.16],C.orange,[0,0,Math.PI/2]);
        for(let i=0;i<9;i++){const a=i*.22;const bullet=new THREE.Group();bullet.position.set(s*(.8-i*.047),.28+Math.sin(a)*.09,.26-i*.13);bullet.rotation.z=Math.PI/2;g.add(bullet);tube(bullet,.037,.22,[0,0,0],C.copper,[0,0,0]);add(bullet,shape('ammotip',()=>new THREE.ConeGeometry(.037,.1,10)),C.steel,[0,.16,0]);}
      }
    }else if(key==='shotgun'){
      for(const s of [-1,1]){rounded(g,[.29,.22,1.1],[s*(v3?.42:.36),.19,-1.65-(v3?.15:0)],C.white,.05);for(let j=0;j<4;j++)rounded(g,[.12,.028,.16],[s*(v3?.46:.4),.32,-1.27-j*.22-(v3?.15:0)],C.black,.008);tube(g,.24,.15,[s*(v3?.17:.2),v3?.15:.12,-2.46],C.orange);tube(g,.14,.02,[s*(v3?.17:.2),v3?.15:.12,-2.55],C.black);}
      const dc=v3?[-.62,.18,-.04]:[0,-.32,-.08];ring(g,.46,.035,dc,C.orange);for(let j=0;j<8;j++){const a=j/8*TAU;ball(g,[.025,.025,.03],[dc[0]+Math.cos(a)*.39,dc[1]+Math.sin(a)*.39,dc[2]+.01],C.steel);}
    }else if(key==='cannon'){
      for(const s of [-1,1]){rounded(g,v3?[.24,.36,1.3]:[.26,.47,1.4],[s*(v3?.42:.31),v3?.06:.11,-1.75],C.white,.07);hose(g,[[s*.65,.2,.25],[s*.7,v3?.36:.5,-.6],[s*(v3?.45:.35),v3?.22:.34,-1.8]],.05,C.orange);for(let j=0;j<5;j++)rounded(g,[.06,.025,.15],[s*(v3?.58:.47),.35,-1.17-j*.2],C.dark,.008);}
      if(v3&&model.slide){tube(g,.35,.12,[0,.12,-2.45],C.orange);const b=model.slide;rounded(b,[.82,.42,.55],[0,.12,-3.15],C.white,.08);rounded(b,[.45,.2,.02],[0,.12,-3.435],C.black,.03);}
      else{tube(g,.4,.15,[0,.12,-2.55],C.orange);rounded(g,[.82,.42,.55],[0,.12,-3.08],C.white,.08);rounded(g,[.45,.2,.02],[0,.12,-3.37],C.black,.03);}
    }else{
      for(const s of [-1,1]){rounded(g,[.15,.2,2],[s*(v3?.55:.35),v3?-.12:.05,-1.6],C.white,.04);hose(g,[[s*.84,.25,.4],[s*1.03,.32,-.7],[s*(v3?.55:.3),v3?-.05:.1,-2.3]],.055,C.cyan);}
      if(!v3)for(let j=0;j<6;j++)ring(g,.33,.035,[0,.1,-.48-j*.35],j%2?C.copper:C.steel);
      ball(g,[.15,.15,.18],[0,.1,-2.72],C.cyan);
    }
    // Flatten only new rigid decorative groups; preserve every existing animated group.
    g.updateMatrixWorld(true);
    for(const child of [...g.children])if(child.isGroup&&!originalChildren.has(child)){
      const rigid=[];child.traverse(o=>{if(o.isMesh)rigid.push(o);});for(const o of rigid)g.attach(o);g.remove(child);
    }
  }
}

