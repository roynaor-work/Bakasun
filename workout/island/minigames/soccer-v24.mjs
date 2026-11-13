/** Soccer v24 (13/11/2026): five Codex packs wired into the match, each behind its own URL switch that brings back v23 exactly.
 *  `?soccerPitchAssets=0`  soccer-pitch-v1: turf with real markings, goals with their net, corner flags, blank boards, ball.
 *  `?soccerClipsV13=0`     soccer-clips-v13: goal kick, keeper throw, throw-in, slide tackle, lob pass, chest control.
 *  `?soccerFxV1=0`         soccer-fx-v1: landing and slide turf, goal confetti, net ripple, ball trail, selection ring, switch ring,
 *                          power-kick lines, and the kick / post / crossbar / landing / net / catch sounds (no whistles).
 *  `?soccerCrowd3d=0`      soccer-crowd-3d-v1: 3D fans with LOD in place of the flat cards of the far stand's front rows
 *                          (`?soccerCrowd3d=full`: Codex's 1,200 fans and its 80K budget, for comparison on a phone).
 *  `?athleteBodyV2=0`      athlete-body-v2: hands with fingers, keeper gloves and the shirt number on the back and shorts.
 * Runtime copies of the packs live in assets/soccer-v24/ (the review packs stay untouched in design/). Pure: three.js only in the
 * view modules (soccer-v24-pitch/-fx/-crowd.mjs, athlete-body-v2.mjs); the URL is read only when a browser location exists. */
const read=(name,search)=>{try{return new URLSearchParams(search??globalThis.location?.search??'').get(name);}catch{return null;}};
const on=(name,search)=>read(name,search)!=='0';
export const soccerPitchAssetsEnabled=search=>on('soccerPitchAssets',search);
export const soccerClipsV13Enabled=search=>on('soccerClipsV13',search);
export const soccerFxV1Enabled=search=>on('soccerFxV1',search);
/** 'budget' (default), 'full' or 'off'. */
export const soccerCrowd3dMode=search=>{const v=read('soccerCrowd3d',search);return v==='0'||v==='off'?'off':v==='full'?'full':'budget';};
export const athleteBodyV2Enabled=search=>on('athleteBodyV2',search);
/** One line of the five switches for the load report and the tests. */
export function soccerV24Flags(search){return {pitchAssets:soccerPitchAssetsEnabled(search),clipsV13:soccerClipsV13Enabled(search),fxV1:soccerFxV1Enabled(search),crowd3d:soccerCrowd3dMode(search),bodyV2:athleteBodyV2Enabled(search)};}
export const soccerV24Url=path=>new URL('../assets/soccer-v24/'+path,import.meta.url).href;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=n=>Math.round(n*1000)/1000;

// ---- 1. pitch kit (design/soccer-pitch-v1) ----------------------------------------------------------------------------------------------
/** The kit is authored at 105 x 68 m, X along the length (manifest.json, REPORT.md). The game scales the turf and its markings to the
 * match pitch exactly like v23 scales the Laws of the Game numbers (lengths by length, widths by width), so the painted lines are the
 * lines the rules use; goals, flags and boards keep their real size. */
export const SOCCER_KIT=Object.freeze({length:105,width:68,lineWidth:.12,penaltyDepth:16.5,penaltyWidth:40.32,goalAreaDepth:5.5,goalAreaWidth:18.32,penaltySpot:11,arcRadius:9.15,centreRadius:9.15,
  goal:Object.freeze({width:7.32,height:2.44,depth:2,frontCentre:.06}),flagHeight:1.6,
  boards:Object.freeze({x:Object.freeze([-36,-12,12,36]),out:2.5,width:4,height:1}),
  files:Object.freeze(['pitch.glb','goal.glb','corner_flag.glb','ad_board.glb','ball.glb','atlas.png'])});
