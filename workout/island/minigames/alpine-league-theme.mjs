/** Ski league v23: the six themes' look and the one map of asset ids. Pure data (no three.js), read by the stage builder
 * (alpine-league-stages.mjs: environment and colours of a track) and by the view (alpine-league-look.mjs and alpine-design-world.mjs).
 *
 * The art is Codex's theme pack (branch codex/alpine-themes-v1, design/alpine-themes-v1, CC0): per theme a sky backplate, snow and
 * ground tiles, three scenery models, two slalom gates and a ramp; a chalet for the village. tools/alpine-themes-runtime.py copies the
 * runtime part to assets/alpine-themes-v23 (textures as WebP); design/ stays as delivered. Every loader reads its file from
 * ALPINE_THEME_ASSETS and falls back to the shipped ski file of the same id when a theme file fails, so swapping art is a change of
 * paths here only. An entry is a path, or {path, ...fit} where the asset needs fitting to the game's frame (ramp: flip and box; gates:
 * the distance of the poles; houses: the height). */

const D = Object.freeze({
  models: Object.freeze({'fir-a': 'design/models/fir-a.glb', 'fir-b': 'design/models/fir-b.glb', 'fir-c': 'design/models/fir-c.glb', rock: 'design/models/rock.glb', 'slalom-gate': 'design/models/slalom-gate.glb'}),
  pack: Object.freeze({'rock-large': 'design/alpine-world/models/rock-large.glb', 'rock-small': 'design/alpine-world/models/rock-small.glb', 'ice-wall': 'design/alpine-world/models/ice-wall.glb', 'snow-sign': 'design/alpine-world/models/snow-sign.glb', mogul: 'design/alpine-world/models/mogul.glb'}),
  track: Object.freeze({kicker: 'design/alpine-track/models/kicker.glb', groomed: 'design/alpine-track/textures/groomed-snow.webp', groomedN: 'design/alpine-track/textures/groomed-normal.webp', ripples: 'design/alpine-track/textures/snow-ripples.webp'})
});
export const THEME_DIR = 'assets/alpine-themes-v23/';
/** One theme of the Codex pack: three scenery models in the tree slots, the rocks (collision rocks are fitted to the course sizes by the
 * design world), the snow and ground tiles, the ramp fitted to the kicker's box (the pack's ramp rises toward -Z: flipped), the two
 * gates (poles 6.4 m apart in the pack, fitted to the course's gate width), the sky, and landmarks placed by the theme layer:
 * {path, height (m), spacing and offset ranges (m, offset from the fence line), turn toward the run, jitter of the turn, cap in view}. */
function codex(id, {trees, rocks = null, landmarks = []}) {
  const f = name => `${THEME_DIR}${id}/${name}`, sky = f('sky.webp');
  return Object.freeze({
    models: Object.freeze({...D.models, 'fir-a': f(trees[0] + '.glb'), 'fir-b': f(trees[1] + '.glb'), 'fir-c': f(trees[2] + '.glb')}),
    pack: Object.freeze({...D.pack, ...(rocks ? {'rock-large': f(rocks[0] + '.glb'), 'rock-small': f(rocks[1] + '.glb')} : {})}),
    track: Object.freeze({...D.track, groomed: f('snow.webp'), ripples: f('ground.webp'), kicker: Object.freeze({path: f('ramp.glb'), flip: true, box: Object.freeze([4, 1.8, 6])})}),
    gates: Object.freeze([f('gate-coral.glb'), f('gate-teal.glb')].map(path => Object.freeze({path, poleHalf: 3.2}))),
    background: Object.freeze({landscape: sky, portrait: sky}),
    landmarks: Object.freeze(landmarks.map(({name, ...fit}) => Object.freeze({path: f(name + '.glb'), ...fit}))),
    sparkle: id === 'ice' ? f('sparkle.png') : null
  });
}
export const ALPINE_THEME_ASSETS = Object.freeze({
  pine: codex('pine', {trees: ['pine-tall', 'pine-round', 'pine-young']}),
  ice: codex('ice', {trees: ['ice-spire', 'ice-cluster', 'ice-spire'], rocks: ['ice-cluster', 'ice-cluster'],
    landmarks: [{name: 'ice-arch', height: 6.8, spacing: [38, 58], offset: [9, 13], turn: 0, jitter: .5, cap: 8}]}),
  lava: codex('lava', {trees: ['basalt-stack', 'glow-stones', 'soot-boulder'], rocks: ['soot-boulder', 'basalt-stack']}),
  aurora: codex('aurora', {trees: ['night-pine', 'moon-crystal', 'night-pine'], rocks: ['frost-boulder', 'frost-boulder']}),
  village: codex('village', {trees: ['village-pine', 'snow-fir', 'village-pine'], rocks: ['garden-boulder', 'garden-boulder'],
    landmarks: [{name: 'chalet', height: 4.6, spacing: [30, 44], offset: [10, 16], turn: .45, jitter: .3, cap: 10}]}),
  peak: codex('peak', {trees: ['cloud-boulder', 'granite-slab', 'snow-spire'], rocks: ['granite-slab', 'snow-spire']})
});
export const pathOf = entry => typeof entry === 'string' ? entry : entry?.path || null;
/** Every file a theme may request (for the offline list and its test). */
export function themeAssetFiles(id) {
  const a = ALPINE_THEME_ASSETS[id]; if (!a) return [];
  return [...new Set([...Object.values(a.models), ...Object.values(a.pack), ...Object.values(a.track), ...a.gates, a.background.landscape, a.background.portrait, ...a.landmarks, a.sparkle].map(pathOf).filter(Boolean))];
}
/** Only the theme pack's own files (the league's offline group); the shipped ski files are in the ski group already. */
export const themePackFiles = id => themeAssetFiles(id).filter(p => p.startsWith(THEME_DIR));

