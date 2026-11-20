/** 14/11/2026 fire v24: the pure model of "inside the building" on an entry stage. Rooms in a row, each on its own clock: fires to put out
 * with the right tool, a friend (child or pet) to carry out once the fire beside them is out, smoke that thickens with time.
 * The clock never punishes: at zero the rest of the crew finishes the room (fires go out, the friend is carried) and the stage goes on
 * with a lower time score. Everything is in metres of the room frame (floor centre, +Y up, open front at +Z); the scene turns a touch into a
 * world point by raycasting the room and hands it here. No DOM, deterministic. */
import {ROOMS,FRIENDS,EFFECT,V24_TUNING,roomSeconds,timeScore} from './fire-v24.mjs?v=island-v2-20261107-19';
import {ROOM_FIRE_ANCHORS} from './fire-v24-anchors.mjs?v=island-v2-20261107-19';
import {createInteriorRescue} from './fire-levels-rescue.mjs?v=island-v2-20261107-19';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const ROOM_HEIGHT=3.12,ROOM_WIDTH=6.4,ROOM_DEPTH=4.6;
/** Where a spot's fire sits: the Codex anchor of the item, or the hand placed position of a built room. */
export function spotAnchor(roomId,spotKey,assetFloor){
  const room=ROOMS[roomId],spot=room?.spots[spotKey];
  if(!spot)return null;
  // Fire Multifloor v2 preserved the room-local furniture anchors except for
  // the curtains, which moved inwards to the windows of its narrower bays.
  if(assetFloor&&spotKey==='curtain_left')return [-2.43,1.84,-2.02];
  if(spot.pos)return [...spot.pos];
  const a=ROOM_FIRE_ANCHORS[roomId]?.[spot.at];
  return a?[...a]:null;
}
// one tank per tool: water refills fast, the extinguisher and the foam are one charge per room that refills slowly (two heavy fires stay beatable)
const TANK={water:{drain:.14,refill:.34,restart:.3},extinguisher:{drain:.2,refill:.1,restart:.3},foam:{drain:.16,refill:.09,restart:.3}};

function buildRoom(plan,index,tuning){
  const def=plan.rooms[index],room=ROOMS[def.room];if(!room)throw new RangeError('Unknown room '+def.room);
  const spots=def.fires.map(key=>{const s=room.spots[key],pos=spotAnchor(def.room,key,def.assetFloor);if(!s||!pos)throw new RangeError('Unknown fire '+def.room+'.'+key);
    const heat=tuning.heat[s.kind]*(def.heatScale||1);return {id:key,at:s.at||null,kind:s.kind,pos,r:s.r,heat,maxHeat:heat,done:false,doneAt:null,how:null,smothered:false,flare:0,spark:0,lastHit:-10};});
  const friend=FRIENDS[def.friend];if(!friend)throw new RangeError('Unknown friend '+def.friend);
  const feet=[...room.rescueSpot],exit=def.assetFloor?[2.31,0,2.46]:[...room.exit];
  let near=null,best=Infinity;for(const s of spots){const d=dist(s.pos,feet);if(d<best){best=d;near=s.id;}}
  const limit=roomSeconds(plan,index);
  return {index,floor:def.floor,id:room.id,titleKey:room.titleKey,file:room.file,def,spots,limit,remaining:limit,time:0,smoke:0,mistakes:0,sprayTime:0,hits:0,
    friend:{id:def.friend,kind:friend.kind,height:friend.height,file:friend.file,near,pos:feet,exit,state:'waiting',t:0},
    handover:false,handoverAt:null,clearedAt:null,score:0,lastMistake:-10,lastHint:-10,warned:false};
}
/** Height of the smoke layer: from the ceiling at smoke 0 down to the smoke floor at 1. */
export function smokeLine(room,tuning=V24_TUNING){return ROOM_HEIGHT-clamp(room.smoke)*(ROOM_HEIGHT-tuning.smokeFloor);}
/** Clock colour band: ok above half, warn above the ten-second mark, critical below. */
export function clockBand(remaining,limit,tuning=V24_TUNING){if(remaining<=tuning.warnSeconds)return 'critical';return remaining/Math.max(1,limit)<=.5?'warn':'ok';}

