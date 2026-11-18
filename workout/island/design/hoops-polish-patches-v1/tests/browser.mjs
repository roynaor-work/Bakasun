import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(process.env.HOOPS_TEST_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url)));
const baselineRoot=process.env.HOOPS_BASELINE_ROOT;
const importer=repo=>import(pathToFileURL(path.join(repo,'tests/helpers/island-browser.mjs')));
const {serveIsland,islandChromium}=await importer(root);
const chromium=process.env.PLAYWRIGHT_MODULE?createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE).chromium:await islandChromium();
const server=await serveIsland('/workout/island/');
const baseline=baselineRoot?await (await importer(baselineRoot)).serveIsland('/workout/island/'):null;
const features=['Physics','Rim','Net','Audio','Lighting','Shadow','Transitions'];
const screens=[{width:844,height:390},{width:390,height:844}];
const shotsDir=process.env.HOOPS_SCREENSHOTS;
if(shotsDir)await mkdir(shotsDir,{recursive:true});
let browser;

function measureInBrowser({viewport,frames,assertMotion}) {
  const session=window.__session,debug=session.debug,view=debug.view,court=debug.engine.court;
  debug.hold=true;debug.holdReplay=true;
  const renderer=view.renderer,gl=renderer.getContext();
  const fixedClock=performance.now();
  Object.defineProperty(performance,'now',{value:()=>fixedClock,configurable:true});
  view.resize(viewport.width,viewport.height,1);
  const {rimX,rimY,rimR,ballR}=court;
  view.setCameraOverride({x:rimX-4.1,y:4.6,z:-6.2},{x:rimX-.6,y:1.9,z:0},43);
  const source=debug.engine.snapshot();
  const players=source.players.map((p,i)=>({...p,x:7.2+(i%5)*1.02,z:-3.5+i*.76,y:0,vx:0,vz:0,face:.6,act:null,air:false,hasBall:false,controlled:false,dribbling:false}));
  const snap=(tick,ball)=>({...source,tick,phase:'live',players,ball:{...source.ball,state:'loose',owner:null,x:rimX,y:rimY+.55,z:0,...ball}});
  const isVisible=mesh=>{for(let o=mesh;o;o=o.parent)if(!o.visible)return false;return true;};
  const rimParts=[],nets=[];let shadow;
  view.scene.traverse(mesh=>{
    if(isVisible(mesh)&&mesh.userData.hoopsRims)for(const range of mesh.userData.hoopsRims)rimParts.push({mesh,...range});
    if(mesh.isMesh&&isVisible(mesh)&&(/__net$|^net(?:--?1)?$/.test(mesh.name))) {
      const x=mesh.getWorldPosition(mesh.position.clone()).x;
      const side=mesh.name==='basket-home__net'?-1:mesh.name==='basket-away__net'?1:Math.sign(x);
      nets.push({mesh,side,first:0,count:mesh.geometry.attributes.position.count});
    }
    if(mesh.isMesh&&mesh.geometry.parameters?.segments===24&&Math.abs(mesh.geometry.parameters?.radius-ballR*1.6)<1e-6)shadow=mesh;
  });
  const copied=part=>{
    const p=part.mesh.geometry.attributes.position,copy=[];
    for(let i=part.first;i<part.first+part.count;i++)copy.push(p.getX(i),p.getY(i),p.getZ(i));
    return copy;
  };
  const diff=(part,rest)=>copied(part).reduce((max,v,i)=>Math.max(max,Math.abs(v-rest[i])),0);
  const start=snap(600,{});
  view.render(start,start,1,1/60);view.render(start,start,1,1/60);
  const restRims=rimParts.map(copied),restNets=nets.map(copied);
  const atRest={exposure:renderer.toneMappingExposure,shadow:{pos:shadow?.position.toArray(),opacity:shadow?.material.opacity}};
  const signals={rim:[],net:[],settledRim:[],settledNet:[],leftRim:[],leftNet:[]};
  const outline=()=>rimParts.map((part,i)=>({side:part.side,delta:diff(part,restRims[i])}));
  const netline=()=>nets.map((part,i)=>({side:part.side,delta:diff(part,restNets[i])}));
  const drawMethods=[['drawArrays',1],['drawElements',0],['drawArraysInstanced',1,2],['drawElementsInstanced',0,3]];
  let sampled=null;
  for(const [name,countIndex,instanceIndex] of drawMethods){
    const original=gl[name];
    gl[name]=function(mode,...args){
      if(sampled){
        sampled.calls++;
        const count=args[countIndex],instances=instanceIndex==null?1:args[instanceIndex];
        if(mode===gl.TRIANGLES)sampled.triangles+=count*instances/3;
        if(mode===gl.TRIANGLE_STRIP||mode===gl.TRIANGLE_FAN)sampled.triangles+=Math.max(0,count-2)*instances;
      }
      return original.call(this,mode,...args);
    };
  }
  const read=(name,prev,snapshot,extra={})=>{
    // Reflection (older halls) runs every other frame. Take the frame that includes it.
    const m=view.metrics();
    let best=null;
    for(let i=0;i<(m.reflection?2:1);i++){
      sampled={calls:0,triangles:0};
      view.render(prev,snapshot,1,1/60);
      const info=view.metrics();
      const row={name,main:[info.calls,info.triangles],total:[sampled.calls,sampled.triangles],reflection:info.reflection?[info.reflection.calls,info.reflection.triangles]:null,...extra};
      if(!best||row.total[0]>best.total[0])best=row;
      sampled=null;
    }
    return best;
  };
  const rows=[read('flight',start,start)];
  const right={type:'contact',what:'rim',side:1,speed:5.4,x:rimX-rimR,y:rimY+.12,z:.14,ny:.9,tick:605,seq:1000};
  view.effects([right],snap(605,{}));
  const contact=snap(607,{x:rimX-rimR,y:rimY+.15,z:.13});
  rows.push(read('rim',start,contact));
  signals.rim=outline();signals.net=netline();
  const score={type:'score',team:0,side:1,points:2,shotType:'layup',tick:624,seq:1001};
  view.effects([score],snap(624,{}));
  const through=snap(628,{y:rimY-.36});
  rows.push(read('net',contact,through));
  const floor=snap(685,{x:rimX-.75,y:ballR,z:-.1});
  rows.push(read('floor',through,floor));
  const finish=snap(740,{x:rimX-.75,y:.35,z:-.1});
  rows.push(read('restored',floor,finish));
  signals.settledRim=outline();signals.settledNet=netline();
  const pass=snap(742,{state:'pass',x:rimX-2.4,y:1.22,z:-.32});
  rows.push(read('pass',finish,pass));
  const receiver={...players[0],x:rimX-2.4,z:-.41,hasBall:true};
  const caught={...snap(743,{state:'held',owner:receiver.id}),players:[receiver,...players.slice(1)]};
  rows.push(read('catch',pass,caught));
  if(assertMotion){
    const left={...right,x:-right.x,z:-right.z,side:-1,tick:744,seq:1002};
    view.effects([left],snap(744,{}));
    const far=snap(746,{x:-rimX+rimR,y:rimY+.15,z:-.13});
    view.setCameraOverride({x:-rimX+4.1,y:4.6,z:6.2},{x:-rimX+.6,y:1.9,z:0},43);
    read('left test',finish,far);
    signals.leftRim=outline();signals.leftNet=netline();
  }
  view.setCameraOverride({x:rimX-4.1,y:4.6,z:-6.2},{x:rimX-.6,y:1.9,z:0},43);
  read('capture',start,contact);
  const metrics=view.metrics();
  return {size:viewport,arena:metrics.arenaSource,quality:metrics.quality,lod:metrics.arenaLod??null,flags:metrics.polish??null,
    atRest,shots:rows,signals:assertMotion?signals:undefined,audio:session.snapshot.audioMetrics};
}

