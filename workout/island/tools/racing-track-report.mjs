// Track report: length, width, corner mix, straights, overtaking zones and a good driver's lap time, plus a top-down map per circuit.
// Usage: node tools/racing-track-report.mjs [out.json] [mapDir]; ?racingTracks=v1 equivalent: RACING_TRACKS=v1 node ... (sets the query before import)
import {writeFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createTrack,TRACKS}=await import('../minigames/racing-tracks.mjs');
const {createRacing}=await import('../minigames/racing-physics.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function analyse(id){
 const tr=createTrack(id),step=6,n=Math.floor(tr.length/step),k=[];
 for(let i=0;i<n;i++){const a=tr.sample(i*step),b=tr.sample(i*step+step);k.push(wrap(b.heading-a.heading)/step);}
 // smooth curvature over 24 m, then split into corners (|k|>1/220) and straights
 const sm=k.map((_,i)=>{let s=0;for(let j=-2;j<=2;j++)s+=k[(i+j+n)%n];return s/5;});
 const corners=[];let cur=null,straight=0,longest=0,straights=[];
 for(let i=0;i<n;i++){const c=Math.abs(sm[i])>1/260;
  if(c){if(!cur)cur={start:i,sign:Math.sign(sm[i]),sum:0,peak:0,len:0};cur.sum+=Math.abs(sm[i])*step;cur.len+=step;cur.peak=Math.max(cur.peak,Math.abs(sm[i]));if(straight>0){straights.push(straight);straight=0;}}
  else{if(cur){corners.push(cur);cur=null;}straight+=step;}}
 if(cur)corners.push(cur);if(straight)straights.push(straight);
 const merged=[];for(const c of corners){const p=merged[merged.length-1];if(p&&c.start*step-(p.start*step+p.len)<40&&c.sign!==p.sign){p.chicane=true;p.len+=c.len;p.sum+=c.sum;p.peak=Math.max(p.peak,c.peak);}else merged.push({...c});}
 const type=c=>{const r=1/c.peak;return c.chicane?'chicane':r<32?'hairpin':r<60?'slow':r<120?'medium':'fast';};
 const mix={};for(const c of merged){const t=type(c);mix[t]=(mix[t]||0)+1;}
 straights.sort((a,b)=>b-a);
 // overtaking zones: a straight of 250 m or more that ends in a corner with radius under 70 m
 const zones=straights.filter(s=>s>=250).length;
 return {id,lengthM:Math.round(tr.length),widthM:+tr.width.toFixed(1),corners:merged.length,mix,longestStraightM:Math.round(straights[0]||0),overtakingZones:zones};
}
function lap(id,bot){
 const race=createRacing({stage:TRACKS.findIndex(t=>t.id===id)+1,seed:3,config:{countdown:0,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0;
 for(let t=0;t<900*60&&race.state.phase!=='finished'&&p.lapTimes.length<3;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:bot==='pro'&&p.nitro>70&&Math.abs(err)<.08});}
 const best=p.lapTimes.length?Math.min(...p.lapTimes):null,hits=p.wallHits;race.dispose();return {lapS:best?+best.toFixed(1):null,wallHits:hits};
}
const rows=TRACKS.map(t=>({...analyse(t.id),pro:lap(t.id,'pro'),casual:lap(t.id,'casual')}));
console.log('set',process.env.RACING_TRACKS||'f1');for(const r of rows)console.log(r.id.padEnd(8),r.lengthM+'m','w',r.widthM,'corners',r.corners,JSON.stringify(r.mix),'straight',r.longestStraightM,'ot',r.overtakingZones,'| lap pro',r.pro.lapS,'casual',r.casual.lapS,'walls',r.pro.wallHits+'/'+r.casual.wallHits);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(rows,null,1));
if(process.argv[3]){const dir=fileURLToPath(new URL('../'+process.argv[3],import.meta.url));await mkdir(dir,{recursive:true});
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 const cells=TRACKS.map(t=>{const tr=createTrack(t.id),pts=[];for(let s=0;s<tr.length;s+=10)pts.push(tr.sample(s));const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minx=Math.min(...xs),maxx=Math.max(...xs),minz=Math.min(...zs),maxz=Math.max(...zs),sc=Math.min(380/(maxx-minx),240/(maxz-minz));
  const P=p=>`${((p.x-minx)*sc+16).toFixed(1)},${(260-((p.z-minz)*sc+16)).toFixed(1)}`;const d=pts.map((p,i)=>(i?'L':'M')+P(p)).join(' ')+'Z';
  return `<div style="display:inline-block;margin:4px"><b>${t.id}</b> ${Math.round(tr.length)} m · ${tr.width.toFixed(1)} m<br><svg width="410" height="270" style="background:#f4f4f0"><path d="${d}" fill="none" stroke="#223" stroke-width="${Math.max(2,tr.width*sc)}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="6 6"/><circle cx="${P(pts[0]).split(',')[0]}" cy="${P(pts[0]).split(',')[1]}" r="6" fill="red"/></svg></div>`;});
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}),pg=await b.newPage({viewport:{width:1280,height:600}});await pg.setContent('<body style="margin:6px;font:13px sans-serif">'+cells.join('')+'</body>');await pg.screenshot({path:dir+'/map-'+(process.env.RACING_TRACKS==='v1'?'v1':'f1')+'.png'});await b.close();}
