import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const url=process.argv[2]||'http://localhost:8765/tools/tennis-session.html?dev=1',out=process.argv[3]||'/tmp/claude-0/ts4';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1}),p=await ctx.newPage();
await p.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.__gate={frozen:false,when:null,pending:[]};
 window.requestAnimationFrame=cb=>raf(t=>{const g=window.__gate;if(g.frozen){g.pending.push(()=>cb(t));return;}cb(t);if(g.when&&g.when()){g.frozen=true;g.when=null;}});});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(url);await p.waitForFunction(()=>window.__tsReady,null,{timeout:120000});await p.waitForTimeout(3000);
const press=(id,type)=>p.evaluate(([id,type])=>{const n=document.getElementById(id),r=n.getBoundingClientRect();n.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,button:0,buttons:type==='pointerup'?0:1}));},[id,type]);
const freezeAt=async(cond,name)=>{await p.evaluate(src=>{window.__gate.when=new Function('return ('+src+')')();},cond);await p.waitForFunction(()=>window.__gate.frozen,null,{timeout:120000,polling:20});
  const info=await p.evaluate(()=>{const s=window.__ts.model.getState(),m=document.querySelector('.tennis-serve-meter'),r=m.getBoundingClientRect();return {meterHidden:m.hidden,mode:m.dataset.mode,grade:m.dataset.grade,size:[Math.round(r.width),Math.round(r.height)],value:s.hitMeter&&+s.hitMeter.value.toFixed(2),zone:s.hitMeter?.zone,charge:+s.charge.toFixed(2),eta:s.contact&&+s.contact.eta.toFixed(2)};});
  await p.screenshot({path:`${out}-${name}.png`});console.log(name,JSON.stringify(info));};
const resume=()=>p.evaluate(()=>{const g=window.__gate;g.frozen=false;const q=g.pending.splice(0);q.forEach(f=>f());});
// serve
await press('pass','pointerdown');await press('pass','pointerup');
await p.evaluate(()=>{window.__gate.when=()=>{const s=window.__ts.model.getState();return s.phase==='toss'&&s.serveZone==='green';};});await p.waitForFunction(()=>window.__gate.frozen,null,{timeout:60000,polling:20});await resume();await press('pass','pointerdown');await press('pass','pointerup');
// return shot: A not pressed, then press and watch the needle
await freezeAt("()=>{const s=window.__ts.model.getState();return s.phase==='rally'&&s.contact&&s.contact.side===0&&s.shot&&s.shot.side===1&&s.contact.eta>1.2;}",'A-incoming-not-pressed');
await resume();await press('shoot','pointerdown');
for(const [c,n] of [[.12,'B-charge-12'],[.3,'C-charge-30'],[.42,'D-charge-42']]){await freezeAt(`()=>window.__ts.model.getState().charge>=${c}`,n);await resume();}
await press('shoot','pointerup');
await p.waitForTimeout(500);console.log('errors',errs.slice(0,3));await b.close();
