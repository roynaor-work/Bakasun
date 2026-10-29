#!/usr/bin/env bash
# Basketball round 3 (29/10/2026): TV sideline camera, defence auto-guard. Apply on main da7b95c. Run from the repo root.
set -euo pipefail
git apply --index <<'HOOPS_R3_END'
diff --git a/tests/island-hoops-feel.test.mjs b/tests/island-hoops-feel.test.mjs
index 6c37b70..7f0bb99 100644
--- a/tests/island-hoops-feel.test.mjs
+++ b/tests/island-hoops-feel.test.mjs
@@ -145 +145,18 @@ test('defence: when the other team gets the ball the child takes the nearest def
 });
+
+test('defence: with the stick idle the child\'s defender runs back between his man and the rim',()=>{
+ assert.equal(cfg.player.defenseAssist,true);
+ const e=live(81),s=S(e),opp=api(e).onCourt(1),mine=api(e).onCourt(0);
+ const h=opp[0];e.debug.give(h.id);
+ const me=mine[0];s.controlled=me.id;if(s.teams[0].ai?.assign)s.teams[0].ai.assign[me.id]=h.id;
+ const rim=e.court.rim(api(e).side(1));
+ e.debug.place(h.id,rim.x-api(e).side(1)*7,0);e.debug.place(me.id,-rim.x*0.6,5);
+ const gap0=()=>{const k=Math.min(cfg.player.assistGapBall/Math.max(0.6,api(e).dist(h,rim)),0.85);return {x:h.x+(rim.x-h.x)*k,z:h.z+(rim.z-h.z)*k};};
+ const d0=Math.hypot(me.x-gap0().x,me.z-gap0().z);
+ for(let i=0;i<90;i++){h.vx=h.vz=0;e.step(NO_INPUT);if(s.ball.state!=='held'||s.possession!==1)break;}
+ const d1=Math.hypot(me.x-gap0().x,me.z-gap0().z);
+ assert.ok(d1<d0-3,`ran back towards the guarding spot: ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
+ // the stick still wins: pushing away moves him away
+ for(let i=0;i<60;i++)e.step(IN({move:{x:-Math.sign(rim.x),z:0}}));
+ assert.ok(Math.sign(rim.x)*me.vx<0,'the stick overrides the assist');
+});
diff --git a/workout/island/data/config.json b/workout/island/data/config.json
index 7eea964..6410f62 100644
--- a/workout/island/data/config.json
+++ b/workout/island/data/config.json
@@ -11503,3 +11503,6 @@
     "userTurn": 18,
-    "autoSwitch": true
+    "autoSwitch": true,
+    "defenseAssist": true,
+    "assistGapBall": 1.0,
+    "assistGapOff": 1.8
    },
@@ -11947,3 +11950,3 @@
     "dollyZ": 0.5,
-    "mode": "behind",
+    "mode": "broadcast",
     "behindBack": 7.5,
@@ -11962,3 +11965,16 @@
     "sideExtraHeight": 1.2,
-    "sideFov": 36
+    "sideFov": 36,
+    "bLead": 0.5,
+    "bLeadMax": 4,
+    "bEdge": 1.2,
+    "bRate": 2.4,
+    "bSpan": 8.6,
+    "bFovMin": 16,
+    "bFovMax": 40,
+    "bHeight": 7,
+    "bDist": 7,
+    "bLookY": 1.7,
+    "bLookZ": 0,
+    "bFollowZ": 0.75,
+    "bNearZ": 3
    },
diff --git a/workout/island/minigames/hoops-controls.mjs b/workout/island/minigames/hoops-controls.mjs
index 84196d6..8b3dfda 100644
--- a/workout/island/minigames/hoops-controls.mjs
+++ b/workout/island/minigames/hoops-controls.mjs
@@ -13,3 +13,3 @@ export function createHoopsControls({root,doc=root.ownerDocument,icons,labels,ba
  const now=()=>win.performance?.now?.()??Date.now();
- const edges=[],keys=new Set();let enabled=true,stick={x:0,y:0},stickPointer=null,center=null;
+ const edges=[],keys=new Set();let enabled=true,stick={x:0,y:0},stickPointer=null,center=null,lockB=null;
  const held={shoot:null,pass:null,alt:null};let shootKey=false,sprintKey=false,passKeyAt=null,passAt=null;
@@ -94,3 +94,6 @@ export function createHoopsControls({root,doc=root.ownerDocument,icons,labels,ba
   consume(){
-   const ks=keyStick(),s=ks||stick,b=basis();
+   const ks=keyStick(),s=ks||stick;
+   // the screen directions are fixed when the thumb lands, so a camera move never bends a run
+   const active=!!ks||stickPointer!==null;if(active&&!lockB)lockB=basis();if(!active)lockB=null;
+   const b=lockB||basis();
    const tilt=Math.hypot(s.x,s.y),auto=!ks&&tilt>=K.autoSprint;
diff --git a/workout/island/minigames/hoops-engine.mjs b/workout/island/minigames/hoops-engine.mjs
index e78964f..98caf68 100644
--- a/workout/island/minigames/hoops-engine.mjs
+++ b/workout/island/minigames/hoops-engine.mjs
@@ -507,2 +507,16 @@ export function createHoopsEngine({config,seed=1,teams,userTeam=0,profile='stand
 
+ /** Defence help for the child: with the stick released his player guards his man (between the
+  * man and the basket, closer on the ball), sprinting back in transition; while he steers, the
+  * player keeps facing the ball handler so he slides instead of turning his back. */
+ function defendAssist(p,ml){
+  const h=holder();if(!h)return;
+  if(ml>=0.05){if(dist(p,h)<7)p.intent.face=Math.atan2(h.x-p.x,h.z-p.z);return;}
+  const T=team(p.team),o=byId(T.ai?.assign?.[p.id])||h,rim=court.rim(side(o.team));
+  const onBall=o.id===h.id,gap=onBall?C.player.assistGapBall??1.0:C.player.assistGapOff??1.8;
+  const k=Math.min(gap/Math.max(0.6,dist(o,rim)),0.85),pt={x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k};
+  const dx=pt.x-p.x,dz=pt.z-p.z,d=hyp(dx,dz);
+  if(d>0.25){p.intent.x=dx/d;p.intent.z=dz/d;p.intent.speed=clamp(d/1.2,0.3,1);p.intent.sprint=d>3;}
+  p.intent.face=Math.atan2(h.x-p.x,h.z-p.z);
+ }
+
  function humanInput(p,inp){
@@ -527,2 +541,3 @@ export function createHoopsEngine({config,seed=1,teams,userTeam=0,profile='stand
   if(p.jumpQueue)followJumpQueue(p,ml);
+  if(!hasBall&&S.ball.state==='held'&&S.possession!==p.team&&C.player.defenseAssist)defendAssist(p,ml);
   if(p.act==='shoot'&&p.shot&&p.shot.held&&inp.shootUp)gradeRelease(p);
diff --git a/workout/island/minigames/hoops-view.mjs b/workout/island/minigames/hoops-view.mjs
index 117afad..3505bd4 100644
--- a/workout/island/minigames/hoops-view.mjs
+++ b/workout/island/minigames/hoops-view.mjs
@@ -63,3 +63,20 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
   state.camX=lerp(state.camX,focusX,k);state.camZ=lerp(state.camZ,clamp(b.z*(V.followZ??0.2),-(V.maxZ??2),V.maxZ??2),k);
-  if(state.landscape&&(V.mode||'behind')==='behind'){
+  if(state.landscape&&(V.mode||'broadcast')==='broadcast'){
+   // TV sideline camera that never turns: right on the screen is always the same way on the
+   // court, so running back on defence feels the same as attacking. Closer than a wide shot,
+   // following the ball with a lead towards the basket being attacked.
+   const h=s.players.find(p=>p.hasBall),fx=h?h.x:b.x,fz=h?h.z:b.z,side=attack||0;
+   const lead2=side?clamp((side*court.rimX-fx)*(V.bLead??0.35),-(V.bLeadMax??4),V.bLeadMax??4):0;
+   const tx=clamp(fx+lead2,-court.hx+(V.bEdge??5),court.hx-(V.bEdge??5));
+   const kb=state.snap||state.bcX==null?1:1-Math.exp(-dt*(V.bRate??2.4));
+   state.bcX=state.bcX==null?tx:lerp(state.bcX,tx,kb);state.bcZ=lerp(state.bcZ??0,clamp(fz,-court.hz,court.hz),kb);
+   state.punch=Math.max(0,(state.punch||0)-dt/1.6);const pb=state.punch;
+   // fixed spot above the near sideline; the lens zooms so the players keep the same size
+   // wherever the ball is (near or far side), like a TV camera operator
+   const cz=-(court.hz+(V.bDist??7)),cy=V.bHeight??7,lz=clamp(state.bcZ*(V.bFollowZ??0.75)+(V.bLookZ??0),-court.hz+(V.bNearZ??3),court.hz-1);
+   const dist=Math.hypot(lz-cz,cy-(V.bLookY??1)),span=(V.bSpan??8)*(1-0.25*pb);
+   camera.fov=clamp(2*Math.atan(span/2/dist)*180/Math.PI,V.bFovMin??16,V.bFovMax??40);
+   camera.position.set(state.bcX,cy,cz);
+   camera.lookAt(state.bcX,V.bLookY??1,lz);
+  } else if(state.landscape&&V.mode==='behind'){
    // behind the play (2K / NBA Live mobile style): low behind the ball, facing the basket the
diff --git a/workout/island/tests/hoops-browser.mjs b/workout/island/tests/hoops-browser.mjs
index f9c4740..ee04513 100644
--- a/workout/island/tests/hoops-browser.mjs
+++ b/workout/island/tests/hoops-browser.mjs
@@ -131,5 +131,5 @@ for(const viewport of only){
   for(const p of a.onCourt(1))e.debug.place(p.id,-side*12,p.z);
-  d.step(1,inp({shootDown:true}));d.step(30,inp({}));
+  d.step(1,inp({shootDown:true}));const dbg={phase:e.snapshot().phase,act:me.act,ctl:S.controlled===me.id,own:S.ball.owner===me.id,ball:S.ball.state,auto:S.autopilot,user:S.userTeam};d.step(30,inp({}));
   const m=document.querySelector('.hoops-meter'),y=m.querySelector('.hoops-meter-yellow').getBoundingClientRect(),g=m.querySelector('.hoops-meter-win').getBoundingClientRect();
-  return {shown:!m.hidden,held:e.snapshot().players.find(p=>p.id===me.id).shotHeld,yH:y.height,gH:g.height,yTop:y.top,gTop:g.top,yBottom:y.bottom,gBottom:g.bottom};});
+  return {dbg,shown:!m.hidden,held:e.snapshot().players.find(p=>p.id===me.id).shotHeld,yH:y.height,gH:g.height,yTop:y.top,gTop:g.top,yBottom:y.bottom,gBottom:g.bottom};});
  assert.ok(meter.shown&&meter.held,'meter shows while the shot is held: '+JSON.stringify(meter));
HOOPS_R3_END
OLD=island-boar-20261029-1; NEW=island-hoops-r3-20261029-1
git grep -l "$OLD" -- workout tests ':!workout/island/verification' | xargs sed -i "s/$OLD/$NEW/g"
git add -A workout tests
echo "tree: $(git write-tree)"
