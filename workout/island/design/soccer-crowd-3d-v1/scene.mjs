/** CC0. A small original stand fixture in the game's 48 x 30 metre coordinates. */
export function makeSeats() {
  const seats = [];
  for (let side=0; side<4; side++) {
    const columns = side < 2 ? 40 : 20;
    for (let row=0; row<10; row++) for (let col=0; col<columns; col++) {
      const along = (col-(columns-1)/2)*(side<2 ? 1.16 : 1.38);
      const out = row*.76;
      const id = seats.length;
      seats.push({id,variant:id%12,team:col<columns/2?0:1,row,col,side,
        x:side<2?along:(side===2?-1:1)*(27+out), y:.4+row*.44,
        z:side<2?(side===0?-1:1)*(18+out):along,
        yaw:[0,Math.PI,Math.PI/2,-Math.PI/2][side], scale:.9+(id%5)*.018});
    }
  }
  return seats;
}

export function makeVenue(T, seats) {
  const root = new T.Group(), owned = [];
  const material = color => {const m=new T.MeshBasicMaterial({color}); owned.push(m); return m;};
  const concrete=material('#354755'), fascia=material('#21313c'), bench=material('#5e7b8a');
  const white=material('#e9eee3');
  function box(x,y,z,w,h,d,m) {
    const g=new T.BoxGeometry(w,h,d), mesh=new T.Mesh(g,m); owned.push(g);
    mesh.position.set(x,y,z); root.add(mesh); return mesh;
  }
  for (let i=0;i<12;i++) box(-22+i*4,-.1,0,4,.18,30,material(i%2?'#356750':'#3c7357'));
  for (const z of [-15,15]) box(0,.005,z,48,.015,.07,white);
  for (const x of [-24,0,24]) box(x,.006,0,.07,.015,30,white);
  for (let side=0;side<4;side++) for (let row=0;row<10;row++) {
    const y=.18+row*.44, out=row*.76, long=side<2;
    box(long?0:(side===2?-1:1)*(27+out),y-.12,long?(side===0?-1:1)*(18+out):0,
      long?49:.76,.24,long?.76:30,concrete);
    box(long?0:(side===2?-1:1)*(27.08+out),y+.13,long?(side===0?-1:1)*(18.08+out):0,
      long?48:.3,.1,long?.3:29,bench);
  }
  for (const z of [-17,17]) box(0,.23,z,50,.46,.18,fascia);
  // One inexpensive ball and a marker make the head-tracking target visible.
  const ballG = new T.IcosahedronGeometry(.19,1), ballM=material('#fff2c9'); owned.push(ballG);
  const ball = new T.Mesh(ballG,ballM); root.add(ball);
  const markerG=new T.RingGeometry(.32,.37,24), marker=new T.Mesh(markerG,white); owned.push(markerG);
  marker.rotation.x=-Math.PI/2; marker.position.y=.025; root.add(marker);
  return {root,ball,marker,dispose(){root.removeFromParent();owned.forEach(o=>o.dispose());}};
}

/** Before: the shipped 4x4 atlas, alpha test and camera-facing instancing model.
 * A matched 1,200-seat fixture, not a claim to benchmark the full game/stadium.
 */
export async function makeAtlasCrowd(T,seats) {
  const texture = await new T.TextureLoader().loadAsync(new URL('../../assets/soccer-v8/crowd-atlas.webp',import.meta.url).href);
  texture.colorSpace=T.SRGBColorSpace;
  const root=new T.Group(), batches=[], time={value:0}, cheer={value:0}, dummy=new T.Object3D();
  for (let side=0;side<4;side++) {
    const selected=seats.filter(s=>s.side===side),g=new T.PlaneGeometry(1,1);g.translate(0,.5,0);
    g.setAttribute('atlasCell',new T.InstancedBufferAttribute(new Float32Array(selected.map(s=>s.id%16)),1));
    g.setAttribute('phase',new T.InstancedBufferAttribute(new Float32Array(selected.map(s=>s.id*.618)),1));
    const m=new T.MeshBasicMaterial({map:texture,color:'#c5d0d4',side:T.DoubleSide,alphaTest:.4,alphaToCoverage:true,depthWrite:true});
    m.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{atlasTime:time,atlasCheer:cheer});
      shader.vertexShader='attribute float atlasCell; attribute float phase; uniform float atlasTime; uniform float atlasCheer;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv=(uv+vec2(mod(atlasCell,4.0),floor(atlasCell/4.0)))*0.25;');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
mat4 world=modelMatrix*instanceMatrix;
vec3 centre=world[3].xyz;
vec3 up=normalize(world[1].xyz);
vec3 right=normalize(cross(up,cameraPosition-centre)+vec3(0.00001,0.0,0.0));
float sway=sin(atlasTime*1.45+phase)*0.018*uv.y;
float bob=atlasCheer*max(0.0,sin(atlasTime*7.0+phase*2.3-centre.x*0.11))*0.09*uv.y;
vec3 p=centre+right*(transformed.x+sway)*length(world[0].xyz)+up*(transformed.y+bob)*length(world[1].xyz);
gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
`);
    };
    const mesh=new T.InstancedMesh(g,m,selected.length);mesh.frustumCulled=false;
    selected.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.yaw,0);dummy.scale.set(1.2,1.55,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    root.add(mesh);batches.push(mesh);
  }
  return {root,metrics:{instances:seats.length,triangles:seats.length*2,draws:batches.length,payloadBytes:98080},
    update(seconds,celebration){time.value=seconds;cheer.value=celebration;},
    dispose(){root.removeFromParent();for(const m of batches){m.geometry.dispose();m.material.dispose();m.dispose();}texture.dispose();}};
}