export function soccerKitScale(pitch){return {sx:pitch.length/SOCCER_KIT.length,sz:pitch.width/SOCCER_KIT.width};}
/** The kit's markings under the pitch transform (metres, outer edges as in the kit). Arcs become ellipses: [along x, along z]. */
export function soccerKitMarkings(pitch){
  const {sx,sz}=soccerKitScale(pitch),K=SOCCER_KIT;
  return {penaltyDepth:round(K.penaltyDepth*sx),penaltyWidth:round(K.penaltyWidth*sz),goalAreaDepth:round(K.goalAreaDepth*sx),goalAreaWidth:round(K.goalAreaWidth*sz),penaltySpot:round(K.penaltySpot*sx),
    arc:[round(K.arcRadius*sx),round(K.arcRadius*sz)],centre:[round(K.centreRadius*sx),round(K.centreRadius*sz)],lineWidth:[round(K.lineWidth*sx),round(K.lineWidth*sz)]};
}
/** Use the kit's painted lines only when they are the simulation's lines: the v23 pitch (`?soccerPitch=v22` keeps the game's own v22 lines)
 * and every straight marking within `tolerance` of config.pitch, arcs within `arcTolerance` (the kit's circles become slight ellipses). */
export function soccerKitLines(pitch,{tolerance=.1,arcTolerance=.3,search}={}){
  // `?soccerKitLines=0`: the game's own v23 lines (0.12 m) on the kit's turf; the kit's lines scale with the pitch (0.074-0.078 m at 8-a-side)
  if(read('soccerKitLines',search)==='0')return {use:false,reason:'flag',worst:null};
  if(!pitch?.v23)return {use:false,reason:'pitch-v22',worst:null};
  const k=soccerKitMarkings(pitch),diffs={penaltyDepth:k.penaltyDepth-pitch.penaltyDepth,penaltyWidth:k.penaltyWidth-pitch.penaltyWidth,goalAreaDepth:k.goalAreaDepth-pitch.goalAreaDepth,goalAreaWidth:k.goalAreaWidth-pitch.goalAreaWidth,penaltySpot:k.penaltySpot-pitch.penaltySpot};
  const arcs={arc:Math.max(...k.arc.map(r=>Math.abs(r-(pitch.arcRadius??r)))),centre:Math.max(...k.centre.map(r=>Math.abs(r-(pitch.centreRadius??r))))};
  const worst=Math.max(...Object.values(diffs).map(Math.abs)),worstArc=Math.max(arcs.arc,arcs.centre);
  return {use:worst<=tolerance&&worstArc<=arcTolerance,reason:worst>tolerance?'markings':worstArc>arcTolerance?'arcs':'match',worst:round(worst),worstArc:round(worstArc),diffs};
}
/** Goal `side` (+1/-1) of the kit on the game's mouth: the front frame's centre on the goal line, the back of the net at the simulation's
 * goal depth, the opening the game's goal width and height. */
export function soccerKitGoal(pitch,side){
  const G=SOCCER_KIT.goal,kx=pitch.goalDepth/(G.depth-G.frontCentre),ky=pitch.goalHeight/G.height,kz=pitch.goalWidth/G.width,hx=pitch.length/2;
  return {position:[round(side*(hx-G.frontCentre*kx)),0,0],rotationY:side>0?0:Math.PI,scale:[round(kx),round(ky),round(kz)]};
}
/** Corner flags (real 1.6 m) on the four corners; the cloth points along the goal line as in the kit preview. */
export function soccerKitFlags(pitch){const hx=pitch.length/2,hz=pitch.width/2;return [[-hx,-hz],[-hx,hz],[hx,-hz],[hx,hz]].map(([x,z],i)=>({position:[x,0,z],rotationY:i%2?Math.PI:0}));}
/** Blank boards (real 4 x 1 m) along both touchlines, at the kit's places scaled to the pitch, 2.5 m (scaled) outside the line: at the
 * 28-degree game camera a 1 m board hides at most 1.9 m behind it, which stays outside the touchline. The v8 LED ring they replace ran
 * round the ends too, so two boards stand behind each goal line on either side of the goal, clear of the net (game choice; the kit's
 * preview has the eight long-side boards only). */