export function createInteriorModel({plan,sound=()=>{},tuning=V24_TUNING}){
  if(!plan?.rooms?.length)throw new RangeError('Entry plan without rooms');
  const rooms=plan.rooms.map((_,i)=>buildRoom(plan,i,tuning)),tools=plan.tools||['water'],tanks={water:1,extinguisher:1,foam:1},empty={water:false,extinguisher:false,foam:false};
  let phase='enter',phaseTime=0,time=0,current=0,tool='water',score=0,result=null,blankets=0,aim=null,spraying=false,hitSpot=null,feedback=null,handovers=0;
  const events=[];let sequence=0;
  const rescue=plan.rescueActions?createInteriorRescue():null;
  const room=()=>rooms[current];
  const emit=(kind,extra={})=>{events.push({kind,at:time,...extra,sequence:++sequence});if(events.length>120)events.splice(0,events.length-120);};
  function say(key){feedback={key,at:time};emit('feedback',{key});}
  function enterRoom(i){current=i;const r=rooms[i];phase='intro';phaseTime=0;tool='water';blankets=r.spots.filter(s=>s.kind==='oil').length;tanks.extinguisher=1;tanks.foam=1;empty.extinguisher=empty.foam=false;emit('room',{room:r.id,index:i});sound('door');}
  function done(spot,how){if(spot.done)return;spot.done=true;spot.doneAt=time;spot.heat=0;spot.how=how;if(how==='blanket')spot.smothered=true;const pts=how==='team'?0:tuning.points[spot.kind];score+=pts;room().score+=pts;emit('out',{id:spot.id,how,points:pts});sound(how==='blanket'?'fwump':how==='team'?'steam':'steam');}
  function mistake(r,key,event){if(time-r.lastMistake<1.6)return;r.lastMistake=time;r.mistakes++;say(key);sound(event);}
  function spotAt(r,p,extra=tuning.reach){let best=null,d0=Infinity;for(const s of r.spots){if(s.done)continue;const d=dist(s.pos,p);if(d<=s.r+extra&&d<d0){d0=d;best=s;}}return best;}
  function nearFriend(r,p){const f=r.friend,h=f.height;return f.state==='waiting'&&Math.hypot(p[0]-f.pos[0],p[2]-f.pos[2])<=Math.max(.75,h*.5)&&p[1]>=-.2&&p[1]<=h+.4;}
  function rescueFriend(r,state){const f=r.friend;f.state=state;f.t=0;score+=tuning.points.rescue;r.score+=tuning.points.rescue;emit('rescue',{room:r.id,friend:f.id});sound('rescue');}
  function tryRescue(r){const f=r.friend,near=r.spots.find(s=>s.id===f.near);
    if(near&&!near.done){say(f.kind==='pet'?'fire.v24.say.clearPet':'fire.v24.say.clearKid');return false;}
    rescueFriend(r,'rescued');return true;}
  function finishRoom(r){r.clearedAt=time;const bonus=r.handover?0:Math.round(tuning.points.roomClear*timeScore(r.time,r.limit,tuning));score+=bonus;r.score+=bonus;phase='clear';phaseTime=0;emit('clear',{room:r.id,bonus,seconds:r.time});}
  function finish(){const rescued=rooms.filter(r=>r.friend.state==='out'||r.friend.state==='rescued'||r.friend.state==='walking').length,seconds=rooms.reduce((n,r)=>n+r.time,0),limit=rooms.reduce((n,r)=>n+r.limit,0);
    const t=rooms.reduce((n,r)=>n+timeScore(r.time,r.limit,tuning),0)/rooms.length,rp=rescued/rooms.length,performance=clamp(tuning.insideWeight.time*t+tuning.insideWeight.rescue*rp);
    result={outcome:'win',score:Math.round(score),performance,rescued,rooms:rooms.length,seconds,limit,handovers,mistakes:rooms.reduce((n,r)=>n+r.mistakes,0)};if(plan.fireLevels)result.floors=plan.floorCount;emit('done',{score:result.score});}
  const model={plan,rooms,tanks,tuning,events,tools,
    get phase(){return phase;},get phaseTime(){return phaseTime;},get time(){return time;},get roomIndex(){return current;},get room(){return room();},get tool(){return tool;},get score(){return score;},
    get blankets(){return blankets;},get aim(){return aim;},get spraying(){return spraying;},get hitSpot(){return hitSpot;},get feedback(){return feedback;},get result(){return result;},
    get empty(){return empty[tool]||false;},get inRoom(){return phase==='intro'||phase==='play'||phase==='handover'||phase==='clear';},
    get rescueAction(){return phase==='play'?rescue?.available(room())??null:null;},
    get rescuePose(){return rescue?.pose(room())??null;},
    spotAt:p=>spotAt(room(),p),nearFriend:p=>nearFriend(room(),p),
    /** Aim help: the nearest burning fire anchor within the assist radius of a world point, else the point itself. */
    assist(p){const r=room();let best=null,d0=tuning.assist;for(const s of r.spots){if(s.done)continue;const d=dist(s.pos,p);if(d<d0){d0=d;best=s;}}return best?{point:[...best.pos],spot:best.id}:{point:p,spot:null};},
    update(dt,input={}){
      if(result||dt<=0)return;dt=Math.min(dt,.1);time+=dt;phaseTime+=dt;hitSpot=null;spraying=false;
      if(feedback&&time-feedback.at>2.6)feedback=null;
      if(phase==='enter'){if(phaseTime>=tuning.enterSeconds)enterRoom(0);return;}
      if(phase==='leave'){if(phaseTime>=tuning.leaveSeconds)finish();return;}
      const r=room();
      if(input.tool&&tools.includes(input.tool)&&input.tool!==tool){tool=input.tool;sound('tool');emit('tool',{tool});}
      if(phase==='intro'){if(phaseTime>=tuning.roomIntroSeconds||input.tap||input.skip){phase='play';phaseTime=0;emit('play',{room:r.id});}return;}
      if(phase==='stairs'){if(phaseTime>=tuning.enterSeconds)enterRoom(current+1);return;}
      if(phase==='clear'){
        if(phaseTime>=tuning.clearSeconds){
          if(current+1===rooms.length){phase='leave';phaseTime=0;sound('door');emit('leave');}
          else if(plan.fireLevels){phase='stairs';phaseTime=0;sound('door');}
          else enterRoom(current+1);
        }
        return;
      }
      const f=r.friend;
      if(f.state==='rescued'){f.t+=dt/1.4;if(f.t>=1){f.state='walking';f.t=0;}}
      else if(f.state==='walking'||f.state==='team'){f.t=Math.min(1,f.t+dt/tuning.leaveSeconds);if(f.t>=1&&f.state==='walking')f.state='out';}
      if(phase==='handover'){ // the crew finishes: fires go out one after another, the friend is carried out
        const step=tuning.handoverSeconds/Math.max(1,r.spots.length),k=Math.floor(phaseTime/step);
        r.spots.filter(s=>!s.done).slice(0,Math.max(0,k+1-r.spots.filter(s=>s.done).length)).forEach(s=>done(s,'team'));
        if(f.state==='waiting'){f.state='team';f.t=0;}
        r.smoke=Math.max(0,r.smoke-.5*dt);
        if(phaseTime>=tuning.handoverSeconds&&r.spots.every(s=>s.done)&&(f.state==='out'||(f.state==='team'&&f.t>=1)))finishRoom(r);
        return;}
      // ---- play ----
      r.time+=dt;r.remaining=Math.max(0,r.remaining-dt);
      if(!r.warned&&r.remaining<=tuning.warnSeconds&&r.spots.some(s=>!s.done)){r.warned=true;say('fire.v24.say.tenSeconds');emit('tenSeconds',{room:r.id});sound('timeout');}
      const fires=r.spots.some(s=>!s.done);
      r.smoke=fires?clamp(r.smoke+dt*(r.def.smokeScale||1)/Math.max(8,r.limit*.9)):Math.max(0,r.smoke-.18*dt);
      for(const s of r.spots){s.flare=Math.max(0,s.flare-dt);s.spark=Math.max(0,s.spark-dt);}
      const rescuing=rescue?.engaged(r);
      if(rescue?.update(r,dt,input.rescueAction))rescueFriend(r,f.id==='girl'?'out':'walking');
      const rescueLocksInput=rescuing||rescue?.engaged(r);
      const unlitFriend=rescue&&input.aim&&nearFriend(r,input.aim)&&!spotAt(r,input.aim);
      const sprayAim=rescueLocksInput||unlitFriend?null:input.aim;
      for(const k of ['water','extinguisher','foam']){const t=TANK[k];if(!(sprayAim&&tool===k&&!empty[k])){tanks[k]=Math.min(1,tanks[k]+t.refill*dt);if(empty[k]&&tanks[k]>=t.restart)empty[k]=false;}}
      aim=sprayAim?[...sprayAim]:null;
      if(input.tap&&!rescueLocksInput){const p=input.tap;
        if(!rescue&&nearFriend(r,p))tryRescue(r);
        else if(tool==='blanket'){const s=spotAt(r,p,.5);if(s&&s.kind==='oil'&&blankets>0){blankets--;done(s,'blanket');}else if(s)say('fire.v24.say.blanketOil');}
      }
      if(aim&&tool!=='blanket'&&(rescue||!(input.tap&&nearFriend(r,input.tap)))){
        const t=TANK[tool];if(tanks[tool]>0&&!empty[tool]){spraying=true;r.sprayTime+=dt;tanks[tool]=Math.max(0,tanks[tool]-t.drain*dt);if(tanks[tool]===0){empty[tool]=true;say(tool==='water'?'fire.v24.say.waterEmpty':'fire.v24.say.toolEmpty');}
          const s=spotAt(r,aim);
          if(s){hitSpot=s.id;s.lastHit=time;r.hits++;const e=EFFECT[s.kind][tool];
            if(e==='spark'){s.spark=.5;mistake(r,'fire.v24.say.electric','spark');}
            else if(e==='flare'){s.flare=.8;s.heat=Math.min(s.maxHeat*1.4,s.heat+.45*dt);mistake(r,'fire.v24.say.oil','flare');}
            else{const close=1-Math.min(1,dist(s.pos,aim)/(s.r+tuning.reach))*.3;s.heat=Math.max(0,s.heat-tuning.cool*e*close*dt);if(s.heat===0)done(s,tool);
              else if(s.kind==='heavy'&&tool!=='foam'&&tools.includes('foam')&&time-r.lastHint>4){r.lastHint=time;say('fire.v24.say.heavy');}}
          }}
      }
      if(r.remaining<=0&&(fires||f.state==='waiting')){phase='handover';phaseTime=0;r.handover=true;r.handoverAt=time;handovers++;say('fire.v24.say.handover');emit('handover',{room:r.id});return;}
      if(!fires&&(f.state==='out')&&r.clearedAt===null)finishRoom(r);
    },
    snapshot(){const r=room();return {mode:'entry',phase,phaseTime,time,tool,tools:[...tools],tanks:{...tanks},blankets,score:Math.round(score),aim,spraying,hitSpot,feedback,result,
      roomIndex:current,roomCount:rooms.length,rescueAction:model.rescueAction,...(plan.fireLevels?{floor:room()?.floor??1,floorCount:plan.floorCount}:{}),
      room:r?{index:current,...(r.floor?{floor:r.floor}:{}),id:r.id,limit:r.limit,remaining:r.remaining,band:clockBand(r.remaining,r.limit,tuning),time:r.time,smoke:r.smoke,smokeLine:smokeLine(r,tuning),mistakes:r.mistakes,handover:r.handover,
        spots:r.spots.map(s=>({id:s.id,kind:s.kind,pos:[...s.pos],r:s.r,heat:s.heat,maxHeat:s.maxHeat,done:s.done,how:s.how,smothered:s.smothered,flare:s.flare,spark:s.spark})),
        friend:{...r.friend,pos:[...r.friend.pos],exit:[...r.friend.exit]}}:null,
      rooms:rooms.map(x=>({id:x.id,...(x.floor?{floor:x.floor}:{}),cleared:x.clearedAt!==null,friend:x.friend.state,mistakes:x.mistakes,score:x.score,handover:x.handover,seconds:+x.time.toFixed(2),limit:x.limit}))};},
  };
  return model;
}
