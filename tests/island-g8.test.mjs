import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FullscreenEntry,installedShell,GameShell} from '../workout/island/ui/game-shell.mjs';
import {nativeShellAction,installPressFeedback} from '../workout/island/ui/press.mjs';

function fixture({mode='',missing=false,reject=false,throws=false}={}){
 const calls=[],locks=[],doc={fullscreenElement:null,documentElement:{}},target={navigator:{},matchMedia:q=>({matches:q===`(display-mode: ${mode})`}),screen:{orientation:{lock:async value=>{locks.push(value);}}}};
 if(!missing)doc.documentElement.requestFullscreen=options=>{calls.push(options);if(throws)throw Error('denied');if(reject)return Promise.reject(Error('denied'));doc.fullscreenElement=doc.documentElement;return Promise.resolve();};
 return {entry:new FullscreenEntry({doc,target}),doc,target,calls,locks};
}
test('G8 requests fullscreen once at entry and reuses it for subsequent games',async()=>{
 const f=fixture();await f.entry.enter();await f.entry.enter();await f.entry.enter();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{navigationUI:'hide'});assert.deepEqual(f.locks,['landscape']);
 f.doc.fullscreenElement=null;await f.entry.enter();assert.equal(f.calls.length,2,'a later explicit entry after the user leaves fullscreen can request it again');
});
test('G8 pending entry cannot issue overlapping fullscreen requests',async()=>{
 const f=fixture();let resolve;f.doc.documentElement.requestFullscreen=()=>{f.calls.push(1);return new Promise(r=>resolve=r);};const first=f.entry.enter();f.entry.enter();assert.equal(f.calls.length,1);resolve();await first;assert.equal(f.locks.length,0);
});
for(const options of [{missing:true},{reject:true},{throws:true}])test(`G8 missing/denied fullscreen uses the fixed viewport: ${JSON.stringify(options)}`,async()=>{const f=fixture(options);await f.entry.enter();assert.equal(f.locks.length,0);assert.equal(f.entry.requesting||false,false);});
for(const mode of ['fullscreen','standalone','minimal-ui'])test(`G8 installed ${mode} never requests API fullscreen`,async()=>{const f=fixture({mode});assert.equal(installedShell(f.target),true);await f.entry.enter();assert.equal(f.calls.length,0);});
test('G8 iOS home-screen detection works without a display-mode media query',async()=>{const f=fixture();f.target.navigator.standalone=true;await f.entry.enter();assert.equal(f.calls.length,0);});
test('G8 API fullscreen is not mistaken for an installed app when offering installation',()=>{const f=fixture({mode:'fullscreen'});f.target.document=f.doc;f.doc.fullscreenElement=f.doc.documentElement;assert.equal(installedShell(f.target),false);});
test('G8 only entry and install buttons retain trusted release activation',()=>{
 for(const action of ['stage-play','game-understood','soccer-drill','game-again','game-next-stage','event-play','shell-install'])assert.equal(nativeShellAction(action),true,action);
 for(const action of ['game-pause','control-fire','game-play','open-games','toggle-build',undefined])assert.equal(nativeShellAction(action),false,String(action));
});
test('G8 a fresh entry touch keeps its native click inside a previous UI compatibility window',()=>{
 const listeners=new Map(),target={addEventListener(type,fn){listeners.set(type,fn);}};
 const dispatch=(type,node,props={})=>{const e={target:node,pointerId:1,button:0,isTrusted:true,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};listeners.get(type)?.(e);if(type==='click'&&!e.stopped)node.onclick?.();return e;};
 const button=(action,onclick)=>{const node={dataset:{action},onclick,matches:()=>false,closest:s=>s==='button'?node:null,click:()=>dispatch('click',node,{isTrusted:false})};return node;};
 let entries=0;installPressFeedback({target,now:()=>10,scheduleFrame:fn=>fn()});
 const opener=button('toggle-city',()=>{}),entry=button('game-understood',()=>entries++);
 dispatch('pointerdown',opener);dispatch('pointerup',opener);
 dispatch('click',entry);assert.equal(entries,0,'retargeting without a fresh down stays blocked');
 const down=dispatch('pointerdown',entry);assert.equal(down.prevented,undefined);assert.equal(entries,0,'no entry on pointerdown');
 dispatch('pointerup',entry);dispatch('click',entry);assert.equal(entries,1,'the trusted native entry click is preserved');
 dispatch('click',entry);assert.equal(entries,1,'the exemption cannot authorize a second compatibility click');
});
test('G8 the game constructor, input, rotation, resume and disposal cannot request fullscreen',async()=>{
 const source=await readFile(new URL('../workout/island/ui/game-shell.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(GameShell.toString(),/requestFullscreen|orientation\??\.lock|exitFullscreen/);
 assert.match(source,/event\.isTrusted&&nativeShellAction/);assert.match(source,/if\(entryGesture\?\.eventPhase\)entry\.enter\(orientationOf\(args\[0\]\)\)/);
 assert.match(source,/this\.paused\|\|this\.orientationBlocked\|\|this\.starting/);
 const press=await readFile(new URL('../workout/island/ui/press.mjs',import.meta.url),'utf8');assert.doesNotMatch(press,/requestFullscreen/);
});
test('G8 manifest declares fullscreen landscape with local SVG and 192/512 PNG icons',async()=>{
 const root=new URL('../workout/island/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
 assert.equal(m.display,'fullscreen');assert.equal(m.orientation,'landscape');assert.ok(m.name&&m.short_name&&m.theme_color&&m.background_color);
 for(const key of ['id','scope','start_url'])assert.equal(m[key],'./');
 for(const size of [192,512]){const icon=m.icons.find(i=>i.sizes===`${size}x${size}`&&i.type==='image/png');assert.ok(icon);const png=await readFile(new URL(icon.src,root));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 assert.ok(m.icons.some(i=>i.type==='image/svg+xml'&&i.sizes==='any'));
 for(const i of m.icons){assert.match(i.src,/^\.\/assets\/icons\//);assert.ok(new URL(i.src,root).href.startsWith(root.href));}
});