export function soccerKitBoards(pitch){
  const {sx,sz}=soccerKitScale(pitch),hx=pitch.length/2,hz=pitch.width/2,B=SOCCER_KIT.boards,out=[];
  for(const x of B.x)for(const side of [-1,1])out.push({position:[round(x*sx),0,round(side*(hz+B.out*sz))],rotationY:side<0?0:Math.PI});
  const back=Math.max(hx+pitch.goalDepth+1.2,hx+B.out*sx+1),near=pitch.goalWidth/2+B.width/2+1.2;
  for(const end of [-1,1])for(const z of [-near-B.width-1,-near,near,near+B.width+1])if(Math.abs(z)+B.width/2<=hz+B.out*sz)out.push({position:[round(end*back),0,round(z)],rotationY:end>0?-Math.PI/2:Math.PI/2});
  return out;
}

// ---- 2. clips (design/soccer-clips-v13) -------------------------------------------------------------------------------------------------
export const SOCCER_V24_PREFIX='v24_';
/** The six clips with a clean simulation event (assets/soccer-v24/clips/clips.json, tools/soccer-v24-clips.mjs). */
export const SOCCER_V24_CLIPS=Object.freeze(['goal_kick','keeper_throw','throw_in','slide_tackle','lob_pass','chest_control']);
/** Left in design/ on purpose (the report says why). */
export const SOCCER_V24_LEFT_OUT=Object.freeze({
  keeper_celebrate:'the save the simulation has is the catch, and the keeper then holds the ball in front of his chest (holdHeight 1.05 m) until he distributes it; the clip pumps both fists with empty hands, and a parry has no event of its own',
  volley:'the simulation has no volley: an airborne ball is headed (v23) or not reached, a shot always starts from the feet',
});
export const soccerV24ClipsUrl=()=>soccerV24Url('clips/clips.json');
export function soccerV24ClipStates(json){
  if(!json||json.schemaVersion!==1||!json.states)throw Error('Soccer v24 clips: unexpected file');
  for(const id of SOCCER_V24_CLIPS)if(!json.states[id]?.keyframes?.length)throw Error('Soccer v24 clips: missing '+id);
  return Object.fromEntries(Object.entries(json.states).map(([name,state])=>[SOCCER_V24_PREFIX+name,{...state,clip:SOCCER_V24_PREFIX+name}]));
}
/** Restart clips are scrubbed on the simulation's restart clock (elapsed / contact / duration of soccer-restarts.mjs, which the physics
 * owns) between three anchors of the clip: where the shown motion starts, the authored contact or release, and the end. The release
 * edge therefore stays exactly where the simulation has it; only the pose differs. The goal kick starts at its approach step (the ball is
 * already on the grass in the game; the clip's first half second puts it down from the hands) and only on a real goal kick (free kicks
 * and penalties share the goal-kick clock and keep their clip). */
export const SOCCER_V24_RESTARTS=Object.freeze({
  goalKick:Object.freeze({clip:'v24_goal_kick',from:.5,contact:1,to:1.6,only:'goalKick'}),
  keeperThrow:Object.freeze({clip:'v24_keeper_throw',from:0,contact:.7,to:1.2}),
  throwIn:Object.freeze({clip:'v24_throw_in',from:0,contact:.8,to:1.4}),
});
export function soccerV24RestartTime(anchor,motion){
  const contact=Math.max(1e-6,motion.contact),duration=Math.max(contact+1e-6,motion.duration),e=clamp(Number.isFinite(motion.elapsed)?motion.elapsed:0,0,duration);
  if(e<=contact)return anchor.from+(anchor.contact-anchor.from)*e/contact;
  return anchor.contact+(anchor.to-anchor.contact)*Math.min(1,(e-contact)/(duration-contact));
}
/** {name, time} of the v24 clip for this restart motion, or null (another restart, a free kick, or the clip is not loaded). */
export function soccerV24RestartClip(motion,restartType,has){
  const anchor=motion&&SOCCER_V24_RESTARTS[motion.kind];
  if(!anchor||anchor.only&&restartType!==anchor.only||!has(anchor.clip))return null;
  return {name:anchor.clip,time:soccerV24RestartTime(anchor,motion)};
}
/** Slide tackle: the slide (slideTime) runs the clip to its contact, the recovery (the simulation's clock) the rest: on the ground, up
 * and standing (events recover 0.6 and stand 0.9 of the 1 s clip). A lost duel plays the same clip (the pack has one slide). */
