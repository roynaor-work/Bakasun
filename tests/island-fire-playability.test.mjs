import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFireModel} from '../workout/island/minigames/fire.mjs';
import {createFireDriver,fireTruckIntersectsBuilding,projectFireRoad} from '../workout/island/minigames/fire-roads.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {fireCertificate,validCertificate,validFireCertificates,recordFireCertificate} from '../workout/island/activity/fire-certificates.mjs';
import {gameResult} from '../workout/island/minigames/result.mjs';
import {fireObjectives,pickFireObjective} from '../workout/island/minigames/fire-canvas.mjs';
import {fireIndicators} from '../workout/island/minigames/fire-navigation.mjs';
import {fireCoachState} from '../workout/island/minigames/fire-ui.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames;
const balance=config.fireRescue;
const make=(level=1,seed=3,extra={})=>createFireModel({config,balance,level,random:seededRandom(seed),...extra});
const advance=(model,seconds,input={})=>{
  for(let left=seconds;left>1e-9&&!model.result;left-=.02)model.update(Math.min(.02,left),typeof input==='function'?input(model):input);
};
const assertOutsideBuildings=(truck,b=balance)=>{
  for(const building of b.city.buildings)assert.equal(fireTruckIntersectsBuilding(truck,building,b.vehicle),false,JSON.stringify({truck,building}));
};
const drive=()=>{
  const truck={x:balance.vehicle.x,z:balance.vehicle.z};
  return {truck,driver:createFireDriver(truck,balance)};
};
const driveFor=(driver,seconds,input)=>{
  for(let left=seconds;left>1e-9;left-=.01)driver.update(Math.min(.01,left),{assisted:true,...input});
};
function parkForRescue(model,rescue=model.rescue){
  // Park on the street below the window, never inside its building footprint.
  const roadZ=model.roads.nodes.reduce((nearest,node)=>Math.abs(node.z-rescue.world[2])<Math.abs(nearest-rescue.world[2])?node.z:nearest,model.roads.nodes[0].z);
  Object.assign(model.truck,{x:rescue.world[0],z:roadZ,speed:0,driving:false,velocityX:0,velocityZ:0});
  model.flames[rescue.fireIndex].heat=0;
  return rescue;
}

test('fire driving reduces speed through a hard turn and recovers cruise speed when aligned',()=>{
  const {truck,driver}=drive();
  driveFor(driver,.4,{moveZ:-1});
  Object.assign(truck,{x:6,z:7.8});
  const cruise=truck.speed;
  driveFor(driver,.2,{moveX:1});
  assert.ok(truck.speed<cruise*.8,JSON.stringify({cruise,speed:truck.speed}));
  assertOutsideBuildings(truck);
  driveFor(driver,.9,{moveX:1});
  assert.ok(truck.x>10,'a deliberate turn must enter the connecting street');
  assertOutsideBuildings(truck);
  assert.ok(Math.abs(Math.sin(truck.yaw+Math.PI/2))<.15,'the vehicle finishes facing its new street');
  assert.ok(truck.speed>cruise*.7,'the speed reduction does not leave the truck permanently sluggish');
});

test('a held stick slides around a blocking facade without penetrating or remaining wedged',()=>{
  const {truck,driver}=drive();
  Object.assign(truck,{x:6,z:0,yaw:-Math.PI/2,heading:-Math.PI/2});
  const start={x:truck.x,z:truck.z};
  for(let i=0;i<400;i++){
    driver.update(.01,{moveX:1,assisted:true});
    assertOutsideBuildings(truck);
  }
  assert.ok(Math.hypot(truck.x-start.x,truck.z-start.z)>6,'continued input must reach a way around the facade');
  assert.ok(truck.x>9,'recovery continues in the requested direction after reaching an opening');
});

test('a navigation tap persists after release, parks in hose range and gives manual control back immediately',()=>{
  const model=make();
  model.update(.02,{navigate:{kind:'fire',index:1}});
  assert.ok(model.snapshot().navigation.active);
  advance(model,10);
  const target=model.flames[1];
  assert.ok(Math.hypot(target.x-model.nozzle.x,target.y-model.nozzle.y)<model.range);
  assert.equal(model.truck.driving,false);
  assertOutsideBuildings(model.truck);
  const position={x:model.truck.x,z:model.truck.z};
  model.update(.02,{navigate:{kind:'fire',index:0}});
  assert.ok(model.snapshot().navigation.active);
  advance(model,.25,{moveZ:-1});
  assert.equal(model.snapshot().navigation.active,false);
  assert.ok(Math.hypot(model.truck.x-position.x,model.truck.z-position.z)>.05);
});