/** Lights and fog of a theme over its alpine-v5 rig. environment = the rig the theme starts from (fence, markers, decals, powder);
 * `visual` is merged into the track's visual block (fog distances, snowfall amount, tree density); `grade` sets the scene: backplate
 * (multiply, then lift; white = the pack's sky as drawn), fog (the pack's fog colour), hemisphere and sun (pale, so the snow keeps the
 * pack's colours), exposure, the snow colour (white = the pack's tiles as drawn), the props' shared palette (white = the pack's model
 * colours), the snowfall colour (volcano: ash), the sparkle colour and the aurora strength; `layers` are the effects and landmarks of
 * alpine-league-look.mjs. `accent` colours the league screens. Fog, sparkle and snowfall colours come from the pack's palette and effects. */
const NEUTRAL = Object.freeze({backplate: '#ffffff', lift: 0, snow: '#ffffff', foliage: '#ffffff'});
export const THEME_LOOKS = Object.freeze({
  pine: Object.freeze({environment: 'fog', accent: '#3f8f5a', ink: '#ffffff',
    visual: Object.freeze({snow: .2, light: 1.05, trees: 2.1, fogNear: 70, fogFar: 225}),
    grade: Object.freeze({...NEUTRAL, fog: '#d7e4d9', hemiSky: '#fff2d7', hemiGround: '#7f9b90', sun: '#ffe9c8', sunScale: 1.05, exposure: 1.0}),
    layers: Object.freeze([])}),
  ice: Object.freeze({environment: 'fog', accent: '#2f9fd6', ink: '#ffffff',
    visual: Object.freeze({snow: .3, light: 1.0, trees: .7, fogNear: 50, fogFar: 185}),
    grade: Object.freeze({...NEUTRAL, fog: '#a8d4e3', hemiSky: '#e4f8fa', hemiGround: '#5094c0', sun: '#f2fbff', sunScale: .95, exposure: 1.0, sparkle: '#8cdced'}),
    layers: Object.freeze(['landmarks', 'sparkles'])}),
  lava: Object.freeze({environment: 'sunset', accent: '#e2683c', ink: '#ffffff',
    visual: Object.freeze({snow: .3, light: .95, trees: .8, fogNear: 55, fogFar: 215}),
    grade: Object.freeze({...NEUTRAL, fog: '#b9aab8', hemiSky: '#f6e2cf', hemiGround: '#555361', sun: '#ffe2c0', sunScale: 1.0, exposure: 1.0, snowfall: '#c9c1cf'}),
    layers: Object.freeze([])}),
  aurora: Object.freeze({environment: 'night-floodlit', accent: '#36c49a', ink: '#ffffff',
    visual: Object.freeze({snow: .3, light: .9, trees: 1.2, dusk: true, fogNear: 40, fogFar: 190}),
    grade: Object.freeze({...NEUTRAL, fog: '#758fa6', hemiSky: '#d1dfec', hemiGround: '#3a4f68', sun: '#dfe8ff', sunScale: .9, exposure: 1.0, snowfall: '#e8f0ff', aurora: .45}),
    layers: Object.freeze(['aurora'])}),
  village: Object.freeze({environment: 'sunset', accent: '#c98a2b', ink: '#ffffff',
    visual: Object.freeze({snow: .18, light: 1.0, trees: 1.4, fogNear: 65, fogFar: 225}),
    grade: Object.freeze({...NEUTRAL, fog: '#e9dfcd', hemiSky: '#fff2d7', hemiGround: '#ab9d8e', sun: '#ffeed6', sunScale: 1.05, exposure: 1.0}),
    layers: Object.freeze(['landmarks', 'lanterns'])}),
  peak: Object.freeze({environment: 'fog', accent: '#5f8fc7', ink: '#ffffff',
    visual: Object.freeze({snow: .45, light: 1.05, trees: .5, fogNear: 65, fogFar: 225}),
    grade: Object.freeze({...NEUTRAL, fog: '#cbdde4', hemiSky: '#f4f6f2', hemiGround: '#829aaa', sun: '#fffaf0', sunScale: 1.05, exposure: 1.02}),
    layers: Object.freeze(['clouds'])})
});
export const THEME_IDS = Object.freeze(Object.keys(THEME_LOOKS));
