/** Ski league v23: the six themes' look and the one map of asset ids. Pure data (no three.js), read by the stage builder
 * (alpine-league-stages.mjs: environment and colours of a track) and by the view (alpine-league-look.mjs: tint, layers, overrides).
 *
 * Interim state (13/11/2026): Codex is building a kit per theme (branch codex/alpine-themes-v1, design/alpine-themes-v1: ground tiles,
 * backgrounds, trees and rocks GLB, slalom gates, ramp, particles). Until it lands every theme points at the ski assets already shipped
 * (design/models, design/alpine-world, design/alpine-track, design/alpine-v5, design/environment) and gets its character from colour
 * grading and code-only effects (sky shader, embers, clouds, sparkles). Switching a theme to the Codex kit is a change of paths in
 * ALPINE_THEME_ASSETS only: every loader reads its files from here and falls back to the shipped file when an override fails. */

const D = Object.freeze({
  models: Object.freeze({'fir-a': 'design/models/fir-a.glb', 'fir-b': 'design/models/fir-b.glb', 'fir-c': 'design/models/fir-c.glb', rock: 'design/models/rock.glb', 'slalom-gate': 'design/models/slalom-gate.glb'}),
  pack: Object.freeze({'rock-large': 'design/alpine-world/models/rock-large.glb', 'rock-small': 'design/alpine-world/models/rock-small.glb', 'ice-wall': 'design/alpine-world/models/ice-wall.glb', 'snow-sign': 'design/alpine-world/models/snow-sign.glb', mogul: 'design/alpine-world/models/mogul.glb'}),
  track: Object.freeze({kicker: 'design/alpine-track/models/kicker.glb', groomed: 'design/alpine-track/textures/groomed-snow.webp', groomedN: 'design/alpine-track/textures/groomed-normal.webp', ripples: 'design/alpine-track/textures/snow-ripples.webp'})
});
const bg = (name, dir = 'design/alpine-v5/backgrounds/') => Object.freeze({landscape: `${dir}${name}-landscape.webp`, portrait: `${dir}${name}-portrait.webp`});
const SKI_DAY = bg('ski-mountains', 'design/environment/backgrounds/');
/** One entry per theme. `background` replaces the environment backplate, `models`/`pack`/`track` replace the design-world files of the
 * same id, `houses` are scenery GLBs placed outside the fence (village). Paths are relative to the island root. */
export const ALPINE_THEME_ASSETS = Object.freeze({
  pine: Object.freeze({...D, background: SKI_DAY, houses: Object.freeze([])}),
  ice: Object.freeze({...D, background: bg('fog'), houses: Object.freeze([])}),
  lava: Object.freeze({...D, background: bg('sunset'), houses: Object.freeze([])}),
  aurora: Object.freeze({...D, background: bg('night-floodlit'), houses: Object.freeze([])}),
  village: Object.freeze({...D, background: bg('sunset'), houses: Object.freeze(['assets/models/city/lod/01-small-house-red-roof.glb'])}),
  peak: Object.freeze({...D, background: bg('fog'), houses: Object.freeze([])})
});
/** Every file a theme may request (for the offline list and its test). */
export function themeAssetFiles(id) {
  const a = ALPINE_THEME_ASSETS[id]; if (!a) return [];
  return [...new Set([...Object.values(a.models), ...Object.values(a.pack), ...Object.values(a.track), a.background.landscape, a.background.portrait, ...a.houses])];
}

/** Colour grading and layers of a theme. environment = the alpine-v5 lighting rig the theme starts from (fence, markers, decals,
 * powder); `visual` is merged into the track's visual block (fog distances, snowfall, tree density); `grade` tints the scene in the view:
 * backplate (multiply, then lift), fog, hemisphere and sun, exposure, snow surface, rocks and the shared vertex-colour palette of trees,
 * signs and fences; `layers` are the code-only effects of alpine-league-look.mjs. `accent` colours the league screens. */
