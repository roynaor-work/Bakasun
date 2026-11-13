/** Original CC0. three r160 adapter: one draw per variation, zero per-frame matrix uploads. */
export async function createCrowd({T, GLTFLoader, seats, base = new URL('../', import.meta.url)}) {
  const manifest = await fetch(new URL('assets.json', base)).then(r => {
    if (!r.ok) throw new Error(`assets.json: ${r.status}`);
    return r.json();
  });
  if (!seats?.length || seats.length > 600) throw new Error('Expected 1–600 seat transforms');
  const root = new T.Group(), loaded = [], batches = [];
  root.name = 'TennisCrowd3D';
  const time = {value: 0}, cheer = {value: 0}, ball = {value: new T.Vector3()};
  try {
    for (const [variant, asset] of manifest.assets.entries()) {
      const gltf = await new GLTFLoader().loadAsync(new URL(asset.file, base).href);
      const source = gltf.scene.children[0];
      loaded.push(source);
      const geometry = source.geometry.clone();
      // Native GLB morph data stays valid for standard glTF viewers. Instancing uses
      // the same delta as a plain attribute, avoiding r160's shared morph weights.
      geometry.setAttribute('cheerDelta', geometry.morphAttributes.position[0]);
      geometry.setAttribute('headMask', geometry.getAttribute('_head'));
      geometry.morphAttributes = {};
      const selected = seats.filter((_, i) => (i * 7 + Math.floor(i/12) * 5) % 12 === variant);
      const phase = new Float32Array(selected.map(s => (s.id * .61803398875 % 1) * Math.PI * 2));
      geometry.setAttribute('fanPhase', new T.InstancedBufferAttribute(phase, 1));
      const material = source.material.clone();
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, {crowdTime: time, crowdCheer: cheer, crowdBall: ball,
          headPivot: {value: new T.Vector3(...source.userData.headPivot)}});
        shader.vertexShader = `attribute vec3 cheerDelta;
attribute float headMask;
attribute float fanPhase;
uniform float crowdTime;
uniform float crowdCheer;
uniform vec3 crowdBall;
uniform vec3 headPivot;
` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
float response = smoothstep(0.0, 0.7, crowdCheer * 1.2 - (sin(fanPhase) + 1.0) * 0.1);
vec3 transformed = position + cheerDelta * response;
// Transform ball into the instance's local frame; clamp neck rotation to 50 degrees.
vec3 toBall = crowdBall - instanceMatrix[3].xyz;
float localX = dot(toBall, normalize(instanceMatrix[0].xyz));
float localZ = dot(toBall, normalize(instanceMatrix[2].xyz));
float yaw = clamp(atan(localX, localZ), -0.87, 0.87) * headMask;
vec3 hp = transformed - headPivot;
transformed.x = headPivot.x + cos(yaw) * hp.x + sin(yaw) * hp.z;
transformed.z = headPivot.z - sin(yaw) * hp.x + cos(yaw) * hp.z;
transformed.y += response * abs(sin(crowdTime * 6.5 + fanPhase)) * 0.075;
transformed.z += sin(crowdTime * 1.4 + fanPhase) * 0.008 * smoothstep(0.5, 1.0, position.y);
`);
      };
      material.customProgramCacheKey = () => 'tennis-crowd3d-v1';
      const mesh = new T.InstancedMesh(geometry, material, selected.length);
      mesh.name = `Fan_${variant+1}`;
      const dummy = new T.Object3D();
      selected.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.set(.92 + (s.id*37%17)/160, .92 + (s.id*19%13)/100, .96 + (s.id*11%13)/120);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      // Conservative whole-batch bounds, including arms-up, bob and yaw.
      mesh.frustumCulled = false;
      root.add(mesh);
      batches.push(mesh);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  function dispose() {
    root.removeFromParent();
    for (const mesh of batches) {mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();}
    for (const mesh of loaded) {mesh.geometry.dispose(); mesh.material.dispose();}
    root.clear();
  }
  return {root, manifest, batches, dispose,
    update({seconds, celebration = 0, ballPosition = [0, 1, 0]}) {
      time.value = seconds;
      cheer.value = T.MathUtils.clamp(celebration, 0, 1);
      ball.value.fromArray(ballPosition);
    },
    metrics: {instances: seats.length, draws: batches.length,
      triangles: batches.reduce((n, m) => n + m.geometry.index.count/3*m.count, 0),
      payloadBytes: manifest.payloadBytes, textures: 0, wasm: false}};
}