export const SOCCER_V24_SLIDE=Object.freeze({clip:'v24_slide_tackle',contact:.4,end:1});
export function soccerV24SlideTime(phase,progress){
  const S=SOCCER_V24_SLIDE,u=clamp(Number.isFinite(progress)?progress:0,0,1);
  return phase==='slide'?S.contact*u:S.contact+(S.end-S.contact)*u;
}
/** A lofted pass (the `loft` event of this player; the v23 lob button raises the same event). */
export function soccerV24LobClip(s,p,has){return s?.event?.type==='loft'&&s.event.player===p.id&&has('v24_lob_pass')?'v24_lob_pass':null;}
/** A pass met standing at chest height (the v10 first touch keeps the running receptions and the thigh / foot heights). */
export const SOCCER_V24_CHEST=Object.freeze({minHeight:1.05,maxHeight:1.65,maxSpeed:2,receive:.6,lead:.15});
export function soccerV24ChestClip(height,speed,has){const C=SOCCER_V24_CHEST;return height>=C.minHeight&&height<=C.maxHeight&&speed<C.maxSpeed&&has('v24_chest_control')?'v24_chest_control':null;}
/** One-shot v24 clips the state machine plays to the end; a player who sets off again leaves them this long after their contact. */
export const SOCCER_V24_HELD=Object.freeze({v24_lob_pass:{contact:.6,follow:.25},v24_chest_control:{contact:.6,follow:.15}});
export const soccerV24Held=state=>Object.hasOwn(SOCCER_V24_HELD,state);

// ---- 3. fx (design/soccer-fx-v1) --------------------------------------------------------------------------------------------------------
/** Sprite sheets as in the pack's manifest.json (frames left to right, top to bottom; anchor from the frame's top left; `px` the square
 * frame in pixels, the trail is one 256 x 32 strip). `size` is the shown size in metres (game choice). */
export const SOCCER_FX_SPRITES=Object.freeze({
  'landing-turf':Object.freeze({px:64,columns:4,rows:4,frames:16,fps:24,seconds:.6667,loop:false,additive:false,anchor:[.5,.6875],size:1.1}),
  'slide-turf':Object.freeze({px:64,columns:4,rows:4,frames:16,fps:24,seconds:.6667,loop:false,additive:false,anchor:[.5,.6875],size:1.5}),
  'goal-confetti':Object.freeze({px:64,columns:8,rows:4,frames:32,fps:24,seconds:1.3333,loop:false,additive:true,anchor:[.5,.5],size:3.2}),
  'goal-net-ripple':Object.freeze({px:128,columns:8,rows:1,frames:8,fps:16,seconds:.5,loop:false,additive:false,anchor:[.5,.5],size:1,hold:true}),
  'ball-trail':Object.freeze({px:32,columns:1,rows:1,frames:1,fps:0,seconds:0,loop:true,additive:true,anchor:[.5,.5],scrollU:-2}),
  'selected-player-ring':Object.freeze({px:64,columns:8,rows:1,frames:8,fps:8,seconds:1,loop:true,additive:false,anchor:[.5,.5],size:1.7}),
  'click-ring':Object.freeze({px:64,columns:8,rows:1,frames:8,fps:20,seconds:.4,loop:false,additive:false,anchor:[.5,.5],size:1.5}),
  'power-kick':Object.freeze({px:128,columns:6,rows:1,frames:6,fps:30,seconds:.2,loop:false,additive:true,anchor:[.5,.5],size:1.6}),
});
/** Frame of a sheet at `age` seconds: one-shots stop on their last frame (and are removed after it), loops wrap. */
export function soccerFxFrame(spec,age){
  if(!(spec.frames>1))return 0;
  const n=Math.floor(Math.max(0,age)*spec.fps);
  return spec.loop?n%spec.frames:Math.min(spec.frames-1,n);
}
/** Texture offset/repeat for a frame (TextureLoader flipY): offset = (col / columns, 1 - (row + 1) / rows), repeat = 1 / grid, with a half
 * pixel inset against bleeding (the sheets have 2 transparent pixels around every cell). */