export const THEME_LOOKS = Object.freeze({
  pine: Object.freeze({environment: 'fog', accent: '#3f8f5a', ink: '#ffffff',
    visual: Object.freeze({snow: .2, light: 1.05, trees: 2.1, fogNear: 70, fogFar: 225}),
    grade: Object.freeze({backplate: '#ffffff', lift: 0, fog: '#cfe2ee', hemiSky: '#e6f2ff', hemiGround: '#5b7a64', sun: '#fff1d8', sunScale: 1.15, exposure: 1.04, snow: '#ffffff', rock: '#d6d2cc', foliage: '#9ccf9c'}),
    layers: Object.freeze([])}),
  ice: Object.freeze({environment: 'fog', accent: '#2f9fd6', ink: '#ffffff',
    visual: Object.freeze({snow: .35, light: .92, trees: .35, fogNear: 46, fogFar: 175}),
    grade: Object.freeze({backplate: '#6f9fd0', lift: .04, fog: '#7fa7c8', hemiSky: '#bfe4ff', hemiGround: '#24435e', sun: '#d6f1ff', sunScale: .85, exposure: .98, snow: '#dcefff', rock: '#9fc4dc', foliage: '#cfe6ff'}),
    layers: Object.freeze(['iceWalls', 'sparkles'])}),
  lava: Object.freeze({environment: 'sunset', accent: '#e2683c', ink: '#ffffff',
    visual: Object.freeze({snow: .12, light: .95, trees: .55, fogNear: 55, fogFar: 215}),
    grade: Object.freeze({backplate: '#ff9a72', lift: 0, fog: '#9a6656', hemiSky: '#ffc4a0', hemiGround: '#3c2622', sun: '#ffd2b0', sunScale: 1.0, exposure: .97, snow: '#d9cdc6', rock: '#5a4844', foliage: '#8c6e5c'}),
    layers: Object.freeze(['embers', 'glow'])}),
  aurora: Object.freeze({environment: 'night-floodlit', accent: '#36c49a', ink: '#ffffff',
    visual: Object.freeze({snow: .3, light: .78, trees: 1.2, dusk: true, fogNear: 34, fogFar: 190}),
    grade: Object.freeze({backplate: '#c9d6ff', lift: 0, fog: '#22334f', hemiSky: '#9fb6ff', hemiGround: '#1d2a3e', sun: '#b9d4ff', sunScale: .9, exposure: 1.0, snow: '#dfe9ff', rock: '#a9b4cc', foliage: '#9fb4c8'}),
    layers: Object.freeze(['aurora'])}),
  village: Object.freeze({environment: 'sunset', accent: '#c98a2b', ink: '#ffffff',
    visual: Object.freeze({snow: .18, light: 1.0, trees: 1.4, fogNear: 65, fogFar: 225}),
    grade: Object.freeze({backplate: '#ffd9a8', lift: .03, fog: '#d7c2b6', hemiSky: '#fbe2cf', hemiGround: '#6f6a7c', sun: '#ffe6c8', sunScale: 1.05, exposure: 1.02, snow: '#fff5ec', rock: '#d0c4bb', foliage: '#b6d1a6'}),
    layers: Object.freeze(['houses', 'lanterns'])}),
  peak: Object.freeze({environment: 'fog', accent: '#5f8fc7', ink: '#ffffff',
    visual: Object.freeze({snow: .55, light: 1.08, trees: .25, fogNear: 65, fogFar: 225}),
    grade: Object.freeze({backplate: '#f2f6ff', lift: .1, fog: '#e6edf5', hemiSky: '#f4f8ff', hemiGround: '#8a9bb3', sun: '#fffaf0', sunScale: 1.1, exposure: 1.12, snow: '#ffffff', rock: '#c9ced8', foliage: '#e6eef6'}),
    layers: Object.freeze(['clouds'])})
});
export const THEME_IDS = Object.freeze(Object.keys(THEME_LOOKS));