const output={drawUnits:'[draw calls, triangles]',renderer:'Chromium + SwiftShader',runs:[]};
const label=viewport=>`${viewport.width}x${viewport.height}`;
const onlyOn=feature=>Object.fromEntries(features.filter(name=>name!==feature).map(name=>['hoopsPolish'+name,'0']));

async function open(address,viewport,params={},route) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  if(route)await page.route(route,entry=>entry.abort());
  const url=new URL('tools/perf-hoops.html',address);
  url.search=new URLSearchParams({dev:1,dur:3600,hoopsQuality:1,hoopsV8Lod:0,hoopsV5Level:1,hoopsCrowd3d:0,hoopsShow:0,seed:4242,...params});
  try {
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__session?.loadFailed||window.__session?.snapshot.renderMetrics?.calls>0,null,{timeout:60000});
    assert.ok(await page.evaluate(()=>window.__session.ready),JSON.stringify({errors,url:url.href}));
    await page.evaluate(()=>{window.__session.debug.hold=true;document.querySelector('#perf').hidden=true;});
    return {context,page,errors};
  }catch(error){await context.close();throw error;}
}

async function sample(address,viewport,name,params,assertMotion=false) {
  const {context,page,errors}=await open(address,viewport,params);
  try {
    const result=await page.evaluate(measureInBrowser,{viewport,assertMotion});
    assert.deepEqual(errors,[],name);
    for(const frame of result.shots){
      assert.ok(frame.main[0]>0&&frame.main[1]>0);
      assert.ok(frame.total[0]>=frame.main[0]&&frame.total[1]>=frame.main[1],JSON.stringify(frame));
    }
    if(assertMotion){
      const motion=result.signals;
      const responsive=(list,side)=>{
        assert.ok(list.some(entry=>entry.side===side&&entry.delta>.003),JSON.stringify({arena:result.arena,list,side}));
        assert.ok(list.filter(entry=>entry.side===-side).every(entry=>entry.delta===0),JSON.stringify(list));
      };
      responsive(motion.rim,1);responsive(motion.net,1);responsive(motion.leftRim,-1);responsive(motion.leftNet,-1);
      assert.ok([...motion.settledRim,...motion.settledNet].every(entry=>entry.delta===0),JSON.stringify(motion));
    }
    if(shotsDir&&['off','all','v5-all','v3-all'].includes(name)){
      await page.locator('canvas').screenshot({path:path.join(shotsDir,`${label(viewport)}-${name}.png`)});
    }
    console.error(`${label(viewport)} ${name} ${result.arena} ${JSON.stringify(result.shots.find(row=>row.name==='rim'))}`);
    return {name,...result};
  }finally{await context.close();}
}