export function soccerFxUv(spec,frame,{width=spec.columns*(spec.px||64),height=spec.rows*(spec.px||64)}={}){
  const col=frame%spec.columns,row=Math.floor(frame/spec.columns),ix=.5/width,iy=.5/height;
  return {offset:[col/spec.columns+ix,1-(row+1)/spec.rows+iy],repeat:[1/spec.columns-2*ix,1/spec.rows-2*iy]};
}
/** Which sprite a match event raises (null: none). The selection ring and the trail are continuous, not events. */
export function soccerFxForEvent(event,s){
  if(!event)return null;
  switch(event.type){
    case 'slide':return 'slide-turf';
    case 'switch':return 'click-ring';
    case 'shot':return !event.punt&&(event.power??0)>=SOCCER_FX_POWER_KICK?'power-kick':null;
    default:return null;
  }
}
/** A shot this hard or harder shows the speed lines (and plays the strong kick). */
export const SOCCER_FX_POWER_KICK=.6;
/** The ball has landed from a real flight: it was at least `from` metres above its rest height on the previous frame and is now on the
 * grass, free (a dribble's small hops and the keeper's hold are not landings). */
export function soccerBallLanded(previousY,ball,radius,{from=.45,ground=.04}={}){
  return previousY!==null&&previousY>radius+from&&(ball.y??0)<=radius+ground&&(ball.owner===null||ball.owner===undefined);
}
/** The Foley bank (assets/soccer-v24/fx/audio, -16 LUFS each): gains bring them to the level of the shipped soccer samples (-23 LUFS at
 * -3..-5 dB). Every file has under 0.002% of its energy in 2-5 kHz (the pack's measurement; the shipped whistle threshold is 8%). */
export const SOCCER_FX_SOUNDS=Object.freeze({
  'v24/kick-soft':Object.freeze({file:'kick-soft.ogg',gainDb:-12,cooldownMs:90,maxVoices:2}),
  'v24/kick-strong':Object.freeze({file:'kick-strong.ogg',gainDb:-10,cooldownMs:110,maxVoices:2}),
  'v24/post-hit':Object.freeze({file:'post-hit.ogg',gainDb:-11,cooldownMs:300,maxVoices:1}),
  'v24/crossbar-hit':Object.freeze({file:'crossbar-hit.ogg',gainDb:-11,cooldownMs:300,maxVoices:1}),
  'v24/ball-land':Object.freeze({file:'ball-land.ogg',gainDb:-16,cooldownMs:250,maxVoices:1}),
  'v24/net-rustle':Object.freeze({file:'net-rustle.ogg',gainDb:-12,cooldownMs:600,maxVoices:1}),
  'v24/keeper-catch':Object.freeze({file:'keeper-catch.ogg',gainDb:-13,cooldownMs:400,maxVoices:1}),
});
/** The v24 sound for a match event (null: keep the shipped cue). `catch` is the keeper's possession with his hands. */
export function soccerFxSound(event,s){
  if(!event)return null;
  switch(event.type){
    case 'shot':return (event.power??0)>=SOCCER_FX_POWER_KICK&&!event.punt?'v24/kick-strong':'v24/kick-soft';
    case 'header':case 'clearance':case 'pass':case 'loft':return 'v24/kick-soft';
    case 'post':return event.kind==='crossbar'?'v24/crossbar-hit':'v24/post-hit';
    case 'possession':{const p=s?.players?.[event.player];return p?.role==='keeper'&&p.hands?'v24/keeper-catch':null;}
    case 'goal':return 'v24/net-rustle';
    default:return null;
  }
}

// ---- 4. crowd (design/soccer-crowd-3d-v1) -----------------------------------------------------------------------------------------------
/** Budget mode: the match already spends ~124K of its 130K triangles and 79 of its 90 draw calls at tier 0 (16 athletes 89K, stadium 32K;
 * measured 13/11). The 3D fans therefore take the front rows of the FAR long stand only (the one the camera faces; the crowd turns
 * with the camera at half time), six of the twelve figures (three seated, three standing: at most 6 draw calls per level), at most
 * `triangles` triangles, and only at tiers 0-1; the flat cards they stand in for are hidden, every other card stays. */
