import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

// A single, non-repeating clay field. The mesh remains perfectly planar; only
// the millimetre-scale grain perturbs the lighting, never the ball surface.
function clayTexture(keep,renderer){
 const w=512,h=1024,data=new Uint8Array(w*h*4);let seed=90431;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const low=Array.from({length:17*33},random);
 const smooth=t=>t*t*(3-2*t);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/(w-1),v=y/(h-1),gx=u*16,gy=v*32,ix=Math.min(15,Math.floor(gx)),iy=Math.min(31,Math.floor(gy)),a=smooth(gx-ix),b=smooth(gy-iy);
  const noise=T.MathUtils.lerp(T.MathUtils.lerp(low[iy*17+ix],low[iy*17+ix+1],a),T.MathUtils.lerp(low[(iy+1)*17+ix],low[(iy+1)*17+ix+1],a),b)-.5;
  const wear=Math.exp(-((u-.5)**2/.06+(v-.14)**2/.004))+Math.exp(-((u-.5)**2/.06+(v-.86)**2/.004));
  const grain=(random()-.5)*.13,shade=1+noise*.09+grain-wear*.025,i=(y*w+x)*4;
  data[i]=Math.min(255,180*shade);data[i+1]=Math.min(255,83*shade);data[i+2]=Math.min(255,53*shade);data[i+3]=255;
 }
 const map=keep(new T.DataTexture(data,w,h));map.colorSpace=T.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.needsUpdate=true;return map;
}

export function createUltraTennisCourt(scene,config,keep,renderer){
 const groups=new Map(),meshes=[],cw=config.court.halfWidth,cl=config.court.halfLength,sl=config.court.serviceLength;
 const mat=(color,extra={})=>keep(new T.MeshStandardMaterial({color,roughness:.92,...extra}));
 const green=mat('#375c50'),stone=mat('#c6b99b'),line=mat('#fff8e6'),graphite=mat('#25483f',{roughness:.5,metalness:.24}),chrome=mat('#c2c8bb',{roughness:.35,metalness:.55});
 function bake(g,m,x,y,z,rx=0,ry=0,rz=0){const o=new T.Object3D();o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.updateMatrix();g.applyMatrix4(o.matrix);if(!groups.has(m))groups.set(m,[]);groups.get(m).push(g);}
 const box=(m,x,y,z,w,h,d)=>bake(new T.BoxGeometry(w,h,d),m,x,y,z);
 box(green,0,-.012,0,13.4,.12,24);
 const map=clayTexture(keep,renderer),clay=mat('#ffffff',{map,bumpMap:map,bumpScale:.012});
 // One continuous surface gives the run-off the same clay grain as the court.
 const field=new T.Mesh(keep(new T.PlaneGeometry(12.7,23.2)),clay);field.rotation.x=-Math.PI/2;field.position.y=.077;field.receiveShadow=true;scene.add(field);
 for(const x of [-cw,cw])box(line,x,.084,0,.065,.008,cl*2+.065);
 for(const z of [-cl,cl,-sl,sl])box(line,0,.084,z,cw*2,.008,.065);
 box(line,0,.084,0,.065,.008,sl*2);
 for(const z of [-cl,cl])box(line,0,.084,z+(z>0?-.15:.15),.065,.008,.3);
 // Drainage channels stay beyond the playable field.
 for(const x of [-6.43,6.43]){box(graphite,x,.055,0,.075,.018,23.2);for(let z=-11.4;z<=11.4;z+=.48)box(chrome,x,.069,z,.065,.008,.018);}
 const netWidth=cw*2+.8,netHeight=config.court.netHeight,segments=48,geometry=keep(new T.PlaneGeometry(netWidth,netHeight,segments,1));
 const pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),sag=.065*(1-(x/(netWidth/2))**2);pos.setY(i,pos.getY(i)-sag*(pos.getY(i)/netHeight+.5));}geometry.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(22,39,29,.10)';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#24372e';ctx.lineWidth=2.8;
 for(let n=0;n<=128;n+=16){ctx.beginPath();ctx.moveTo(n,0);ctx.lineTo(n,128);ctx.moveTo(0,n);ctx.lineTo(128,n);ctx.stroke();}
 const texture=keep(new T.CanvasTexture(canvas));texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(netWidth*1.9,netHeight*2);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const netMaterial=mat('#ffffff',{map:texture,transparent:true,side:T.DoubleSide,alphaTest:.04,depthWrite:false,roughness:1});
 const net=new T.Mesh(geometry,netMaterial);net.position.set(0,netHeight/2+.09,0);net.castShadow=true;scene.add(net);
 // Bound top tape follows the cable, with a centre strap and post hardware.
 const tapeGeometry=keep(new T.PlaneGeometry(netWidth,.085,segments,1));const tp=tapeGeometry.attributes.position;
 for(let i=0;i<tp.count;i++){const x=tp.getX(i);tp.setY(i,tp.getY(i)-.065*(1-(x/(netWidth/2))**2));}tapeGeometry.computeVertexNormals();
 const tape=new T.Mesh(tapeGeometry,mat('#f7f0da',{side:T.DoubleSide}));tape.position.set(0,netHeight+.09,0);tape.castShadow=true;scene.add(tape);
 box(line,0,netHeight/2+.055,0,.035,netHeight-.04,.018);
 for(const x of [-cw-.45,cw+.45]){
  bake(new T.CylinderGeometry(.065,.072,1.26,12),graphite,x,.66,0);bake(new T.SphereGeometry(.071,10,6),chrome,x,1.3,0);
  box(graphite,x,.105,0,.24,.04,.26);box(chrome,x+(x<0?-.085:.085),.98,0,.08,.06,.05);
  for(const z of [-.07,.07])bake(new T.CylinderGeometry(.019,.019,.018,6),chrome,x,.137,z);
 }
 for(const [m,parts]of groups){const g=keep(mergeGeometries(parts,false));parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,m);mesh.receiveShadow=true;mesh.castShadow=m===graphite||m===chrome;scene.add(mesh);meshes.push(mesh);}
 return {metrics:()=>({courtSurface:'continuous-granular-clay',courtTexture:[512,1024],courtPlanar:true,netSag:.065,staticCourtBatches:meshes.length+3})};
}

