/** Standalone Three r160 vehicle adapter. Consumes a freshly loaded GLTF result.
 * All scene states share geometry. GPU resources and FX particles are pooled.
 * Wheels roll around local +X; front steer pivots turn around local +Y.
 */
import * as T from './vendor/engine.mjs';

export async function loadVehicle(meta, baseURL = new URL('./', import.meta.url), options = {}) {
  const gltf = await new T.GLTFLoader().loadAsync(new URL(meta.path, baseURL).href);
  return createVehicleController(gltf, meta, options);
}

export function createVehicleController(gltf, meta, { effects = true } = {}) {
  const root = new T.Group();
  root.name = meta.id;
  const scenes = new Map();
  const materials = new Set();
  const materialCopies = new Map();
  const tires = new Map();
  const punctures = new Map();
  const beacons = [];
  const lamps = [];
  const spin = [];
  const steering = [];
  let state = 'intact', lights = true, smoke = false, elapsed = 0, disposed = false;
  let paint = meta.colors[0];
  const vector = new T.Vector3();
  const axes = new T.Vector3();

  for (const [name, index] of Object.entries(meta.scenes)) {
    const scene = gltf.scenes[index];
    scene.visible = name === state;
    const parts = new Map();
    scene.traverse(object => {
      if (object.userData.partId) parts.set(object.userData.partId, object);
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const clone = material => {
        if (!materialCopies.has(material)) materialCopies.set(material, material.clone());
        const copy = materialCopies.get(material);
        materials.add(copy);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    for (const object of parts.values()) {
      const info = object.userData;
      if (info.role === 'wheel_spin') spin.push(object);
      if (info.role === 'wheel_steer') steering.push(object);
      if (info.role === 'beacon' || info.role === 'beacon_glow') beacons.push(object);
      if (info.role === 'head_lamp' || info.role === 'tail_lamp') lamps.push(object);
      if (info.role === 'tire' && info.wheel !== 'spare') {
        if (!tires.has(info.wheel)) tires.set(info.wheel, []);
        tires.get(info.wheel).push(object);
      }
    }
    root.add(scene);
    scenes.set(name, { scene, parts });
  }

  function eachMaterial(object, callback) {
    object.traverse(child => {
      if (!child.isMesh) return;
      for (const mat of Array.isArray(child.material) ? child.material : [child.material]) callback(mat);
    });
  }

  // Fixed pools; no geometry or particle objects are created by burstTire/update.
  const fxRoot = new T.Group();
  fxRoot.name = 'vehicle_effects';
  root.add(fxRoot);
  let smokeTexture, smokeMaterials = [], shardGeometry, shardMaterial;
  const puffs = [], shards = [];
  if (effects) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,255,255,.72)');
    gradient.addColorStop(.35,'rgba(255,255,255,.45)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0,0,64,64);
    smokeTexture = new T.CanvasTexture(canvas);
    for (let i=0;i<24;i++) {
      const material = new T.SpriteMaterial({map:smokeTexture,color:0x9cabb5,transparent:true,depthWrite:false});
      smokeMaterials.push(material);
      const object = new T.Sprite(material);
      object.visible = false;
      fxRoot.add(object);
      puffs.push({object, age:-1, life:1.9+(i%4)*.18, seed:i*2.399963, velocity:new T.Vector3()});
    }
    shardGeometry = new T.TetrahedronGeometry(.065,0);
    shardMaterial = new T.MeshStandardMaterial({color:0x18212b,roughness:.92});
    for (let i=0;i<16;i++) {
      const object = new T.Mesh(shardGeometry,shardMaterial);
      object.visible = false;
      fxRoot.add(object);
      shards.push({object,age:-1,life:1.1+(i%3)*.13,velocity:new T.Vector3()});
    }
  }
  let smokeClock = 0, nextPuff = 0;

  function setColor(value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError('Color must be #RRGGBB');
    paint = value;
    for (const material of materials) {
      if (material.name === 'paint') material.color.set(value);
      if (material.name === 'paint_light') {
        material.color.set(value);
        material.color.lerp(new T.Color(0xffffff),.10);
      }
    }
  }

  function setDamage(value) {
    if (!scenes.has(value)) throw new RangeError('Unknown damage state: '+value);
    state = value;
    for (const [name, entry] of scenes) entry.scene.visible = name === value;
  }

  function setLights(value) {
    lights = Boolean(value);
    for (const object of lamps) eachMaterial(object, material => { material.emissiveIntensity = lights ? 1.8 : 0; });
    if (!lights) for (const object of beacons) eachMaterial(object, material => { material.emissiveIntensity = 0; });
  }

  function repairTires() {
    punctures.clear();
    for (const objects of tires.values()) for (const object of objects) object.morphTargetInfluences[0] = 0;
    for (const p of shards) { p.age=-1; p.object.visible=false; }
  }

  function burstTire(wheel = meta.wheels.find(w => !w.spare).id) {
    if (!tires.has(wheel)) throw new RangeError('Unknown wheel: '+wheel);
    if (punctures.has(wheel)) return false;
    punctures.set(wheel,0);
    const pivot = scenes.get(state).parts.get('wheel_'+wheel+'_steer');
    root.updateMatrixWorld(true);
    pivot.getWorldPosition(vector);
    root.worldToLocal(vector);
    for (let i=0;i<shards.length;i++) {
      const p = shards[i];
      p.age = 0;
      p.object.visible = true;
      p.object.position.copy(vector);
      p.object.scale.setScalar(.7+(i%4)*.15);
      const a = i*2.399963;
      p.velocity.set(Math.cos(a)*(1.0+i%3*.3),.8+i%5*.26,Math.sin(a)*(1.0+i%4*.2));
    }
    return true;
  }

  function setEngineSmoke(value) { smoke = Boolean(value); }

  function update(dt, speed = 0, steerAngle = 0) {
    if (disposed) return;
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(speed) || !Number.isFinite(steerAngle)) {
      throw new TypeError('update requires finite dt >= 0, speed and steerAngle');
    }
    dt = Math.min(dt,.10);
    elapsed += dt;
    for (const object of spin) {
      const step = speed*dt/object.userData.radius;
      object.rotation.x = (object.rotation.x + step) % (Math.PI*2);
    }
    for (const object of steering) object.rotation.y = object.userData.front ? T.MathUtils.clamp(steerAngle,-.55,.55) : 0;
    for (const [wheel, amount] of punctures) {
      const value = Math.min(1,amount+dt/.12);
      punctures.set(wheel,value);
      for (const object of tires.get(wheel)) object.morphTargetInfluences[0] = value;
    }
    // Alternating red/blue double flashes: 120 ms on, 80 ms off, 100 ms on.
    const phase = elapsed % .8;
    const flash = p => p >= 0 && (p < .12 || (p >= .20 && p < .30));
    for (const object of beacons) {
      const offset = object.userData.channel==='red' ? 0 : .4;
      const intensity = lights && flash(phase-offset) ? 5 : 0;
      if (object.userData.role==='beacon_glow') object.scale.setScalar(intensity ? 1 : .001);
      eachMaterial(object, material => { material.emissiveIntensity = intensity; });
    }
    if (!effects) return;
    smokeClock += dt;
    if (smoke && smokeClock >= .075) {
      smokeClock %= .075;
      const p = puffs[nextPuff++ % puffs.length];
      const anchor = scenes.get(state).parts.get('fx_engine_smoke');
      root.updateMatrixWorld(true);
      anchor.getWorldPosition(vector);
      root.worldToLocal(vector);
      p.object.position.copy(vector);
      p.object.position.y += .15;
      p.age=0;
      p.object.visible=true;
      p.velocity.set(Math.sin(p.seed)*.10,.65+(nextPuff%4)*.055,-.09-speed*.025);
      p.object.material.rotation = p.seed;
    }
    for (const p of puffs) {
      if (p.age < 0) continue;
      p.age += dt;
      if (p.age >= p.life) { p.age=-1; p.object.visible=false; continue; }
      const t = p.age/p.life;
      axes.copy(p.velocity).multiplyScalar(dt);
      p.object.position.add(axes);
      p.object.position.x += Math.sin(p.seed+p.age*3)*dt*.07;
      p.object.scale.setScalar(.18+t*1.25);
      p.object.material.opacity = Math.sin(Math.PI*t)*.62;
      p.object.material.color.setHex(state==='crushed' ? 0x8f9ba6 : 0xb0bdc5);
    }
    for (const p of shards) {
      if (p.age < 0) continue;
      p.age+=dt;
      if (p.age >= p.life) { p.age=-1; p.object.visible=false; continue; }
      p.velocity.y-=3.6*dt;
      axes.copy(p.velocity).multiplyScalar(dt);
      p.object.position.add(axes);
      p.object.rotation.x+=dt*5;
      p.object.rotation.z+=dt*3;
      if (p.object.position.y < .035) {
        p.object.position.y=.035;
        p.velocity.y=Math.abs(p.velocity.y)*.27;
        p.velocity.x*=.83;
        p.velocity.z*=.83;
      }
      p.object.scale.multiplyScalar(Math.max(0,1-dt*.4));
    }
  }

  function reset() {
    setDamage('intact');
    repairTires();
    setEngineSmoke(false);
    setLights(true);
    for (const p of puffs) { p.age=-1; p.object.visible=false; }
    for (const object of spin) object.rotation.x = 0;
    for (const object of steering) object.rotation.y = 0;
    elapsed=0;
  }

  function inspect() {
    const entry = scenes.get(state);
    return {
      id:meta.id,state,paint,lights,smoke,
      visibleStates:[...scenes].filter(([,v])=>v.scene.visible).map(([k])=>k),
      wheels:[...entry.parts.values()].filter(o=>o.userData.role==='wheel_spin').map(o=>({
        id:o.userData.wheel,angle:o.rotation.x,radius:o.userData.radius,
        puncture:punctures.get(o.userData.wheel)||0
      })),
      beaconIntensities:beacons.filter(o=>o.userData.role==='beacon'&&entry.parts.get(o.userData.partId)===o).map(o=>{
        let intensity=0;
        eachMaterial(o,m=>{intensity=m.emissiveIntensity;});
        return {channel:o.userData.channel,intensity};
      }),
      particles:{smoke:puffs.filter(p=>p.age>=0).length,shards:shards.filter(p=>p.age>=0).length},
      poolCapacity:{smoke:puffs.length,shards:shards.length}
    };
  }

  function dispose() {
    if (disposed) return;
    disposed=true;
    const geometries = new Set();
    root.traverse(object=>{ if (object.geometry) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const material of materialCopies.keys()) material.dispose();
    for (const material of smokeMaterials) material.dispose();
    smokeTexture?.dispose();
    shardMaterial?.dispose();
    root.removeFromParent();
    root.clear();
  }

  setLights(true);
  return { root, meta, scenes, animations:gltf.animations, setColor, setDamage, setLights, setEngineSmoke,
    burstTire, repairTires, reset, update, inspect, dispose };
}