export const SOCCER_CROWD_BUDGET=Object.freeze({rows:3,variants:Object.freeze([0,2,4,6,8,10]),triangles:9000,levels:Object.freeze([1,2]),maxQuality:1,fansPerCard:3,replanSeconds:.25});
export const SOCCER_CROWD_FULL=Object.freeze({rows:3,variants:Object.freeze([0,1,2,3,4,5,6,7,8,9,10,11]),triangles:80000,levels:Object.freeze([0,1,2]),maxQuality:3,fansPerCard:3,replanSeconds:.25,instances:1200});
/** Seats in world metres from the v8 stadium's card placements (stadium-local, full size) and its scale to the match pitch: three fans
 * across each card's width (the cards are three-person cut-outs), facing the pitch. `sections` picks the stands (0 = z+ straight,
 * 4 = z- straight in soccer-v8-layout's bowl parameter); `rows` the front rows of the lower tier. Fan scale = the stadium's height scale.
 * A card stands `tread` metres above its row's tread (soccer-v8-layout: 0.82 of a riser); a fan sits on the tread. The fans face +Z
 * (assets.json), a card's +Z faces out of the bowl, hence the half turn. */
export function soccerCrowdSeats(placements,{scale,rows,sections=null,variants,fansPerCard=3,limit=1200,tread=0}){
  const out=[],cards=[];
  for(const p of placements)if(soccerCrowdCardRank(p,{rows,sections})!==null)cards.push(p);
  cards.sort((a,b)=>soccerCrowdCardRank(a,{rows,sections})-soccerCrowdCardRank(b,{rows,sections}));
  const used=[];
  for(const p of cards){
    if(out.length+fansPerCard>limit)break;
    used.push(p);
    const rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw); // the card's right vector (rotation about Y)
    for(let k=0;k<fansPerCard;k++){
      const along=(k-(fansPerCard-1)/2)*p.width/fansPerCard,id=out.length;
      out.push({id,variant:variants[(id*7+p.row*3+k)%variants.length],team:p.x<0?0:1,x:round((p.x+rx*along)*scale.x),y:round((p.y-tread)*scale.y),z:round((p.z+rz*along)*scale.z),yaw:round(Math.atan2(Math.sin(p.yaw+Math.PI),Math.cos(p.yaw+Math.PI))),scale:round(scale.y*(.94+((id*37)%13)/100)),card:p});
    }
  }
  return {seats:out,cards:used};
}
/** Which flat cards the 3D fans may stand in for, and in which order (lower first): the lower tier's front rows, nearest row first,
 * the long stands before the ends and the corners, the middle of a stand before its sides. Null: never replaced. The stadium sorts its
 * cards by this rank (soccer-v8-stadium crowdRank) and the seats are taken in the same order, so hiding the top m cards of a section
 * hides exactly the cards whose fans are drawn. */
const SECTION_ORDER=[0,2,1,2,0,2,1,2];
export function soccerCrowdCardRank(p,{rows,sections=null}){
  if(p.tier!==0||p.row>=rows||sections&&!sections.includes(p.section))return null;
  const along=p.section%4===0?Math.abs(p.x):p.section%4===2?Math.abs(p.z):Math.abs(p.x)+Math.abs(p.z);
  return p.row*1e4+SECTION_ORDER[p.section]*1e3+along;
}
/** Cards hidden per section for the cards used by `count` seats (fansPerCard fans per card). */
export function soccerCrowdHiddenCards(cards,fans,fansPerCard=3){
  const out=new Map();for(const p of cards.slice(0,Math.ceil(fans/fansPerCard)))out.set(p.section,(out.get(p.section)||0)+1);return out;
}

// ---- 5. athlete body v2 (design/athlete-body-v2) ----------------------------------------------------------------------------------------
/** The pack draws 0-99 (seven-segment digits); anything else shows no number rather than throwing in the middle of a match. */
export function soccerShirtNumber(n){return Number.isInteger(n)&&n>=0&&n<=99?n:null;}
