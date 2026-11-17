/** Island Tennis — the tennis v7 venue (design/tennis-v7, GPT, 04/11): three court surfaces, a regulation net, a felt ball,
 * a venue with terraces/canopy/floodlights/umpire chair/trees, court officials and 480 instanced spectators.
 * Pure helpers only (no three.js), so node tests can run them; the loader is tennis-v7-venue.mjs.
 *
 * v7 is an upgrade, never a requirement: any load failure keeps the previous court and crowd, ?tennisV7=0 forces the
 * previous look and data/config.json can switch it off. The four v7 characters are NOT used here (see TENNIS.md):
 * the game drives its own kid rig with arm IK and an avatar shirt colour that a baked atlas cannot honour. */
export const V7_FILES=Object.freeze({
 courts:Object.freeze({hard:'court-hard.glb',clay:'court-clay.glb',grass:'court-grass.glb'}),
 venue:'venue.glb',net:'net.glb',ball:'ball.glb',crowd:'crowd-prototypes.glb',crew:'crew.glb',layout:'crowd.json'
});
/** Node names the view needs from each file (checked before anything visible changes). GLTFLoader turns spaces into underscores. */
export const V7_REQUIRED=Object.freeze({
 court:['Court_surface','Ivory_court_lines','Court_surround'],venue:['Venue_vertex_palette','Floodlight_glass'],net:['Net_woven_mesh','Top_tape__center_sag'],
 ball:['Felt_ball','Continuous_tennis_seam'],crowd:['Crowd_LOD0','Crowd_Cheer','Crowd_LOD1'],crew:['People']
});
/** The v7 package is metric (23.77 x 10.97 m); the game court is 18 m long: these are the real lengths the maps start from. */
export const REAL={halfLength:11.885,serviceLength:6.4,singlesHalf:4.115,doublesHalf:5.485};

/** ?tennisV7=0 forces the previous look (before/after captures and the kill switch), ?tennisV7=1 forces v7 even when the config
 * switch is off. `quality` is the view's tier (0 best); v7 is used at every tier unless `minQuality` says otherwise. */
export function v7Enabled(environment,quality,params){
 const q=params?.get?.('tennisV7');
 if(q==='0')return false;
 if(!environment?.v7)return false;
 if(q==='1')return true;
 return environment.v7.enabled!==false&&quality>=(environment.v7.minQuality??0);
}
/** Which of the three surfaces a stage plays on: `surfaces` in order, `stagesPerSurface` stages each; ?tennisSurface= pins one. */
export function surfaceFor(v7,stage,params){
 const pin=params?.get?.('tennisSurface');
 if(pin&&V7_FILES.courts[pin])return pin;
 const list=(v7?.surfaces||['clay']).filter(s=>V7_FILES.courts[s]);if(!list.length)return 'clay';
 const per=Math.max(1,Math.trunc(v7?.stagesPerSurface||10)),index=Math.floor((Math.max(1,Math.trunc(Number(stage)||1))-1)/per);
 return list[Math.min(list.length-1,index)];
}

/** Court map: the real baseline (11.885) lands on the game baseline and the real service line (6.4) on the game service
 * line, piecewise linear, so every painted line sits exactly where the rules judge it. The net stays at 0. */
export function courtWarpZ(z,{halfLength,serviceLength}){
 const a=Math.abs(z),s=Math.sign(z)||1;
 if(a<=REAL.serviceLength)return s*a*serviceLength/REAL.serviceLength;
 if(a<=REAL.halfLength)return s*(serviceLength+(a-REAL.serviceLength)*(halfLength-serviceLength)/(REAL.halfLength-REAL.serviceLength));
 return s*(a-(REAL.halfLength-halfLength));
}
/** Scenery map (terraces, benches, trees, spectators, officials' seats): inside the baselines one uniform squeeze (no kink at the
 * service line), outside them the stands only move toward the net by the missing length, so nothing but the court's own
 * length is distorted and the distance baseline -> stand stays what the package was designed with. */
export function sceneWarpZ(z,{halfLength}){
 const a=Math.abs(z),s=Math.sign(z)||1;
 return a<=REAL.halfLength?z*halfLength/REAL.halfLength:s*(a-(REAL.halfLength-halfLength));
}

/** Crowd levels: 2 = row-0 spectators in the 266-triangle model, with the cheering pose after a point, the other rows in the
 * 32-triangle model; 1 = every spectator in the cheap model; 0 = two thirds of them. -1 = no crowd (the lowest quality tier). */
export const CROWD_LEVELS=Object.freeze([{level:0,keep:2/3,detail:false},{level:1,keep:1,detail:false},{level:2,keep:1,detail:true}]);
/** Whether spectator `id` is drawn at `level` (deterministic: the stands thin out evenly, no random holes). */
export function crowdKeeps(level,id){return level>=1?true:id%3!==2;}
/** Starting crowd level for a quality tier, from `environment.v7.crowdLevels` ([2,1,-1] by default); ?tennisCrowdLevel=0..2 pins it (and turns the governor off). */
export function crowdStartLevel(v7,quality,params){
 const q=params?.get?.('tennisCrowdLevel');
 if(q!=null&&q!==''&&Number.isFinite(Number(q)))return {level:Math.max(0,Math.min(2,Math.round(Number(q)))),pinned:true};
 const table=v7?.crowdLevels||[2,1,-1];
 return {level:table[Math.min(table.length-1,Math.max(0,quality))],pinned:false};
}
/** Row-0 spectators that stand up after a point: the permanent cheerers (id % 11 === 0) plus every third other one. */
export function cheerRole(id){return id%11===0?'always':id%3===0?'burst':'seated';}

/** Runtime LOD: steps the crowd down one level when the frame time stays over `slowMs` for `window` frames (same idea as
 * hoops-v5 createCrowdGovernor). It never steps back up (no flicker between levels); frames over `ignoreMs` are tab
 * switches and loading hitches, not load, and do not count. Returns the new level or null. The view's own quality drop
 * (DPR / shadows) needs 75 slow frames at 25 ms: the crowd governor is eager enough (24 ms, 45 frames) to go first. */
export function createCrowdGovernor({level=2,slowMs=24,window=45,cooldown=120,ignoreMs=250,pinned=false}={}){
 let ema=slowMs/2,over=0,wait=0;
 return {
  get level(){return level;},
  get ema(){return ema;},
  observe(milliseconds){
   if(pinned||level<=0)return null;
   const ms=milliseconds;if(!(ms>0)||ms>ignoreMs)return null;
   ema+=(ms-ema)*0.1;
   if(wait>0){wait--;return null;}
   over=ema>slowMs?over+1:0;
   if(over>=window&&level>0){level--;over=0;wait=cooldown;return level;}
   return null;
  },
 };
}
