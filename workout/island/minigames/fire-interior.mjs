/** 13/11/2026 fire v23, part B: inside the building. A static screen per room, no walking (Roy approved the simple version):
 * the engine arrives, a tap on the door (or the "enter" button) goes in, then three rooms in a row and a victory screen.
 * Each room has 2-4 burning things, a child or a pet to reach before the smoke comes down, and one rule with one new tool:
 *   living room - water never on electricity (the extinguisher opens), kitchen - a blanket on burning oil (the blanket opens),
 *   bedroom - crawl under the smoke with a long press down (foam opens, for the heavy fire of the bed and the wardrobe).
 * A mistake shows why and costs a star at most; smoke that reaches the floor sends a second crew for the child (no points).
 * Pure and deterministic: scene px of each room picture (1600x740), no DOM. */
import {roomAnchor,streetAnchor,spriteBox} from './fire-v23-assets.mjs?v=island-v2-20261107-11';

export const INTERIOR_TUNING=Object.freeze({
  arriveSeconds:2.4,enterSeconds:.7,introSeconds:3.2,clearSeconds:1.6,leaveSeconds:1.7,victorySeconds:7,
  cool:.55,                                       // heat per second at effectiveness 1
  heat:{normal:1,electric:1,oil:1,heavy:1.5},
  points:{normal:60,electric:90,oil:90,heavy:110,rescue:150,room:80},
  reach:22,                                       // px beyond a spot's radius that still hits it
  crawlLift:280,crawlEase:6,                      // how far the view drops when crawling (px of the clear zone) and how fast
  airOut:.12,                                     // smoke per second leaving a room once every fire is out
  mistakeCooldown:1.6,
});
/** Tool against a fire: a number scales the cooling; 'spark' = electricity (nothing happens, a warning), 'flare' = oil and water (it grows). */
export const EFFECT=Object.freeze({
  normal:{water:1,extinguisher:1,foam:1.1},
  electric:{water:'spark',extinguisher:1.3,foam:'spark'},
  oil:{water:'flare',extinguisher:.4,foam:.6},
  heavy:{water:.3,extinguisher:.45,foam:1.35},
});
export const TOOLS=Object.freeze(['water','extinguisher','blanket','foam']);
const TANK={water:{drain:.13,refill:.24,restart:.3},extinguisher:{drain:.2,refill:0},foam:{drain:.16,refill:0}};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

function buildRoom(def,index,tuning,anchor){
  const pick=name=>{const p=anchor(def.image,name);if(!p)throw new RangeError('Unknown room anchor '+def.image+'.'+name);return p;};
  const spots=def.spots.map(s=>{const p=pick(s.at),heat=tuning.heat[s.kind];if(heat===undefined)throw new RangeError('Unknown fire kind '+s.kind);return {id:s.id,kind:s.kind,x:p.x,y:p.y,r:s.r,heat,maxHeat:heat,done:false,doneAt:null,smothered:false,flare:0,spark:0,lastHit:-10};});
  const r=def.rescue,feet=pick(r.at),head=anchor(def.image,r.kind==='pet'?'petTop':'kidTop')||{x:feet.x,y:feet.y-180},exit=pick('exit'),exitTop=anchor(def.image,'exitTop')||exit;
  const rescue={kind:r.kind,near:r.near,sprite:r.sprite||null,run:r.run||null,low:Boolean(r.low),x:feet.x,y:feet.y,headY:head.y,exit,exitTop,state:'waiting',t:0};
  const ceiling=pick('ceiling').y,floor=740;
  return {index,id:def.id,image:def.image,rule:def.rule,tool:def.tool,def,spots,rescue,ceiling,floor,smoke:def.smokeStart||0,time:0,mistakes:0,sprayTime:0,crawl:0,feedback:null,feedbackAt:-10,lastMistake:-10,lastHint:-10,clearedAt:null,score:0};
}
export function smokeLine(room,tuning=INTERIOR_TUNING){return room.ceiling+clamp(room.smoke)*(room.floor-room.ceiling);}
/** Is the child or the pet hidden in the smoke for the current view? Crawling lowers the eyes under the smoke. */
export function rescueCovered(room,tuning=INTERIOR_TUNING){return room.rescue.headY<smokeLine(room)-room.crawl*tuning.crawlLift;}

