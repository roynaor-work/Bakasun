import {CLIPS,GRAPH,HUBS,getClip,transitionsFrom,createMotionState,setLocomotion,requestMotion,advanceMotion,sampleMotion,worldPose,playbackRateFor} from './src/index.mjs';
const el=id=>document.getElementById(id),canvas=el('pose'),ctx=canvas.getContext('2d');
let state=createMotionState(),paused=false,last=0,log=[],lastGraphClip=null;
const context=()=>({hasBall:el('hasBall').checked,ballHeightMeters:Number(el('height').value),spaceForScissor:el('scissorSpace').checked,grounded:true});
const color=['#70d8c4','#e7b67a','#8bafff','#e4a2df','#adcc79','#f19592'];
const sources=[...new Set(CLIPS.map(c=>c.sourcePackage))],positions=new Map();
sources.forEach((source,col)=>CLIPS.filter(c=>c.sourcePackage===source).forEach((c,row)=>positions.set(c.id,{x:col*190+22,y:64+row*27,col})));
el('inventory').textContent=`${CLIPS.length} קליפים · ${GRAPH.transitions.length} מעברים · שישה ענפי מקור · ללא תלויות חיצוניות`;
function options(){el('clip').replaceChildren(...CLIPS.filter(c=>c.role===state.role).map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.id;return o;}));el('clip').value=state.clipId;}
function events(result){state=result.state;for(const e of result.events)if(e.type!=='loop')log.unshift(`${Number(e.at??e.firstAt??state.clock).toFixed(3)} ${e.type} ${e.to??e.clipId??''}${e.reason?' · '+e.reason:''}${e.guards?' · '+e.guards.join(', '):''}`);log=log.slice(0,18);}
function reset(){state=createMotionState({role:el('role').value});log=[];options();refresh();}
function refresh(){
 const clip=getClip(state.clipId),sample=sampleMotion(state),floor=sample.diagnostics;
 el('state').textContent=JSON.stringify({clipId:state.clipId,time:Number(state.time.toFixed(3)),clock:Number(state.clock.toFixed(3)),cycle:state.cycle,speedMps:state.speedMps,playbackRate:playbackRateFor(clip,state.speedMps),queue:state.queue?.request.clipId??null,position:state.position.map(v=>Number(v.toFixed(3))),rawFloorMeters:Number(floor.rawMinimum.toFixed(4)),presentationLiftMeters:Number(floor.lift.toFixed(4)),floorSafe:floor.safe},null,2);
 el('events').replaceChildren(...log.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));
 const world=worldPose(clip,sample.pose),project=p=>[320+(p[0]+p[2]*.42)*155,365-(p[1]+p[2]*.12)*155];
 ctx.clearRect(0,0,640,440);ctx.strokeStyle='#334b60';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(35,365);ctx.lineTo(605,365);ctx.stroke();
 for(let i=0;i<world.length;i++){const parent=clip.skeleton[i].parent;if(parent<0)continue;const a=project(world[parent].translation),b=project(world[i].translation);ctx.strokeStyle=/Left/.test(clip.skeleton[i].name)?'#70d8c4':/Right/.test(clip.skeleton[i].name)?'#e7b67a':'#bfced8';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(...b,4,0,Math.PI*2);ctx.fill();}
 if(lastGraphClip===state.clipId)return;
 lastGraphClip=state.clipId;
 const edges=transitionsFrom(state.clipId),svg=el('graph');
 svg.replaceChildren();const ns='http://www.w3.org/2000/svg';
 function node(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);return n;}
 sources.forEach((s,i)=>{node('text',{x:i*190+10,y:22},s.replace('soccer-',''));});
 for(const e of edges){const a=positions.get(e.from),b=positions.get(e.to);node('path',{d:`M${a.x} ${a.y} Q570 15 ${b.x} ${b.y}`,stroke:'#6eaaa1','stroke-width':1,opacity:.2,fill:'none'});}
 for(const c of CLIPS){const p=positions.get(c.id);const circle=node('circle',{cx:p.x,cy:p.y,r:c.id===state.clipId?7:4,fill:color[p.col],stroke:c.id===state.clipId?'white':'none',tabindex:0,role:'button','aria-label':c.id});const title=document.createElementNS(ns,'title');title.textContent=c.id;circle.append(title);const select=()=>{if(c.role!==state.role){el('role').value=c.role;reset();}el('clip').value=c.id;el('request').focus();};circle.addEventListener('click',select);circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});node('text',{x:p.x+11,y:p.y+4},c.sourceId);}
 el('transitions').replaceChildren(...edges.map(e=>{const tr=document.createElement('tr');for(const v of[e.to,e.kind,e.exitWindow.join(' – '),e.blendSeconds,e.guards.join(', ')]){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}return tr;}));
}
el('request').onclick=()=>{events(requestMotion(state,{clipId:el('clip').value,ttl:1},context()));refresh();};
el('locomotion').onclick=()=>{events(setLocomotion(state,{speedMps:Number(el('speed').value)},context()));refresh();};
el('cancel').onclick=()=>{events(requestMotion(state,{clipId:HUBS[state.role],cancel:true},context()));refresh();};
el('role').onchange=reset;el('reset').onclick=reset;
el('pause').onclick=()=>{paused=!paused;el('pause').textContent=paused?'המשך':'השהיה';};
el('step').onclick=()=>{paused=true;el('pause').textContent='המשך';events(advanceMotion(state,.1,context()));refresh();};
options();refresh();
let rendered=0;function tick(t){if(last&&!paused){events(advanceMotion(state,Math.min(.1,(t-last)/1000),context()));if(t-rendered>80){refresh();rendered=t;}}last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);
fetch('./data/transition-audit.json').then(r=>{if(!r.ok)throw new Error('audit unavailable');return r.json();}).then(data=>{const table=document.createElement('table');const head=document.createElement('tr');for(const t of['מהירות','מעברים','קפיצות ללא מיזוג','חדירות לפני תיקון','כישלונות אחרי מדיניות']){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);for(const p of data.profiles){const tr=document.createElement('tr');for(const v of[p.speedMps??'קצב מקור',p.summary.transitionCount,p.summary.hardCutFailures,p.summary.rawFloorFailures,p.summary.adaptedFailures]){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}tr.lastChild.className=p.summary.adaptedFailures?'bad':'good';table.append(tr);}el('audit').replaceChildren(table);}).catch(()=>{el('audit').textContent='יש להגיש את התיקייה דרך שרת מקומי כדי לטעון את דוח המדידות.';});
