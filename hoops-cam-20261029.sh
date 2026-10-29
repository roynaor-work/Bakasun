#!/usr/bin/env bash
# Basketball camera round, refreshed 29/10/2026: apply on main cefbacb. Run from the repo root.
set -euo pipefail
git apply --index <<'HOOPS_A_END'
diff --git a/workout/island/data/config.json b/workout/island/data/config.json
index dc59dad..19981fc 100644
--- a/workout/island/data/config.json
+++ b/workout/island/data/config.json
@@ -11946,3 +11946,19 @@
     "maxZ": 3.5,
-    "dollyZ": 0.5
+    "dollyZ": 0.5,
+    "mode": "behind",
+    "behindBack": 7.5,
+    "behindHeight": 3.8,
+    "behindFov": 48,
+    "behindLook": 0.45,
+    "behindLookY": 1.4,
+    "behindZ": 0.55,
+    "behindLookZ": 0.25,
+    "behindRate": 2.2,
+    "behindSwing": 1.6,
+    "behindWall": 2,
+    "behindNear": 12,
+    "behindFar": 19,
+    "sideExtraBack": 2.5,
+    "sideExtraHeight": 1.2,
+    "sideFov": 36
    },
diff --git a/workout/island/minigames/hoops-engine.mjs b/workout/island/minigames/hoops-engine.mjs
index c0f2556..4bffd63 100644
--- a/workout/island/minigames/hoops-engine.mjs
+++ b/workout/island/minigames/hoops-engine.mjs
@@ -947,3 +947,3 @@ export function createHoopsEngine({config,seed=1,teams,userTeam=0,profile='stand
     score:[team(0).score,team(1).score],teamFouls:[team(0).fouls,team(1).fouls],timeouts:[team(0).timeouts,team(1).timeouts],possession:S.possession,dir:[...S.dir],userTeam:S.userTeam,
-    controlled:S.controlled,ball:{x:+b.x.toFixed(3),y:+b.y.toFixed(3),z:+b.z.toFixed(3),state:b.state,owner:b.owner,shotId:b.shot?.id||null,dribbleT:+b.dribbleT.toFixed(3)},
+    controlled:S.controlled,ball:{x:+b.x.toFixed(3),y:+b.y.toFixed(3),z:+b.z.toFixed(3),state:b.state,owner:b.owner,passTo:b.state==='pass'?b.pass?.to??null:null,shotId:b.shot?.id||null,dribbleT:+b.dribbleT.toFixed(3)},
     players:snapshotPlayers(),ft:S.ft?{shooter:S.ft.shooter,left:S.ft.left,total:S.ft.total}:null,inbound:S.inbound?{team:S.inbound.team,inbounder:S.inbound.inbounder}:null,
diff --git a/workout/island/minigames/hoops-players.mjs b/workout/island/minigames/hoops-players.mjs
index 8a3d020..3947599 100644
--- a/workout/island/minigames/hoops-players.mjs
+++ b/workout/island/minigames/hoops-players.mjs
@@ -114,3 +114,7 @@ export function createAvatar(assets,card,teamLook,opts={}){
   if(p.act==='steal'&&rArm){const u=Math.min(1,p.actT/0.4);const k=Math.sin(u*Math.PI)*1.1;rArm.rotateX(-k);spine&&spine.rotateX(k*0.25);}
-  if(ctx.contest&&lArm&&rArm&&!p.hasBall&&p.act!=='shoot'){lArm.rotateZ(-0.9*ctx.contest);rArm.rotateZ(0.9*ctx.contest);}
+  if(ctx.contest&&lArm&&rArm&&!p.hasBall&&p.act!=='shoot'&&!p.air){lArm.rotateZ(-0.9*ctx.contest);rArm.rotateZ(0.9*ctx.contest);}
+  // block and rebound: both arms reach straight up through the jump
+  if(p.air&&(p.act==='block'||p.act==='rebound')&&lArm&&rArm){const k=Math.min(1,0.35+ctx.airU*1.4);lArm.rotateZ(-2.6*k);rArm.rotateZ(2.6*k);lFore&&lFore.rotateZ(-1.6*k);rFore&&rFore.rotateZ(1.6*k);}
+  // a pass on its way: hands up in front of the chest, ready to catch
+  if(ctx.catching&&!p.hasBall&&lArm&&rArm&&!p.air){lArm.rotateX(-0.9);rArm.rotateX(-0.9);lFore&&lFore.rotateX(-0.5);rFore&&rFore.rotateX(-0.5);}
  };
diff --git a/workout/island/minigames/hoops-view.mjs b/workout/island/minigames/hoops-view.mjs
index b30b514..e735f5a 100644
--- a/workout/island/minigames/hoops-view.mjs
+++ b/workout/island/minigames/hoops-view.mjs
@@ -43,4 +43,5 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
  const ringMat=new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.9,depthWrite:false});