test('explicit navigation cancellation stops the route without spending water or changing score',()=>{
  const model=make(),water=model.water;
  model.update(.02,{navigate:{kind:'fire',index:1}});
  advance(model,.3);
  model.update(.02,{cancelNavigation:true});
  advance(model,.6);
  assert.equal(model.snapshot().navigation.active,false);
  assert.equal(model.truck.driving,false);
  assert.equal(model.water,water);
  assert.equal(model.score,0);
});

test('tapping a nearby objective cancels an older distant route and makes the new target actionable',()=>{
  const model=make(5),target=model.flames[0];
  model.update(.02,{navigate:{kind:'fire',index:4}});
  advance(model,.3);
  assert.equal(model.navigation.active,true);
  assert.ok(Math.hypot(target.x-model.nozzle.x,target.y-model.nozzle.y)<model.range*.88);
  model.update(.02,{select:{kind:'fire',index:0}});
  assert.equal(model.navigation.active,false);
  assert.deepEqual(model.selectedObjective,{kind:'fire',index:0});
  advance(model,.5);
  assert.equal(model.truck.driving,false);
  const heat=target.heat;
  advance(model,.1,{firing:true,x:target.x,y:target.y});
  assert.ok(target.heat<heat,'selecting a nearby fire must allow the player to stop and spray it');
  assert.equal(model.coolingTarget,0);
});

test('both hydrants can be approached with one tap and connect after the truck is parked',()=>{
  for(let index=0;index<balance.city.hydrants.length;index++){
    const model=make(),water=model.water;
    advance(model,.5,{firing:true,x:-10000,y:-10000});
    assert.ok(model.water<water);
    const used=model.water;
    model.update(.02,{navigate:{kind:'hydrant',index}});
    advance(model,12);
    assert.equal(model.truck.driving,false);
    assert.equal(model.atHydrant,true,JSON.stringify({index,truck:model.truck}));
    assert.ok(model.connection>=balance.hydrant.connectSeconds);
    assert.ok(model.water>used);
    assertOutsideBuildings(model.truck);
  }
});

test('spray feedback distinguishes a distant target, an accurate cooling stream and a deliberate miss',()=>{
  const model=make(5),target=model.flames[4];
  advance(model,.2,{firing:true,x:target.x,y:target.y});
  assert.equal(model.inRange,false);
  assert.equal(model.snapshot().coolingTarget,null);
  model.update(.02,{navigate:{kind:'fire',index:4}});
  advance(model,10);
  const heat=target.heat;
  advance(model,.15,{firing:true,x:target.x,y:target.y});
  assert.equal(model.inRange,true);
  assert.equal(model.snapshot().coolingTarget,4);
  assert.ok(target.heat<heat);
  const cooled=target.heat;
  advance(model,.1,{firing:true,x:target.x,y:target.y-500});
  assert.equal(model.snapshot().coolingTarget,null);
  assert.ok(target.heat>=cooled,'water pointed away from a facade must not cool it');
  assert.ok(model.snapshot().waterWasted>0);
});

test('rescue locks a reachable window without pixel-perfect reticle placement',()=>{
  const model=make(3),rescue=parkForRescue(model);
  advance(model,rescue.seconds+.1,{rescue:true,x:-10000,y:-10000});
  assert.equal(rescue.rescued,true);
  assert.equal(model.score,rescue.points);
  assert.ok(model.ladder.extension>0);
  const score=model.score;
  advance(model,.3,{rescue:true,x:10000,y:10000});
  assert.equal(model.score,score,'holding a completed rescue never awards it twice');
});

test('a brief finger release preserves ladder progress but leaving the site cancels it',()=>{
  const model=make(3),rescue=parkForRescue(model);
  advance(model,.45,{rescue:true});
  const progress=rescue.progress;
  assert.ok(progress>0&&progress<rescue.seconds);
  advance(model,.16);
  assert.ok(rescue.progress>=progress,'ordinary touch jitter must not discard work');
  advance(model,rescue.seconds-progress+.05,{rescue:true});
  assert.equal(rescue.rescued,true);
  const second=make(3),other=parkForRescue(second);
  advance(second,.4,{rescue:true});
  advance(second,.8,{moveX:1});
  assert.equal(other.progress,0,'driving away cannot preserve an abandoned ladder task');
});

