import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { pose } from './cam-lab-fixtures.js';

test('automatic attempts finalize and upload with granted, denied, and unsupported zoom permission; revocation stops sends', async () => {
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
  let now=0,raf,worker,stopped=0,cameraMode='approved';const events=[],requests=[],values=new Map(),records=new Map(),timers=[],cameraRequests=[];
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
    globals('navigator',{userAgent:'synthetic-Android',permissions:{query:async descriptor=>{
      assert.deepEqual(descriptor,{name:'camera',panTiltZoom:true});
      return {state:cameraMode==='approved'?'granted':'denied'};
    }},mediaDevices:{
      getSupportedConstraints:()=>({zoom:cameraMode!=='unsupported'}),getUserMedia:async options=>{
      cameraRequests.push(options);
      assert.equal(options.audio,false);assert.equal(options.video.width.ideal,720);assert.equal(options.video.height.ideal,1280);
      if(cameraMode==='denied'&&options.video.zoom){const error=new Error('synthetic PTZ refusal');error.name='NotAllowedError';throw error;}
      let zoom=cameraMode==='approved'?1:cameraMode==='denied'?1:undefined;
      const track={kind:'video',stop(){stopped++;events.push('camera-stop');},addEventListener(){},getSettings:()=>({width:720,height:1280,...(zoom===undefined?{}:{zoom}),facingMode:'user'}),
        getCapabilities:()=>cameraMode==='approved'?{zoom:{min:.5,max:3}}:{},applyConstraints:async constraints=>{if(constraints.advanced?.[0]?.zoom!==undefined)zoom=constraints.advanced[0].zoom;}};return new FakeStream([track]);
    }}});
    globals('fetch',async(endpoint,options)=>{requests.push(JSON.parse(options.body));events.push('fetch');return{ok:true,json:async()=>({ok:true})};});
    globals('MediaRecorder',FakeMediaRecorder);globals('MediaStream',FakeStream);globals('Worker',FakeWorker);
    globals('performance',{now:()=>now});globals('requestAnimationFrame',callback=>{raf=callback;return 1;});globals('cancelAnimationFrame',()=>{});
    globals('createImageBitmap',async()=>({close(){}}));globals('setTimeout',(fn,delay)=>{const t={fn,delay};timers.push(t);return t;});globals('clearTimeout',t=>{if(t)t.cleared=true;});
    await import('../workout/cam-lab/app.mjs?auto-upload-test');await flush();
    assert.equal(get('upload-off-banner').hidden,true);assert.equal(get('upload-on-banner').hidden,false);
    assert.equal(location.hash,'');assert.equal(get('upload-config-status').textContent,'שליחה לבדיקה: פעילה');assert.equal(get('record').checked,true);
    await get('settings').handlers.submit({preventDefault(){}});await flush();assert.equal(FakeMediaRecorder.instances.length,1);
    assert.equal(cameraRequests[0].video.zoom,true);
    assert.equal(requests.length,0);assert.match(get('zoom-status').textContent,/0.5/);
    const frame=async sample=>{now+=50;get('video').currentTime+=.05;await raf();
      worker.onmessage({data:{type:'pose',id:now/50,timestamp:now,poses:[{landmarks:sample.p,world:sample.world}],inferenceMs:20,model:'full'}});};
    const partial=pose();partial.p[15].visibility=.1;partial.p[16].visibility=.4;
    await frame(partial);assert.ok(colors.includes('#70e2b5'));assert.ok(colors.includes('#ffd685'));assert.ok(colors.includes('#ff8b8b'));
    assert.equal(get('start').disabled,false);
    assert.equal(get('record-option').hidden,true);assert.equal(get('recording-panel').hidden,true);assert.equal(get('export-panel').hidden,true);
    assert.equal(get('finish').hidden,false);assert.equal(get('upload-status').textContent,'מקליט ושולח לבדיקה אוטומטית');
    for(let i=0;i<60;i++)await frame(pose());
    assert.equal(get('start').hidden,true); // No recording, download or Start click.
    for(let i=0;i<20;i++)await frame(pose({angle:110}));for(let i=0;i<20;i++)await frame(pose());
    get('finish').onclick();get('stop').onclick();get('finish').onclick();await flush();
    assert.equal(stopped,1);assert.ok(events.indexOf('video-final')<events.indexOf('camera-stop'));assert.ok(events.indexOf('durable')<events.indexOf('fetch'));
    assert.deepEqual(requests.map(r=>r.part),['video','skeleton','diagnostics']);assert.equal(get('upload-status').textContent,'נשלח לבדיקה');assert.equal(records.size,0);
    const diagnostic=JSON.parse(Buffer.from(requests[2].data,'base64').toString());
    assert.equal(diagnostic.countStarted,true);assert.equal(diagnostic.countNotStartedReason,null);assert.equal(diagnostic.endReason,'finish');
    assert.equal(diagnostic.labVersion,'4.0.0');assert.equal(diagnostic.userAgent,'synthetic-Android');assert.equal(diagnostic.camera.settings.zoom,.5);
    assert.equal(diagnostic.camera.ptz.requested,true);assert.equal(diagnostic.camera.ptz.granted,true);
    assert.equal(diagnostic.camera.ptz.state,'granted');assert.equal(diagnostic.camera.ptz.fallback,false);assert.equal(diagnostic.camera.ptz.actualZoom,.5);
    assert.equal(diagnostic.model,'full');assert.equal(diagnostic.attempts[0].counted,1);assert.ok(diagnostic.attempts[0].requiredPoints[27].observedPercent>0);
    assert.ok(diagnostic.attempts[0].preparation.frames>0);assert.equal(JSON.stringify(diagnostic).includes('synthetic-key'),false);
    const skeleton=JSON.parse(Buffer.from(requests[1].data,'base64').toString());assert.equal(skeleton.version,2);
    const {replayRecording}=await import('../workout/cam-lab/recording.mjs');assert.equal(replayRecording(skeleton)[0].counted,1);
    cameraMode='denied';get('again').onclick();await get('settings').handlers.submit({preventDefault(){}});await frame(pose());
    // Four-minute limit also delivers an attempt that never reached Start.
    timers.filter(t=>t.delay===240000&&!t.cleared).at(-1).fn();await flush();assert.equal(requests.length,6);
    get('finish').onclick();get('stop').onclick();await flush();assert.equal(requests.length,6); // Already finalized, including after sending.
    const placementOnly=JSON.parse(Buffer.from(requests[5].data,'base64').toString());assert.equal(placementOnly.attempts[0].counted,0);
    assert.equal(placementOnly.countStarted,false);assert.equal(placementOnly.countNotStartedReason,'no-count-start');assert.equal(placementOnly.endReason,'duration-limit');
    assert.ok(placementOnly.attempts[0].preparation.frames>0);
    assert.equal(get('error').hidden,true);assert.equal(placementOnly.camera.settings.zoom,1);
    assert.equal(placementOnly.camera.ptz.requested,true);assert.equal(placementOnly.camera.ptz.granted,false);
    assert.equal(placementOnly.camera.ptz.state,'denied');assert.equal(placementOnly.camera.ptz.fallback,true);assert.equal(placementOnly.camera.ptz.actualZoom,1);
    assert.equal(cameraRequests.length,3);assert.equal(cameraRequests[1].video.zoom,true);assert.equal(cameraRequests[2].video.zoom,undefined);
    cameraMode='unsupported';get('again').onclick();await get('settings').handlers.submit({preventDefault(){}});await frame(pose());
    assert.equal(get('error').hidden,true);assert.equal(cameraRequests.length,4);assert.equal(cameraRequests[3].video.zoom,undefined);
    for(let i=0;i<60;i++)await frame(pose());
    assert.equal(get('start').hidden,true);assert.equal(FakeMediaRecorder.instances.length,3);
    get('finish').onclick();await flush();assert.equal(requests.length,9);
    const unsupported=JSON.parse(Buffer.from(requests[8].data,'base64').toString());assert.equal(unsupported.camera.settings.zoom,undefined);
    assert.equal(unsupported.countStarted,true);assert.equal(unsupported.countNotStartedReason,null);
    assert.ok(JSON.parse(Buffer.from(requests[7].data,'base64').toString()).countStartMs>0);
    assert.equal(new Set(requests.map(r=>r.session)).size,3); // New capture and countdown after Again, without reload.
    assert.equal(unsupported.camera.ptz.requested,false);assert.equal(unsupported.camera.ptz.granted,null);
    assert.equal(unsupported.camera.ptz.state,'unsupported');assert.equal(unsupported.camera.ptz.actualZoom,null);
    get('again').onclick();await get('settings').handlers.submit({preventDefault(){}});await get('upload-disable').onclick();
    assert.equal(values.has('camlab.upload'),false);get('finish').onclick();await flush();assert.equal(requests.length,9);
  } finally {for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('camera setup explains the movement and zoom permission before the camera button',async()=>{
  const html=await readFile(new URL('../workout/cam-lab/index.html',import.meta.url),'utf8');
  const explanation=html.indexOf('הזזה וזום של המצלמה');
  assert.ok(explanation>=0);assert.ok(explanation<html.indexOf('id="camera"'));
  assert.match(html.slice(Math.max(0,explanation-150),explanation+250),/מומלץ.*לאשר/s);
});
