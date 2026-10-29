// Weather for the second chapter (waves 11-20): clear, fog, rain, storm.
// Everything blends smoothly between presets; rain is one line-segment mesh around the camera, lightning is a flash plus a bolt.
import * as THREE from './vendor/three.module.js';
import {HIGH,rand} from './kit.js';

const P={
  clear:{fog:'#a9d6df',dens:.0024,hemi:1.05,hemiSky:'#d3ecff',hemiGnd:'#c4a87a',sun:3.4,sunCol:'#ffe8c2',top:'#2b86c2',mid:'#7fc0dc',hor:'#d8f0ee',seaTop:'#5aa9d6',seaHor:'#d8f0ee',dim:1,chop:0,cloud:'#ffffff',cloudA:1,rain:0,mtn:'#b9d9dc',env:.6,exp:1},
  fog:{fog:'#c4ced0',dens:.0125,hemi:1.0,hemiSky:'#e2e8ea',hemiGnd:'#b4a88c',sun:1.7,sunCol:'#f2eee2',top:'#a5b6bd',mid:'#bfcbcf',hor:'#cad4d6',seaTop:'#93a7ad',seaHor:'#c4ced0',dim:.72,chop:0,cloud:'#d8dee0',cloudA:.35,rain:0,mtn:'#c4ced0',env:.45,exp:1},
  rain:{fog:'#8f9ca2',dens:.0058,hemi:.82,hemiSky:'#b1bec5',hemiGnd:'#7d7466',sun:1.35,sunCol:'#d9dee2',top:'#4f5e67',mid:'#6f7f88',hor:'#9aa6ab',seaTop:'#52626b',seaHor:'#9aa6ab',dim:.55,chop:.45,cloud:'#8a959b',cloudA:1,rain:.62,mtn:'#7b888e',env:.36,exp:.97},
  storm:{fog:'#5f6d75',dens:.0066,hemi:.66,hemiSky:'#8796a2',hemiGnd:'#5a544c',sun:.75,sunCol:'#c8d0d8',top:'#232c34',mid:'#3a4750',hor:'#65727a',seaTop:'#2e3b43',seaHor:'#5f6d75',dim:.36,chop:1,cloud:'#4a545a',cloudA:1,rain:1,mtn:'#434f56',env:.26,exp:.94}
};
const COLORS=['fog','hemiSky','hemiGnd','sunCol','top','mid','hor','seaTop','seaHor','cloud','mtn'];
const NUMS=['dens','hemi','sun','dim','chop','cloudA','rain','env','exp'];
const toState=p=>{const o={};for(const k of COLORS)o[k]=new THREE.Color(p[k]);for(const k of NUMS)o[k]=p[k];return o;};