test('rescue action still respects unsafe fire, truck distance and the clear-window challenge',()=>{
  const unsafe=make(3),r=parkForRescue(unsafe);
  unsafe.flames[r.fireIndex].heat=Math.min(1,balance.rescue.safeHeat+.2);
  advance(unsafe,r.seconds+.2,{rescue:true});
  assert.equal(r.rescued,false);
  assert.equal(r.progress,0);
  const distant=make(3),d=distant.rescue;
  distant.flames[d.fireIndex].heat=0;
  Object.assign(distant.truck,{x:18,z:-18,speed:0,driving:false});
  advance(distant,d.seconds+.2,{rescue:true,x:d.x,y:d.y});
  assert.equal(d.rescued,false);
  assert.equal(d.progress,0);
  const clear=make(5),c=parkForRescue(clear);
  clear.flames[c.fireIndex].heat=.05;
  advance(clear,c.seconds+.1,{rescue:true});
  assert.equal(c.rescued,false);
  clear.flames[c.fireIndex].heat=0;
  advance(clear,c.seconds+.1,{rescue:true});
  assert.equal(c.rescued,true);
});

test('rescue coaching explains sequence order when the selected window fire is already out',()=>{
  const model=make(6),second=parkForRescue(model,model.rescues[1]);
  model.update(.02,{rescue:true});
  assert.equal(model.flames[second.fireIndex].heat,0);
  assert.equal(model.rescues[0].rescued,false);
  assert.equal(model.ladder.target,second);
  assert.equal(second.progress,0);
  assert.equal(model.guidance.key,'fire.guide.rescueOrder');
  assert.equal(fireCoachState(model).key,'fire.guide.rescueOrder');
});

test('coaching confirms the selected fire is out while other objectives remain',()=>{
  const model=make(1,3,{power:10}),target=model.flames[0];
  model.update(.02,{select:{kind:'fire',index:0}});
  advance(model,.5,{firing:true,x:target.x,y:target.y});
  model.update(.02);
  assert.equal(target.heat,0);
  assert.equal(model.firesOut,false);
  assert.equal(model.navigation.active,false);
  assert.equal(model.guidance.key,'fire.guide.fireOut');
  const coach=fireCoachState(model);
  assert.equal(coach.key,'fire.guide.fireOut');
  assert.equal(coach.progress,1);
  assert.equal(coach.distance,null);
});

test('idle parked coaching offers the available action at nearby fires, windows and hydrants',()=>{
  const fire=make();
  fire.update(.02,{select:{kind:'fire',index:0}});
  assert.equal(fire.truck.driving,false);
  assert.equal(fire.spraying,false);
  assert.equal(fire.guidance.key,'fire.guide.cool');
  const window=make(3),rescue=parkForRescue(window);
  window.flames[rescue.fireIndex].heat=.6;
  window.update(.02,{select:{kind:'rescue',index:0}});
  assert.equal(window.rescuing,false);
  assert.equal(window.guidance.key,'fire.guide.clearWindow');
  window.flames[rescue.fireIndex].heat=0;
  window.update(.02);
  assert.equal(window.guidance.key,'fire.guide.rescue');
  assert.equal(rescue.progress,0,'an instruction alone never performs the rescue');
  advance(window,rescue.seconds+.1,{rescue:true});
  window.update(.02);
  assert.equal(rescue.rescued,true);
  assert.equal(window.guidance.key,'fire.guide.select','a completed window no longer asks for another rescue hold');
  const ordered=make(6);
  parkForRescue(ordered,ordered.rescues[1]);
  ordered.update(.02,{select:{kind:'rescue',index:1}});
  assert.equal(ordered.guidance.key,'fire.guide.rescueOrder');
  const hydrant=make();
  advance(hydrant,.3,{firing:true,x:-10000,y:-10000});
  hydrant.update(.02,{navigate:{kind:'hydrant',index:0}});
  advance(hydrant,5);
  assert.equal(hydrant.navigation.active,false);
  assert.equal(hydrant.truck.driving,false);
  assert.equal(hydrant.atHydrant,true);
  assert.equal(hydrant.guidance.key,'fire.guide.refill');
  assert.equal(fireCoachState(hydrant).distance,null);
});

test('frozen purchased equipment is read by the model and survives driving, spraying and rescue unchanged',()=>{
  const equipment=Object.freeze({tank:1.25,pressure:1.2,range:1.15,hose:1}),before={...equipment};
  const model=make(3,3,{equipment});
  assert.ok(model.maxWater>balance.levels[2].water);
  assert.ok(model.maxPressure>balance.initialPressure);
  assert.ok(model.range>balance.range);
  advance(model,.3,{moveZ:-1});
  advance(model,.4,{firing:true,x:model.flames[0].x,y:model.flames[0].y});
  const rescue=parkForRescue(model);
  advance(model,rescue.seconds+.2,{rescue:true});
  assert.deepEqual(equipment,before);
  assert.deepEqual(model.snapshot().equipment,before);
});

