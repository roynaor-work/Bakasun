import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const DT=1/60;
const load=(root,name)=>import(pathToFileURL(join(root,'workout/island/minigames',name)).href);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rng=seed=>{let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};};
export const games=[{id:'fireRescue',name:'כיבוי אש',stages:Array.from({length:30},(_,i)=>i+1),sources:['workout/island/minigames/fire.mjs','workout/island/minigames/fire-campaign.mjs','workout/island/minigames/fire-session.mjs','workout/island/minigames/result.mjs','workout/island/activity/fire-certificates.mjs'],notes:['שלבי כניסה 3,6,...,30 עוברים דרך מעטפת v24 המקורית ומודל החדרים המקורי, כולל עצירת שעון הרחוב ומיזוג התוצאה. רק ה-DOM והציור מוחלפים במשטח בדיקה.','מודל הכבאות המקורי, ניווט אוטומטי לפי הקשה על יעד, ציוד התחלתי וללא בונוס עיר.','כוכבי תוצאת המשחק מחושבים דרך gameResult; כוכבי תעודת הכבאי נשמרים בנפרד ב-diagnostics.certificateStars.','הבוט מכבה אש עד תום, מטפל בחילוץ לפי סדר כשהוא נדרש, מתמלא בברז הקרוב ומייצב סולם ברוח. נפילות אינן מדד במודל זה.']}];
export const recommendations=[];
// The actual production v24 flow is instantiated with a minimal display surface.
// Only drawing/DOM scheduling is replaced; canFinish gating and result merge stay original.
function surface(){const listeners=new Map();return {hidden:false,children:[],style:{},dataset:{},classList:{add(){},remove(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},remove(){},addEventListener(k,f){listeners.set(k,f);},click(){listeners.get('click')?.();}};}
async function entryFlow(sourceRoot,common,balance,stage,seed,createFireModel,seededRandom){
 const [{startFireEntry},{createInteriorModel},{fireScenario}]=await Promise.all([load(sourceRoot,'fire-v24-flow.mjs'),load(sourceRoot,'fire-v24-interior.mjs'),load(sourceRoot,'fire-campaign.mjs')]);
 const dialog=surface(),canvas=surface();canvas.parentElement=surface();let m,inside,onDone,finish,raw;
 const previousDocument=globalThis.document,previousFrame=globalThis.requestAnimationFrame;
 globalThis.document={createElement:surface,createElementNS:surface,head:surface()};globalThis.requestAnimationFrame=()=>0;
 let session;
 try{session=startFireEntry({config:common,balance:fireScenario(balance,stage),level:stage,seed,dialog,canvas,t:k=>k,random:seededRandom(seed),finish:r=>{raw=r;return {ok:true};}},createFireModel,()=>{},()=>({mode:'three'}),{
  runSession(ctx,makeModel,_draw,makeView){m=makeModel(ctx);makeView(ctx,m);finish=ctx.finish;return {setPaused(){},dispose(){},get snapshot(){return m.snapshot();},debug:{model:m}};},
  loadInterior:async()=>({runFireV24Interior(_ctx,args){inside=createInteriorModel({plan:args.plan});onDone=args.onDone;return {setPaused(){},dispose(){},get snapshot(){return inside.snapshot();}};}})
 });}finally{globalThis.document=previousDocument;globalThis.requestAnimationFrame=previousFrame;}
 return {m,session,dialog,get inside(){return inside;},get raw(){return raw;},finish,get flow(){return session.v24;},enter(){dialog.children.find(n=>n.id==='fire-enter')?.click();},completeInside(){onDone(inside.result);}};
}
export async function runTrial({sourceRoot,config,stage,profile,seed}){
 const [{createFireModel},{seededRandom},{gameResult}]=await Promise.all([load(sourceRoot,'fire.mjs'),load(sourceRoot,'context.mjs'),load(sourceRoot,'result.mjs')]);
 const common=config.minigames,balance=common.fireRescue;
 const entry=stage%3===0?await entryFlow(sourceRoot,common,balance,stage,seed,createFireModel,seededRandom):null;
 const m=entry?.m||createFireModel({config:common,balance,level:stage,random:seededRandom(seed),power:1,equipment:{}}),b=m.balance;
 const random=rng(seed^0xf17e5a31),mem={target:null,pumping:false,refilling:false},reaction=profile.reactionSeconds;
 let input={},decisionAt=reaction,steps=0,decisions=0,lapses=0,refillVisits=0,previousRefill=false,interiorTime=0,insideDecisionAt=0,insideInput={},insideFinished=false;
 const distance=target=>Math.hypot(target.x-m.nozzle.x,target.y-m.nozzle.y);
 function decision(){
  decisions++;
  if(random()<profile.lapseProbability){lapses++;return {};}
  if(entry&&!entry.flow.done){
   const building=entry.flow.building;
   if(entry.flow.state==='ready'){entry.enter();return {};}
   if(!m.navigation.active){const index=b.render.sites.map((p,index)=>({index,d:Math.hypot(p[0]-building.door[0],p[2]-building.door[2])})).sort((a,c)=>a.d-c.d)[0].index;return {navigate:{kind:'fire',index},charge:true};}
   return {charge:true};
  }
  if(m.canFinish&&m.rescues.every(r=>r.rescued||r.expired))return {finish:true};
  if(m.pressure<.25)mem.pumping=true;if(m.pressure>=m.maxPressure*.97)mem.pumping=false;
  if(m.water<Math.max(12,m.maxWater*.12))mem.refilling=true;if(m.water>=m.maxWater*.98)mem.refilling=false;
  if(mem.refilling){
   const nearest=b.city.hydrants.map((p,index)=>({p,index,d:Math.hypot(p[0]-m.truck.x,p[2]-m.truck.z)})).sort((a,c)=>a.d-c.d)[0];
   return {refill:true,charge:true,...(!m.atHydrant&&!m.navigation.active?{navigate:{kind:'hydrant',index:nearest.index}}:{})};
  }
  if(mem.pumping)return {charge:true};
  const rescues=m.rescues.map((r,index)=>({r,index})).filter(({r})=>!r.rescued&&!r.expired);
  let rescue;
  if(m.settings.ladderMode==='sequence')rescue=rescues[0];
  else rescue=rescues.sort((a,c)=>a.r.remaining-c.r.remaining||Math.hypot(a.r.world[0]-m.truck.x,a.r.world[2]-m.truck.z)-Math.hypot(c.r.world[0]-m.truck.x,c.r.world[2]-m.truck.z))[0];
  const needed=rescue&&m.requiredRescues>m.rescues.filter(r=>r.rescued).length;
  // Rescue a safe citizen when their window is clear; required rescues take priority.
  if(rescue&&(needed||m.firesOut||m.flames[rescue.r.fireIndex]?.heat<=0)){
   const f=m.flames[rescue.r.fireIndex];
   if(f?.heat<=0){
    const near=Math.hypot(m.truck.x-rescue.r.world[0],m.truck.z-rescue.r.world[2])<=b.rescue.truckRadius;
    if(!near)return !m.navigation.active?{navigate:{kind:'rescue',index:rescue.index},charge:true}:{charge:true};
    const sway=m.settings.ladderMode==='wind'?clamp(-(m.ladder.wind+m.ladder.sway*2)/b.ladder.stabilizePower+(random()-.5)*profile.aimError,-1,1):0;
    return {rescue:true,x:rescue.r.x,y:rescue.r.y,moveX:sway};
   }
   mem.target=rescue.r.fireIndex;
  }
  let target=Number.isInteger(mem.target)?m.flames[mem.target]:null;
  if(!target?.active||target.heat<=0){
   const options=m.flames.map((f,index)=>({f,index})).filter(({f})=>f.active&&f.heat>0);
   const picked=options.sort((a,c)=>distance(a.f)-distance(c.f))[0];target=picked?.f;mem.target=picked?.index??null;
  }
  if(!target)return {finish:m.canFinish,charge:true};
  if(distance(target)>m.range*.92){return !m.navigation.active?{navigate:{kind:'fire',index:mem.target},charge:true}:{charge:true};}
  // Same reticle space as manual aiming. Tremor is proportional to the hose hit radius.
  const error=m.aimRadius*3*profile.aimError;
  return {firing:true,x:target.x+(random()*2-1)*error,y:target.y+(random()*2-1)*error};
 }
 const maxSeconds=Math.max(360,m.settings.seconds+b.startGrace+2);
 while(!m.result&&m.time+interiorTime<maxSeconds){
  if(entry?.flow.inside){
   if(!entry.inside){await Promise.resolve();continue;}
   const i=entry.inside;
   if(i.time>=insideDecisionAt){insideDecisionAt+=reaction;decisions++;
    if(random()<profile.lapseProbability){lapses++;insideInput={};}
    else if(i.phase==='intro')insideInput={skip:true};
    else if(i.phase!=='play')insideInput={};
    else{const room=i.room,spot=room.spots.find(s=>!s.done),friend=room.friend;
     if(spot){const preferred={normal:'water',electric:'extinguisher',oil:'blanket',heavy:'foam'}[spot.kind],tool=i.tools.includes(preferred)?preferred:'water';
      const err=profile.aimError*2.5,p=spot.pos.map((x,k)=>x+(k===1?.4:1)*(random()*2-1)*err),point=i.assist(p).point;
      insideInput=tool==='blanket'?{tool,tap:point}:{tool,aim:point};
     }else if(friend.state==='waiting')insideInput={tap:[friend.pos[0],.5,friend.pos[2]]};else insideInput={};}
   }
   i.update(DT,insideInput);delete insideInput.tap;delete insideInput.skip;interiorTime=i.time;steps++;
   if(i.result&&!insideFinished){insideFinished=true;entry.completeInside();}
   continue;
  }
  if(m.time+1e-9>=decisionAt){input=decision();decisionAt+=reaction;}
  m.update(DT,input);steps++;
  for(const k of ['navigate','select','finish'])delete input[k];
  if(m.refilling&&!previousRefill)refillVisits++;previousRefill=m.refilling;
 }
 if(entry&&m.result)entry.finish(m.result);
 const raw=entry?.raw||m.result,s=m.snapshot();
 const converted=raw?gameResult(raw,{config:common,level:stage},balance):null;
 return {outcome:raw?.outcome??'timeout',seconds:+(m.time+interiorTime).toFixed(4),stars:converted?.stars??null,falls:null,score:raw?.score??m.score,reason:raw?.reason??(raw?'completed':'harness_limit'),objectives:{firesExtinguished:s.firesOut,requiredRescues:m.requiredRescues,rescued:m.rescues.filter(r=>r.rescued).length,rescueTargetMet:m.rescues.filter(r=>r.rescued).length>=m.requiredRescues,quickCertificate:raw?.certificate?.fast??false,carefulCertificate:raw?.certificate?.careful??false},diagnostics:{steps,decisions,lapses,refillVisits,resultValid:Boolean(converted),patienceExceeded:m.time+interiorTime>profile.patienceSeconds,streetSeconds:+m.time.toFixed(3),interiorSeconds:+interiorTime.toFixed(3),interior:entry?.flow.result??null,entryRequired:Boolean(entry),entryCompleted:entry?.flow.done??null,streetScore:m.score,certificateStars:raw?.certificate?.stars??null,waterRemaining:+m.water.toFixed(3),waterUsed:+s.waterUsed.toFixed(3),waterWasted:+s.waterWasted.toFixed(3),rescuesExpired:m.rescues.filter(r=>r.expired).length,flamesRemaining:m.flames.filter(f=>f.heat>0).length,performance:raw?.performance??null,ladderMode:m.settings.ladderMode}};
}
