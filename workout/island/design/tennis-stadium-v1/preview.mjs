import * as T from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const $ = id => document.getElementById(id);
const canvas = $('stadium');
const loading = $('loading');
const resources = { geometries: new Set(), materials: new Set(), textures: new Set() };
let renderer, frame, disposed = false;
window.stadiumPreview = { ready: false, errors: [] };

function countTriangles(root) {
  let triangles = 0;
  root.traverse(o => {
    if (o.isMesh) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  return triangles;
}

async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function start() {
  const [manifest, layout, inventory] = await Promise.all(['assets.json', 'scene.json', 'inventory.json'].map(readJSON));
  renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Geometry count is independent of camera/culling; no hidden shadow passes.
  renderer.shadowMap.enabled = false;
  const scene = new T.Scene();
  scene.background = new T.Color('#53647c');
  scene.fog = new T.Fog('#718095', 65, 160);
  const camera = new T.PerspectiveCamera(42, 1, .1, 250);
  scene.add(new T.HemisphereLight('#b4c8e6', '#343b35', 1.35));
  const sun = new T.DirectionalLight('#ffd1a0', 2.1);
  sun.position.set(-24, 19, 10);
  scene.add(sun);
  const fill = new T.DirectionalLight('#93b8ed', .9);
  fill.position.set(18, 12, -10);
  scene.add(fill);

  const loader = new GLTFLoader();
  const textureLoader = new T.TextureLoader();
  const modelAssets = manifest.assets.filter(a => a.path.endsWith('.glb'));
  const imageAssets = manifest.assets.filter(a => a.path.endsWith('.png'));
  const [models, textures] = await Promise.all([
    Promise.all(modelAssets.map(async a => [a.path.split('/').pop().replace('.glb', ''), (await loader.loadAsync(a.path)).scene])),
    Promise.all(imageAssets.map(async a => {
      const tex = await textureLoader.loadAsync(a.path);
      tex.colorSpace = T.SRGBColorSpace;
      resources.textures.add(tex);
      return [a.path.split('/').pop(), tex];
    }))
  ]);
  const library = new Map(models), maps = new Map(textures);
  for (const [name, model] of library) {
    model.traverse(o => {
      if (!o.isMesh) return;
      if (name === 'net') o.material.side = T.DoubleSide;
      resources.geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        resources.materials.add(m);
        for (const value of Object.values(m)) if (value?.isTexture) resources.textures.add(value);
      }
    });
  }
  const stands = [];
  for (const p of layout.placements) {
    const model = library.get(p.model).clone(true);
    model.position.fromArray(p.position);
    model.rotation.y = p.rotationY;
    scene.add(model);
    if (p.model === 'stand-10m') stands.push(model);
  }
  const courtMap = maps.get('court-blue-green.png');
  courtMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  courtMap.wrapS = courtMap.wrapT = T.RepeatWrapping;
  const court = new T.Mesh(new T.PlaneGeometry(...layout.courtSize), new T.MeshStandardMaterial({ map: courtMap, roughness: .96 }));
  court.rotation.x = -Math.PI / 2;
  court.position.y = .015;
  scene.add(court);
  const base = new T.Mesh(new T.BoxGeometry(32, .16, 49), new T.MeshStandardMaterial({ color: '#435f5c', roughness: 1 }));
  base.position.y = -.09;
  scene.add(base);
  const ground = new T.Mesh(new T.PlaneGeometry(240,240), new T.MeshStandardMaterial({color:'#263e43',roughness:1}));
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -.18;
  scene.add(ground);
  for (const x of [-10,10]) for (const z of [-13,13]) {
    const lamp = new T.PointLight('#ffe4b3', 75, 28, 2);
    lamp.position.set(x,8.5,z);
    scene.add(lamp);
  }
  // Repeating blue sample in the courtside access strip demonstrates the tile.
  const tile = maps.get('hardcourt-tile.png');
  tile.wrapS = tile.wrapT = T.RepeatWrapping;
  tile.repeat.set(2, 22);
  const strip = new T.Mesh(new T.PlaneGeometry(.75, 29), new T.MeshStandardMaterial({ map: tile, roughness: .95 }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(-8.9, .022, 0);
  scene.add(strip);
  // Open cylinder: skyline stays behind the stadium and encloses every orbit.
  const sky = new T.Mesh(new T.CylinderGeometry(95, 95, 70, 48, 1, true),
    new T.MeshBasicMaterial({ map: maps.get('evening-city.png'), side: T.BackSide, fog: false, toneMapped: false }));
  sky.position.y = 28;
  scene.add(sky);

  // One batch, 600 spectators, two triangles each. Interleaved pose cells match
  // the existing island buildCrowd convention: idx = variant*2 + cheering.
  const atlas = maps.get('crowd-atlas.png');
  atlas.generateMipmaps = false;
  atlas.minFilter = atlas.magFilter = T.LinearFilter;
  const geo = new T.PlaneGeometry(...layout.crowd.planeSize);
  geo.translate(0, layout.crowd.planeSize[1] / 2, 0);
  const people = stands.length * 60;
  const cells = new Float32Array(people * 2), shades = new Float32Array(people);
  geo.setAttribute('cell', new T.InstancedBufferAttribute(cells, 2));
  geo.setAttribute('shade', new T.InstancedBufferAttribute(shades, 1));
  const crowdMaterial = new T.MeshBasicMaterial({ map: atlas, side: T.DoubleSide, alphaTest: .5, color: '#b0c0cf' });
  const cheer = { value: 0 };
  crowdMaterial.onBeforeCompile = shader => {
    shader.uniforms.uCheer = cheer;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_pars_vertex>',
      '#include <uv_pars_vertex>\nattribute vec2 cell; attribute float shade; uniform float uCheer; varying vec2 vCellUv; varying float vShade;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nfloat cheering=step(cell.y,uCheer); float idx=cell.x*2.0+cheering; float col=mod(idx,8.0); float row=floor(idx/8.0); vec2 safeUv=mix(vec2(1.0/128.0,1.0/256.0),vec2(127.0/128.0,255.0/256.0),uv); vCellUv=vec2((col+safeUv.x)/8.0,1.0-(row+1.0-safeUv.y)/2.0); vShade=shade;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>',
      '#include <map_pars_fragment>\nvarying vec2 vCellUv; varying float vShade;')
      .replace('#include <map_fragment>', 'diffuseColor*=texture2D(map,vCellUv); diffuseColor.rgb*=vShade;');
  };
  crowdMaterial.customProgramCacheKey = () => 'tennis-original-atlas-v1';
  const crowd = new T.InstancedMesh(geo, crowdMaterial, people);
  crowd.name = 'original-crowd';
  const dummy = new T.Object3D(), point = new T.Vector3();
  let i = 0;
  scene.updateMatrixWorld(true);
  for (const stand of stands) for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) {
    const x = col < 6 ? -4.5 + col * .7 : .95 + (col - 6) * .7;
    point.set(x, .28 + row * .42 - .025, .48 + row * .88 - .06).applyMatrix4(stand.matrixWorld);
    dummy.position.copy(point);
    dummy.rotation.set(0, stand.rotation.y + Math.PI, 0);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    cells[i * 2] = (i * 7 + row * 3) % 8;
    cells[i * 2 + 1] = ((i * 47) % 101) / 101;
    shades[i] = .85 - row * .04 + (i % 7) * .017;
    i++;
  }
  crowd.instanceMatrix.needsUpdate = true;
  crowd.computeBoundingSphere();
  scene.add(crowd);

  let view = { theta: .73, phi: 1.18, radius: 62, target: new T.Vector3(0, 1.1, 0) };
  const views = {
    overview: [ .73, 1.18, 62, [0,1.1,0] ],
    court: [ 1.4, 1.29, 24, [0,1.3,0] ],
    stand: [ -.8, 1.16, 19, [-9,1.1,-3] ]
  };
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    const [theta,phi,radius,target] = views[button.dataset.view];
    view = {theta,phi,radius,target:new T.Vector3(...target)};
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  }));
  let lastPointer;
  canvas.addEventListener('pointerdown', event => { lastPointer = [event.pointerId,event.clientX,event.clientY]; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!lastPointer || event.pointerId !== lastPointer[0]) return;
    view.theta -= (event.clientX-lastPointer[1]) * .006;
    view.phi = T.MathUtils.clamp(view.phi + (event.clientY-lastPointer[2]) * .004, .22, 1.48);
    lastPointer = [event.pointerId,event.clientX,event.clientY];
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, () => { lastPointer = undefined; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); view.radius=T.MathUtils.clamp(view.radius*Math.exp(event.deltaY*.001),10,84); }, {passive:false});
  let cheerMode = 0;
  $('cheer').addEventListener('click', () => {
    cheerMode = (cheerMode+1)%3;
    $('cheer').textContent = ['עידוד: אוטומטי','ידיים למעלה','ידיים למטה'][cheerMode];
    $('cheer').setAttribute('aria-pressed', String(cheerMode === 1));
  });
  $('wire').addEventListener('click', () => {
    const active = $('wire').getAttribute('aria-pressed') !== 'true';
    $('wire').setAttribute('aria-pressed', String(active));
    scene.traverse(o => {
      if (!o.isMesh || o === sky || o === crowd) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.wireframe = active;
    });
  });
  for (const item of inventory.files) {
    const asset = manifest.assets.find(a => a.path === item.path);
    const row = document.createElement('tr');
    const name = row.insertCell(), link = document.createElement('a');
    link.href = item.path;
    link.textContent = item.path;
    name.append(link);
    row.insertCell().textContent = (item.bytes/1000).toFixed(1)+' KB';
    const measurement = row.insertCell();
    measurement.dir = 'ltr';
    measurement.textContent = asset?.triangles?.toLocaleString('en') ?? (asset?.width ? `${asset.width} × ${asset.height}` : '—');
    $('files').append(row);
  }
  const triangles = countTriangles(scene);
  if (triangles > 25000) throw Error(`Scene budget exceeded: ${triangles}`);
  $('triangles').textContent = triangles.toLocaleString('en');
  $('fans').textContent = people.toLocaleString('en');
  $('bytes').textContent = (inventory.totalBytes/1000000).toFixed(2)+' MB';
  $('loaded').textContent = `${manifest.assets.length} / ${manifest.assets.length}`;

  function render(time) {
    if (disposed) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    const {theta,phi,radius,target} = view;
    camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta)).add(target);
    camera.lookAt(target);
    cheer.value = cheerMode === 1 ? 1 : cheerMode === 2 ? -1 : .28+.24*Math.sin(time*.0007);
    renderer.render(scene,camera);
    window.stadiumPreview.visibleTriangles = renderer.info.render.triangles;
    window.stadiumPreview.drawCalls = renderer.info.render.calls;
    frame=requestAnimationFrame(render);
  }
  scene.traverse(o => {
    if (!o.isMesh) return;
    resources.geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.materials.add(m);
  });
  render(0);
  loading.hidden = true;
  Object.assign(window.stadiumPreview, { ready:true, triangles, fans:people, loaded:manifest.assets.length,
    totalBytes:inventory.totalBytes, models:models.map(([name])=>name), textureCount:textures.length,
    crowdInstances:crowd.count, crowdBatches:1, compression:'none', csp:document.querySelector('[http-equiv]').content });
}

start().catch(error => {
  loading.textContent = `טעינת התצוגה נכשלה: ${error.message}`;
  loading.classList.add('error');
  window.stadiumPreview.errors.push(error.message);
  console.error(error);
});
window.addEventListener('pagehide', () => {
  disposed = true;
  cancelAnimationFrame(frame);
  for (const set of Object.values(resources)) for (const resource of set) resource.dispose();
  renderer?.dispose();
}, {once:true});
