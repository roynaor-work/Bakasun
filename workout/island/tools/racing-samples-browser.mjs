// Real-browser check of the racing sample layer: loads the 15 sounds through the real module, renders the layer offline at several rpm
// values and reports RMS, peak and how the crossfade moves. Usage: node tools/racing-samples-browser.mjs [out.json]
import {createRequire} from 'node:module';import {createServer} from 'node:http';import {readFile,stat,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);let f=path.resolve(workout,p.slice(1));if((await stat(f)).isDirectory())f=path.join(f,'index.html');const b=await readFile(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`;page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(origin+'/island/tools/character-check.html').catch(()=>{});
const out={};
for(const format of ['ogg','mp3']){
 out[format]=await page.evaluate(async({origin,format})=>{
  const {createRacingSamples}=await import(origin+'/island/minigames/racing-samples.mjs');
  const rows=[];
  for(const [label,state] of [['idle rpm .15',{rpm:.15,speed:3}],['mid rpm .5',{rpm:.5,speed:25}],['high rpm .8',{rpm:.8,speed:38}],['redline rpm 1',{rpm:1,speed:42}],['drift rpm .6',{rpm:.6,speed:30,drifting:true,steer:.8}]]){
   const ctx=new OfflineAudioContext(1,44100*2,44100),layer=createRacingSamples({context:ctx,base:origin+'/island/assets/racing-audio-v2/',format});
   await layer.load();layer.update({...state,level:1});
   const t0=performance.now();const buffer=await ctx.startRendering(),data=buffer.getChannelData(0).slice(22050);
   let sum=0,peak=0;for(const v of data){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
   rows.push({label,rms:+Math.sqrt(sum/data.length).toFixed(4),peak:+peak.toFixed(4),renderMs:Math.round(performance.now()-t0)});
  }
  return rows;
 },{origin,format});
}
await browser.close();server.close();
console.log(JSON.stringify(out,null,1));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