test('thirty-stage certificate storage preserves the ten legacy achievements exactly',()=>{
  const old=Array.from({length:10},(_,index)=>({fast:index%2===0,rescue:index%3===0,careful:index%4===0})).map(c=>({...c,stars:Number(c.fast)+Number(c.rescue)+Number(c.careful)}));
  const preserved=structuredClone(old),expanded=[...structuredClone(old),...Array(20).fill(null)];
  const data={config:{minigames:{fireRescue:{levels:Array(30).fill({})}}}};
  assert.ok(validFireCertificates(expanded,data));
  const earned=fireCertificate({won:true,time:1,seconds:60,rescued:true,wasted:0,used:10},balance.certificate);
  assert.deepEqual(Object.keys(earned).sort(),['careful','fast','rescue','stars']);
  assert.ok(validCertificate(earned));
  assert.equal(recordFireCertificate(expanded,30,earned),true);
  assert.deepEqual(expanded.slice(0,10),preserved);
  assert.deepEqual(expanded[29],earned);
  assert.equal(recordFireCertificate(expanded,1,{fast:false,rescue:false,careful:false,stars:0}),true);
  assert.deepEqual(expanded.slice(0,10),preserved,'a weaker replay never overwrites an old certificate');
});

test('the actual completed model keeps the established result, certificate and settlement contract',()=>{
  const model=make(1,3,{power:10}),before=structuredClone(model.snapshot().equipment);
  for(const flame of model.flames)if(flame.active)advance(model,.5,{firing:true,x:flame.x,y:flame.y});
  assert.equal(model.result.outcome,'win');
  assert.ok(Number.isSafeInteger(model.result.score));
  assert.ok(validCertificate(model.result.certificate));
  assert.deepEqual(Object.keys(model.result.summary).sort(),['out','rescued','water']);
  const settled=gameResult(model.result,{config,level:1},balance);
  assert.deepEqual(Object.keys(settled).sort(),['money','outcome','score','stars']);
  assert.equal(settled.outcome,'win');
  assert.deepEqual(model.snapshot().equipment,before);
  const result=structuredClone(model.result),water=model.water;
  advance(model,2,{firing:true,rescue:true,moveX:1});
  assert.deepEqual(model.result,result);
  assert.equal(model.water,water);
});

test('a broad scene tap selects a live objective and returns an independent world coordinate',()=>{
  const model=make(3),ctx={config:{...config,width:844,height:390},balance};
  const world=([x,y,z])=>({x:422+x*10,y:195+z*6-y*4});
  const target=(x,y)=>world([(x-balance.render.logicalCenter[0])*balance.render.worldScale,0,(y-balance.render.logicalCenter[1])*balance.render.worldScale]);
  const origin=()=>world([model.truck.x,0,model.truck.z]);
  const first=balance.render.sites[0],point=world([first[0],first[1]+1.2,first[2]]);
  const selected=pickFireObjective(point.x-15,point.y+5,model,ctx,world,target,origin);
  assert.equal(selected.kind,'fire');
  assert.equal(selected.index,0);
  selected.world[0]=999;
  assert.notEqual(balance.render.sites[0][0],999);
  model.flames[0].heat=0;
  assert.ok(!fireObjectives(model,ctx).some(item=>item.kind==='fire'&&item.index===0));
  model.flames[0].warning=.5;
  assert.ok(fireObjectives(model,ctx).some(item=>item.kind==='fire'&&item.index===0),'warning fires remain discoverable');
});

test('an off-screen low-water marker chooses the nearest hydrant rather than hydrant zero',()=>{
  const model={...make().snapshot(),water:0,maxWater:100,atHydrant:false,truck:{x:-18,z:-6},flames:[],rescues:[]};
  const ctx={config:{...config,width:844,height:390},balance},target=()=>({x:-100,y:150}),origin=()=>({x:422,y:195});
  const marker=fireIndicators(model,ctx,target,origin)[0];
  assert.equal(marker.kind,'hydrant');
  const selected=pickFireObjective(marker.x,marker.y,model,ctx,()=>null,target,origin);
  assert.equal(selected.kind,'hydrant');
  assert.equal(selected.index,1);
  assert.deepEqual(selected.world,balance.city.hydrants[1]);
});

