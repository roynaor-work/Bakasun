// QA2 headless probe: tap timing vs needle zone, needle at contact, drop crossing height/seconds. Same input path (applyTennisSample, pressFires).
const W=new URL('../../../../../',import.meta.url).href;
const {createTennis}=await import(W+'workout/island/minigames/tennis.mjs');
const {applyTennisSample}=await import(W+'workout/island/minigames/tennis-controls.mjs');
const {baseConfig}=await import(W+'workout/island/verification/tennis-v14/sim.mjs');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),NONE={hit:false,serve:false,lob:false,drop:false};
function sampler(){let previous={...NONE},gesture=0;return({moveX=0,moveZ=0,tap=null,aim=null}={})=>{const stickAim=aim||(Math.hypot(moveX,moveZ)?{x:moveX,z:moveZ,height:0,manual:true}:{x:1,z:0,height:0,manual:false});const events=tap?[{action:tap,type:'press',aim:stickAim,heldSeconds:0,gesture:++gesture},{action:tap,type:'release',aim:stickAim,heldSeconds:.07,gesture}]:[];const s={moveX,moveZ,kickHeld:false,passHeld:false,sprintHeld:false,dropHeld:false,kickAim:stickAim,passAim:stickAim,lobAim:stickAim,shotAim:tap&&tap!=='serve'?stickAim:null,holding:{...NONE},previousHolding:{...previous},events,switchPlayer:false};previous={...NONE};return s;};}
function play({stage,difficulty,seed,lead,kind='hit',returnMeter=true,maxFrames=60*400}){
 const m=createTennis({config:baseConfig,stage,seed:(Math.imul(seed,2654435761)>>>0)||1,difficulty,ranks:{speed:1,hit:1,serve:1},returnMeter}),next=sampler();
 const out={taps:[],drops:[]};let nTap=0,ev=m.getState().event.id,key=null,inc=null,oppHit=0,pend=null,lastZ=null,lastY=null;
 for(let f=0;f<maxFrames&&m.getState().phase!=='complete';f++){const s=m.getState();const o={};
  if(s.server===0&&s.phase==='serve')o.tap='serve';else if(s.server===0&&s.phase==='toss'){if(s.serveZone==='green'&&Math.abs(s.serveMeter-.5)<.07)o.tap='serve';}
  else if(s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1&&s.ball.lastHitter===1){if(s.event.type==='hit'&&s.event.side===1)oppHit=s.event.id;const k=s.pointNumber+':'+oppHit;
   if(k!==key){key=k;inc={tapped:false,start:s.elapsed,at:s.contact.at};out.taps.push(inc);}
   const p=s.players[0];o.moveX=clamp((s.contact.x-p.x)*4,-1,1);o.moveZ=clamp((s.contact.z-p.z)*4,-1,1);
   if(Math.abs(s.contact.eta)<1/120&&s.hitMeter)inc.vAtContact=s.hitMeter.value;
   if(!inc.tapped&&s.contact.eta<=lead){inc.tapped=true;inc.eta=s.contact.eta;inc.v=s.hitMeter?.value;inc.zone=s.hitMeter?.zone;inc.rise=s.contact.at-inc.start;inc.greenSec=(s.hitMeter?.greenHalf??0)*2*inc.rise;nTap++;const every=Number(process.env.EVERY||1);o.tap=kind==='drop'?(nTap%every===0?'drop':'hit'):kind;if(process.env.RAIM)o.aim={x:Math.sin(nTap*12.9898)*.999,z:0,height:0,manual:true};}}
  applyTennisSample(m,next(o),1/60,{pressFires:returnMeter});const n=m.getState(),e=n.event;
  if(pend&&n.ball.lastHitter===0&&pend.cross==null){const z=n.ball.z,y=n.ball.y;if(lastZ!=null&&lastZ>0&&z<=0)pend.cross=lastY+(y-lastY)*lastZ/(lastZ-z);lastZ=z;lastY=y;}
  if(e.id!==ev){ev=e.id;
   if(e.type==='hit'&&e.side===0&&!e.serving&&inc?.tapped&&!inc.res)inc.res={grade:e.grade,rating:e.rating,power:e.power,zone:e.zone};
   if(e.type==='missSwing'&&inc?.tapped&&!inc.res)inc.res={miss:e.reason};
   if(e.type==='hit'&&e.side===0&&!e.serving&&pend){out.drops.push({...pend,seconds:pend.reachAfter??(n.elapsed-pend.at),winner:null,reason:'rally'});pend=null;}
   if(e.type==='hit'&&e.side===0&&!e.serving&&n.shot?.drop){pend={at:n.elapsed,reached:false,cross:null,pz:n.players[0].z,oz:n.players[1].z,landZ:n.landing?.z,serveReturn:n.rallyHits};lastZ=n.ball.z;lastY=n.ball.y;}
   if(e.type==='hit'&&e.side===1&&!e.serving&&pend&&!pend.reached){pend.reached=true;pend.reachAfter=n.elapsed-pend.at;}
   if(['point','game','complete'].includes(e.type)){if(pend){out.drops.push({...pend,seconds:n.elapsed-pend.at,winner:e.winner,reason:e.reason});pend=null;}inc=null;key=null;}}}
 return out;}
