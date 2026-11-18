import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

// v24.4 tennis (Roy after v24.3): OUT / NET line calls (sign + shout) and the Codex tennis-ui-v2 controls. Pure parts; the browser proof is
// workout/island/tests/aliens-tennis-v24-4-browser.mjs.
const {tennisCalloutsEnabled,calloutFor,CALL_WORD,VOICES,playCall}=await import('../workout/island/minigames/tennis-callouts.mjs');
const {tennisUi2Enabled,UI2,ui2MeterBox}=await import('../workout/island/minigames/tennis-ui2.mjs');
const root=new URL('../workout/island/',import.meta.url);

test('line calls: out and net only, words, flags',()=>{
 assert.equal(calloutFor({reason:'out'}),'out');assert.equal(calloutFor({reason:'net'}),'net');assert.equal(calloutFor({reason:'doubleBounce'}),null);assert.equal(calloutFor(null),null);
 assert.equal(CALL_WORD.out,'OUT!');assert.equal(CALL_WORD.net,'NET!');
 assert.equal(tennisCalloutsEnabled(''),true);assert.equal(tennisCalloutsEnabled('?tennisCallouts=0'),false);
});
test('the shout is synthesised: a falling voice through three formants and a "t" burst, all nodes released',()=>{
 const made=[];let disconnected=0;
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),Q:param(),connect(){},disconnect(){disconnected++;},start(){},stop(){}};made.push(n);return n;};
 const context={currentTime:1,sampleRate:8000,createGain:()=>node('gain'),createOscillator:()=>node('osc'),createBiquadFilter:()=>node('filter'),createBufferSource:()=>node('buffer'),createBuffer:(c,l)=>({getChannelData:()=>new Float32Array(l)})};
 for(const kind of ['out','net']){made.length=0;const seconds=playCall(context,{},kind,{random:()=>.3});
  assert.ok(seconds>.3&&seconds<.6,`${kind} lasts ${seconds}`);assert.equal(made.filter(n=>n.kind==='osc').length,1);
  assert.ok(made.filter(n=>n.kind==='filter').length>=VOICES[kind].formants.length+1);
  const burst=made.find(n=>n.kind==='buffer');assert.ok(burst);disconnected=0;burst.onended();assert.equal(disconnected,made.length,'every node is disconnected after the call');}
 assert.equal(playCall(context,{},'fault'),0);assert.equal(playCall(null,{},'out'),0);
});
test('tennis-ui-v2 layout at 844x390: touch targets >= 56 px, no overlaps, the bar on the right edge clear of every button',()=>{
 assert.equal(tennisUi2Enabled(''),true);assert.equal(tennisUi2Enabled('?tennisUi=v24'),false);
 const W=844,H=390,rects=Object.entries(UI2.buttons).map(([id,b])=>({id,x:W-UI2.inset.right-b.right-b.size,y:H-UI2.inset.bottom-b.bottom-b.size,w:b.size,h:b.size}));
 for(const r of rects){assert.ok(r.w>=56&&r.h>=56,r.id);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=W&&r.y+r.h<=H,r.id);}
 const hit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)assert.ok(!hit(rects[i],rects[j]),`${rects[i].id}/${rects[j].id}`);
 const shoot=rects.find(r=>r.id==='shoot');assert.ok(shoot.x+shoot.w>=W-60&&shoot.y+shoot.h>=H-40,'the hit is in the bottom-right corner, under the thumb');
 for(const h of [320,360,390,430]){const m=ui2MeterBox(h),bar={x:W-m.right-m.width,y:m.top,w:m.width,h:m.height};assert.ok(bar.y>=8&&bar.y+bar.h<=h-8,`bar inside ${h}`);
  if(h===390)for(const r of rects)assert.ok(!hit(bar,r),`bar clear of ${r.id}`);}
});
test('the copied Codex art is on disk, listed, offline, and licensed',()=>{
 const used=['button-serve-idle','button-serve-pressed','button-smash-idle','button-smash-pressed','button-drop-idle','button-drop-pressed','button-lob-idle','button-lob-pressed','fx-out','fx-net'];
 const manifest=JSON.parse(readFileSync(new URL('offline-manifest.json',root),'utf8')),text=JSON.stringify(manifest);
 for(const name of used){const path=`assets/tennis-ui-v2/${name}.svg`;assert.ok(existsSync(new URL(path,root)),path);assert.ok(text.includes(path),`${path} in the offline manifest`);
  assert.ok(readFileSync(new URL(path,root),'utf8').startsWith('<svg'),path);}
 assert.match(readFileSync(new URL('assets/tennis-ui-v2/LICENSES.md',root),'utf8'),/CC0/);
});
test('help text follows the controls: v24.4 names the serve plate and the bar on the right edge; ?tennisUi=v24 keeps the v24.3 wording',()=>{
 const strings=JSON.parse(readFileSync(new URL('data/strings.he.json',root),'utf8')),activity=readFileSync(new URL('ui/activity.mjs',root),'utf8');
 assert.match(strings['minigame.tennis.help.2'],/כפתור ההגשה/);assert.match(strings['minigame.tennis.help.1'],/בקצה הימני/);
 assert.match(strings['minigame.tennis.help.2.v243'],/החצים העולים/);assert.match(strings['minigame.tennis.help.1.v243'],/המד שבצד ליד הכפתורים/);
 assert.match(activity,/id==='tennis'&&polishValue\('tennisUi'\)==='v24'\)\{keys\[0\]\+='\.v243';keys\[1\]\+='\.v243';\}/);
});
test('ready stance: between strokes the racket is up and in front with the other hand on its throat; swings, backswing and toss untouched',async()=>{
 const T=await import('../workout/island/vendor/three.module.js');
 const {tennisReadyEnabled,readyStance,readyHold,READY_DEFAULTS}=await import('../workout/island/minigames/tennis-grip.mjs');
 assert.equal(tennisReadyEnabled(''),true);assert.equal(tennisReadyEnabled('?tennisReady=0'),false);
 const r=readyHold(T,READY_DEFAULTS),head=new T.Vector3(0,-1,0).applyQuaternion(r.quaternion);
 assert.ok(head.y>.3&&head.z>.5,'the shaft (old-racket -Y) points up and forward');assert.ok(head.x<0,'toward the middle of the body');
 assert.ok(Math.abs(new T.Vector3(0,0,1).applyQuaternion(r.quaternion).y)<.05,'the strings face sideways (edge up), as when waiting');
 assert.ok(r.leftHand[2]>r.rightHand[2]&&r.leftHand[1]>r.rightHand[1],'the other hand holds the throat, above and in front of the grip');
 const at=(p,phase='rally',server=1,index=0)=>readyStance(p,{phase,server,index});
 assert.equal(at({swing:0,preparing:false}),true);assert.equal(at({swing:.2,preparing:false}),false);assert.equal(at({swing:0,preparing:true}),false);
 assert.equal(at({swing:0},'toss',0,0),false,'the server tossing');assert.equal(at({swing:0},'serve',0,0),true,'waiting to serve');assert.equal(at({swing:0},'toss',1,0),true,'the receiver during the toss');
});
