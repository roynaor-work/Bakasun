import {chromium} from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const B='http://localhost:8765/workout/island/tools/';
const scenes={
 soccer:B+'perf-soccer.html?auto=1&seconds=300&warmup=1&dev=1',
 hoops:B+'perf-hoops.html?dur=300',
 alpine:B+'perf-alpine.html?autostart=1&seconds=300',
 racing:B+'perf-racing.html?dur=300&autostart=1',
};
const only=process.argv.slice(2);
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
for(const [name,url] of Object.entries(scenes)){
  if(only.length&&!only.includes(name))continue;
  const dir='raw/'+name;fs.rmSync(dir,{recursive:true,force:true});
  const ctx=await b.newContext({viewport:{width:+(process.env.VW||640),height:+(process.env.VH||360)},recordVideo:{dir,size:{width:+(process.env.VW||640),height:+(process.env.VH||360)}},hasTouch:true});
  const p=await ctx.newPage();p.on('pageerror',e=>console.log(name,'ERR',e.message));
  await p.addInitScript(()=>{const S=0.2;const rn=performance.now.bind(performance),t0=rn();const vn=()=>(rn()-t0)*S;performance.now=vn;const D0=Date.now();Date.now=()=>D0+vn();
const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(()=>cb(vn()));
const st=window.setTimeout.bind(window),si=window.setInterval.bind(window);window.setTimeout=(f,d=0,...a)=>st(f,d/S,...a);window.setInterval=(f,d=0,...a)=>si(f,d/S,...a);});
await p.addInitScript(()=>{const s=document.createElement('style');s.textContent='body *{visibility:hidden!important} canvas{visibility:visible!important} body{background:#000}';document.addEventListener('DOMContentLoaded',()=>document.head.append(s));});
  await p.goto(url);
  await p.waitForTimeout(Number(process.env.W||16000));
  await p.screenshot({path:`raw/${name}.png`});
  await ctx.close();
  console.log(name,fs.readdirSync(dir));
}
await b.close();
