// Original CC0-1.0. Object-space paint on cloned materials; the source GLB is immutable.
import * as T from '../../vendor/three.module.js';

export async function loadPalettes() {
  const read = async path => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`Cannot load ${path}: ${response.status}`);
    return response.json();
  };
  const manifest = await read('./manifest.json');
  const teams = await Promise.all(manifest.teams.map(team => read(team.palette)));
  return {manifest, teams};
}

/** source is the GLTFLoader scene, before the runtime's per-material merge.
 * Returns a new scene and a disposer for ONLY its owned materials/textures.
 * Geometry, transforms, wheel pivots and original material objects are shared untouched.
 */
export async function paintCar(source, palette, car, mapping) {
  const root = source.clone(true);
  const texture = await new T.TextureLoader().loadAsync(new URL(car.numberPlate, import.meta.url).href);
  // Raw sampler: the shader converts the sRGB PNG to linear explicitly.
  texture.colorSpace = T.NoColorSpace;
  texture.anisotropy = 4;
  const materials = [];
  const primary = new T.Color(palette.primary), secondary = new T.Color(palette.secondary);
  const stripe = new T.Color(palette.stripe), pinstripe = new T.Color(palette.pinstripe);
  const projections = mapping.numberProjections;
  const nose = projections.find(p => p.face === 'top');
  const side = projections.find(p => p.face === 'both-sides');
  const rear = projections.find(p => p.face === 'endplates');
  root.traverse(object => {
    if (!object.isMesh) return;
    const node = object.parent?.isGroup && object.parent.name ? object.parent.name : object.name;
    // GLTFLoader expands multi-material wing nodes into child meshes.
    const part = [object.name, node].find(name => [...mapping.primaryNodes, ...mapping.secondaryNodes].includes(name));
    if (!part) return;
    const replace = material => {
      if (material.name !== mapping.material) return material;
      const copy = new T.MeshPhysicalMaterial({...palette.finish, color: palette.primary, name: material.name});
      const role = mapping.primaryNodes.includes(part) ? 0 : part === 'RearWing' ? 1 : 2;
      const hasStripe = mapping.stripeNodes.includes(part);
      copy.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, {
          livPrimary: {value: primary}, livSecondary: {value: secondary},
          livStripe: {value: stripe}, livPin: {value: pinstripe}, livPlate: {value: texture},
          livHalfWidth: {value: car.stripeWidth / 2}, livPinWidth: {value: car.pinstripeWidth},
          livRole: {value: role}, livHasStripe: {value: hasStripe ? 1 : 0},
          livSill: {value: new T.Vector3(mapping.bodySecondary.maxY, mapping.bodySecondary.minAbsX, mapping.bodySecondary.feather)},
          livNose: {value: new T.Vector4(...nose.center, ...nose.size)},
          livSide: {value: new T.Vector4(...side.center, ...side.size)},
          livRear: {value: new T.Vector4(...rear.center, ...rear.size)},
        });
        shader.vertexShader = 'varying vec3 livPosition; varying vec3 livNormal;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nlivPosition = position; livNormal = normal;');
        shader.fragmentShader = `
          varying vec3 livPosition; varying vec3 livNormal;
          uniform vec3 livPrimary, livSecondary, livStripe, livPin, livSill;
          uniform vec4 livNose, livSide, livRear;
          uniform float livHalfWidth, livPinWidth, livRole, livHasStripe;
          uniform sampler2D livPlate;
          vec3 plateLinear(vec3 c) {
            return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
          }
          vec4 plateAt(vec2 uv) {
            if (min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0);
            vec4 plate = texture2D(livPlate, uv);
            plate.rgb = plateLinear(plate.rgb);
            return plate;
          }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
          #include <color_fragment>
          vec3 p = livPosition;
          vec3 n = normalize(livNormal);
          vec3 paint = livRole < 0.5 ? livPrimary : livSecondary;
          if (livRole < 0.5) {
            float sill = (1.0 - smoothstep(livSill.x-livSill.z, livSill.x+livSill.z, p.y))
              * smoothstep(livSill.y, livSill.y+livSill.z, abs(p.x));
            paint = mix(paint, livSecondary, sill);
          }
          float edge = max(fwidth(p.x), 0.0008);
          float line = 1.0 - smoothstep(livHalfWidth-edge, livHalfWidth+edge, abs(p.x));
          float pin = 1.0 - smoothstep(livPinWidth-edge, livPinWidth+edge,
            abs(abs(p.x) - (livHalfWidth + 0.016)));
          paint = mix(paint, livPin, pin * livHasStripe);
          paint = mix(paint, livStripe, line * livHasStripe);
          vec4 plate = vec4(0.0);
          if (livRole < 0.5 && n.y > 0.25) {
            plate = plateAt(vec2(0.5 + (p.x-livNose.x)/livNose.z,
              0.5 - (p.z-livNose.y)/livNose.w));
          }
          if (livRole < 0.5 && abs(n.x) > 0.5 && abs(p.x) > 0.34) {
            plate = plateAt(vec2(0.5 - sign(p.x)*(p.z-livSide.x)/livSide.z,
              0.5 + (p.y-livSide.y)/livSide.w));
          }
          if (livRole > 0.5 && livRole < 1.5 && abs(n.x) > 0.5 && abs(p.x) > 0.64) {
            plate = plateAt(vec2(0.5 - sign(p.x)*(p.z-livRear.x)/livRear.z,
              0.5 + (p.y-livRear.y)/livRear.w));
          }
          diffuseColor.rgb = mix(paint, plate.rgb, plate.a);
        `);
      };
      copy.customProgramCacheKey = () => 'racing-liveries-v1';
      materials.push(copy);
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
  });
  root.userData.livery = {team: palette.id, driverId: car.driverId, number: car.number, variant: car.variant};
  return {root, dispose() {materials.forEach(material => material.dispose()); texture.dispose();}};
}
