// CC0-1.0. Local sprite atlases and a procedural water surface for the GLB anchors.
import * as THREE from '../../vendor/three.module.js';

async function loadAtlas(spec, baseURL) {
  const map = await new THREE.TextureLoader().loadAsync(new URL(spec.atlas, baseURL).href);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  const inset = .5 / (spec.framePixels * spec.frames);
  map.repeat.set(1 / spec.frames - 2 * inset, 1);
  return {
    map,
    frame(time) {
      map.offset.x = (Math.floor(time * spec.fps) % spec.frames) / spec.frames + inset;
    },
  };
}

function sprite(map) {
  const material = new THREE.SpriteMaterial({ map, opacity: 0, transparent: true, depthWrite: false, toneMapped: false });
  return new THREE.Sprite(material);
}

function waterSurface() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { seconds: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec2 worldXZ;
      void main() {
        vUv = uv;
        worldXZ = (modelMatrix * vec4(position, 1.0)).xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying vec2 worldXZ;
      uniform float seconds;
      uniform float opacity;
      void main() {
        vec2 p = worldXZ;
        float a = sin(11.0*p.x + 3.0*p.y + 1.2*seconds + sin(7.0*p.y - seconds));
        float b = sin(8.0*p.y - 6.0*p.x - 1.65*seconds + .6*sin(4.0*p.x));
        float wake = .5 + .5*sin(11.0*distance(vUv, vec2(.18, .68)) - 2.1*seconds);
        float highlights = smoothstep(1.37, 1.95, .86*a + b + .23*wake);
        float ripples = smoothstep(.81, 1.0, sin(19.0*p.y - 2.3*seconds + 1.9*a));
        float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
        float bank = (1.0 - smoothstep(.001, .019, edge)) * (.58 + .42*a);
        vec3 teal = mix(vec3(.027,.23,.30), vec3(.12,.59,.67), .34 + .17*a + .17*b);
        vec3 color = mix(teal, vec3(.70,.94,.88), .69*highlights + .14*ripples + .20*bank);
        gl_FragColor = vec4(color, opacity*(.68 + .22*highlights + .10*bank));
        #include <colorspace_fragment>
      }`,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  surface.rotation.x = -Math.PI / 2;
  surface.renderOrder = 1;

  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5,
    -.5, 1, -.5, .5, 1, -.5, .5, 1, .5, -.5, 1, .5,
  ], 3));
  walls.setIndex([0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  const volume = new THREE.Mesh(walls, new THREE.MeshBasicMaterial({
    color: 0x29818e, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, toneMapped: false,
  }));
  return { surface, volume };
}

/** Anchors are read in world space. Update model matrices before passing the room. */
export async function createInteriorEffects(spec, baseURL, reducedMotion = false) {
  const [flameAtlas, smokeAtlas] = await Promise.all([
    loadAtlas(spec.flame, baseURL), loadAtlas(spec.smoke, baseURL),
  ]);
  const root = new THREE.Group();
  root.name = 'interior_effects';
  const flameSprites = [];
  const smokeSprites = [];
  const glow = new THREE.PointLight(0xff722b, 0, 3.9, 2);
  const { surface, volume } = waterSurface();
  root.add(volume, surface, glow);

  let flames = [];
  let room = null;
  let smokeMode = spec.smoke.modes[0];
  let layerAnchors = [];
  let depth = 0;
  let targetDepth = 0;
  let time = 0;
  const waterOrigin = new THREE.Vector3();
  const smokeOrigin = new THREE.Vector3();

  function attach(nextRoom, roomInfo) {
    if (room !== nextRoom) depth = 0;
    room = nextRoom;
    layerAnchors = room ? spec.smoke.layers.map(name => room.getObjectByName(roomInfo.smokeNodes[name])) : [];
    if (room) {
      const anchor = room.getObjectByName(roomInfo.flood.node);
      anchor.getWorldPosition(waterOrigin);
      surface.scale.set(...roomInfo.flood.size, 1);
      volume.scale.set(roomInfo.flood.size[0], 1, roomInfo.flood.size[1]);
    }
  }

  function configure({ burning, smoke, floodDepth }) {
    flames = burning;
    smokeMode = spec.smoke.modes.find(mode => mode.id === smoke) ?? spec.smoke.modes[0];
    targetDepth = room ? THREE.MathUtils.clamp(floodDepth, 0, spec.flood.maxDepthMeters) : 0;
  }

  function step(delta) {
    time += reducedMotion ? 0 : delta;
    flameAtlas.frame(time);
    smokeAtlas.frame(time);
    while (flameSprites.length < flames.length) {
      const flame = sprite(flameAtlas.map);
      flame.center.set(.5, .10);
      flame.renderOrder = 2;
      flameSprites.push(flame);
      root.add(flame);
    }
    flameSprites.forEach((flame, i) => {
      flame.visible = Boolean(flames[i]);
      if (!flame.visible) return;
      flames[i].fire.getWorldPosition(flame.position);
      const pulse = Math.sin(time * 8 + i * 2.1);
      flame.scale.set(.53 + .09 * pulse, 1.02 + .16 * pulse, 1);
      flame.material.opacity = .89 + .09 * pulse;
    });
    const lightSource = flames.find(item => !item.id.endsWith('door')) ?? flames[0];
    glow.intensity = lightSource ? 9 + 2 * Math.sin(time * 13) : 0;
    if (lightSource) lightSource.fire.getWorldPosition(glow.position).add(new THREE.Vector3(0, .38, .14));

    const puffsPerLayer = 8;
    if (layerAnchors.length && smokeMode.id !== 'off' && !smokeSprites.length) {
      for (let i = 0; i < spec.smoke.layers.length * puffsPerLayer; i++) {
        const cloud = sprite(smokeAtlas.map);
        cloud.renderOrder = 3;
        smokeSprites.push(cloud);
        root.add(cloud);
      }
    }
    smokeSprites.forEach((cloud, i) => {
      const layer = Math.floor(i / puffsPerLayer);
      const alpha = layerAnchors[layer] ? smokeMode.opacity[layer] : 0;
      cloud.visible = alpha > 0;
      if (!cloud.visible) return;
      const local = i % puffsPerLayer;
      const column = local % 4;
      const row = Math.floor(local / 4);
      const anchor = layerAnchors[layer];
      const [width, height, length] = anchor.userData.extent;
      anchor.getWorldPosition(smokeOrigin);
      cloud.position.set(
        smokeOrigin.x + width * (-.33 + column * .22) + .17 * Math.sin(time * .58 + i * .72),
        smokeOrigin.y + .055 * Math.sin(time * .44 + local) + (row - .5) * .065,
        smokeOrigin.z + length * (row ? .25 : -.18) + .14 * Math.sin(time * .4 - i),
      );
      cloud.scale.set(width * (.45 + .035 * Math.sin(i)), height * 1.29, 1);
      cloud.material.opacity = alpha * (row ? .96 : .82);
    });

    const maxChange = delta * spec.flood.fillMetersPerSecond;
    depth = reducedMotion ? targetDepth : depth + THREE.MathUtils.clamp(targetDepth - depth, -maxChange, maxChange);
    surface.visible = volume.visible = depth > .004 && Boolean(room);
    surface.position.copy(waterOrigin);
    surface.position.y += depth + .004;
    surface.material.uniforms.seconds.value = time;
    surface.material.uniforms.opacity.value = Math.min(.87, depth * 4.9);
    volume.position.copy(waterOrigin);
    volume.scale.y = depth;
    volume.material.opacity = Math.min(.62, depth * 3.4);
  }

  return {
    root, attach, configure, step,
    get animating() {
      return !reducedMotion && (flames.length > 0 || (room && smokeMode.id !== 'off') || depth > 0 || targetDepth > 0);
    },
    status() {
      return {
        flames: flameSprites.filter(flame => flame.visible).length,
        smokeLayers: smokeMode.opacity.map((value, i) => Boolean(layerAnchors[i] && value)),
        smokePuffs: smokeSprites.filter(cloud => cloud.visible).length,
        floodDepth: depth,
        floodVisible: surface.visible,
      };
    },
  };
}
