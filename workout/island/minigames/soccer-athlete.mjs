/** Realistic athlete look: per-player skin, hair, stubble and kit colours over the
 * shared CC0 athlete textures (one shader program for every player). */
const SKIN_REFERENCE = [0.52, 0.31, 0.235]; // linear albedo the skin texture was authored at
function linear(T, hex) { return new T.Color(hex); } // THREE.Color stores linear values
const SKIN_HEAD = `
uniform sampler2D athleteMask; uniform sampler2D athleteOrm;
uniform vec3 athleteTone; uniform vec3 athleteHair; uniform float athleteBeard; float athleteSkinWeight = 0.0;`;
const SKIN_BODY = `
#include <map_fragment>
{
  vec3 m = texture2D(athleteMask, vMapUv).rgb;
  vec3 orm = texture2D(athleteOrm, vMapUv).rgb;
  float eye = step(0.79, vMapUv.x) * step(vMapUv.y, 0.115);
  vec3 skin = diffuseColor.rgb * mix(athleteTone, vec3(1.0), eye);
  float stubble = m.g * athleteBeard * smoothstep(0.45, 0.95, orm.b) * 0.8;
  skin = mix(skin, athleteHair * 0.7 + skin * 0.12, clamp(stubble, 0.0, 0.92));
  vec3 hair = athleteHair * (0.5 + 0.85 * orm.b);
  diffuseColor.rgb = mix(skin, hair, m.r * (1.0 - eye));
  athleteSkinWeight = (1.0 - m.r) * (1.0 - eye);
}`;
// Cheap sub-surface look: warm light bleeding at grazing angles (ears, nose, jaw line).
const SKIN_SCATTER = `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vec3(0.95, 0.32, 0.2) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * 0.22 * athleteSkinWeight;`;
const KIT_HEAD = `
uniform sampler2D athleteKitMask; uniform sampler2D athleteNumbers; uniform float athleteNumberCell; uniform float athleteNumberCells;
uniform vec3 kitPrimary; uniform vec3 kitSecondary; uniform vec3 kitShorts; uniform vec3 kitShortsTrim;
uniform vec3 kitSocks; uniform vec3 kitSocksTrim; uniform vec3 kitBoots; uniform vec3 kitBootAccent;
varying vec2 vAthleteNumber; varying vec2 vAthleteCrest;`;
const KIT_BODY = `
#include <map_fragment>
{
  vec3 d = texture2D(map, vMapUv).rgb;
  vec3 k = texture2D(athleteKitMask, vMapUv).rgb;
  float boots = clamp(1.0 - k.r - k.g - k.b, 0.0, 1.0);
  vec3 jersey = mix(kitPrimary, kitSecondary, d.g) * (1.0 - 0.16 * d.b);
  vec3 shorts = mix(kitShorts, kitShortsTrim, d.g);
  vec3 socks = mix(kitSocks, kitSocksTrim, d.g);
  vec3 shoe = mix(kitBoots, kitBootAccent, d.g);
  vec3 c = (jersey * k.r + shorts * k.g + socks * k.b + shoe * boots) * (0.25 + 0.95 * d.r);
  // Club crest: a shield in the team colours on the left chest.
  if (vAthleteCrest.x >= 0.0 && vAthleteCrest.x <= 1.0 && vAthleteCrest.y >= 0.0 && vAthleteCrest.y <= 1.0) {
    vec2 q = (vAthleteCrest - 0.5) * 2.0;
    float hw = q.y > -0.1 ? 0.75 : 0.75 * (q.y + 1.0) / 0.9;
    float outer = (1.0 - smoothstep(-0.06, 0.0, abs(q.x) - hw)) * (1.0 - smoothstep(0.74, 0.8, q.y)) * step(-1.0, q.y);
    float inner = (1.0 - smoothstep(-0.06, 0.0, abs(q.x) - (hw - 0.17))) * (1.0 - smoothstep(0.58, 0.64, q.y)) * step(-0.8, q.y);
    float band = smoothstep(0.08, 0.02, abs(q.y - 0.15)) * inner;
    vec3 crest = mix(kitSecondary, kitPrimary * 0.55, inner);
    crest = mix(crest, kitSecondary, band);
    c = mix(c, crest * (0.35 + 0.8 * d.r), outer * k.r);
  }
  if (vAthleteNumber.x >= 0.0 && vAthleteNumber.x <= 1.0 && vAthleteNumber.y >= 0.0 && vAthleteNumber.y <= 1.0) {
    vec4 n = texture2D(athleteNumbers, vec2((clamp(vAthleteNumber.x, 0.02, 0.98) + athleteNumberCell) / athleteNumberCells, vAthleteNumber.y));
    c = mix(c, n.rgb * n.rgb * (0.25 + 0.95 * d.r), n.a * k.r);
  }
  diffuseColor.rgb = c;
}`;
export function createAthleteMaterials(T, source, {profile, kit, numbers, cell, track = x => x}) {
  const skinSource = source.skin, kitSource = source.kit;
  const skin = track(skinSource.clone()), kitMat = track(kitSource.clone());
  const tone = linear(T, profile.skin), hair = linear(T, profile.hair);
  skin.userData.athlete = {
    athleteMask: {value: source.skinMask}, athleteOrm: {value: source.skinOrm},
    athleteTone: {value: new T.Vector3(tone.r / SKIN_REFERENCE[0], tone.g / SKIN_REFERENCE[1], tone.b / SKIN_REFERENCE[2])},
    athleteHair: {value: new T.Vector3(hair.r, hair.g, hair.b)}, athleteBeard: {value: profile.beard ?? 0},
  };
  skin.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, skin.userData.athlete);
    shader.fragmentShader = SKIN_HEAD + "\n" + shader.fragmentShader.replace('#include <map_fragment>', SKIN_BODY).replace('#include <emissivemap_fragment>', SKIN_SCATTER);
  };
  skin.customProgramCacheKey = () => 'athlete-skin-2';
  const col = hex => { const c = linear(T, hex); return new T.Vector3(c.r, c.g, c.b); };
  kitMat.userData.athlete = {
    athleteKitMask: {value: source.kitMask}, athleteNumbers: {value: numbers}, athleteNumberCell: {value: cell}, athleteNumberCells: {value: Math.max(1,numbers.image.width/64)},
    kitPrimary: {value: col(kit.primary)}, kitSecondary: {value: col(kit.secondary)}, kitShorts: {value: col(kit.shorts)}, kitShortsTrim: {value: col(kit.shortsTrim)},
    kitSocks: {value: col(kit.socks)}, kitSocksTrim: {value: col(kit.socksTrim)}, kitBoots: {value: col(profile.boots || '#1b1d22')}, kitBootAccent: {value: col(profile.bootAccent || '#e9eef2')},
  };
  kitMat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, kitMat.userData.athlete);
    shader.vertexShader = 'attribute vec2 _numberuv; attribute vec2 _crestuv; varying vec2 vAthleteNumber; varying vec2 vAthleteCrest;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAthleteNumber = _numberuv; vAthleteCrest = _crestuv;');
    shader.fragmentShader = KIT_HEAD + "\n" + shader.fragmentShader.replace('#include <map_fragment>', KIT_BODY);
  };
  kitMat.customProgramCacheKey = () => 'athlete-kit-2';
  return {skin, kit: kitMat};
}
/** Team colours -> full kit. Keepers get a contrasting kit of their own. */
export function athleteKit(colors, keeper, keeperColor) {
  if (keeper) return {primary: keeperColor, secondary: '#1d2430', shorts: '#1d2430', shortsTrim: keeperColor, socks: keeperColor, socksTrim: '#1d2430'};
  return {primary: colors[0], secondary: colors[1], shorts: colors[1] === '#ffcf69' ? '#f2f2ee' : '#20242c', shortsTrim: colors[0], socks: colors[0], socksTrim: colors[1]};
}
/** Prepare textures from the loaded glTF materials (mask maps are stored in the emissive slot). */
export function athleteSources(T, gltfScene) {
  let skin, kit;
  gltfScene.traverse(o => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.name === 'athlete-skin') skin = m; if (m.name === 'athlete-kit') kit = m; } });
  const skinMask = skin.emissiveMap, skinOrm = skin.roughnessMap, kitMask = kit.emissiveMap;
  for (const t of [skinMask, skinOrm, kitMask, kit.map, skin.normalMap, kit.normalMap]) if (t) t.colorSpace = T.NoColorSpace;
  for (const m of [skin, kit]) { m.emissiveMap = null; m.emissive.set(0); m.metalness = 0; m.needsUpdate = true; }
  skin.roughness = 1; kit.roughness = 1;
  return {skin, kit, skinMask, skinOrm, kitMask};
}
/** Face/hair shape per player through morph targets. */
export function applyAthleteShape(mesh, profile) {
  const dict = mesh.morphTargetDictionary; if (!dict) return;
  for (const [name, value] of Object.entries(profile.shape || {})) if (dict[name] !== undefined) mesh.morphTargetInfluences[dict[name]] = value;
}
/** Build one realistic athlete per roster slot: own skeleton, mixer, materials and face/hair shape. */
export function setupAthletes(T, {source, animations, config, roster, numbers, track, cloneRig, scene, createMotion}) {
  const a = config.view.athlete, src = athleteSources(T, source), out = [];
  for (const m of [src.skin, src.kit]) track(m);
  for (const t of [src.skinMask, src.skinOrm, src.kitMask, src.skin.map, src.kit.map, src.skin.normalMap, src.kit.normalMap]) if (t) track(t);
  for (let id = 0; id < roster.length; id++) {
    const slot = roster[id], keeper = slot.role === 'keeper', team = slot.team === 0 ? config.team : config.opponent;
    const profile = a.profiles[id % a.profiles.length], kit = athleteKit(team.colors, keeper, slot.team === 0 ? a.keeperColors[0] : a.keeperColors[1]);
    const root = cloneRig(source), pivot = new T.Group(); pivot.add(root); scene.add(pivot);
    const mats = createAthleteMaterials(T, src, {profile, kit, numbers, cell: id, track});
    root.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = o.receiveShadow = true; if (o.material.name === 'athlete-skin') o.material = mats.skin; else if (o.material.name === 'athlete-kit') o.material = mats.kit; applyAthleteShape(o, profile); });
    // Level of detail: full mesh on the normal tiers, the economy mesh on low tiers.
    const lods = ['AthleteMesh', 'AthleteMeshLOD1'].map(n => { const list = []; root.getObjectByName(n)?.traverse(o => o.isMesh && list.push(o)); return list; }).filter(l => l.length);
    const setLod = level => { const pick = Math.min(level, lods.length - 1); lods.forEach((list, i) => list.forEach(o => (o.visible = i === pick))); return pick; };
    setLod(0);
    const mixer = new T.AnimationMixer(root), motion = createMotion(T, mixer, animations, a.motion);
    out.push({root, pivot, mixer, motion, materials: mats, athlete: true, profile, kit, keeper, team: slot.team, setLod, lodCount: lods.length});
  }
  return out;
}
