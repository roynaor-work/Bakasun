// The list of soccer match assets kept on the device by the soccer service
// worker (soccer-sw.js). Pure data and matchers; shared by the menu's download
// button, the worker's precache message and the tests.
export const SOCCER_ASSET_PATHS=Object.freeze([
  'design/characters2/soccer-player.glb','design/characters2/goalkeeper.glb','design/characters2/regions.json',
  'design/characters/rig.json','design/viewer/retarget-map.json',
  'design/motion/soccer.json','design/motion2/soccer/throws-receives.json','design/motion2/soccer/kicks-locomotion.json','design/motion2/soccer/tackles-reactions.json',
  'design/models2/soccer-stadium.glb','design/models/soccer-goal.glb','design/models/soccer-ball.glb',
  'design/environment/textures/grass-mown.webp','design/environment/textures/stand-concrete.webp','design/environment/textures/crowd-dots.webp',
  'design/environment/backgrounds/stadium-day-landscape.webp','design/environment/backgrounds/stadium-day-portrait.webp',
  'design/vfx/atlases/goal-burst.json','design/vfx/atlases/goal-burst.webp','design/vfx/atlases/confetti.json','design/vfx/atlases/confetti.webp','design/vfx/atlases/landing-dust.json','design/vfx/atlases/landing-dust.webp',
  'design/vfx/cameras/goal-replay-left.json','design/vfx/cameras/goal-replay-right.json','design/vfx/cameras/goal-replay-behind.json',
  'design/tactics/soccer.json','design/controls/soccer.json','design/controls/interaction.json','design/audio/mix.json',
  'design/audio/soccer/ambience-loop.ogg','design/audio/soccer/crowd-calm.ogg','design/audio/soccer/crowd-excited.ogg','design/audio/soccer/crowd-goal.ogg','design/audio/soccer/kick.ogg','design/audio/soccer/net.ogg','design/audio/soccer/pass.ogg','design/audio/soccer/whistle.ogg',
  'design/audio/scenes/opening.ogg','design/audio/scenes/victory.ogg','design/audio/scenes/defeat.ogg',
  'vendor/draco/draco_decoder.wasm','vendor/draco/draco_wasm_wrapper.js',
  'assets/soccer-realism/turf-albedo-1k.jpg','assets/soccer-realism/turf-normal-gl-1k.jpg','assets/athlete/athlete.glb','assets/kid-full.glb',
]);
/** Only these island paths are ever answered from the device cache; application
 * code and data carry ?v= tags and keep going to the network untouched. */
export const SOCCER_CACHE_PATTERNS=Object.freeze([
  /\/design\/(characters2\/(soccer-player|goalkeeper)\.glb|characters2\/regions\.json|characters\/rig\.json|viewer\/retarget-map\.json)$/,
  /\/design\/(motion\/soccer\.json|motion2\/soccer\/[^/]+\.json)$/,
  /\/design\/(models2\/soccer-stadium\.glb|models\/soccer-(goal|ball)\.glb)$/,
  /\/design\/environment\/(textures|backgrounds)\/[^/]+\.webp$/,
  /\/design\/vfx\/(atlases|cameras)\/[^/]+\.(json|webp)$/,
  /\/design\/(tactics\/soccer\.json|controls\/(soccer|interaction)\.json|audio\/mix\.json|audio\/(soccer|scenes)\/[^/]+\.ogg)$/,
  /\/vendor\/draco\/[^/]+\.(wasm|js)$/,
  /\/assets\/(soccer-realism\/[^/]+\.jpg|athlete\/athlete\.glb|kid-full\.glb)$/,
]);
export function isSoccerCachedPath(pathname){
  return typeof pathname==='string'&&!pathname.includes('..')&&SOCCER_CACHE_PATTERNS.some(pattern=>pattern.test(pathname));
}
export function soccerCacheName(version){return 'island-soccer-'+String(version||'dev').replace(/[^\w.-]/g,'_');}
