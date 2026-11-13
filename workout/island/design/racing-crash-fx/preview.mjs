import * as T from 'three';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';

const views = [], paints = [], loader = new GLTFLoader();
const manifest = await fetch('manifest.json').then(r => r.json());
const status = document.querySelector('#status');
let paused = false, elapsed = 0, last = performance.now();
document.querySelector('#pause').addEventListener('click', event => {
  paused = !paused;
  event.target.textContent = paused ? 'Resume rotation & playback' : 'Pause rotation & playback';
});
document.querySelector('#paint').addEventListener('input', event => {
  for (const material of paints) material.color.set(event.target.value);
});

function modelView(mesh, triangles, tint) {
  const article = document.createElement('article'), canvas = document.createElement('canvas');
  const title = document.createElement('h2'), caption = document.createElement('small');
  title.textContent = mesh.name.replaceAll('_', ' ');
  caption.textContent = `${triangles} triangles · ${tint ? 'car paint material' : '128 × 128 embedded rubber texture'}`;
  article.append(canvas, title, caption);
  document.querySelector('#models').append(article);
  const renderer = new T.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#1b242d');
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, 1, .01, 20);
  scene.add(new T.HemisphereLight('#e7f1ff', '#596171', 2));
  const key = new T.DirectionalLight('#fff0db', 3);
  key.position.set(3, 5, 4); scene.add(key);
  const rim = new T.DirectionalLight('#c9deff', 2);
  rim.position.set(-3, 2, -3); scene.add(rim);
  const material = mesh.material.clone();
  if (tint) { material.color.set(document.querySelector('#paint').value); paints.push(material); }
  const object = new T.Mesh(mesh.geometry, material);
  const group = new T.Group(); group.add(object); scene.add(group);
  if (!tint) object.rotation.z = .25;
  const bounds = new T.Box3().setFromObject(group), size = bounds.getSize(new T.Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  camera.position.set(extent * 1.1, extent * 1.05, extent * 1.7);
  camera.lookAt(0, 0, 0);
  views.push({renderer, scene, camera, group, canvas});
}

function atlasView(id, file, fps, blending) {
  const canvas = document.querySelector(id), renderer = new T.WebGLRenderer({canvas, antialias: true});
  renderer.setClearColor('#0a0f14');
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-.5, .5, .5, -.5, .01, 10);
  camera.position.z = 1;
  const ready = new Promise((resolve, reject) => {
    new T.TextureLoader().load(file, texture => {
      texture.colorSpace = T.SRGBColorSpace;
      texture.minFilter = texture.magFilter = T.LinearFilter;
      texture.generateMipmaps = false;
      texture.repeat.set(.25, .25);
      texture.offset.set(0, .75);
      const material = new T.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false, blending});
      scene.add(new T.Mesh(new T.PlaneGeometry(1, 1), material));
      views.push({renderer, scene, camera, texture, fps});
      resolve();
    }, undefined, reject);
  });
  return ready;
}

try {
  const [body, tire] = await Promise.all([loader.loadAsync('body-fragments.glb'), loader.loadAsync('formula-tire.glb')]);
  for (const entry of manifest.models[0].meshes) modelView(body.scene.getObjectByName(entry.name), entry.triangles, true);
  modelView(tire.scene.getObjectByName('formula_tire'), manifest.models[1].triangles, false);
  const info = document.createElement('article'); info.className = 'budget';
  info.innerHTML = '<strong>Pack limits</strong><br>6 fragments · ≤60 triangles each<br>Single tire · 120 triangles<br>2 flipbooks · 16 frames each<br>1 shared, texture-free paint material<br>CC0 · no brands · no Draco';
  document.querySelector('#models').append(info);
  await Promise.all([atlasView('#sparks', 'sparks-atlas.png', 40, T.AdditiveBlending), atlasView('#smoke', 'smoke-dust-atlas.png', 20, T.NormalBlending)]);
  status.textContent = '7 meshes + 2 flipbooks loaded';
  window.crashFxPreviewReady = true;
} catch (error) {
  status.textContent = `Load failed: ${error.message}`; status.style.color = '#ffabab';
  throw error;
}

function draw(now) {
  if (!paused) elapsed += (now - last) / 1000;
  last = now;
  for (const view of views) {
    const {renderer, scene, camera, canvas, group, texture, fps} = view;
    if (group) {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      }
      group.rotation.y = elapsed * .35;
    }
    if (texture) {
      const frame = Math.min(15, Math.floor(elapsed % (16 / fps + .25) * fps));
      texture.offset.set(frame % 4 / 4, (3 - Math.floor(frame / 4)) / 4);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
