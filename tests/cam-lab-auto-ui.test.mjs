import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { pose } from './cam-lab-fixtures.js';

test('parent setup records automatically, finalizes video before camera release, uploads all three parts and revokes consent', async () => {
  const saved = new Map(), globals = (key,value) => {
    saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  };
  class Element {
    constructor() {this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.style={};this.handlers={};this.value='';}
    addEventListener(name,handler){this.handlers[name]=handler;}
    append(child){this.children.push(child);} replaceChildren(){this.children=[];}
    classList={toggle(){},remove(){}};
  }
  const elements=new Map(), get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const colors=[];const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){colors.push(this.strokeStyle);},arc(){},fill(){colors.push(this.fillStyle);}};
  get('overlay').getContext=()=>ctx;
  Object.assign(get('video'),{videoWidth:720,videoHeight:1280,readyState:2,currentTime:0,play:async()=>{}});
  get('exercise').value='squats';get('age').value='7';get('height').value='120';get('mode').value='solo';get('camera-facing').value='user';get('camera-width').value='wide';
  let now=0,raf,worker,stopped=0;const events=[],requests=[],values=new Map(),records=new Map(),timers=[];
  const location={hash:'#upload=https%3A%2F%2Fupload.example.invalid%2Freceive&key=synthetic-key',pathname:'/cam-lab/',search:''};
  class FakeWorker {
    constructor(){worker=this;} terminate(){events.push('worker-stop');}
    postMessage(m){if(m.type==='init')this.onmessage({data:{type:'ready',model:'full',modelHistory:[{model:'full',reason:'initial',timestamp:0}]}});}
  }
  class FakeStream {constructor(tracks){this.tracks=tracks;}getVideoTracks(){return this.tracks;}getTracks(){return this.tracks;}}
  class FakeMediaRecorder {
    static instances=[];static isTypeSupported(mime){return mime==='video/webm';}
    constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';FakeMediaRecorder.instances.push(this);}
    start(){this.state='recording';events.push('video-start');}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['synthetic-video'])});events.push('video-final');this.onstop();});}
  }
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
    const tx={abort(){tx.onabort?.();},objectStore(){return{
      put(record){return request(()=>{records.set(record.session,structuredClone(record));events.push('durable');});},
      getAll(){return request(()=>[...records.values()].map(r=>structuredClone(r)));},
      delete(key){return request(()=>records.delete(key));},clear(){return request(()=>records.clear());}
    };}};
    function request(operation){const req={};queueMicrotask(()=>{req.result=operation();req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return req;}
    return tx;
  }};
  const flush=async()=>{for(let i=0;i<20;i++)await yieldToIO();};
  try {
    globals('document',{hidden:false,getElementById:get,createElement:()=>new Element(),addEventListener(){}});
    globals('window',{location,history:{state:null,replaceState(){location.hash='';}},innerHeight:1280,innerWidth:720,
      isSecureContext:true,Worker:FakeWorker,OffscreenCanvas:class{},createImageBitmap(){},addEventListener(){}});
    globals('localStorage',{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)});
    globals('indexedDB',{open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess?.();});return req;}});
    globals('navigator',{userAgent:'synthetic-Android',mediaDevices:{getUserMedia:async options=>{
      assert.equal(options.audio,false);assert.equal(options.video.width.ideal,720);assert.equal(options.video.height.ideal,1280);
      const track={kind:'video',stop(){stopped++;events.push('camera-stop');},addEventListener(){},getSettings:()=>({width:720,height:1280,zoom:.5,facingMode:'user'}),
        getCapabilities:()=>({zoom:{min:.5,max:3}}),applyConstraints:async()=>{}};return new FakeStream([track]);
    }}});
    globals('fetch',async(endpoint,options)=>{requests.push(JSON.parse(options.body));events.push('fetch');return{ok:true,json:async()=>({ok:true})};});
    globals('MediaRecorder',FakeMediaRecorder);globals('MediaStream',FakeStream);globals('Worker',FakeWorker);
    globals('performance',{now:()=>now});globals('requestAnimationFrame',callback=>{raf=callback;return 1;});globals('cancelAnimationFrame',()=>{});
    globals('createImageBitmap',async()=>({close(){}}));globals('setTimeout',(fn,delay)=>{const t={fn,delay};timers.push(t);return t;});globals('clearTimeout',t=>{if(t)t.cleared=true;});
    await import('../workout/cam-lab/app.mjs?auto-upload-test');await flush();
    assert.equal(location.hash,'');assert.equal(get('upload-config-status').textContent,'שליחה לבדיקה: פעילה');assert.equal(get('record').checked,true);
    await get('settings').handlers.submit({preventDefault(){}});await flush();assert.equal(FakeMediaRecorder.instances.length,1);
    assert.equal(requests.length,0);assert.match(get('zoom-status').textContent,/0.5/);
    const frame=async sample=>{now+=50;get('video').currentTime+=.05;await raf();
      worker.onmessage({data:{type:'pose',id:now/50,timestamp:now,poses:[{landmarks:sample.p,world:sample.world}],inferenceMs:20,model:'full'}});};
    const partial=pose();partial.p[15].visibility=.1;partial.p[16].visibility=.4;
    await frame(partial);assert.ok(colors.includes('#70e2b5'));assert.ok(colors.includes('#ffd685'));assert.ok(colors.includes('#ff8b8b'));
    assert.equal(get('start').disabled,false);get('start').onclick();
    for(let i=0;i<20;i++)await frame(pose({angle:110}));for(let i=0;i<20;i++)await frame(pose());
    get('finish').onclick();await flush();
    assert.equal(stopped,1);assert.ok(events.indexOf('video-final')<events.indexOf('camera-stop'));assert.ok(events.indexOf('durable')<events.indexOf('fetch'));
    assert.deepEqual(requests.map(r=>r.part),['video','skeleton','diagnostics']);assert.equal(get('upload-status').textContent,'נשלח לבדיקה');assert.equal(records.size,0);
    const diagnostic=JSON.parse(Buffer.from(requests[2].data,'base64').toString());
    assert.equal(diagnostic.labVersion,'3.0.0');assert.equal(diagnostic.userAgent,'synthetic-Android');assert.equal(diagnostic.camera.settings.zoom,.5);
    assert.equal(diagnostic.model,'full');assert.equal(diagnostic.attempts[0].counted,1);assert.ok(diagnostic.attempts[0].requiredPoints[27].observedPercent>0);
    assert.ok(diagnostic.attempts[0].preparation.frames>0);assert.equal(JSON.stringify(diagnostic).includes('synthetic-key'),false);
    const skeleton=JSON.parse(Buffer.from(requests[1].data,'base64').toString());assert.equal(skeleton.version,2);
    const {replayRecording}=await import('../workout/cam-lab/recording.mjs');assert.equal(replayRecording(skeleton)[0].counted,1);
    get('again').onclick();await get('settings').handlers.submit({preventDefault(){}});await frame(pose());
    // Four-minute limit also delivers an attempt that never reached Start.
    timers.filter(t=>t.delay===240000&&!t.cleared).at(-1).fn();await flush();assert.equal(requests.length,6);
    const placementOnly=JSON.parse(Buffer.from(requests[5].data,'base64').toString());assert.equal(placementOnly.attempts[0].counted,0);
    assert.ok(placementOnly.attempts[0].preparation.frames>0);
    get('again').onclick();await get('settings').handlers.submit({preventDefault(){}});await get('upload-disable').onclick();
    assert.equal(values.has('camlab.upload'),false);get('finish').onclick();await flush();assert.equal(requests.length,6);
  } finally {for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
