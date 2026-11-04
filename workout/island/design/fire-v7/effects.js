/* Six fixed-capacity billboard pools with reusable geometry buffers. */
(function(global){
  'use strict';
  const {THREE}=global.FireCore;
  const fract=x=>x-Math.floor(x),rand=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
  class ParticleBatch{
    constructor(kind,capacity,textures){
      this.kind=kind;this.capacity=capacity;this.count=0;this.textures=textures;
      const plane=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();
      g.index=plane.index;g.attributes.position=plane.attributes.position;g.attributes.uv=plane.attributes.uv;
      this.center=new Float32Array(capacity*3);this.size=new Float32Array(capacity*2);this.params=new Float32Array(capacity*4);
      g.setAttribute('aCenter',new THREE.InstancedBufferAttribute(this.center,3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSize',new THREE.InstancedBufferAttribute(this.size,2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aParams',new THREE.InstancedBufferAttribute(this.params,4).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount=0;
      this.material=new THREE.ShaderMaterial({
        uniforms:{atlas:{value:textures[512]},color:{value:new THREE.Color(kind==='smoke'?0xbac5d4:0xffffff)}},
        vertexShader:`attribute vec3 aCenter;attribute vec2 aSize;attribute vec4 aParams;varying vec2 vUv;varying vec4 vParams;
          void main(){vUv=uv;vParams=aParams;float c=cos(aParams.z),s=sin(aParams.z);vec2 p=position.xy*aSize;
          p=mat2(c,-s,s,c)*p;vec4 view=modelViewMatrix*vec4(aCenter,1.);view.xy+=p;gl_Position=projectionMatrix*view;}`,
        fragmentShader:`uniform sampler2D atlas;uniform vec3 color;varying vec2 vUv;varying vec4 vParams;
          void main(){float frame=floor(vParams.x);float next=mod(frame+1.,16.);vec2 cell=vec2(mod(frame,4.),3.-floor(frame/4.));
          vec2 cell2=vec2(mod(next,4.),3.-floor(next/4.));
          vec4 tex=mix(texture2D(atlas,(cell+vUv)/4.),texture2D(atlas,(cell2+vUv)/4.),fract(vParams.x));float a=tex.a*vParams.y;if(a<.007)discard;
          gl_FragColor=vec4(tex.rgb*color*vParams.w,a);
          #include <colorspace_fragment>
          }`,
        transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
        blending:kind==='flame'||kind==='ember'||kind==='beacon'?THREE.AdditiveBlending:THREE.NormalBlending,
        toneMapped:false,
      });
      this.mesh=new THREE.Mesh(g,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=kind==='smoke'?4:kind==='steam'?5:6;
      this.mesh.name=kind+' fixed particle pool';
    }
    clear(){this.count=0;}
    put(x,y,z,w,h,frame,alpha,angle=0,light=1){
      if(this.count>=this.capacity)return;
      const i=this.count++,c=i*3,s=i*2,p=i*4;
      this.center[c]=x;this.center[c+1]=y;this.center[c+2]=z;this.size[s]=w;this.size[s+1]=h;
      this.params[p]=frame;this.params[p+1]=alpha;this.params[p+2]=angle;this.params[p+3]=light;
    }
    commit(){
      const g=this.mesh.geometry;g.instanceCount=this.count;
      for(const name of ['aCenter','aSize','aParams'])g.attributes[name].needsUpdate=true;
    }
    setSize(size){this.material.uniforms.atlas.value=this.textures[size];}
    dispose(){this.mesh.geometry.dispose();this.material.dispose();}
  }
  class FireEffects{
    constructor(scene,textures){
      this.scene=scene;this.quality='mobile';this.atlasSize=512;this.waterPath=[];
      this.batches={};for(const [kind,count]of Object.entries({flame:160,smoke:96,steam:48,water:128,ember:80,beacon:6})){
        this.batches[kind]=new ParticleBatch(kind,count,textures[kind]);scene.add(this.batches[kind].mesh);
      }
      // A single continuous tapered tube supplies the jet's silhouette.
      const seg=30,radial=5,positions=new Float32Array((seg+1)*radial*3),indices=[];
      for(let i=0;i<seg;i++)for(let j=0;j<radial;j++){
        const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+j,d=(i+1)*radial+(j+1)%radial;
        indices.push(a,b,c,b,d,c);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setIndex(indices);
      this.jet=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xb4e7f5,transparent:true,opacity:.60,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
      this.jet.frustumCulled=false;this.jet.renderOrder=5;this.jet.visible=false;scene.add(this.jet);
      this.jetSegments=seg;this.jetRadial=radial;this.temp=new THREE.Vector3();
      this.batches.beacon.material.uniforms.color.value.set(0xff3438);
    }
    setQuality(q){this.quality=q;for(const batch of Object.values(this.batches))batch.setSize(q==='low'?256:this.atlasSize);}
    setAtlasSize(size){this.atlasSize=size;this.setQuality(this.quality);}
    clear(){for(const batch of Object.values(this.batches))batch.clear();this.jet.visible=false;}
    fire(t,sources){
      const mult=this.quality==='low'?.5:this.quality==='detail'?1.25:1;
      for(let s=0;s<sources.length;s++){
        const src=sources[s],source=src.id??s,heat=src.heat||.7;if(heat<.1)continue;
        const [x,y,z]=src.position,scale=src.scale||1;
        const n=src.smokeOnly?0:Math.round((src.small?3:6)*mult);
        for(let k=0;k<n;k++){
          const seed=source*41+k*7,phase=fract(t*(.68+rand(seed)*.3)+rand(seed+1)),sway=Math.sin(t*3.4+seed)*.10;
          const life=Math.sin(phase*Math.PI),spread=(rand(seed+2)-.5)*.85*scale;
          const px=x+spread+sway*phase,py=y+phase*1.45*scale,pz=z+(rand(seed+3)-.5)*.34*scale;
          const w=(1.55+rand(seed+4)*.9)*scale*(.85-phase*.3),h=(1.4+rand(seed+5)*1.3)*scale;
          this.batches.flame.put(px,py+h*.36,pz,w,h,fract(t*.9+rand(seed))*16,life*heat*.78,Math.sin(seed)*.12,1.13);
        }
        const smokeN=Math.round((src.small?2:3)*mult);
        for(let k=0;k<smokeN;k++){
          const seed=source*17+k*13,phase=fract(t*.13+rand(seed+19)),life=Math.sin(phase*Math.PI);
          const size=(1.8+phase*3.9)*scale;
          this.batches.smoke.put(x+phase*1.15+Math.sin(seed+phase*3)*.20,y+1.4*scale+phase*5.5*scale,z-.12+phase*.25,size,size*.86,
            fract(t*.15+rand(seed+22))*16,life*.70*heat,seed*.31+phase*.35,1.65);
        }
        for(let k=0;k<(src.smokeOnly?0:Math.round(2*mult));k++){
          const seed=source*23+k*5,phase=fract(t*.35+rand(seed+51));
          this.batches.ember.put(x+Math.sin(seed+phase*4)*.5+phase,y+phase*4.2*scale,z+Math.cos(seed)*.4,.075,.16,
            Math.floor(fract(t*.4+k*.21)*16),(1-phase)*heat,phase*2,1.7);
        }
      }
    }
    water(t,start,end,enabled){
      if(!enabled||!start||!end){this.jet.visible=false;return;}
      this.jet.visible=true;const positions=this.jet.geometry.attributes.position.array;
      const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2],length=Math.sqrt(dx*dx+dy*dy+dz*dz);
      const arc=Math.min(2.1,length*.09),segments=this.jetSegments,radial=this.jetRadial;
      const horizontal=new THREE.Vector3(-dz,0,dx).normalize();
      const normal=new THREE.Vector3(dx,dy,dz).normalize().cross(horizontal).normalize();
      for(let i=0;i<=segments;i++){
        const f=i/segments,px=start[0]+dx*f,py=start[1]+dy*f+Math.sin(f*Math.PI)*arc,pz=start[2]+dz*f;
        const radius=(.018+f*.045)*(1+Math.sin(t*19+f*24)*.13);
        for(let j=0;j<radial;j++){
          const a=j/radial*Math.PI*2,c=Math.cos(a)*radius,s=Math.sin(a)*radius,index=(i*radial+j)*3;
          positions[index]=px+horizontal.x*c+normal.x*s;positions[index+1]=py+horizontal.y*c+normal.y*s;positions[index+2]=pz+horizontal.z*c+normal.z*s;
        }
      }
      this.jet.geometry.attributes.position.needsUpdate=true;
      const count=this.quality==='low'?20:48;
      for(let k=0;k<count;k++){
        const f=fract(t*(.95+rand(k)*.2)+k/count),seed=k*11;
        const jitter=.025+f*.09;
        this.batches.water.put(start[0]+dx*f+Math.sin(seed+f*10)*jitter,
          start[1]+dy*f+Math.sin(f*Math.PI)*arc+Math.cos(seed)*jitter,
          start[2]+dz*f+Math.cos(seed+f*7)*jitter,.045+f*.035,.10+f*.08,k%16,.75,0,1);
      }
      // Short ballistic splash and pale steam at the actual hit point.
      for(let k=0;k<(this.quality==='low'?9:22);k++){
        const p=fract(t*1.2+rand(k+141)),a=rand(k+62)*Math.PI*2,r=p*(.5+rand(k+92)*.7);
        this.batches.water.put(end[0]+Math.cos(a)*r,end[1]+Math.sin(p*Math.PI)*.6-p*.4,
          end[2]+Math.sin(a)*r,.07,.11,k%16,(1-p)*.85,a,1);
      }
      for(let k=0;k<5;k++){
        const p=fract(t*.3+k*.2),s=.5+p*1.3;
        this.batches.steam.put(end[0]+Math.sin(k)*p*.5,end[1]+p*1.9,end[2]+p*.2,s,s,k*3,Math.sin(p*Math.PI)*.30,k*.7,1.3);
      }
    }
    commit(){for(const batch of Object.values(this.batches))batch.commit();}
    get count(){return Object.values(this.batches).reduce((n,b)=>n+b.count,0);}
    dispose(){for(const batch of Object.values(this.batches))batch.dispose();this.jet.geometry.dispose();this.jet.material.dispose();}
  }
  global.FireEffects=FireEffects;
})(window);