async function checkSessionAudio() {
  const {context,page,errors}=await open(server.url,screens[0],{},/hoops-polish-v1\/audio\/rim-hit-03\.ogg$/);
  try {
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(()=>window.__session.snapshot.audioMetrics.impact?.ready.length===8,null,{timeout:15000});
    const result=await page.evaluate(async()=>{
      const s=window.__session,d=s.debug,engine=d.engine,ball=engine.debug.state.ball,c=engine.court,seen=[];
      const base=d.view.effects;
      d.view.effects=(events,snapshot)=>{seen.push(...events);base(events,snapshot);};
      const later=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const inject=props=>{
        const state=engine.debug.state;
        state.phase='live';state.clock=80;state.shotClock=24;state.pending=null;
        Object.assign(ball,{state:'loose',owner:null,shot:null,pass:null,missShot:null,lastTouch:0,touchedRim:false,vx:0,vy:0,vz:0,...props});
        d.step(1);
      };
      const side=engine.snapshot().dir[0];
      inject({x:side*c.rimX,y:c.rimY+.143,z:c.rimR+.012,vy:-6});
      await later(280);
      inject({x:side*(c.rimX+.21),y:c.rimY+.58,z:0,vx:6*side});
      await later(280);
      inject({x:5,y:c.ballR+.02,z:2,vy:-7});
      await later(700);
      inject({x:side*c.rimX,y:c.rimY+.035,z:0,vy:-5});
      return {events:seen.filter(e=>e.type==='contact'||e.type==='score'),audio:s.snapshot.audioMetrics,side};
    });
    assert.deepEqual(errors,[]);
    assert.ok(result.events.some(e=>e.what==='rim'&&e.side===result.side&&e.ny>.8));
    assert.ok(result.events.some(e=>e.what==='board'&&e.side===result.side));
    assert.ok(result.events.some(e=>e.what==='floor'));
    assert.ok(result.events.some(e=>e.type==='score'&&e.side===result.side&&e.kind==='tip'&&e.score[0]>=2));
    assert.deepEqual(result.audio.impact.mp3,['impact:rim-hit-03']);
    for(const id of ['rim-hit-03','backboard-thud','ball-parquet-hard','net-swish'])assert.ok(result.audio.played[`impact:${id}`]>0,JSON.stringify(result));
    assert.equal(result.audio.played.swish,undefined);
    assert.equal(result.audio.loops,0);
    return result;
  }finally{await context.close();}
}

function counts(row){return row.shots.map(({name,main,total,reflection})=>({name,main,total,reflection}));}
function compare(a,b){
  assert.deepEqual(counts(a),counts(b),`${a.name} / ${b.name} ${label(a.size)}`);
  assert.equal(a.arena,b.arena);
}

try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  output.browser=browser.version();
  for(const viewport of process.env.HOOPS_FAST?[screens[0]]:screens){
    const off=await sample(server.url,viewport,'off',{hoopsPolish:0});
    assert.ok(Object.values(off.flags).every(value=>!value));
    assert.equal(off.audio.impact,null);
    if(baseline){
      const original=await sample(baseline.url,viewport,'original',{});
      compare(off,original);
      assert.deepEqual(off.atRest,original.atRest);
      output.runs.push(original);
    }
    const all=await sample(server.url,viewport,'all',{},true);
    assert.ok(Object.values(all.flags).every(Boolean));
    compare(off,all);
    output.runs.push(off,all);
    if(!process.env.HOOPS_FAST)for(const feature of features){
      const row=await sample(server.url,viewport,feature,onlyOn(feature));
      assert.deepEqual(Object.keys(row.flags).filter(key=>row.flags[key]),[feature.toLowerCase()]);
      compare(off,row);output.runs.push(row);
    }
  }
  if(!process.env.HOOPS_FAST)for(const [venue,params] of [
    ['v8-lod2',{hoopsV8Lod:2}],
    ['v5',{hoopsV8:0,hoopsV5:1,hoopsQuality:2}],
    ['v4',{hoopsV8:0,hoopsV5:0,hoopsV4:1,hoopsQuality:2}],
    ['v3',{hoopsV8:0,hoopsV5:0,hoopsV4:0,hoopsQuality:0}],
  ]){
    const off=await sample(server.url,screens[0],`${venue}-off`,{...params,hoopsPolish:0});
    const on=await sample(server.url,screens[0],`${venue}-all`,params,true);
    compare(off,on);output.runs.push(off,on);
  }
  output.sessionAudio=await checkSessionAudio();
  if(process.env.HOOPS_BROWSER_JSON)await writeFile(process.env.HOOPS_BROWSER_JSON,JSON.stringify(output,null,2)+'\n');
  else console.log(JSON.stringify(output,null,2));
}finally{
  await browser?.close();await baseline?.close();await server.close();
}
