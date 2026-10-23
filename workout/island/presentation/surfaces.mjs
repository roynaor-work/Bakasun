import * as T from '../vendor/three.module.js';

const PALETTES={grass:[66,112,73],sand:[229,198,146],clay:[177,88,61],asphalt:[53,72,80],water:[22,139,157]};
/** Small, seamless, deterministic material textures. No network or canvas needed. */
export function surfaceTexture(kind,repeat=1){
  const size=128,base=PALETTES[kind]||PALETTES.grass,bytes=new Uint8Array(size*size*4);let seed=317;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=(seed/4294967296-.5),u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    let shade=grain*(kind==='asphalt'?.2:kind==='clay'?.23:.16);
    if(kind==='grass')shade+=(seed%31===0?-.13:0)+Math.sin(u*23+Math.sin(v*9)*2)*.02;
    if(kind==='water')shade=.14*Math.sin(u*5+Math.sin(v*3))+.08*Math.sin(v*11+u*3)+Math.pow(Math.max(0,Math.sin(v*19+Math.sin(u*7))),18)*.38;
    const i=(y*size+x)*4;for(let c=0;c<3;c++)bytes[i+c]=Math.min(255,Math.max(0,base[c]*(1+shade)));bytes[i+3]=255;
  }
  const texture=new T.DataTexture(bytes,size,size);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.repeat.set(repeat,repeat);texture.needsUpdate=true;return texture;
}

export function adventureRenderer(renderer,exposure=.96){renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;}

/** A distant nebula and planet behind the original combat plane. Three batches. */
export function createSpaceBackdrop(scene){
  const time={value:0},geometry=new T.PlaneGeometry(600,600),material=new T.ShaderMaterial({depthWrite:false,uniforms:{time},vertexShader:'varying vec2 uvArt;void main(){uvArt=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 uvArt;uniform float time;
    void main(){vec2 p=uvArt;float cloud=sin(p.x*12.+sin(p.y*8.+time*.012))*sin(p.y*11.-p.x*4.);float veil=pow(max(0.,1.-abs(p.y-p.x*.42-.3)*2.8),3.);vec3 c=mix(vec3(.018,.035,.095),vec3(.06,.23,.32),veil*(.4+cloud*.25));c+=vec3(.14,.07,.22)*pow(max(0.,cloud),4.)*veil;gl_FragColor=vec4(c,1.);}`});
  const nebula=new T.Mesh(geometry,material);nebula.rotation.x=-Math.PI/2;nebula.position.set(0,-20,-65);scene.add(nebula);
  const planetG=new T.SphereGeometry(4,24,16),planetM=new T.MeshStandardMaterial({color:'#5a93a4',roughness:.88}),planet=new T.Mesh(planetG,planetM);planet.position.set(-19,-10,-46);scene.add(planet);
  const ringG=new T.RingGeometry(5.3,6.5,48),ringM=new T.MeshBasicMaterial({color:'#b3d8d0',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false}),ring=new T.Mesh(ringG,ringM);ring.rotation.set(-1.05,.3,.18);ring.position.copy(planet.position);scene.add(ring);
  let disposed=false;return {update(t){time.value=t;},dispose(){if(disposed)return;disposed=true;for(const object of [nebula,planet,ring])scene.remove(object);for(const resource of [geometry,material,planetG,planetM,ringG,ringM])resource.dispose();}};
}