test('coaching exposes active-route distance and real progress while keeping idle instructions concise',()=>{
  const model=make(),idle=fireCoachState(model);
  assert.equal(idle.active,false);
  assert.equal(idle.distance,null);
  const guide=fireCoachState({...model,navigation:{active:true},guidance:{key:'fire.guide.approachFire',kind:'drive',distance:12.2,progress:.45}});
  assert.equal(guide.active,true);
  assert.equal(guide.distance,13);
  assert.equal(guide.progress,.45);
  assert.equal(guide.key,'fire.guide.approachFire');
  const settled=fireCoachState({...model,navigation:{active:false},guidance:{key:'fire.guide.cool',kind:'fire',distance:2,progress:1.5}});
  assert.equal(settled.distance,null);
  assert.equal(settled.progress,1);
});

/** A player policy that issues the same one-tap routes as the live session.
 * Heat, position, timers and supplies are changed only by ordinary actions. */
function playWithTapRoutes(level,seed){
  const model=make(level,seed),b=model.balance;
  let pumping=false,refilling=false,driveSeconds=0,spraySeconds=0;
  for(let step=0;step<15000&&!model.result;step++){
    if(model.water<=16)refilling=true;if(model.water>=model.maxWater-.1)refilling=false;
    if(model.pressure<.3)pumping=true;if(model.pressure>=model.maxPressure*.98)pumping=false;
    const input={charge:pumping||refilling};
    const moveTo=(kind,index,world)=>{
      const point=projectFireRoad(model.roads,{x:world[0],z:world[2]});
      if(Math.hypot(point.x-model.truck.x,point.z-model.truck.z)<.5&&!model.truck.driving)return false;
      if(!model.navigation.active||model.navigation.kind!==kind||model.navigation.targetIndex!==index)input.navigate={kind,index};
      return true;
    };
    if(refilling){
      const index=b.city.hydrants.reduce((best,next,i,list)=>Math.hypot(next[0]-model.truck.x,next[2]-model.truck.z)<Math.hypot(list[best][0]-model.truck.x,list[best][2]-model.truck.z)?i:best,0);
      moveTo('hydrant',index,b.city.hydrants[index]);input.refill=true;
    }else{
      let rescue=model.rescues.find(r=>!r.rescued&&!r.expired);
      const descending=model.rescues.find(r=>r.rescued&&r.descent<1);
      if(rescue&&descending&&model.ladder.mode==='sequence')rescue=null;
      if(rescue){
        const fire=model.flames[rescue.fireIndex],moving=moveTo('rescue',model.rescues.indexOf(rescue),rescue.world);
        if(fire.heat>0){input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;}
        else if(!moving){input.rescue=true;if(model.ladder.mode==='wind')input.moveX=Math.max(-1,Math.min(1,(-model.ladder.wind-model.ladder.sway*3)/b.ladder.stabilizePower));}
      }else if(!descending){
        const fire=model.flames.filter(f=>f.active&&f.heat>0).sort((a,b)=>Math.hypot(a.x-model.nozzle.x,a.y-model.nozzle.y)-Math.hypot(b.x-model.nozzle.x,b.y-model.nozzle.y))[0];
        if(fire){
          const index=model.flames.indexOf(fire);
          const moving=Math.hypot(fire.x-model.nozzle.x,fire.y-model.nozzle.y)>model.range*.8&&moveTo('fire',index,b.render.sites[index]);
          input.x=fire.x;input.y=fire.y;input.firing=!moving&&!pumping;
        }
      }
    }
    model.update(.02,input);
    assertOutsideBuildings(model.truck,b);
    driveSeconds+=Number(model.truck.driving)*.02;spraySeconds+=Number(model.spraying)*.02;
  }
  return {outcome:model.result?.outcome,time:model.time,rescued:model.rescues.filter(r=>r.rescued).length,expired:model.rescues.filter(r=>r.expired).length,required:model.requiredRescues,driveSeconds,spraySeconds,navigation:model.snapshot().navigation};
}

for(const level of [1,15,30])test(`fire stage ${level} finishes with one-tap routes and real actions across three seeds`,()=>{
  for(const seed of [1,3,17]){
    const run=playWithTapRoutes(level,seed),label=JSON.stringify({level,seed,...run});
    assert.equal(run.outcome,'win',label);
    assert.ok(run.rescued>=run.required,label);
    assert.equal(run.expired,0,label);
    assert.ok(run.spraySeconds>0,label);
    if(level>1)assert.ok(run.driveSeconds>0,label);
  }
});