- const ring=new THREE.Mesh(new THREE.RingGeometry(0.42,0.5,40),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.012;scene.add(ring);
- const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.09,0.22,3),ringMat);arrow.rotation.x=Math.PI;scene.add(arrow);
+ const ring=new THREE.Mesh(new THREE.RingGeometry(0.5,0.68,48),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.012;scene.add(ring);
+ const glow=new THREE.Mesh(new THREE.CircleGeometry(0.5,40),new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.22,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=0.011;scene.add(glow);
+ const arrow=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.34,3),ringMat);arrow.rotation.x=Math.PI;scene.add(arrow);
 
@@ -62,3 +63,27 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
   state.camX=lerp(state.camX,focusX,k);state.camZ=lerp(state.camZ,clamp(b.z*(V.followZ??0.2),-(V.maxZ??2),V.maxZ??2),k);
-  if(state.landscape){
+  if(state.landscape&&(V.mode||'behind')==='behind'){
+   // behind the play (2K / NBA Live mobile style): low behind the ball, facing the basket the
+   // team with the ball attacks; it swings round smoothly when the ball changes hands
+   const h=s.players.find(p=>p.hasBall),fx=h?h.x:b.x,fz=h?h.z:b.z;
+   const side=attack||Math.sign(fx||1)||1,rimX=side*court.rimX;
+   const kk=state.snap?1:1-Math.exp(-dt*(V.behindRate??2.2));
+   // swing angle: 0 looks at the +x basket, PI at the -x one; halfway is the TV sideline view
+   // far from the basket (bringing the ball up, transition) the camera eases round to the
+   // sideline; in the half court it sits behind the play
+   const far=clamp((Math.abs(rimX-fx)-(V.behindNear??12))/((V.behindFar??19)-(V.behindNear??12)),0,1),wf=far*far*(3-2*far);
+   const goalA=side>0?wf*Math.PI/2:Math.PI-wf*Math.PI/2;
+   state.bW=state.snap||state.bW==null?wf:lerp(state.bW,wf,1-Math.exp(-dt*(V.behindSwing??1.6)));
+   state.bA=state.snap||state.bA==null?goalA:lerp(state.bA,goalA,1-Math.exp(-dt*(V.behindSwing??1.6)));
+   // the ball holder stays in the lower third; never back beyond the far baseline wall
+   const tx=clamp(fx,-court.hx+1,court.hx-1),tz=clamp(fz,-court.hz,court.hz);
+   state.bX=state.snap||state.bX==null?tx:lerp(state.bX,tx,kk);state.bZ=state.snap||state.bZ==null?tz:lerp(state.bZ,tz,kk);
+   // the camera stays in front of the backboard behind it; near that wall it rises instead
+   state.punch=Math.max(0,(state.punch||0)-dt/1.6);const punch=state.punch*(1-state.bW);
+   const ca=Math.cos(state.bA),sa=Math.sin(state.bA),back=((V.behindBack??8.5)+state.bW*(V.sideExtraBack??3.5))*(1-0.38*punch),lim=court.hx-(V.behindWall??2);
+   const rawX=state.bX-ca*back,over=Math.max(0,Math.abs(rawX)-lim);
+   const cx=clamp(rawX,-lim,lim),cz=clamp(state.bZ*(V.behindZ??0.55)-sa*back,-(court.hz+3),court.hz+3);
+   const ahead=clamp(Math.abs(rimX-state.bX)*lerp(V.behindLook??0.45,0.55,state.bW),1.5,lerp(6,10,state.bW));
+   const lx=state.bX+ca*ahead,lz=state.bZ*(V.behindLookZ??0.25)+sa*ahead;
+   camera.fov=lerp(V.behindFov??50,V.sideFov??36,state.bW)-8*punch;camera.position.set(cx,(V.behindHeight??3.8)+state.bW*(V.sideExtraHeight??1.6)+Math.min(3,over*0.55),cz);camera.lookAt(lx,V.behindLookY??1.4,lz);
+  } else if(state.landscape){
    camera.fov=V.fov;camera.position.set(state.camX,V.height,-(court.hz+V.distance)+state.camZ*(V.dollyZ??0));camera.lookAt(state.camX*0.98,V.lookY,state.camZ+V.lookZ);
@@ -93,3 +118,4 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
    const contest=handler&&handler.team!==p.team&&handler.act==='shoot'&&Math.hypot(handler.x-p.x,handler.z-p.z)<1.8?1:0;
-   av.pose(p,{defending,dribbling:s.phase==='live',airU:p.air?clamp((p.y)/(0.7),0,1):0,contest},Math.min(0.05,dt));
+   const catching=s.ball.state==='pass'&&s.ball.passTo===p.id;
+   av.pose(p,{defending,dribbling:s.phase==='live',airU:p.air?clamp((p.y)/(0.7),0,1):0,contest,catching},Math.min(0.05,dt));
   }
@@ -125,4 +151,4 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
   const me=s.players.find(p=>p.controlled);
-  if(me&&!state.replay){const mi=playerInterp(prevById.get(me.id),me,alpha);ring.visible=true;ring.position.x=mi.x;ring.position.z=mi.z;arrow.visible=true;arrow.position.set(mi.x,me.hasBall?2.75:2.6,mi.z);arrow.rotation.y+=dt*2;}
-  else {ring.visible=false;arrow.visible=false;}
+  if(me&&!state.replay){const mi=playerInterp(prevById.get(me.id),me,alpha);ring.visible=true;ring.position.x=mi.x;ring.position.z=mi.z;glow.visible=true;glow.position.x=mi.x;glow.position.z=mi.z;const pulse=1+Math.sin(performance.now()*0.008)*0.06;ring.scale.setScalar(pulse);arrow.visible=true;arrow.position.set(mi.x,me.hasBall?2.75:2.6,mi.z);arrow.rotation.y+=dt*2;}
+  else {ring.visible=false;glow.visible=false;arrow.visible=false;}
   // nets, LED, displays
@@ -145,2 +171,3 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
   for(const e of events){
+   if(e.type==='shotStart'&&(e.shotType==='dunk'||e.shotType==='layup'))state.punch=e.shotType==='dunk'?1:0.6;
    if(e.type==='score'){const n=dyn.nets.find(n=>Math.sign(n.side)===Math.sign((e.side)??1));for(const n2 of dyn.nets)n2.swing=1;state.cheer=1;if(e.shotType==='dunk')state.shake=1;}
HOOPS_A_END
git apply --index <<'HOOPS_B_END'
diff --git a/workout/island/data/config.json b/workout/island/data/config.json
index 19981fc..eb20725 100644
--- a/workout/island/data/config.json
+++ b/workout/island/data/config.json
@@ -11949,6 +11949,6 @@
     "behindBack": 7.5,
-    "behindHeight": 3.8,
+    "behindHeight": 3.6,
     "behindFov": 48,
     "behindLook": 0.45,
-    "behindLookY": 1.4,
+    "behindLookY": 2.0,
     "behindZ": 0.55,
diff --git a/workout/island/minigames/hoops-view.mjs b/workout/island/minigames/hoops-view.mjs
index e735f5a..bea49bc 100644
--- a/workout/island/minigames/hoops-view.mjs
+++ b/workout/island/minigames/hoops-view.mjs
@@ -81,3 +81,3 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
    state.punch=Math.max(0,(state.punch||0)-dt/1.6);const punch=state.punch*(1-state.bW);
-   const ca=Math.cos(state.bA),sa=Math.sin(state.bA),back=((V.behindBack??8.5)+state.bW*(V.sideExtraBack??3.5))*(1-0.38*punch),lim=court.hx-(V.behindWall??2);
+   const ca=Math.cos(state.bA),sa=Math.sin(state.bA),back=((V.behindBack??8.5)+state.bW*(V.sideExtraBack??3.5))*(1-0.38*punch),lim=court.hx-(V.behindWall??2)-state.bW*2.5;
    const rawX=state.bX-ca*back,over=Math.max(0,Math.abs(rawX)-lim);
@@ -85,4 +85,4 @@ export async function createHoopsView(canvas,config,{court,teams,quality=2,asset
    const ahead=clamp(Math.abs(rimX-state.bX)*lerp(V.behindLook??0.45,0.55,state.bW),1.5,lerp(6,10,state.bW));
-   const lx=state.bX+ca*ahead,lz=state.bZ*(V.behindLookZ??0.25)+sa*ahead;
-   camera.fov=lerp(V.behindFov??50,V.sideFov??36,state.bW)-8*punch;camera.position.set(cx,(V.behindHeight??3.8)+state.bW*(V.sideExtraHeight??1.6)+Math.min(3,over*0.55),cz);camera.lookAt(lx,V.behindLookY??1.4,lz);
+   const lx=state.bX+side*ahead,lz=state.bZ*(V.behindLookZ??0.25);
+   camera.fov=lerp(V.behindFov??50,V.sideFov??36,state.bW)-8*punch;camera.position.set(cx,(V.behindHeight??3.8)+state.bW*(V.sideExtraHeight??1.6)+Math.min(3,over*0.55),cz);camera.lookAt(lx,lerp(V.behindLookY??1.4,1.1,state.bW),lz);
   } else if(state.landscape){
HOOPS_B_END
OLD=island-soccer-athlete-20261029-1; NEW=island-hoops-cam-20261029-1
git grep -l "$OLD" -- workout tests ':!workout/island/verification' | xargs sed -i "s/$OLD/$NEW/g"
git add -A workout tests
echo "tree: $(git write-tree)"