const pct=(a,b)=>b?Math.round(100*a/b)+'%':'-',med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;},f2=v=>v==null?'-':v.toFixed(2);
const cells=[[1,'easy',8],[10,'normal',12],[25,'hard',18]];
if(process.env.DIAG){const st=Number(process.env.DIAG),dd=process.env.DIFF||'easy';const ds=Array.from({length:14},(_,i)=>play({stage:st,difficulty:dd,seed:i+100,lead:.05,kind:'drop',returnMeter:process.env.RM!=='0'})).flatMap(o=>o.drops);
 const by={};for(const d of ds){const k=d.reason+'/'+(d.reached?'R':'-')+'/w'+d.winner;by[k]=(by[k]||0)+1;}console.log(ds.length,by);
 console.log(JSON.stringify(ds.slice(0,10).map(d=>({pz:+d.pz.toFixed(2),oz:+d.oz.toFixed(2),landZ:d.landZ&&+d.landZ.toFixed(2),cross:d.cross&&+d.cross.toFixed(2),s:+d.seconds.toFixed(2),r:d.reason,rh:d.serveReturn}))));
 const near=ds.filter(d=>d.pz<7.6),far=ds.filter(d=>d.pz>=7.6);console.log('player z<7.6:',near.length,'reached',near.filter(d=>d.reached).length,'| z>=7.6:',far.length,'reached',far.filter(d=>d.reached).length);process.exit(0);}
console.log('## tap timing (lead = seconds before contact when the finger lands)');
for(const [stage,d,n] of cells)for(const lead of [0.3,0.15,0.05,0,-0.05]){
 const t=Array.from({length:n},(_,i)=>play({stage,difficulty:d,seed:i+1,lead})).flatMap(o=>o.taps).filter(x=>x.tapped);
 const z=k=>t.filter(x=>x.zone===k).length,g=k=>t.filter(x=>x.res?.grade===k).length,miss=t.filter(x=>x.res?.miss).length,perf=t.filter(x=>x.res?.rating==='perfect').length;
 console.log(`stage ${stage} ${d} lead ${lead}: taps ${t.length} zone G/Y/R ${pct(z('green'),t.length)}/${pct(z('yellow'),t.length)}/${pct(z('red'),t.length)} grade good/med/weak ${g('good')}/${g('medium')}/${g('weak')} perfect ${perf} miss ${miss} | needle at tap med ${f2(med(t.map(x=>x.v)))} | flight med ${f2(med(t.map(x=>x.rise)))} s, green window med ${f2(med(t.map(x=>x.greenSec)))} s`);}
console.log('## needle at contact');
for(const [stage,d,n] of cells){const t=Array.from({length:n},(_,i)=>play({stage,difficulty:d,seed:i+1,lead:-1})).flatMap(o=>o.taps).filter(x=>x.vAtContact!=null);const v=t.map(x=>x.vAtContact);console.log(`stage ${stage} ${d}: n ${v.length} min ${f2(Math.min(...v))} med ${f2(med(v))} max ${f2(Math.max(...v))}`);}
console.log('## drops (natural tap, lead 0.05)');
for(const [stage,d,n] of [[1,'easy',14],[6,'easy',14],[10,'normal',20],[25,'hard',30]]){const ds=Array.from({length:n},(_,i)=>play({stage,difficulty:d,seed:i+100,lead:.05,kind:'drop'})).flatMap(o=>o.drops);
 const c=ds.map(x=>x.cross).filter(x=>x!=null),un=ds.filter(x=>!x.reached&&x.winner===0),sec=un.length?un.map(x=>x.seconds):[NaN],fast=ds.filter(x=>!x.reached&&x.winner===0&&x.seconds<1.5);
 console.log(`stage ${stage} ${d}: drops ${ds.length} reached ${pct(ds.filter(x=>x.reached).length,ds.length)} untouched-win ${pct(un.length,ds.length)} (<1.5 s ${fast.length}) seconds min ${f2(Math.min(...sec))} med ${f2(med(sec))} | reach after med ${f2(med(ds.filter(x=>x.reached).map(x=>x.reachAfter)))} | net cross m min ${f2(Math.min(...c))} med ${f2(med(c))} max ${f2(Math.max(...c))} | net faults ${ds.filter(x=>x.reason==='net').length}`);}
