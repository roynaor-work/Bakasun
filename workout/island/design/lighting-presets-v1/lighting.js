/* Original shared lighting adapter. MIT; see LICENSES.md. No DOM or renderer ownership. */
(function (global) {
  'use strict';

  function random(seed) {
    let state = seed >>> 0;
    return () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  }

  async function loadTextures(THREE, pack, inline = {}) {
    const loader = new THREE.TextureLoader();
    const entries = await Promise.all(Object.entries(pack.assets).map(async ([id, asset]) => {
      const map = await loader.loadAsync(inline[asset.path] || asset.path);
      map.colorSpace = asset.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = asset.wrapS === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      map.wrapT = asset.wrapT === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      map.name = asset.path;
      return [id, map];
    }));
    return Object.fromEntries(entries);
  }

  function create(THREE, scene, textures, options = {}) {
    const scale = options.worldUnitsPerMeter ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('worldUnitsPerMeter must be positive');
    const root = new THREE.Group();
    root.name = 'island-lighting-v1';
    root.scale.setScalar(scale);
    scene.add(root);
    const originalFog = scene.fog;
    const ownedFog = new THREE.Fog('#ffffff', 1, 200);
    const sun = new THREE.DirectionalLight('#ffffff', 1);
    const ambient = new THREE.HemisphereLight('#ffffff', '#555555', 1);
    sun.name = 'preset-sun';
    ambient.name = 'preset-ambient';
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(options.shadowMapSize ?? 1024);
    Object.assign(sun.shadow.camera, { left: -36*scale, right: 36*scale,
      top: 36*scale, bottom: -36*scale, near: .5*scale, far: 180*scale });
    sun.shadow.bias = -.0003;
    sun.shadow.normalBias = .035*scale;
    sun.shadow.camera.updateProjectionMatrix();
    root.add(sun, sun.target, ambient);

    const skyUniforms = {
      uZenith: { value: new THREE.Color() }, uUpper: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uSunDirection: { value: new THREE.Vector3() },
      uDisc: { value: .02 }, uHalo: { value: .5 }, uTile: { value: textures.skyTile },
      uRepeat: { value: new THREE.Vector2(8, 4) }, uStrength: { value: .018 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(340, 32, 20), new THREE.ShaderMaterial({
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uZenith,uUpper,uHorizon,uGround,uSunColor,uSunDirection;
        uniform float uDisc,uHalo,uStrength; uniform vec2 uRepeat; uniform sampler2D uTile;
        varying vec3 vDir;
        void main(){
          vec3 d=normalize(vDir); float h=d.y;
          vec3 c=mix(uGround,uHorizon,smoothstep(-.15,0.0,h));
          c=mix(c,uUpper,smoothstep(0.0,.35,h));
          c=mix(c,uZenith,smoothstep(.35,1.0,h));
          vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,asin(clamp(h,-1.0,1.0))/3.1415927+.5);
          c*=1.0+(texture2D(uTile,uv*uRepeat).r-.5)*uStrength;
          float s=dot(d,uSunDirection);
          float disc=smoothstep(cos(uDisc),cos(uDisc*.72),s);
          float glow=pow(max(s,0.0),100.0)*uHalo*.35;
          c+=uSunColor*(disc*.95+glow);
          gl_FragColor=vec4(c,1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.name = 'preset-sky';
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    root.add(sky);

    const cloudGroup = new THREE.Group();
    const cloudSprites = Array.from({ length: 16 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.clouds,
        transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      sprite.renderOrder = -8;
      sprite.frustumCulled = false;
      cloudGroup.add(sprite);
      return sprite;
    });
    root.add(cloudGroup);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(512*3);
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starUniforms = { uColor:{value:new THREE.Color('#dceaff')},
      uOpacity:{value:1}, uSize:{value:2.4} };
    const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({ uniforms:starUniforms,
      transparent:true,depthWrite:false,fog:false,toneMapped:false,
      vertexShader:`uniform float uSize;
        void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=uSize;}`,
      fragmentShader:`uniform vec3 uColor;uniform float uOpacity;
        void main(){float r=length(gl_PointCoord-.5)*2.0;
          float alpha=(1.0-smoothstep(.12,.85,r))*uOpacity;
          if(alpha<.01)discard;gl_FragColor=vec4(uColor,alpha);
          #include <colorspace_fragment>
        }`,
    }));
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    root.add(stars);

    // One precipitation draw call per scene. Movement is computed on the GPU.
    const rainPositions = [], snowPositions = [];
    const weatherRandom = random(4488);
    for (let i=0; i<400; i++) {
      const x=weatherRandom()*64-32, y=weatherRandom()*36, z=weatherRandom()*64-32;
      rainPositions.push(x,y,z,x+.05,y+.85,z+.02);
      snowPositions.push(x,y,z);
    }
    const weatherUniforms = {
      uTime: { value: 0 }, uSpeed: { value: 1 }, uWind: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color() }, uOpacity: { value: .5 },
      uFogNear: { value: 20 },
      uFogFar: { value: 100 }, uScale: { value: scale },
    };
    const weatherVertex = `uniform float uTime,uSpeed,uScale; uniform vec2 uWind;
      varying float vDepth;
      void main(){ vec3 p=position;
        p.y=mod(p.y-uTime*uSpeed,36.0);
        p.xz=mod(p.xz+uWind*uTime+32.0,64.0)-32.0;
        #ifdef SNOW
          p.x+=sin(uTime*.7+p.z)*.35;
        #endif
        vec4 view=modelViewMatrix*vec4(p,1.0); vDepth=-view.z;
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(90.0*uScale/max(1.0,-view.z),1.5,6.0);
      }`;
    const weatherFragment = `uniform vec3 uColor; uniform float uOpacity,uFogNear,uFogFar;
      varying float vDepth;
      void main(){ float a=uOpacity;
        #ifdef SNOW
          a*=1.0-smoothstep(.15,.5,length(gl_PointCoord-.5));
        #endif
        a*=1.0-smoothstep(uFogNear,uFogFar,vDepth);
        if(a<.01)discard;
        gl_FragColor=vec4(uColor,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    function precipitation(points, snow) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
      const material = new THREE.ShaderMaterial({ uniforms: weatherUniforms,
        defines: snow ? { SNOW: 1 } : {}, transparent: true, depthWrite: false,
        vertexShader: weatherVertex, fragmentShader: weatherFragment });
      const object = snow ? new THREE.Points(geometry,material) : new THREE.LineSegments(geometry,material);
      object.frustumCulled = false;
      object.renderOrder = 5;
      root.add(object);
      return object;
    }
    const rain = precipitation(rainPositions, false);
    const snow = precipitation(snowPositions, true);

    const spots = Array.from({ length: 4 }, () => {
      const light = new THREE.SpotLight('#ffffff',0,100*scale,.62,.65,2);
      light.castShadow = false; // Keep one shadow map per scene on mobile.
      const fixture = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,16,7),
        new THREE.MeshLambertMaterial({ color:'#71818a' }));
      pole.position.y=-8;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(2.5,.8,.6),
        new THREE.MeshLambertMaterial({ color:'#485867' }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.halo,
        color:'#e2eeff', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
        toneMapped:false, fog:true }));
      glow.scale.set(7,7,1);
      glow.position.z=.4;
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(2.2,.48,.12),
        new THREE.MeshBasicMaterial({ color:'#e2eeff',toneMapped:false }));
      bulb.position.z=.36;
      fixture.add(pole,housing,glow,bulb);
      root.add(light,light.target,fixture);
      return { light,fixture,glow,bulb };
    });

    let current = null;
    let disposed = false;
    function apply(preset) {
      if (disposed) throw new Error('Lighting rig was disposed');
      if (!preset?.sun || !preset?.sky || !preset?.textures) throw new TypeError('Invalid lighting preset');
      current = preset;
      root.userData.presetId = preset.id;
      sun.color.set(preset.sun.color);
      sun.intensity = preset.sun.intensity;
      sun.position.fromArray(preset.sun.direction).multiplyScalar(80);
      ambient.color.set(preset.ambient.color);
      ambient.groundColor.set(preset.ambient.groundColor);
      ambient.intensity = preset.ambient.intensity;
      ownedFog.color.set(preset.fog.color);
      ownedFog.near = preset.fog.start*scale;
      ownedFog.far = preset.fog.end*scale;
      scene.fog = preset.fog.enabled ? ownedFog : null;
      for (const [key, uniform] of [['zenith','uZenith'],['upper','uUpper'],['horizon','uHorizon'],['ground','uGround']]) {
        skyUniforms[uniform].value.set(preset.sky.gradient[key]);
      }
      skyUniforms.uSunDirection.value.fromArray(preset.sun.direction).normalize();
      skyUniforms.uSunColor.value.set(preset.sun.color);
      skyUniforms.uDisc.value = preset.sun.discAngularRadius;
      skyUniforms.uHalo.value = preset.sun.haloOpacity;
      skyUniforms.uRepeat.value.fromArray(preset.sky.tileRepeat);
      skyUniforms.uStrength.value = preset.sky.tileStrength;
      skyUniforms.uTile.value = textures[preset.textures.skyTile];
      // Re-seeding on each apply makes every scene show the same weather/sky.
      const starRandom = random(preset.stars.seed);
      for (let i=0; i<512; i++) {
        const y=.05+starRandom()*.95, phi=starRandom()*Math.PI*2;
        const r=Math.sqrt(1-y*y)*240;
        starPositions.set([r*Math.cos(phi),y*240,r*Math.sin(phi)],i*3);
      }
      starGeometry.attributes.position.needsUpdate=true;
      starGeometry.setDrawRange(0,preset.stars.count);
      stars.visible = preset.stars.enabled;
      starUniforms.uColor.value.set(preset.stars.color);
      starUniforms.uOpacity.value = preset.stars.opacity;
      starUniforms.uSize.value = preset.stars.size;
      const cloudRandom = random(preset.clouds.seed);
      cloudSprites.forEach((sprite,i) => {
        sprite.visible = preset.clouds.enabled && i<preset.clouds.count;
        sprite.material.map = textures[preset.textures.clouds];
        sprite.material.color.set(preset.clouds.color);
        sprite.material.opacity = preset.clouds.opacity;
        const width=(24+cloudRandom()*26)*preset.clouds.scale;
        sprite.scale.set(width,width*.5,1);
        sprite.userData.base = new THREE.Vector3(cloudRandom()*190-95,
          preset.clouds.altitude+cloudRandom()*24,-60-cloudRandom()*80);
        sprite.position.copy(sprite.userData.base);
      });
      rain.visible = preset.weather.type === 'rain';
      snow.visible = preset.weather.type === 'snow';
      rain.geometry.setDrawRange(0,preset.weather.count*2);
      snow.geometry.setDrawRange(0,preset.weather.count);
      weatherUniforms.uSpeed.value = preset.weather.speed;
      weatherUniforms.uWind.value.fromArray(preset.weather.wind);
      weatherUniforms.uColor.value.set(preset.weather.color);
      weatherUniforms.uOpacity.value = preset.weather.opacity;
      weatherUniforms.uFogNear.value = preset.fog.enabled ? ownedFog.near : 1e8;
      weatherUniforms.uFogFar.value = preset.fog.enabled ? ownedFog.far : 1e9;
      spots.forEach(({ light,fixture,glow,bulb },i) => {
        const item=preset.spotlights[i];
        light.visible=fixture.visible=!!item;
        light.intensity=0;
        if (!item) return;
        light.position.fromArray(item.position);
        light.target.position.fromArray(item.target);
        light.color.set(item.color);
        light.intensity=item.intensity*scale*scale;
        light.distance=item.distance*scale;
        light.angle=item.angle;
        light.penumbra=item.penumbra;
        light.decay=item.decay;
        fixture.position.copy(light.position);
        glow.material.map = textures[preset.textures.halo];
        glow.material.color.set(item.color);
        glow.material.opacity=item.haloOpacity;
        bulb.material.color.set(item.color);
      });
    }

    function update(seconds, camera) {
      if (!current || disposed) return;
      sky.position.copy(camera.position).divideScalar(scale);
      stars.position.copy(sky.position);
      weatherUniforms.uTime.value=seconds;
      cloudSprites.forEach(sprite => {
        const base=sprite.userData.base;
        sprite.position.x=((base.x+95+seconds*current.clouds.speed)%190)-95;
      });
    }

    function dispose() {
      if (disposed) return;
      disposed=true;
      if (scene.fog === ownedFog || (scene.fog === null && current && !current.fog.enabled)) scene.fog=originalFog;
      const geometries=new Set(), materials=new Set();
      root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m=>materials.add(m));
      });
      geometries.forEach(g=>g.dispose());
      materials.forEach(m=>m.dispose());
      sun.shadow.dispose();
      root.removeFromParent();
      // Texture ownership stays with the caller: the same maps can serve many rigs.
    }

    return { root,sun,ambient,sky,stars,clouds:cloudGroup,rain,snow,spots,apply,update,dispose,
      get presetId(){ return current?.id ?? null; } };
  }

  global.IslandLighting = Object.freeze({ create,loadTextures });
})(globalThis);
