import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** Presentation only: waterline foam and bow waves for every hull, hazy far
 * islands for depth, and a gold ring that marks a critical hit. Four fixed
 * draws; nothing here reads or writes simulation state. */
function canvasTexture(size,paint){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');paint(g,size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
function foamRing(g,s){
 const h=s/2;g.clearRect(0,0,s,s);
 for(let i=0;i<220;i++){const a=i/220*Math.PI*2;if(Math.sin(a*5+1.1)+.6*Math.sin(a*13)>.55)continue;const r=h*(.74+.08*Math.sin(a*7)+.05*Math.sin(a*17+1.3)),w=h*(.05+.05*Math.abs(Math.sin(a*11)));
  const grad=g.createRadialGradient(h+Math.cos(a)*r,h+Math.sin(a)*r,0,h+Math.cos(a)*r,h+Math.sin(a)*r,w*2.2);grad.addColorStop(0,'rgba(255,255,255,.55)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.beginPath();g.arc(h+Math.cos(a)*r,h+Math.sin(a)*r,w*2.2,0,Math.PI*2);g.fill();}
}
function bowWave(g,s){
 g.clearRect(0,0,s,s);g.lineCap='round';
 for(let k=0;k<3;k++){g.strokeStyle=`rgba(255,255,255,${.62-k*.17})`;g.lineWidth=s*(.05-k*.012);g.beginPath();g.moveTo(s*.5,s*(.06+k*.08));g.quadraticCurveTo(s*(.32-k*.04),s*(.4+k*.05),s*(.06+k*.02),s*.97);g.moveTo(s*.5,s*(.06+k*.08));g.quadraticCurveTo(s*(.68+k*.04),s*(.4+k*.05),s*(.94-k*.02),s*.97);g.stroke();}
 const grad=g.createRadialGradient(s*.5,s*.12,0,s*.5,s*.12,s*.22);grad.addColorStop(0,'rgba(255,255,255,.7)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(0,0,s,s);
}
export function createNavalDressing(scene,balance,{maxShips=8}={}){
 const flat=new T.PlaneGeometry(1,1);flat.rotateX(-Math.PI/2);
 const ringMap=canvasTexture(128,foamRing),waveMap=canvasTexture(128,bowWave);
 const foamMaterial=new T.MeshBasicMaterial({map:ringMap,color:'#ffffff',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}),waveMaterial=foamMaterial.clone();waveMaterial.map=waveMap;
 const foam=new T.InstancedMesh(flat,foamMaterial,maxShips),waves=new T.InstancedMesh(flat,waveMaterial,maxShips);
 for(const mesh of [foam,waves]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.renderOrder=1;mesh.setColorAt(0,new T.Color(1,1,1));scene.add(mesh);}
 // Far islands: low hazy silhouettes beyond the play area give the sea a horizon.
 const hills=[];let seed=91;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(const [x,z,w,h] of [[-190,-250,46,10],[-120,-282,30,7],[40,-292,58,13],[150,-262,40,9],[230,-210,34,7],[-250,-170,30,6]]){
  for(let n=0;n<3;n++){const g=new T.ConeGeometry(w*(.55+rnd()*.5),h*(.7+rnd()*.6),9,1);g.translate(x+(n-1)*w*.45,h*.3-1,z+rnd()*8);g.scale(1,1,.55);g.deleteAttribute('uv');g.deleteAttribute('normal');hills.push(g.toNonIndexed());g.dispose();}
 }
 const hillGeometry=mergeGeometries(hills);hills.forEach(g=>g.dispose());
 const hillMaterial=new T.MeshBasicMaterial({color:'#86aeb9',fog:false}),horizon=new T.Mesh(hillGeometry,hillMaterial);scene.add(horizon);
 const burstGeometry=new T.RingGeometry(.86,1,48);burstGeometry.rotateX(-Math.PI/2);
 const burstMaterial=new T.MeshBasicMaterial({color:'#ffd768',transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,depthTest:false,toneMapped:false}),burst=new T.Mesh(burstGeometry,burstMaterial);burst.visible=false;burst.renderOrder=6;scene.add(burst);
 const dummy=new T.Object3D(),color=new T.Color();let disposed=false,shown={foam:0,waves:0,critical:false};
 return {
  /** hulls: [{x,z,yaw,length,speed,visible}] in world units. */
  update(hulls,time,blast,life){
   if(disposed)return;let f=0,w=0;
   for(const h of hulls){if(!h.visible||f>=maxShips)continue;const pulse=1+Math.sin(time*2.3+h.x)*.04,beam=h.length*.36;
    dummy.position.set(h.x,.05,h.z);dummy.rotation.set(0,h.yaw+Math.sin(time*.7+h.x)*.18,0);dummy.scale.set(beam*1.22*pulse,1,h.length*1.02*pulse);dummy.updateMatrix();foam.setMatrixAt(f,dummy.matrix);color.setScalar((.17+Math.min(.25,h.speed*.05))*.8);foam.setColorAt(f,color);f++;
    const strength=.2+.8*Math.min(1,h.speed/4.5);{const dx=-Math.sin(h.yaw),dz=-Math.cos(h.yaw);dummy.position.set(h.x+dx*h.length*.28,.06,h.z+dz*h.length*.28);dummy.scale.set(beam*(1.6+strength*1.4),1,h.length*(.55+strength*.55));dummy.updateMatrix();waves.setMatrixAt(w,dummy.matrix);color.setScalar(.75*1.15*strength);waves.setColorAt(w,color);w++;}
   }
   foam.count=f;waves.count=w;for(const m of [foam,waves]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
   const u=blast&&blast.life>0&&blast.critical?1-blast.life/life:-1;burst.visible=u>=0;
   if(burst.visible){burst.position.set(blast.wx,.12,blast.wz);burst.scale.setScalar(2+u*12);burstMaterial.opacity=Math.pow(1-u,1.1);}
   shown={foam:f,waves:w,critical:burst.visible};
  },
  degrade(){horizon.visible=true;waves.visible=false;},
  metrics(){return {...shown,horizonIslands:6,disposed};},
  dispose(){if(disposed)return;disposed=true;scene.remove(foam,waves,horizon,burst);foam.dispose();waves.dispose();for(const g of [flat,hillGeometry,burstGeometry])g.dispose();for(const m of [foamMaterial,waveMaterial,hillMaterial,burstMaterial])m.dispose();ringMap?.dispose();waveMap?.dispose();},
 };
}
