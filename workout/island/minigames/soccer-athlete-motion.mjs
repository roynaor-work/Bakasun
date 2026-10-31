const hypot2=(x,z)=>Math.sqrt(x*x+z*z); // Math.hypot is a non-inlined builtin that boxes its result on every call
/** Mocap-driven animation layer for the realistic athlete rig.
 * Locomotion clips (jog/run/sprint) share one phase so the feet stay in step while
 * they blend by speed; one-shot actions (shot, pass, header, throw, reach, slide)
 * cross-fade over it. Presentation only: never changes the simulation. */
export const ATHLETE_BONES = {
  UpperLeg_R: 'RightUpLeg', LowerLeg_R: 'RightLeg', UpperLeg_L: 'LeftUpLeg', LowerLeg_L: 'LeftLeg', Head: 'Head', Neck: 'Neck', Chest: 'Spine1', Hips: 'Hips', Spine: 'Spine',
  UpperArm_L: 'LeftArm', UpperArm_R: 'RightArm', LowerArm_L: 'LeftForeArm', LowerArm_R: 'RightForeArm', Hand_L: 'LeftHand', Hand_R: 'RightHand', Foot_L: 'LeftFoot', Foot_R: 'RightFoot',
};
export const ATHLETE_CLIPS = ['idle', 'ready', 'jog', 'run', 'sprint', 'shot', 'shot-b', 'pass', 'header', 'throw', 'reach', 'celebrate', 'sit'];
const LOCO = ['jog', 'run', 'sprint'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let restartData;
/** One local request shared by every athlete. No script, worker or eval is used. */
export function loadSoccerRestartMotion(){
  return restartData??=fetch(new URL('../design/motion2/soccer.json',import.meta.url)).then(r=>{if(!r.ok)throw Error(`Soccer restart motion: ${r.status}`);return r.json();});
}
/** Retarget the canonical authored restart pack once to the adult rig. The
 * target's diagonal bind limbs need their own basis; copying rotations would
 * leave the wrists beside the head instead of above it. */
export function compileAthleteRestartClips(T,root,data){
  if(!data)return [];
  const map={Root:null,Hips:'Hips',Spine:'Spine',Chest:'Spine1',Neck:'Neck',Head:'Head',LeftArm:'LeftArm',LeftForeArm:'LeftForeArm',LeftHand:'LeftHand',RightArm:'RightArm',RightForeArm:'RightForeArm',RightHand:'RightHand',LeftUpLeg:'LeftUpLeg',LeftLeg:'LeftLeg',LeftFoot:'LeftFoot',RightUpLeg:'RightUpLeg',RightLeg:'RightLeg',RightFoot:'RightFoot'};
  const reverse=Object.fromEntries(Object.entries(map).filter(([,v])=>v).map(([a,b])=>[b,a])),bones=[],saved=[],basis={},sourceBones=data.skeleton.bones,sourceByName=Object.fromEntries(sourceBones.map(b=>[b.name,b]));
  root.traverse(b=>{if(b.isBone){bones.push(b);saved.push({b,q:b.quaternion.clone(),p:b.position.clone()});}});
  const V=a=>new T.Vector3().fromArray(a),Q=a=>new T.Quaternion().fromArray(a).normalize();
  for(const b of bones){const name=reverse[b.name],child=name&&sourceBones.find(q=>q.parent===name),targetChild=child&&root.getObjectByName(map[child.name]);basis[b.name]=child&&targetChild?new T.Quaternion().setFromUnitVectors(targetChild.position.clone().normalize(),V(child.restTranslationMeters).normalize()):b.quaternion.clone();}
  const hips=root.getObjectByName('Hips'),left=root.getObjectByName('LeftFoot'),right=root.getObjectByName('RightFoot'),point=new T.Vector3();
  root.updateMatrixWorld(true);const floor=Math.min(left?.getWorldPosition(point).y??0,right?.getWorldPosition(point).y??0),verticalScale=root.getWorldScale(point).y||1,hipScale=(hips?.position.y||.86)/sourceByName.Hips.restTranslationMeters[1],clips=[];
  for(const [kind,state]of Object.entries(data.states)){
    const times=state.keyframes.map(f=>f.time*state.durationSeconds),values=Object.fromEntries(bones.map(b=>[b.name,[]])),positions=[];
    for(const frame of state.keyframes){
      const source={},world={};
      for(const b of sourceBones)source[b.name]=(b.parent?source[b.parent].clone():new T.Quaternion()).multiply(Q(frame.rotations[b.name]));
      for(const b of bones){
        const name=reverse[b.name],parent=b.parent?.isBone?world[b.parent.name]:new T.Quaternion();
        world[b.name]=name?source[name].clone().multiply(basis[b.name]):parent.clone().multiply(saved.find(x=>x.b===b).q);
        b.quaternion.copy(parent).invert().multiply(world[b.name]);
        const a=values[b.name],last=a.length;if(last&&b.quaternion.x*a[last-4]+b.quaternion.y*a[last-3]+b.quaternion.z*a[last-2]+b.quaternion.w*a[last-1]<0)b.quaternion.set(-b.quaternion.x,-b.quaternion.y,-b.quaternion.z,-b.quaternion.w);
        a.push(...b.quaternion.toArray());
      }
      const bind=saved.find(x=>x.b===hips).p,off=frame.hipsOffsetMeters||[0,0,0];hips.position.copy(bind).addScaledVector(V(off),hipScale);root.updateMatrixWorld(true);
      const low=Math.min(left?.getWorldPosition(point).y??floor,right?.getWorldPosition(point).y??floor);hips.position.y+=Math.max(0,floor-low)/verticalScale;
      positions.push(...hips.position.toArray());
    }
    const tracks=bones.map(b=>new T.QuaternionKeyframeTrack(`${b.name}.quaternion`,times,values[b.name]));tracks.push(new T.VectorKeyframeTrack('Hips.position',times,positions));
    const clip=new T.AnimationClip('restart-'+kind,state.durationSeconds,tracks);clip.userData={restart:kind,contact:state.events.find(e=>(e.name||e.event)==='visual_release').atSeconds};clips.push(clip);
  }
  for(const {b,q,p}of saved){b.quaternion.copy(q);b.position.copy(p);}root.updateMatrixWorld(true);return clips;
}
/** Pure weight solver (unit-tested): speed in m/s -> locomotion and idle weights. */
export function locomotionWeights(speed, sprinting, m, out = {}) {
  const moving = smooth(m.idleSpeed, m.moveSpeed, speed);
  let jog = 1 - smooth(m.jogSpeed, m.runSpeed, speed), sprint = smooth(m.runSpeed, m.sprintSpeed, speed);
  if (sprinting) sprint = Math.max(sprint, smooth(m.idleSpeed, m.runSpeed, speed));
  const run = Math.max(0, 1 - jog - sprint), sum = jog + run + sprint || 1;
  out.still = 1 - moving; out.jog = moving * jog / sum; out.run = moving * run / sum; out.sprint = moving * sprint / sum; return out;
}
/** Phase rate (cycles per second) that keeps planted feet under the body, capped so
 * very fast arcade speeds do not turn into a blur of steps. */
export function strideRate(speed, weights, clips, m) { return strideWarp(speed, weights, clips, m).rate; }
/** Faster than the clip: share the difference between cadence and a longer stride (the
 * leg IK lengthens the step by `warp` along the facing), like stride warping in sports games. */
export function strideWarp(speed, weights, clips, m, out = {rate: 0, warp: 1}) {
  let stride = 0, period = 0, total = 0;
  for (const c of LOCO) { const w = weights[c]; if (w <= 0) continue; stride += w * clips[c].speed * clips[c].duration; period += w * clips[c].duration; total += w; }
  if (!total) { out.rate = 1 / clips.jog.duration; out.warp = 1; return out; }
  stride /= total; period /= total;
  const ratio = speed / stride * period, warp = clamp(Math.pow(Math.max(1, ratio), m.strideShare ?? 0), 1, m.maxStride ?? 1);
  out.rate = clamp(speed / stride / warp, m.minRate / period, m.maxRate / period); out.warp = warp; return out;
}
export function createAthleteMotion(T, mixer, clips, m) {
  const actions = {}, weights = {}, info = {};
  for (const name of [...ATHLETE_CLIPS,...clips.filter(c=>c.userData?.restart).map(c=>c.name)]) {
    const clip = clips.find(c => c.name === name); if (!clip) continue;
    const action = mixer.clipAction(clip); action.enabled = true; action.setEffectiveWeight(0); action.play();
    const loop = LOCO.includes(name) || ['idle', 'ready', 'celebrate'].includes(name);
    if (!loop) { action.setLoop(T.LoopOnce, 1); action.clampWhenFinished = true; }
    actions[name] = action; weights[name] = 0;
    info[name] = {duration: clip.duration, speed: m.clipSpeeds[name] || 0, contact: m.contacts[name] ?? 0};
  }
  for (const c of LOCO) actions[c].timeScale = 0;
  // Absolute base pose. three.js skips writing a property whose mixed value did not change
  // (every track when dt is 0, constant tracks on live frames), so the additive layers that
  // run after the mixer (head look, leg IK, ball hold) would stack on their own previous
  // result. The bones are reset to the last clean mixer pose before each mixer update.
  const pose = [];
  mixer.getRoot().traverse(o => { if (o.isBone) pose.push({bone: o, q: o.quaternion.clone(), p: o.position.clone()}); });
  let poseSaved = false;
  let phase = 0, shot = null, lastKick = 0, lastSteal = 0, lastHeader = 0, lastThrow = 0, lastDive = 0, shotIndex = 0;
  // Reused every frame: the blend targets and the returned summary (no per-player garbage).
  const target = Object.fromEntries(Object.keys(actions).map(k => [k, 0])), names = Object.keys(actions), result = {speed: 0, phase: 0, rate: 0, warp: 1, oneShot: null}, locoOut = {still: 0, jog: 0, run: 0, sprint: 0}, cadenceOut = {rate: 0, warp: 1};
  const start = (name, at, rate, weight = 1, fadeIn = m.fadeIn) => { const a = actions[name]; if (!a) return; a.reset(); a.time = clamp(at, 0, info[name].duration); a.timeScale = rate; a.play(); shot = {name, weight, rate, fadeIn}; };
  return {
    actions, weights,
    get oneShot() { return shot?.name || null; },
    /** p: simulated player, s: state, mode: playerAnimation mode, dt: animation seconds. */
    update(p, s, mode, dt, options = {}) {
      const speed = hypot2(p.vx, p.vz), sprinting = p.id === s.controlled ? s.sprint?.active : p.sprinting;
      // --- one-shot triggers (edge detected on the simulation timers) ---
      // Throws and keeper releases also start a kick timer, so they are matched first.
      const restart=p.restartMotion,restartName=restart&&'restart-'+restart.kind,restartAction=actions[restartName];
      if(restartAction){
        if(shot?.name!==restartName)start(restartName,0,0,1,.045);
        restartAction.timeScale=0;restartAction.time=clamp(restart.elapsed,0,info[restartName].duration);
      }else if(shot?.name?.startsWith('restart-'))shot=null;
      else if (p.throwTime > lastThrow + 1e-6) start('throw', m.throwStart, m.throwRate);
      else if (p.headerTime > lastHeader + 1e-6) start('header', m.headerTakeoff, info.header.duration / Math.max(0.3, p.headerTime + 0.55));
      else if (p.diveTime > lastDive + 1e-6) start('reach', m.reachStart, 1.25);
      else if (p.kickTime > lastKick + 1e-6 && p.throwTime <= 0) {
        const ball = hypot2(s.ball.vx, s.ball.vz), power = (s.ball.shot?.shooter === p.id && ball > m.shotBallSpeed * 0.6) || (s.ball.lastPlayer === p.id && ball > m.shotBallSpeed);
        const name = power ? (shotIndex++ % 2 ? 'shot-b' : 'shot') : 'pass';
        start(name, info[name].contact - m.contactLead, power ? 1.1 : 1.2, 1, m.kickFadeIn);
      } else if (p.stealTime > lastSteal + 1e-6) start('pass', info.pass.contact - 0.14, 1.5, 0.85);
      lastKick = p.kickTime; lastSteal = p.stealTime; lastHeader = p.headerTime; lastThrow = p.throwTime; lastDive = p.diveTime;
      if (shot && !restartAction && !actions[shot.name].isRunning() && actions[shot.name].time >= info[shot.name].duration - 1e-3) shot = null;
      if (shot && (shot.name === 'shot' || shot.name === 'shot-b' || shot.name === 'pass') && p.kickTime <= 0 && p.stealTime <= 0 && actions[shot.name].time > info[shot.name].contact + 0.45) shot = null;
      if (shot && shot.name === 'header' && p.headerTime <= 0 && actions.header.time > info.header.duration - 0.25) shot = null;
      if (shot && shot.name === 'throw' && p.throwTime <= 0 && actions.throw.time > m.throwStart + 0.75) shot = null;
      if (shot && shot.name === 'reach' && p.diveTime <= 0 && p.catchTime <= 0 && !p.hands) shot = null;
      // --- targets ---
      for (const k of names) target[k] = 0;
      let top = 0;
      if (mode === 'celebrate') { target.celebrate = 1; top = 1; }
      else if (mode === 'slide' || mode === 'recover') { target.sit = options.slide ?? 1; top = target.sit; }
      if (shot && !top) { target[shot.name] = shot.weight; top = shot.weight; }
      // Charging a kick: hold the back-swing of the coming pass/shot over the run.
      if (!top && options.charge > 0) { const name = options.chargeKind === 'pass' ? 'pass' : 'shot', a = actions[name]; a.timeScale = 0; a.time = info[name].contact * (0.35 + 0.5 * options.charge); target[name] = 0.3 + 0.55 * options.charge; top = target[name]; }
      const loco = locomotionWeights(speed, sprinting, m, locoOut), base = 1 - top;
      const ready = (p.role === 'keeper' || options.marking) && speed < m.runSpeed ? 1 : 0;
      target.idle = loco.still * base * (1 - ready); target.ready = loco.still * base * ready;
      for (const c of LOCO) target[c] = loco[c] * base;
      // Turning on the spot: step through a slow jog so the feet turn with the body.
      const turnStep = !p.hands && m.turnStepWeight ? clamp((Math.abs(options.turnRate || 0) - m.turnStepFrom) / m.turnStepRange, 0, 1) * m.turnStepWeight * loco.still : 0;
      if (turnStep > 0) { target.jog += turnStep * base; target.idle *= 1 - turnStep; target.ready *= 1 - turnStep; }
      if (p.hands && speed <= m.idleSpeed) { target.idle = base; target.ready = 0; }
      // --- shared phase for locomotion ---
      const cadence = strideWarp(Math.max(speed, m.idleSpeed), loco, info, m, cadenceOut), rate = Math.max(cadence.rate, turnStep > 0 ? m.turnStepRate * Math.min(1, turnStep * 4) : 0);
      phase = (phase + dt * rate) % 1;
      for (const c of LOCO) actions[c].time = phase * info[c].duration;
      // --- smooth weights ---
      for (const k of names) {
        const tau = target[k] > weights[k] ? (shot?.name === k ? shot.fadeIn : m.fadeIn) : m.fadeOut, w = weights[k] + (target[k] - weights[k]) * (1 - Math.exp(-dt / tau));
        weights[k] = w < 1e-3 && target[k] === 0 ? 0 : w;
        actions[k].setEffectiveWeight(weights[k]);
      }
      if (poseSaved) for (const b of pose) { b.bone.quaternion.copy(b.q); b.bone.position.copy(b.p); }
      mixer.update(dt);
      for (const b of pose) { b.q.copy(b.bone.quaternion); b.p.copy(b.bone.position); }
      poseSaved = true;
      result.speed = speed; result.phase = phase; result.rate = rate; result.warp = cadence.warp * (1 - loco.still); result.oneShot = shot?.name || null;
      return result;
    },
  };
}

const _q = [], _v = [];
/** Additive head and neck turn toward a world point (the ball), applied after the mixer.
 * Limited to a natural range and eased so the head never snaps. */
export function athleteLook(T, character, point, dt, m) {
  const head = character.bones.Head?.bone, neck = character.root.getObjectByName('Neck1');
  if (!head || !neck) return;
  if (!_q.length) _q.push(new T.Quaternion(), new T.Quaternion(), new T.Quaternion(), new T.Quaternion()), _v.push(new T.Vector3(), new T.Vector3(), new T.Vector3());
  const qa = _q[0], qb = _q[1], qc = _q[2], qd = _q[3], eye = _v[0], dir = _v[1], fwd = _v[2];
  character.pivot.updateMatrixWorld(true);
  head.getWorldPosition(eye); dir.set(point.x - eye.x, (point.y ?? 0) - eye.y, point.z - eye.z);
  const yaw0 = character.yaw ?? 0, flat = hypot2(dir.x, dir.z) || 1;
  let yaw = Math.atan2(dir.x, dir.z) - yaw0; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = Math.atan2(-dir.y, flat) - m.lookRestPitch;
  const want = {yaw: Math.abs(yaw) > m.lookMaxYaw * 1.6 ? 0 : clamp(yaw, -m.lookMaxYaw, m.lookMaxYaw), pitch: clamp(pitch, -m.lookMaxPitch, m.lookMaxPitch)};
  const look = character.look ||= {yaw: 0, pitch: 0}, k = 1 - Math.exp(-dt / m.lookEase);
  look.yaw += (want.yaw - look.yaw) * k; look.pitch += (want.pitch - look.pitch) * k;
  const weight = character.lookWeight ?? 1;
  for (let i = 0; i < 2; i++) {
    const bone = i ? head : neck, share = i ? 0.6 : 0.4;
    // world-space yaw about +Y and pitch about the body's side axis, converted into the bone's parent frame
    fwd.set(Math.cos(yaw0), 0, -Math.sin(yaw0));
    qa.setFromAxisAngle(fwd, look.pitch * share * weight); qb.setFromAxisAngle(_v[1].set(0, 1, 0), look.yaw * share * weight); qa.premultiply(qb);
    bone.parent.getWorldQuaternion(qc);
    qd.copy(qc).invert().multiply(qa).multiply(qc);
    bone.quaternion.premultiply(qd);
    bone.updateMatrixWorld(true);
  }
}
