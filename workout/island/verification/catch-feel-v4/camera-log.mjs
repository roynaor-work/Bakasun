import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL('/opt/node22/lib/node_modules/playwright/index.mjs').href);
const stage=+process.argv[2]||1;
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-proxy-server']});
const p=await b.newPage({viewport:{width:320,height:150}});
await p.goto(`http://127.0.0.1:8765/workout/island/tools/catch-harness.html?stage=${stage}&seed=3&dev=1`);
await p.waitForFunction('window.done===true',null,{timeout:120000});await p.waitForTimeout(300);
await p.evaluate(()=>{window.__out=[];window.__prev=null;});
const rec=`(tag)=>{const cam=session.debug.view().camera,s=session.chase?.state,c=cam.position,pt=window.__prev;const cur={tag,mode:session.snapshot.mode,cx:c.x,cy:c.y,cz:c.z,fov:cam.fov,x:s?.x??null,rel:s?(((s.x%66)+66)%66)-c.x:null,ph:s?.phase??null};if(pt){cur.dc=Math.hypot(c.x-pt.cx,c.y-pt.cy,c.z-pt.cz);cur.dfov=Math.abs(cam.fov-pt.fov);}window.__prev=cur;window.__out.push(cur);}`;
await p.evaluate(`window.__rec=${rec}`);
await p.evaluate(()=>{for(let i=0;i<60*90&&session.snapshot.mode==='chase';i++){session.debug.stepChase(1/60);session.debug.view().update(1/60,{});window.__rec('chase');}});
await p.waitForFunction(()=>session.snapshot.mode==='throw',null,{timeout:60000});
await p.evaluate(()=>{for(let i=0;i<60*6;i++){session.debug.step(1/60);session.debug.view().update(0,{});window.__rec('throw');}});
const r=await p.evaluate(()=>window.__out);
/*
 const rec=(tag)=>{const s=session.chase?.state;const c=cam.position;const pt=prev;const cur={tag,mode:session.snapshot.mode,cx:c.x,cy:c.y,cz:c.z,fov:cam.fov,x:s?.x??null,rel:s?(((s.x%66)+66)%66)-c.x:null,ph:s?.phase??null};
  if(pt){cur.dc=Math.hypot(c.x-pt.cx,c.y-pt.cy,c.z-pt.cz);cur.dfov=Math.abs(cam.fov-pt.fov);}prev=cur;out.push(cur);};
 for(let i=0;i<60*90&&session.snapshot.mode==='chase';i++){session.debug.stepChase(1/60);rec('chase');}
 for(let i=0;i<60*6;i++){session.debug.step(1/60);rec('throw');}
 return out;});
*/
const big=r.filter(x=>x.dc>.35||x.dfov>.6);
const rr=r.filter(x=>x.rel!==null&&x.tag==='chase');let wrap=0;for(let i=1;i<rr.length;i++)if(Math.abs(rr[i].rel-rr[i-1].rel)>3){wrap++;if(wrap<4)console.log('car-vs-camera jump',rr[i-1].rel.toFixed(1),'->',rr[i].rel.toFixed(1),'at x',rr[i].x.toFixed(0));}console.log('car-vs-camera jumps',wrap);
console.log('frames',r.length,'jumps',big.length);
for(const x of big.slice(0,12))console.log(JSON.stringify(x));
const ch=r.filter(x=>x.tag==='chase'&&x.dc!==undefined),mx=Math.max(...ch.map(x=>x.dc));console.log('max chase cam step',mx.toFixed(3));
// car-relative-to-camera: x - shift vs camera
await b.close();
