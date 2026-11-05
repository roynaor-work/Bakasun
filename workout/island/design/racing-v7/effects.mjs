import * as T from 'three';
import {loadTexture} from './loader.mjs';

// Fixed-size particle pools. No geometry/material allocation in update().
export async function createEffects(scene){
  const root=new T.Group();root.name='Tire smoke and contact sparks';scene.add(root);
  const smokeTex=await loadTexture('./textures/tire-smoke.png',true);
  const smokeN=42,sparkN=46;
  const smokeState=Array.from({length:smokeN},()=>({age:9,life:1,p:new T.Vector3(),v:new T.Vector3(),size:1}));
  const sparkState=Array.from({length:sparkN},()=>({age:9,life:.5,p:new T.Vector3(),v:new T.Vector3()}));
  const smokeMaterial=new T.MeshBasicMaterial({map:smokeTex,color:'#a9bac9',transparent:true,opacity:.27,depthWrite:false,side:T.DoubleSide});
  const smoke=new T.InstancedMesh(new T.PlaneGeometry(1,1),smokeMaterial,smokeN);smoke.frustumCulled=false;smoke.renderOrder=4;root.add(smoke);
  const sparkGeo=new T.BufferGeometry(),sparkPositions=new Float32Array(sparkN*6),sparkColors=new Float32Array(sparkN*6);
  sparkGeo.setAttribute('position',new T.BufferAttribute(sparkPositions,3).setUsage(T.DynamicDrawUsage));
  sparkGeo.setAttribute('color',new T.BufferAttribute(sparkColors,3).setUsage(T.DynamicDrawUsage));
  const sparks=new T.LineSegments(sparkGeo,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1,depthWrite:false,blending:T.AdditiveBlending}));sparks.frustumCulled=false;sparks.renderOrder=5;root.add(sparks);
  const beamCanvas=document.createElement('canvas');beamCanvas.width=128;beamCanvas.height=256;
  const bg=beamCanvas.getContext('2d'),beamPixels=bg.createImageData(128,256);
  for(let y=0;y<256;y++)for(let x=0;x<128;x++){
    const lobe=Math.exp(-(((x-39)/27)**2)-((y-133)/88)**2)+Math.exp(-(((x-89)/27)**2)-((y-133)/88)**2);
    const edge=Math.sin(Math.PI*(x+.5)/128)**1.8*Math.sin(Math.PI*(y+.5)/256)**1.4;
    const i=(y*128+x)*4;beamPixels.data[i]=222;beamPixels.data[i+1]=238;beamPixels.data[i+2]=255;beamPixels.data[i+3]=Math.min(255,lobe*edge*170);
  }
  bg.putImageData(beamPixels,0,0);
  const beamTexture=new T.CanvasTexture(beamCanvas);beamTexture.colorSpace=T.SRGBColorSpace;
  const beam=new T.Mesh(new T.PlaneGeometry(5.2,15),new T.MeshBasicMaterial({map:beamTexture,color:'#d2e7ff',transparent:true,opacity:.21,depthWrite:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));beam.name='Headlamp road pool';beam.rotation.x=-Math.PI/2;beam.renderOrder=2;root.add(beam);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const sg=shadowCanvas.getContext('2d'),shade=sg.createRadialGradient(32,32,6,32,32,32);shade.addColorStop(0,'rgba(255,255,255,.85)');shade.addColorStop(.6,'rgba(255,255,255,.53)');shade.addColorStop(1,'rgba(255,255,255,0)');sg.fillStyle=shade;sg.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(shadowCanvas);
  const shadow=new T.Mesh(new T.PlaneGeometry(2.6,4.6),new T.MeshBasicMaterial({map:shadowTexture,color:'#000000',transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));shadow.name='Local contact shade';shadow.rotation.x=-Math.PI/2;shadow.renderOrder=1;root.add(shadow);
  const groundMatrix=new T.Matrix4(),backward=new T.Vector3(),groundNormal=new T.Vector3();
  const dummy=new T.Object3D(),q=new T.Quaternion(),p=new T.Vector3();let si=0,ki=0,emit=0;
  let randomSeed=7127;
  function rand(){randomSeed=(Math.imul(1664525,randomSeed)+1013904223)|0;return(randomSeed>>>0)/4294967296;}
  const local=new T.Vector3(),world=new T.Vector3();
  function burstSpark(point,count=14,direction=null){
    for(let i=0;i<count;i++){
      const s=sparkState[ki++%sparkN];s.age=0;s.life=.24+rand()*.5;
      s.p.copy(point);s.v.set((rand()-.5)*5,1.5+rand()*5,(rand()-.5)*4);
      if(direction)s.v.addScaledVector(direction,4+rand()*7);
    }
  }
  function update(dt,{car,camera,drift,speed,boost,sample,ahead,night,visualTime}){
    if(sample&&car){backward.copy(sample.t).negate();groundNormal.crossVectors(sample.t,sample.n).normalize();groundMatrix.makeBasis(sample.n,backward,groundNormal);shadow.quaternion.setFromRotationMatrix(groundMatrix);shadow.position.copy(sample.p);shadow.position.y+=.019;}
    beam.visible=!!night;
    if(night&&ahead){beam.position.copy(ahead.p);beam.position.y+=.045;beam.rotation.set(-Math.PI/2,0,0);beam.rotateOnWorldAxis(T.Object3D.DEFAULT_UP,ahead.yaw);}
    emit+=dt;
    if(car&&drift&&speed>20&&emit>.045){
      emit=0;
      for(const sign of [-1,1]){
        const s=smokeState[si++%smokeN];s.age=0;s.life=.85+rand()*.55;s.size=.55+rand()*.38;
        local.set(sign*.93,.19,-1.55);s.p.copy(car.localToWorld(local));
        s.v.set((rand()-.5)*.8,.55+rand()*.5,(rand()-.5)*.8);
      }
      // A deliberate demonstration of underbody / road contact while drifting.
      if(Math.floor(visualTime*8)%6===0){local.set(1.25,.11,-2.23);burstSpark(car.localToWorld(local),9,car.getWorldDirection(world).negate());}
    }
    q.copy(camera.quaternion);
    for(let i=0;i<smokeN;i++){
      const s=smokeState[i];s.age+=dt;
      if(s.age<s.life){
        s.p.addScaledVector(s.v,dt);const f=1-s.age/s.life;
        dummy.position.copy(s.p);dummy.quaternion.copy(q);dummy.rotateZ(i*2.31+s.age*.2);
        dummy.scale.setScalar((s.size+s.age*1.6)*Math.min(1,f*5));
      }else{dummy.position.set(0,-999,0);dummy.scale.setScalar(.0001);}
      dummy.updateMatrix();smoke.setMatrixAt(i,dummy.matrix);
    }
    smoke.instanceMatrix.needsUpdate=true;
    for(let i=0;i<sparkN;i++){
      const s=sparkState[i];s.age+=dt;const a=i*6;
      if(s.age<s.life){
        s.v.y-=dt*9.8;s.p.addScaledVector(s.v,dt);p.copy(s.p).addScaledVector(s.v,-.035);
        s.p.toArray(sparkPositions,a);p.toArray(sparkPositions,a+3);
        const fade=1-s.age/s.life;
        for(let j=0;j<2;j++){sparkColors[a+j*3]=1.8*fade;sparkColors[a+j*3+1]=.85*fade;sparkColors[a+j*3+2]=.18*fade;}
      }else{for(let j=0;j<6;j++){sparkPositions[a+j]=0;sparkColors[a+j]=0;}}
    }
    sparkGeo.attributes.position.needsUpdate=true;sparkGeo.attributes.color.needsUpdate=true;
  }
  function clear(){for(const s of smokeState)s.age=9;for(const s of sparkState)s.age=9;emit=0;}
  return{root,update,burstSpark,clear,counts:{smoke:smokeN,sparks:sparkN}};
}

// Screen-space peripheral blur samples the current framebuffer, with a clear center.
export function createSpeedPass(renderer){
  const target=new T.WebGLRenderTarget(1,1,{depthBuffer:true,type:T.HalfFloatType});
  target.texture.colorSpace=T.LinearSRGBColorSpace;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const uniforms={tScene:{value:target.texture},strength:{value:0},center:{value:new T.Vector2(.5,.48)}};
  const material=new T.ShaderMaterial({uniforms,depthWrite:false,depthTest:false,toneMapped:true,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D tScene;uniform float strength;uniform vec2 center;varying vec2 vUv;
    void main(){vec2 d=vUv-center;float e=smoothstep(.22,.66,length(d));vec2 b=d*strength*e;
      vec4 c=texture2D(tScene,vUv)*.30;
      c+=texture2D(tScene,vUv-b*.25)*.22;c+=texture2D(tScene,vUv-b*.5)*.20;
      c+=texture2D(tScene,vUv-b*.75)*.16;c+=texture2D(tScene,vUv-b)*.12;
      gl_FragColor=c;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  function resize(w,h,pixelRatio){target.setSize(Math.max(1,Math.round(w*pixelRatio)),Math.max(1,Math.round(h*pixelRatio)));}
  function render(world,worldCamera,amount){
    if(amount<.003){renderer.setRenderTarget(null);renderer.render(world,worldCamera);return;}
    renderer.setRenderTarget(target);renderer.render(world,worldCamera);
    renderer.setRenderTarget(null);uniforms.strength.value=amount;renderer.render(scene,camera);
  }
  return{resize,render,target,dispose(){target.dispose();material.dispose();scene.children[0].geometry.dispose();}};
}

export function createSpeedLines(canvas){
  const ctx=canvas.getContext('2d');let width=1,height=1;let enabled=true;
  function resize(w,h){width=w;height=h;canvas.width=w;canvas.height=h;}
  function draw(time,intensity){
    ctx.clearRect(0,0,width,height);if(!enabled||intensity<.05)return;
    const cx=width*.5,cy=height*.46;
    ctx.lineWidth=.7;ctx.strokeStyle=`rgba(225,245,250,${intensity*.31})`;
    for(let i=0;i<27;i++){
      const angle=i*2.39996323;
      const t=(time*(.40+(i%5)*.06)+i*.371)%1;
      const base=.52+t*.28,ray=Math.hypot(width,height)*.59;
      const x=Math.cos(angle)*ray,y=Math.sin(angle)*ray;
      ctx.beginPath();ctx.moveTo(cx+x*base,cy+y*base);
      ctx.lineTo(cx+x*(base+.025+intensity*.07),cy+y*(base+.025+intensity*.07));ctx.stroke();
    }
  }
  return{resize,draw,setEnabled(v){enabled=v;}};
}
