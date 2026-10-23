import * as T from '../vendor/three.module.js';

// Six fixed instanced batches. Their clocks follow the simulation, so pause,
// slow frames and disposal never leave a second, independent effects timeline.
const COUNTS=Object.freeze({flames:7,smoke:8,embers:10,drops:64,mist:30,stream:42});
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const fract=v=>v-Math.floor(v);
const noise=v=>fract(Math.sin(v*127.1+311.7)*43758.5453123);
const vertexShader=`
  attribute vec4 aEffect;
  varying vec2 vUv;
  varying vec4 vEffect;
  void main(){
    vUv=uv;vEffect=aEffect;
    gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
  }
`;
const noiseShader=`
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vEffect;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
  float field(vec2 p){return n2(p)*.62+n2(p*2.07+13.7)*.27+n2(p*4.11-7.3)*.11;}
`;
const outputShader=`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const fragments={
  flames:`
    ${noiseShader}
    void main(){
      vec2 p=vUv;float seed=vEffect.x*23.0,t=uTime*(1.9+vEffect.y*.6);
      float turbulence=field(vec2(p.x*5.1+seed,p.y*5.5-t));
      float bend=sin(p.y*5.3-t*1.6+seed)*.10*p.y;
      float taper=mix(.48,.018,pow(p.y,.76));
      float edge=abs(p.x-.5+bend)+(turbulence-.48)*(.12+p.y*.19);
      float body=(1.0-smoothstep(taper*.63,taper,edge));
      body*=smoothstep(0.,.10,p.y)*(1.-smoothstep(.68,1.,p.y));
      float holes=smoothstep(.18,.65,field(vec2(p.x*8.7+seed,p.y*7.9-t*1.25)));
      float temperature=clamp((1.-p.y)*.72+(1.-edge/max(.02,taper))*.34+turbulence*.17,0.,1.);
      vec3 color=mix(vec3(.72,.075,.009),vec3(2.35,.72,.055),smoothstep(.20,.76,temperature));
      color=mix(color,vec3(3.2,1.9,.54),smoothstep(.73,1.03,temperature));
      float alpha=body*mix(.29,.92,holes)*vEffect.z;
      if(alpha<.012)discard;
      gl_FragColor=vec4(color,alpha);
      ${outputShader}
    }
  `,
  smoke:`
    ${noiseShader}
    void main(){
      vec2 p=(vUv-.5)*2.;float age=vEffect.y,seed=vEffect.x*41.;
      vec2 drift=vec2(seed+uTime*.065,seed*.37-uTime*.11);
      float cloud=field(p*2.6+drift);
      float shape=1.-smoothstep(.12,1.12,length(p*vec2(.94,1.))+(cloud-.4)*.34);
      float structure=mix(.45,1.,field(p*4.0+drift*1.4));
      float light=clamp(.42+p.y*.17+cloud*.24,0.,1.);
      vec3 soot=mix(vec3(.10,.115,.12),vec3(.43,.46,.47),light);
      vec3 steam=mix(vec3(.53,.65,.68),vec3(.88,.94,.94),light);
      vec3 color=mix(soot,steam,vEffect.w);
      float alpha=shape*structure*vEffect.z;
      if(alpha<.012)discard;
      gl_FragColor=vec4(color,alpha);
      ${outputShader}
    }
  `,
  embers:`
    ${noiseShader}
    void main(){
      vec2 p=(vUv-.5)*2.;float core=1.-smoothstep(.08,.91,length(p));
      float pulse=.72+.28*sin(uTime*12.+vEffect.x*91.);
      vec3 color=mix(vec3(1.5,.18,.015),vec3(3.2,1.25,.19),core);
      float alpha=core*vEffect.z*pulse;
      if(alpha<.01)discard;
      gl_FragColor=vec4(color,alpha);
      ${outputShader}
    }
  `,
  drops:`
    ${noiseShader}
    void main(){
      vec2 p=(vUv-.5)*2.;float mask=1.-smoothstep(.12,1.,dot(p,p));
      float glint=pow(max(0.,1.-length(p-vec2(-.17,.20))),3.);
      vec3 color=mix(vec3(.28,.56,.67),vec3(1.1,1.35,1.45),glint);
      float alpha=mask*vEffect.z;
      if(alpha<.015)discard;
      gl_FragColor=vec4(color,alpha);
      ${outputShader}
    }
  `,
  mist:`
    ${noiseShader}
    void main(){
      vec2 p=(vUv-.5)*2.;float cloud=field(p*3.+vEffect.x*31.+vec2(uTime*.16,-uTime*.23));
      float mask=1.-smoothstep(.14,.98,length(p)+(cloud-.5)*.25);
      float alpha=mask*mix(.3,1.,cloud)*vEffect.z;
      if(alpha<.01)discard;
      gl_FragColor=vec4(mix(vec3(.46,.68,.75),vec3(.90,1.02,1.06),cloud),alpha);
      ${outputShader}
    }
  `,
  stream:`
    ${noiseShader}
    void main(){
      vec2 p=(vUv-.5)*2.;float edge=1.-smoothstep(.05,1.,abs(p.x));
      float ends=1.-smoothstep(.40,1.,abs(p.y));
      float glint=.58+.42*sin(vUv.y*18.+uTime*28.+vEffect.x*47.);
      float alpha=edge*ends*vEffect.z;
      if(alpha<.01)discard;
      gl_FragColor=vec4(mix(vec3(.26,.59,.72),vec3(1.1,1.28,1.34),glint),alpha);
      ${outputShader}
    }
  `
};

/** Procedural rendering only: never mutates flames, rescue or water state.
 * Existing tube geometry can remain as the hydraulic stream's solid body.
 * Call after the original view has computed its real nozzle and impact. */
export function createUltraFireEffects({scene,model,balance}){
  const root=new T.Group();root.name='ultra-fire-effects';scene.add(root);
  const uniforms={uTime:{value:model.time||0}},batches=[],resources=[];
  const siteCount=model.flames.length,rescueCount=model.rescues?.length||0;
  const capacities={flames:siteCount*COUNTS.flames,smoke:siteCount*COUNTS.smoke+rescueCount*3,embers:siteCount*COUNTS.embers,drops:COUNTS.drops,mist:COUNTS.mist,stream:COUNTS.stream};
  function batch(kind){
    const geometry=new T.PlaneGeometry(1,1),count=capacities[kind],effect=new T.InstancedBufferAttribute(new Float32Array(Math.max(1,count)*4),4).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('aEffect',effect);
    const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader:fragments[kind],transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,forceSinglePass:true,blending:kind==='embers'?T.AdditiveBlending:T.NormalBlending});
    const mesh=new T.InstancedMesh(geometry,material,Math.max(1,count));mesh.count=0;mesh.name=`ultra-fire-${kind}`;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.renderOrder=kind==='smoke'?12:kind==='mist'?14:16;
    root.add(mesh);const entry={mesh,effect,used:0,capacity:count,kind};batches.push(entry);resources.push(geometry,material,mesh);return entry;
  }
  const flames=batch('flames'),smoke=batch('smoke'),embers=batch('embers'),drops=batch('drops'),mist=batch('mist'),stream=batch('stream');
  const lights=[new T.PointLight('#ff7628',0,10,2),new T.PointLight('#ff953e',0,9,2)];
  for(const light of lights){light.name='ultra-fire-heat-light';root.add(light);}
  const dummy=new T.Object3D(),cameraQuaternion=new T.Quaternion(),uprightQuaternion=new T.Quaternion(),streamDirection=new T.Vector3(),right=new T.Vector3(),screenRight=new T.Vector3(),screenUp=new T.Vector3(),relative=new T.Vector3(),worldUp=new T.Vector3(0,1,0),facing=new T.Vector3();
  const source=new T.Vector3(),end=new T.Vector3();
  const siteHeat=new Float32Array(siteCount),lastHeat=new Float32Array(siteCount),steamHeat=new Float32Array(siteCount);
  const sites=balance.render.sites.map(p=>new T.Vector3(...p));
  for(let i=0;i<siteCount;i++)lastHeat[i]=model.flames[i].active&&!model.flames[i].warning?clamp(model.flames[i].heat||0):0;
  let disposed=false,lastTime=model.time||0,sprayTail=0,fireCount=0;
  const put=(entry,x,y,z,w,h,seed,age,alpha,variant=0,rotation=0,upright=false)=>{
    if(entry.used>=entry.capacity||alpha<=.003||w<=0||h<=0)return;
    const i=entry.used++;dummy.position.set(x,y,z);dummy.scale.set(w,h,1);dummy.quaternion.copy(upright?uprightQuaternion:cameraQuaternion);if(rotation)dummy.rotateZ(rotation);dummy.updateMatrix();entry.mesh.setMatrixAt(i,dummy.matrix);
    const at=i*4,array=entry.effect.array;array[at]=seed;array[at+1]=age;array[at+2]=alpha;array[at+3]=variant;
  };
  function update({camera,nozzle,impact,handHose=false,hoseStart}={}){
    if(disposed||!camera)return;
    const time=Math.max(0,model.time||0),dt=clamp(time-lastTime,0,.15);lastTime=time;uniforms.uTime.value=time;cameraQuaternion.copy(camera.quaternion);
    camera.getWorldDirection(relative);facing.set(-relative.x,0,-relative.z).normalize();uprightQuaternion.setFromAxisAngle(worldUp,Math.atan2(facing.x,facing.z));
    screenRight.set(1,0,0).applyQuaternion(cameraQuaternion);screenUp.set(0,1,0).applyQuaternion(cameraQuaternion);
    // A screen-facing card leans backwards in this elevated camera. Keep its
    // rear edge outside the wall rather than losing its top half to depth test.
    const cardDepth=Math.abs(screenUp.z)*.5;
    for(const entry of batches)entry.used=0;
    const pressure=clamp((model.pressure||0)/(model.maxPressure||1),.18,1.4),spraying=Boolean(model.spraying&&impact&&(nozzle||hoseStart));
    sprayTail=spraying?1:Math.max(0,sprayTail-dt*2.6);fireCount=0;
    let brightest=-1,second=-1;
    for(let i=0;i<siteCount;i++){
      const f=model.flames[i],site=sites[i];if(!site)continue;
      const heat=f.active&&f.heat>0&&!f.warning?clamp(f.heat):0;
      siteHeat[i]=heat;lastHeat[i]+=(1-Math.exp(-(heat>lastHeat[i]?9:2.1)*dt))*(heat-lastHeat[i]);
      const cooling=spraying&&heat>0&&Math.hypot(f.x-model.impact.x,f.y-model.impact.y)<=(model.aimRadius||balance.aimRadius);
      steamHeat[i]=clamp(steamHeat[i]+dt*(cooling?3:-1.2));
      if(heat>0){fireCount++;if(brightest<0||heat>siteHeat[brightest]){second=brightest;brightest=i;}else if(second<0||heat>siteHeat[second])second=i;}
      const size=.56+heat*.90,phase=f.phase||i*1.7;
      if(heat>0){
        for(let j=0;j<COUNTS.flames;j++){
          const seed=noise(i*37+j*2.73),age=fract(time*(.68+seed*.43)+j/COUNTS.flames+phase*.17),rise=age*(1.3+heat*.6),envelope=Math.sin(age*Math.PI);
          const height=(1.48+seed*1.28)*size*(.82+envelope*.25),width=(.50+seed*.54)*size;
          const sway=Math.sin(time*(3+seed)+phase+j*2.6)*(.045+age*.15);
          put(flames,site.x+(seed-.5)*.82*size+sway,site.y-.28+height*.47+rise*.18,site.z+.25+(noise(j+i*17)-.5)*.18,width,height,seed,age,(.76+heat*.22)*(.65+envelope*.35),0,(seed-.5)*.20,true);
        }
        for(let j=0;j<COUNTS.embers;j++){
          const seed=noise(i*53+j*1.43),age=fract(time*(.22+seed*.22)+j/COUNTS.embers+phase),life=Math.sin(age*Math.PI),wind=age*age;
          const x=site.x+Math.sin(j*4.9+age*3.6)*(.18+age*.49)+wind*.57,z=site.z+.32+Math.cos(j*3.3+age*4.1)*age*.22;
          put(embers,x,site.y+age*(2.3+seed*2.2),z,(.025+seed*.028)*life,(.06+seed*.07)*life,seed,age,life*heat*.86,0,(seed-.5)*.7);
        }
      }
      const soot=lastHeat[i];
      if(soot>.008||steamHeat[i]>.008){
        for(let j=0;j<COUNTS.smoke;j++){
          const seed=noise(i*23+j*1.91),age=fract(time*(.09+seed*.035)+j/COUNTS.smoke+phase*.09),life=Math.sin(age*Math.PI),plume=1.12+age*3.05;
          const height=plume*(.82+seed*.3),x=site.x+Math.sin(age*3.8+phase+seed*5)*age*.57+age*age*.8,z=site.z+.24+height*cardDepth+Math.cos(age*4+seed*7)*age*.10;
          const alpha=soot*(.42+heat*.20)*life*(1-age*.42),steam=steamHeat[i];
          put(smoke,x,site.y+.65+age*(4.8+heat*1.5),z,plume*(.9+seed*.3),height,seed,age,alpha+steam*.11,clamp(steam*.83),Math.sin(seed*TAU)*.4);
        }
      }
    }
    for(let i=0;i<rescueCount;i++){
      const rescue=model.rescues[i];if(!rescue.expired||rescue.feedback<=0)continue;
      const age=1-rescue.feedback/(rescue.feedbackSeconds||1),p=rescue.world;
      for(let j=0;j<3;j++)put(smoke,p[0]+(j-1)*.22,p[1]+age*1.8+j*.23,p[2]+.2+(.8+age*1.2)*cardDepth,.6+age*1.5,.8+age*1.2,noise(i*3+j),age,(1-age)*.26,.12,j*.7);
    }
    for(let i=0;i<lights.length;i++){
      const index=i===0?brightest:second,light=lights[i];
      if(index<0){light.intensity=0;continue;}
      light.position.copy(sites[index]);light.position.y+=.7;light.position.z+=.55;
      light.intensity=siteHeat[index]*(4.5+Math.sin(time*11+index)*.45+Math.sin(time*17+index*3)*.25);
    }
    if(impact){end.copy(impact);}
    if(spraying){
      source.copy((handHose&&hoseStart)||nozzle||hoseStart);streamDirection.copy(end).sub(source);
      camera.getWorldDirection(relative);right.crossVectors(streamDirection,relative).normalize();screenRight.set(1,0,0).applyQuaternion(cameraQuaternion);screenUp.set(0,1,0).applyQuaternion(cameraQuaternion);
      const length=streamDirection.length(),rise=balance.render.streamRise||3,charge=1+(model.charge||0)*.25;
      for(let j=0;j<COUNTS.stream;j++){
        const seed=noise(j*9.17),age=fract(time*(1.35+pressure*.7)+j/COUNTS.stream),arc=4*(1-age)*age*rise;
        const spread=.015+age*.115,wave=Math.sin(age*39-time*23+seed*TAU)*spread;
        const x=source.x+streamDirection.x*age+right.x*wave,y=source.y+streamDirection.y*age+arc+Math.cos(age*37-time*26)*spread*.36,z=source.z+streamDirection.z*age+right.z*wave;
        const projectedX=streamDirection.dot(screenRight);
        const projectedY=streamDirection.dot(screenUp)+(4-8*age)*rise,angle=-Math.atan2(projectedX,projectedY);
        put(stream,x,y,z,(.048+seed*.048)*pressure*charge,Math.min(.70,length/COUNTS.stream*1.5),seed,age,.34+pressure*.35,0,angle);
      }
    }
    if(sprayTail>0){
      for(let j=0;j<COUNTS.drops;j++){
        const seed=noise(j*3.83),age=fract(time*(1.27+seed*.72)+j/COUNTS.drops),angle=j*2.399963,reach=(.25+seed*.9)*age*pressure;
        const x=end.x+Math.cos(angle)*reach,z=end.z+Math.sin(angle)*reach*.77,y=end.y+Math.sin(age*Math.PI)*(.38+seed*.52)-age*age*.28;
        const life=Math.sin(age*Math.PI)*sprayTail;
        put(drops,x,y+.05,z+.13,(.036+seed*.039)*life,(.08+seed*.16)*life,seed,age,life*(.49+pressure*.30),0,(seed-.5)*1.4);
      }
      for(let j=0;j<COUNTS.mist;j++){
        const seed=noise(j*5.97),age=fract(time*(.48+seed*.24)+j/COUNTS.mist),angle=j*2.399963,spread=age*(.6+seed*.75)*pressure;
        const height=.28+age*.90;
        put(mist,end.x+Math.cos(angle)*spread+age*.25,end.y+.10+age*(.5+seed*.7),end.z+.22+height*cardDepth+Math.sin(angle)*spread*.50,.28+age*1.0,height,seed,age,Math.sin(age*Math.PI)*(.27+pressure*.08)*sprayTail,0,seed*TAU);
      }
    }
    for(const entry of batches){entry.mesh.count=entry.used;entry.mesh.visible=entry.used>0;entry.mesh.instanceMatrix.needsUpdate=true;entry.effect.needsUpdate=true;}
  }
  function metrics(){
    return {disposed,drawCalls:disposed?0:batches.filter(b=>b.used>0).length,triangles:disposed?0:batches.reduce((n,b)=>n+b.used*2,0),maxTriangles:Object.values(capacities).reduce((n,count)=>n+count*2,0),capacity:{...capacities},active:disposed?{}:Object.fromEntries(batches.map(b=>[b.kind,b.used])),fires:fireCount,lights:disposed?0:lights.filter(l=>l.intensity>0).length,textures:0};
  }
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const resource of resources)resource.dispose();for(const light of lights)light.dispose();root.clear();resources.length=0;}
  return {update,dispose,metrics};
}