export function createInteriorModel({stage,sound=()=>{},tuning=INTERIOR_TUNING,anchor=roomAnchor,street=streetAnchor,sprite=spriteBox}){
  const rooms=stage.rooms.map((def,i)=>buildRoom(def,i,tuning,anchor)),door=street('door')||{x:1000,y:720},truckBox=sprite('truck');
  const tanks={water:1,extinguisher:1,foam:1},empty={water:false,extinguisher:false,foam:false};
  let phase='arrive',phaseTime=0,time=0,current=0,tool='water',score=0,result=null,blankets=0,newTool=null,aim=null,spraying=false,hitSpot=null,feedback=null;
  const unlocked=new Set(['water']),events=[];
  const room=()=>rooms[current];
  function say(key){feedback={key,at:time};events.push({kind:'feedback',key,at:time});}
  function enterRoom(i){current=i;const r=rooms[i];phase='intro';phaseTime=0;newTool=r.tool;unlocked.add(r.tool);tool='water';blankets=r.spots.filter(s=>s.kind==='oil').length;tanks.extinguisher=1;tanks.foam=1;empty.extinguisher=empty.foam=false;sound('door');}
  function done(spot,how){spot.done=true;spot.doneAt=time;spot.heat=0;if(how==='blanket')spot.smothered=true;const pts=tuning.points[spot.kind];score+=pts;room().score+=pts;events.push({kind:'out',id:spot.id,at:time,how});sound(how==='blanket'?'fwump':'steam');}
  function mistake(r,key){if(time-r.lastMistake<tuning.mistakeCooldown)return;r.lastMistake=time;r.mistakes++;say(key);sound(key==='fire.v23.say.oil'?'flare':'spark');}
  function spotAt(r,x,y,extra=tuning.reach){let best=null,dist=Infinity;for(const s of r.spots){if(s.done)continue;const d=Math.hypot(s.x-x,s.y-y);if(d<=s.r+extra&&d<dist){dist=d;best=s;}}return best;}
  function onRescue(r,x,y){const c=r.rescue,h=Math.max(60,c.y-c.headY)*(c.kind==='pet'?1.5:1);return c.state==='waiting'&&Math.abs(x-c.x)<=Math.max(60,h*.45)&&y>=c.y-h-30&&y<=c.y+30;}
  function tryRescue(r){const c=r.rescue;
    if(rescueCovered(r,tuning)){say(r.rule==='smoke'?'fire.v23.say.crawl':'fire.v23.say.smoke');return false;}
    const near=r.spots.find(s=>s.id===c.near);if(near&&!near.done){say(c.kind==='pet'?'fire.v23.say.clearPet':'fire.v23.say.clearKid');return false;}
    c.state='leaving';c.t=0;score+=tuning.points.rescue;r.score+=tuning.points.rescue;events.push({kind:'rescue',at:time,room:r.id});sound('rescue');return true;}
  const model={stage,rooms,tanks,tuning,events,door,
    get phase(){return phase;},get phaseTime(){return phaseTime;},get time(){return time;},get roomIndex(){return current;},get room(){return room();},get tool(){return tool;},get score(){return score;},
    get unlocked(){return [...unlocked];},get blankets(){return blankets;},get newTool(){return newTool;},get aim(){return aim;},get spraying(){return spraying;},get hitSpot(){return hitSpot;},get feedback(){return feedback;},get result(){return result;},
    get truckProgress(){return phase==='arrive'?clamp(phaseTime/tuning.arriveSeconds):1;},truckBox,
    get empty(){return empty[tool]||false;},
    /** Point inside the room picture that a tap would act on (debug and tests). */
    spotAt:(x,y)=>spotAt(room(),x,y),
    update(dt,input={}){
      if(result||dt<=0)return;dt=Math.min(dt,.1);time+=dt;phaseTime+=dt;hitSpot=null;spraying=false;
      if(feedback&&time-feedback.at>2.6)feedback=null;
      if(phase==='arrive'){if(phaseTime>=tuning.arriveSeconds){phase='door';phaseTime=0;}return;}
      if(phase==='door'){const tap=input.tap;if(input.enter||(tap&&Math.hypot(tap.x-door.x,tap.y-door.y)<=95)){phase='enter';phaseTime=0;sound('door');}return;}
      if(phase==='enter'){if(phaseTime>=tuning.enterSeconds)enterRoom(0);return;}
      if(phase==='victory'){if(input.finish||phaseTime>=tuning.victorySeconds){const rescued=rooms.filter(r=>r.rescue.state==='saved').length,mistakes=rooms.reduce((n,r)=>n+r.mistakes,0),seconds=rooms.reduce((n,r)=>n+r.time,0);
          result={outcome:'win',score:Math.round(score),performance:.45*rescued/rooms.length+.25*(1-Math.min(1,mistakes/4))+.3*clamp((stage.par??rooms.length*40)/Math.max(1,seconds)),summary:{rooms:rooms.length,rescued,mistakes,seconds:Math.round(seconds)}};sound('rescue');}
        return;}
      const r=room();
      if(input.tool&&unlocked.has(input.tool)&&input.tool!==tool){tool=input.tool;sound('tool');}
      // crawling: eyes go down under the smoke (eased), the smoke comes down half as fast
      r.crawl+= ((input.crawl?1:0)-r.crawl)*Math.min(1,dt*tuning.crawlEase);
      if(phase==='intro'){if(phaseTime>=tuning.introSeconds||input.tap||input.skip){phase='play';phaseTime=0;newTool=null;}return;}
      if(phase==='clear'){if(phaseTime>=tuning.clearSeconds){if(current+1<rooms.length)enterRoom(current+1);else{phase='victory';phaseTime=0;sound('rescue');}}return;}
      // ---- play ----
      r.time+=dt;
      const fires=r.spots.some(s=>!s.done);
      r.smoke=fires?Math.min(1,r.smoke+dt/r.def.smokeSeconds*(input.crawl?.5:1)):Math.max(0,r.smoke-tuning.airOut*dt);
      for(const s of r.spots){s.flare=Math.max(0,s.flare-dt);s.spark=Math.max(0,s.spark-dt);}
      // tanks: water refills while not spraying; the extinguisher and the foam are one per room
      for(const k of ['water','extinguisher','foam']){const t=TANK[k];if(!(input.pointer&&tool===k&&!empty[k])&&t.refill){tanks[k]=Math.min(1,tanks[k]+t.refill*dt);if(empty[k]&&tanks[k]>=t.restart)empty[k]=false;}}
      aim=input.pointer?{x:input.pointer.x,y:input.pointer.y}:null;
      const c=r.rescue;
      if(input.tap){const {x,y}=input.tap;
        if(onRescue(r,x,y))tryRescue(r);
        else if(tool==='blanket'){const s=spotAt(r,x,y,40);if(s&&s.kind==='oil'&&blankets>0){blankets--;done(s,'blanket');}else if(s)say('fire.v23.say.blanketOil');}
      }
      if(aim&&tool!=='blanket'&&!(input.tap&&onRescue(r,aim.x,aim.y))){
        const t=TANK[tool];if(tanks[tool]>0&&!empty[tool]){spraying=true;r.sprayTime+=dt;tanks[tool]=Math.max(0,tanks[tool]-t.drain*dt);if(tanks[tool]===0){empty[tool]=true;say(tool==='water'?'fire.v23.say.waterEmpty':'fire.v23.say.toolEmpty');}
          const s=spotAt(r,aim.x,aim.y);
          if(s){hitSpot=s.id;s.lastHit=time;const e=EFFECT[s.kind][tool];
            if(e==='spark'){s.spark=.5;mistake(r,'fire.v23.say.electric');}
            else if(e==='flare'){s.flare=.8;s.heat=Math.min(s.maxHeat*1.4,s.heat+.45*dt);mistake(r,'fire.v23.say.oil');}
            else{const close=1-Math.min(1,Math.hypot(s.x-aim.x,s.y-aim.y)/(s.r+tuning.reach))*.3;s.heat=Math.max(0,s.heat-tuning.cool*e*close*dt);if(s.heat===0)done(s,tool);
              else if(s.kind==='heavy'&&tool!=='foam'&&unlocked.has('foam')&&time-r.lastHint>4){r.lastHint=time;say('fire.v23.say.heavy');}}
          }}
      }
      if(c.state==='leaving'){c.t+=dt/tuning.leaveSeconds;if(c.t>=1){c.t=1;c.state='saved';}}
      if(c.state==='waiting'&&r.smoke>=1){c.state='teammate';c.t=0;say('fire.v23.say.teammate');}
      if(c.state==='teammate'&&c.t<1)c.t=Math.min(1,c.t+dt/tuning.leaveSeconds);
      if(!fires&&(c.state==='saved'||(c.state==='teammate'&&c.t>=1))&&r.clearedAt===null){r.clearedAt=time;const bonus=Math.round(tuning.points.room*(1-r.smoke));score+=bonus;r.score+=bonus;phase='clear';phaseTime=0;events.push({kind:'clear',room:r.id,at:time});}
    },
    snapshot(){const r=room();return {mode:'interior',level:stage.level,phase,phaseTime,time,room:r?{index:current,id:r.id,image:r.image,rule:r.rule,smoke:r.smoke,smokeLine:smokeLine(r,tuning),crawl:r.crawl,covered:rescueCovered(r,tuning),mistakes:r.mistakes,
        spots:r.spots.map(s=>({id:s.id,kind:s.kind,x:s.x,y:s.y,r:s.r,heat:s.heat,done:s.done,smothered:s.smothered,flare:s.flare,spark:s.spark})),rescue:{...r.rescue,exit:{...r.rescue.exit}}}:null,
      rooms:rooms.map(x=>({id:x.id,cleared:x.clearedAt!==null,rescue:x.rescue.state,mistakes:x.mistakes,score:x.score})),tool,unlocked:[...unlocked],tanks:{...tanks},blankets,score:Math.round(score),aim,spraying,hitSpot,feedback,door,result};},
  };
  return model;
}
