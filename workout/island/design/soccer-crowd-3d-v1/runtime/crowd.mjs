/** CC0. Instanced soccer fans. All positions passed to update are root-local. */
import {planCrowd} from './lod-policy.mjs';

export async function createSoccerCrowd({T, GLTFLoader, seats, base = new URL('../', import.meta.url)}) {
  const finite3 = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  if (!Array.isArray(seats) || seats.length < 1 || seats.length > 1200 ||
      new Set(seats.map(s => s.id)).size !== seats.length || seats.some(s =>
        ![s.id,s.x,s.y,s.z,s.yaw].every(Number.isFinite) || ![0,1].includes(s.team) ||
        !Number.isInteger(s.variant) || s.variant < 0 || s.variant >= 12 ||
        (s.scale !== undefined && (!Number.isFinite(s.scale) || s.scale <= 0)))) {
    throw new Error('Expected 1–1200 unique finite seats, team 0/1 and variant 0–11');
  }
  const get = async name => {
    const response = await fetch(new URL(name, base));
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };
  const [manifest, config] = await Promise.all([get('assets.json'), get('lod-config.json')]);
  const root = new T.Group(), batches = [], sources = [], dummy = new T.Object3D();
  root.name = 'SoccerCrowd3D';
  const uniforms = {crowdTime: {value: 0}, crowdCheer: {value: 0}, crowdPose: {value: -1},
    crowdBall: {value: new T.Vector3()}, homeColor: {value: new T.Color(config.teamColors.home)},
    awayColor: {value: new T.Color(config.teamColors.away)}};
  const groups = Array.from({length: 12}, (_,v) => seats.map((s,index) => ({s,index})).filter(({s}) => s.variant === v));
  let lastCamera = null, disposed = false;
  const metrics = {instances: seats.length, triangles: 0, draws: 0, payloadBytes: manifest.payloadBytes};
  function dispose() {
    if (disposed) return;
    disposed = true; root.removeFromParent();
    for (const m of batches) {m.geometry.dispose(); m.material.dispose(); m.dispose();}
    for (const m of sources) {m.geometry.dispose(); m.material.dispose();}
    root.clear();
  }
  try {
    for (const asset of manifest.assets) {
      const data = await new GLTFLoader().loadAsync(new URL(asset.file,base).href);
      const source = data.scene.children[0]; sources.push(source);
      const selected = groups[asset.variant], geometry = source.geometry.clone();
      geometry.setAttribute('raiseDelta', geometry.morphAttributes.position[0]);
      geometry.setAttribute('clapDelta', geometry.morphAttributes.position[1]);
      geometry.setAttribute('headMask', geometry.getAttribute('_head'));
      geometry.setAttribute('shirtMask', geometry.getAttribute('_shirt'));
      geometry.morphAttributes = {};
      for (const [name,size] of [['fanPhase',1],['fanTeam',1]])
        geometry.setAttribute(name, new T.InstancedBufferAttribute(new Float32Array(selected.length*size),size).setUsage(T.DynamicDrawUsage));
      const material = source.material.clone();
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms, {headPivot: {value: new T.Vector3(...asset.headPivot)}});
        shader.vertexShader = `attribute vec3 raiseDelta; attribute vec3 clapDelta;
attribute float headMask; attribute float shirtMask; attribute float fanPhase; attribute float fanTeam;
uniform float crowdTime; uniform float crowdCheer; uniform float crowdPose;
uniform vec3 crowdBall; uniform vec3 headPivot; uniform vec3 homeColor; uniform vec3 awayColor;
` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `
#include <color_vertex>
vColor.rgb *= mix(vec3(1.0), mix(homeColor, awayColor, fanTeam), shirtMask);
`);
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
float response = smoothstep(0.0,0.8,crowdCheer*1.2-(sin(fanPhase)+1.0)*0.12);
float raised = crowdPose < -0.5 ? response*step(0.33,fract(fanPhase)) : (crowdPose < 0.5 ? 0.0 : (crowdPose < 1.5 ? 1.0 : 0.0));
float applause = crowdPose < -0.5 ? (1.0-step(0.33,fract(fanPhase)))*(0.5+0.5*response) : step(1.5,crowdPose);
float clapWeight = applause*(0.68+0.32*(0.5+0.5*cos(crowdTime*11.0+fanPhase)));
vec3 transformed = position + raiseDelta*raised + clapDelta*clapWeight;
vec3 toBall = crowdBall-instanceMatrix[3].xyz;
float localX = dot(toBall,normalize(instanceMatrix[0].xyz));
float localZ = dot(toBall,normalize(instanceMatrix[2].xyz));
float yaw = length(vec2(localX,localZ))>0.0001 ? clamp(atan(localX,localZ),-0.87,0.87)*headMask : 0.0;
vec3 hp = transformed-headPivot;
transformed.x = headPivot.x+cos(yaw)*hp.x+sin(yaw)*hp.z;
transformed.z = headPivot.z-sin(yaw)*hp.x+cos(yaw)*hp.z;
transformed.y += response*max(0.0,sin(crowdTime*7.0+fanPhase))*0.12;
`);
      };
      material.customProgramCacheKey = () => 'soccer-crowd-3d-v1';
      const mesh = new T.InstancedMesh(geometry,material,selected.length);
      mesh.name = `Fan${asset.variant+1}LOD${asset.level}`;
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.userData = {asset,selected}; root.add(mesh); batches.push(mesh);
    }
  } catch (error) {dispose(); throw error;}

  function setCamera(position) {
    if (disposed) throw new Error('Disposed crowd');
    if (!finite3(position)) throw new Error('Expected finite camera [x,y,z]');
    if (lastCamera?.every((v,i) => v === position[i])) return metrics;
    const plan = planCrowd(seats,position,config);
    lastCamera = [...position];
    let draws = 0;
    for (const mesh of batches) {
      const {asset,selected} = mesh.userData, g = mesh.geometry;
      let count = 0;
      for (const {s,index} of selected) {
        const w = plan.assignments[index].weights;
        if (w[asset.level] <= 0) continue;
        g.attributes.fanPhase.setX(count,(s.id*.61803398875%1)*Math.PI*2);
        g.attributes.fanTeam.setX(count,s.team);
        dummy.position.set(s.x,s.y,s.z); dummy.rotation.set(0,s.yaw,0);
        dummy.scale.setScalar(s.scale ?? 1); dummy.updateMatrix(); mesh.setMatrixAt(count++,dummy.matrix);
      }
      mesh.count = count; mesh.visible = count > 0;
      if (count) {
        draws++; mesh.instanceMatrix.needsUpdate = true;
        for (const name of ['fanPhase','fanTeam']) g.attributes[name].needsUpdate = true;
      }
    }
    const {assignments,...summary} = plan;
    Object.assign(metrics,summary,{draws}); return metrics;
  }
  return {root,batches,sources,manifest,config,metrics,dispose,setCamera,
    setTeamColors(home,away) {uniforms.homeColor.value.set(home); uniforms.awayColor.value.set(away);},
    update({seconds, celebration = 0, ballPosition = [0,1,0], cameraPosition, pose = -1}) {
      if (!Number.isFinite(seconds) || !finite3(ballPosition)) throw new Error('Expected finite time and ball position');
      if (cameraPosition) setCamera(cameraPosition);
      uniforms.crowdTime.value = seconds;
      uniforms.crowdCheer.value = T.MathUtils.clamp(celebration,0,1);
      uniforms.crowdPose.value = pose; uniforms.crowdBall.value.fromArray(ballPosition);
    }};
}
