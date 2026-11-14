/** Island Racing: the racing v7 package (design/racing-v7, 05/11): five sports cars with three LODs, the spectator figure,
 * the shared prop library, the asphalt maps and the tire-smoke sprite. Pure helpers only (no three.js), so node tests can run them;
 * the loader is racing-v7-assets.mjs.
 *
 * v7 is an upgrade, never a requirement: any load failure keeps the previous coupe, trees and procedural textures,
 * ?racingV7=0 and minigames.islandRacing.v7.enabled=false turn it off. The package's three tracks are not used: the game's own
 * track data (racing-tracks.mjs) drives physics, result and map and must not change. */

/** Which v7 car drives in each grid slot (slot 0 is the player). */
export const V7_SLOT_CARS=Object.freeze(['apex','velour','prism','solis','vector']);
/** Paint (hex) per grid slot, the same set the previous coupe used, so the player still reads as red. */
export const V7_SLOT_COLORS=Object.freeze(['#d93228','#18b6bd','#d6aa3b','#566bd1','#b7c2ca']);
/** The LODs loaded per slot. Opponents are never seen closer than lod1 distance, so lod0 is not even downloaded. */
export function carLodsFor(slot){return slot===0?[0,1,2]:[1,2];}
export function carFile(id,lod){return `cars/${id}-lod${lod}.glb`;}

export const V7_FILES=Object.freeze({
 spectator:'crowd/spectator.glb',
 props:'props/props.glb',
 asphaltColor:'textures/asphalt-color.webp',
 asphaltNormal:'textures/asphalt-normal.png',
 asphaltOrm:'textures/asphalt-orm.webp',
 smoke:'textures/tire-smoke.png',
});
/** Every file one session asks for. Used by the loader, the offline manifest and the tests. */
export function v7FileList(){
 const list=[];
 V7_SLOT_CARS.forEach((id,slot)=>{for(const lod of carLodsFor(slot))list.push(carFile(id,lod));});
 return [...list,...Object.values(V7_FILES)];
}
/** Names the code looks up in the files (checked before anything visible changes). */
export const V7_REQUIRED=Object.freeze({
 car:['Body','WheelFrontL','WheelFrontR','WheelRearL','WheelRearR'],
 props:['Palm','Pine','Grandstand'],
 spectator:['Hips','LeftArm','LeftForeArm','RightArm','RightForeArm'],
});

/** ?racingV7=0 forces the previous assets (before/after captures, rollback), ?racingV7=1 forces v7 even when the config switch is off. */
export function v7Enabled(cfg,params){
 const q=params?.get?.('racingV7');
 if(q==='0')return false;
 if(!cfg)return false;
 if(q==='1')return true;
 return cfg.enabled!==false;
}

/** Distance (metres from the camera) where each LOD gives way to the next: [lod0 until, lod1 until].
 * 0 means that LOD is never shown. Quality is the view's tier (0 best, 2 lowest). */
export function lodDistances(role,quality){
 if(role==='player')return quality===0?[17,46]:quality===1?[12,34]:[0,30];
 return quality===0?[0,30]:quality===1?[0,20]:[0,0];
}
/** The LOD for a distance, with 12% hysteresis around each boundary so a car on the border does not flicker. */
export function pickLod(distance,bounds,current=-1,hysteresis=0.12){
 let level=current<0?(distance<bounds[0]?0:distance<bounds[1]?1:2):current;
 while(level<2&&distance>bounds[level]*(1+hysteresis))level++;
 while(level>0&&distance<bounds[level-1]*(1-hysteresis))level--;
 return level;
}

/** Spectators in view: nearest groups only, by quality (0 best). */
export const CROWD_CAP=Object.freeze([66,30,0]);
export const CROWD_RADIUS=Object.freeze([150,110,0]);
/** The crowd list is rebuilt when the player has moved this far (metres) since the last build. */
export const CROWD_REFRESH=12;

const lcg=seed=>{let v=seed>>>0;return()=>((v=(Math.imul(v,1664525)+1013904223)>>>0)/4294967296);};
/** Where the standing spectators go: small groups on the grass behind the lamp line, facing the road. Deterministic for
 * (track, seed); every site is checked against the road so nobody stands on it. groundAt(x,z) gives the grass height. */
export function crowdSites(track,groundAt,seed=1,clear=0){
 const random=lcg((seed>>>0)^0x5ec7a70),sites=[],width=track.width;
 const groups=[[.04,1],[.17,-1],[.31,1],[.47,-1],[.58,1],[.71,-1],[.86,1]];
 for(const [fraction,side] of groups){
  const p=track.sample(track.length*fraction),tx=p.tangent.x,tz=p.tangent.z,len=Math.hypot(tx,tz)||1;
  for(let row=0;row<2;row++)for(let col=0;col<7;col++){
   const lateral=side*(width/2+(clear?Math.max(8.2,clear+1.2):8.2)+row*1.5+random()*.5),along=(col-3)*1.25+(random()-.5)*.5;
   const x=p.x+p.normal.x*lateral+tx/len*along,z=p.z+p.normal.z*lateral+tz/len*along;
   if(track.project(x,z).distance<width/2+(clear?clear+.6:7))continue;
   const dx=-side*p.normal.x,dz=-side*p.normal.z;
   sites.push({x,y:groundAt(x,z),z,yaw:Math.atan2(dx,dz)+(random()-.5)*.5,scale:.92+random()*.13,variant:sites.length%3});
  }
 }
 return sites;
}