/** Fixed pools: impacts follow real events, with no geometry allocation in play. */
export function createUltraTennisEffects(scene,keep){
 const count=24,positions=new Float32Array(count*3),velocity=new Float32Array(count*3),geometry=keep(new T.BufferGeometry());geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 const material=keep(new T.PointsMaterial({color:'#dbb18b',size:.055,transparent:true,opacity:.7,depthWrite:false})),dust=new T.Points(geometry,material);dust.visible=false;scene.add(dust);
 const pulse=new T.Mesh(keep(new T.RingGeometry(.12,.145,32)),keep(new T.MeshBasicMaterial({color:'#fff8cb',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false})));pulse.visible=false;scene.add(pulse);
 let event=-1,life=0,pulseLife=0,serial=0;
 return {update(s,dt,camera){
  if(event!==s.event.id){event=s.event.id;
   if(s.event.type==='bounce'||s.event.reason==='doubleBounce'){
    life=.42;serial++;const x=s.ball.x,z=s.ball.z;
    for(let i=0;i<count;i++){const angle=i*2.399963+serial*.7,speed=.35+(i%7)*.075;positions.set([x,.12,z],i*3);velocity.set([Math.sin(angle)*speed,.25+(i%5)*.13,Math.cos(angle)*speed],i*3);}dust.visible=true;
   }
   if(s.event.type==='hit'){pulseLife=.16;pulse.position.set(s.ball.x,s.ball.y+.09,s.ball.z);pulse.visible=true;}
  }
  if(life>0){life=Math.max(0,life-dt);for(let i=0;i<count;i++){const j=i*3;positions[j]+=velocity[j]*dt;positions[j+1]=Math.max(.1,positions[j+1]+velocity[j+1]*dt);positions[j+2]+=velocity[j+2]*dt;velocity[j+1]-=2.5*dt;}geometry.attributes.position.needsUpdate=true;material.opacity=life/.42*.55;dust.visible=life>0;}
  if(pulseLife>0){pulseLife=Math.max(0,pulseLife-dt);pulse.quaternion.copy(camera.quaternion);pulse.scale.setScalar(1+(1-pulseLife/.16)*2.4);pulse.material.opacity=pulseLife/.16*.65;pulse.visible=pulseLife>0;}
 },metrics:()=>({dustParticles:count,impactEffects:true})};
}