export function createWeather({scene,world,camera,renderer,sfx}){
  const cur=toState(P.clear),goal=toState(P.clear);let kind='clear',flash=0,flashT=0,nextBolt=6,shake=0;
  // rain streaks
  const N=HIGH?1700:850,pos=new Float32Array(N*6),drops=[];
  for(let i=0;i<N;i++)drops.push({x:rand(-46,46),y:rand(-2,34),z:rand(-72,20),v:rand(36,48)});
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const rainMat=new THREE.LineBasicMaterial({color:'#d4dee2',transparent:true,opacity:0,depthWrite:false});
  const rain=new THREE.LineSegments(rg,rainMat);rain.frustumCulled=false;rain.renderOrder=5;scene.add(rain);
  // lightning bolt (a jagged line far over the sea)
  const boltGeo=new THREE.BufferGeometry();boltGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(28*3),3));
  const boltMat=new THREE.LineBasicMaterial({color:'#f2f7ff',transparent:true,opacity:0,fog:false,depthWrite:false,blending:THREE.AdditiveBlending});
  const bolt=new THREE.Line(boltGeo,boltMat);bolt.frustumCulled=false;bolt.visible=false;scene.add(bolt);
  const boltLight=new THREE.DirectionalLight('#dfe8ff',0);boltLight.position.set(0,80,-200);scene.add(boltLight);
  function strike(){const a=boltGeo.attributes.position;let x=rand(-260,260),y=190,z=rand(-560,-260);const n=a.count;
    for(let i=0;i<n;i++){a.setXYZ(i,x,y,z);y-=190/(n-1);x+=rand(-9,9);z+=rand(-4,4);}a.needsUpdate=true;
    bolt.visible=true;flash=1;flashT=0;boltLight.position.set(x,120,z+100);
    const d=Math.abs(z)/340;setTimeout(()=>sfx.play('thunder',Math.max(.35,1.1-d*.5)),(400+d*900));}
  function set(next,instant=false){kind=P[next]?next:'clear';Object.assign(goal,toState(P[kind]));if(instant)for(const k of COLORS)cur[k].copy(goal[k]);if(instant)for(const k of NUMS)cur[k]=goal[k];nextBolt=rand(3,6);apply();}
  function apply(){
    scene.fog.color.copy(cur.fog);scene.fog.density=cur.dens;
    world.hemi.intensity=cur.hemi+flash*2.4;world.hemi.color.copy(cur.hemiSky);world.hemi.groundColor.copy(cur.hemiGnd);
    world.sun.intensity=cur.sun;world.sun.color.copy(cur.sunCol);boltLight.intensity=flash*3.5;
    const s=world.sky,fl=flash*.55;s.top.value.copy(cur.top).lerp(WHITE,fl*.6);s.mid.value.copy(cur.mid).lerp(WHITE,fl*.7);s.horizon.value.copy(cur.hor).lerp(WHITE,fl*.8);
    const u=world.seaU;u.fogColor.value.copy(cur.fog);u.skyTop.value.copy(cur.seaTop);u.skyHor.value.copy(cur.seaHor);u.uDim.value=Math.min(1,cur.dim+flash*.5);u.uFog.value=cur.dens*1.1;u.uChop.value=cur.chop;
    for(const c of world.clouds||[]){c.material.color.copy(cur.cloud);c.material.opacity=Math.min(1,(c.userData.a??=c.material.opacity)*cur.cloudA);}
    if(world.mountain)world.mountain.color.copy(cur.mtn);
    scene.environmentIntensity=cur.env;renderer.toneMappingExposure=cur.exp;
    rainMat.opacity=cur.rain*.42;rain.visible=cur.rain>.02;
  }
  function update(dt){
    const k=1-Math.exp(-dt/.9);for(const c of COLORS)cur[c].lerp(goal[c],k);for(const n of NUMS)cur[n]+=(goal[n]-cur[n])*k;
    if(kind==='storm'){nextBolt-=dt;if(nextBolt<=0){nextBolt=rand(4.5,10);strike();}}
    if(flash>0){flashT+=dt;flash=flashT<.07?1:flashT<.13?.25:flashT<.2?.85:Math.max(0,.85-(flashT-.2)*3.2);boltMat.opacity=flash;if(flash<=0)bolt.visible=false;}
    if(rain.visible){const wind=kind==='storm'?-11:-5,len=kind==='storm'?1.35:1.0,live=Math.floor(N*Math.min(1,cur.rain+.15));const cx=camera.position.x,cz=camera.position.z;
      for(let i=0;i<live;i++){const d=drops[i];d.y-=d.v*dt;d.x+=wind*dt;if(d.y<-2){d.y=rand(28,34);d.x=rand(-46,46);d.z=rand(-72,20);}if(d.x<-46)d.x+=92;
        const j=i*6;pos[j]=cx+d.x;pos[j+1]=d.y;pos[j+2]=cz-24+d.z;pos[j+3]=cx+d.x-wind*.03*len;pos[j+4]=d.y+len;pos[j+5]=cz-24+d.z;}
      rg.setDrawRange(0,live*2);rg.attributes.position.needsUpdate=true;}
    sfx.rain?.(kind==='rain'||kind==='storm'?cur.rain:0);
    apply();
  }
  return {set,update,strike,get kind(){return kind;},get flash(){return flash;}};
}
const WHITE=new THREE.Color('#ffffff');
