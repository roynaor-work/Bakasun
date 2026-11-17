import { CLIP_DATA } from './data/clips.mjs';
import { freeze } from './math.mjs';

export const API_VERSION='1.0.0';
export const HUBS=freeze({field:'soccer-run-cycles-v3:idle_relaxed',keeper:'soccer-keeper-motion-v3:keeper_ready',referee:'soccer-run-cycles-v3:referee_idle'});
const keeperNames=/^(keeper_|dive_|catch_|punch$|save_with_foot$|getup_keeper_)/;
function roleOf(c){if(/referee/.test(c.sourceId))return 'referee';if(c.role==='keeper'||c.role==='goalkeeper'||keeperNames.test(c.sourceId))return 'keeper';return 'field';}
function kindOf(c){
  if(/^getup_|scissor_land_getup/.test(c.sourceId))return 'recovery';
  if(c.sourceId==='keeper_shuffle')return 'move';
  if(/_to_/.test(c.sourceId)&&!c.loop)return 'bridge';
  if(c.loop&&(/idle/.test(c.sourceId)))return 'idle';
  if(c.loop&&roleOf(c)==='keeper')return 'ready';
  if(c.loop)return 'move';
  return 'action';
}
function priorityOf(c){if(c.kind==='recovery')return 110;if(/fall_|stumble|slide_tackle/.test(c.sourceId))return 100;if(c.role==='keeper'&&c.kind==='action')return 80;if(c.kind==='action')return 50;return 10;}
function guardsOf(c){
  const g=[`role:${c.role}`];
  if(c.loop&&c.kind==='move'&&c.speedMps>0)g.push(`maxSpeed:${c.speedMps*1.5}`);
  if(c.kind==='bridge'&&c.sourceId.startsWith('idle_to_')){
    const target=CLIP_DATA.find(d=>d.sourcePackage===c.sourcePackage&&d.sourceId===c.rawMetadata.nativeHandoff.target);
    if(target?.speedMps>0)g.push(`maxSpeed:${target.speedMps*1.5}`);
  }
  if(c.sourcePackage==='soccer-kicks-v2'||/^(volley_|scissor_backward|header_)/.test(c.sourceId))g.push('canAct');
  if(c.sourcePackage==='soccer-kicks-v2'||c.sourceId==='run_ball')g.push('hasBall');
  if(c.sourceId==='running_kick')g.push('minSpeed:2.6','maxSpeed:6.75');
  if(/keeper_(throw|punt)$/.test(c.sourceId))g.push('hasBall');
  if(c.sourcePackage==='soccer-kicks-v2'&&c.sourceId==='volley')g.push('height:0.5:1.2');
  if(c.sourcePackage==='soccer-kicks-v2'&&c.sourceId==='scissors')g.push('height:1.2:1.8','spaceForScissor');
  if(c.sourcePackage==='soccer-volley-scissor-v1'){
    if(/^volley_/.test(c.sourceId))g.push('height:0.5:1.2');
    if(/^header_/.test(c.sourceId))g.push('height:1.5:2.2');
    if(c.sourceId==='scissor_backward')g.push('height:1.2:1.8','spaceForScissor');
  }
  return g;
}
export const CLIPS=freeze(CLIP_DATA.map(c=>{
  const n={...c,role:roleOf(c),kind:kindOf(c)};n.priority=priorityOf(n);n.guards=guardsOf(n);return n;
}));
const clipsById=Object.fromEntries(CLIPS.map(c=>[c.id,c]));
export function getClip(id){if(typeof id!=='string'||!Object.hasOwn(clipsById,id))throw new RangeError(`Unknown clip: ${String(id)}`);return clipsById[id];}

const recoveryNames={slide_tackle:'getup_fast',fall_soft:'getup_soft',fall_foul:'getup_foul',dive_left:'getup_keeper_left',dive_low_left:'getup_keeper_left',dive_high_left:'getup_keeper_left',dive_right:'getup_keeper_right',dive_low_right:'getup_keeper_right',dive_high_right:'getup_keeper_right',catch_chest:'getup_keeper_left',catch_high:'getup_keeper_left',punch:'getup_keeper_right',save_with_foot:'getup_keeper_right',scissor_backward:'scissor_land_getup'};
function automaticTarget(c){
  if(recoveryNames[c.sourceId])return `${c.sourcePackage}:${recoveryNames[c.sourceId]}`;
  if(c.sourceId==='running_kick')return 'soccer-run-cycles-v3:run';
  if(c.kind==='bridge'){
    if(c.sourceId.startsWith('idle_to_'))return `${c.sourcePackage}:${c.sourceId.slice(8)}`;
    return c.role==='referee'?`${c.sourcePackage}:referee_idle`:`${c.sourcePackage}:idle_relaxed`;
  }
  return HUBS[c.role];
}
const edges=[];
function add(from,to,kind,window,blendSeconds=.18){
  if(from===to)return;
  const dest=getClip(to);
  // fall_soft begins neutral and falls in0.3s: complete the entrance blend
  // before its fastest fall interval instead of superimposing both motions.
  if(dest.sourceId==='fall_soft'&&kind==='request')blendSeconds=.12;
  const source=getClip(from);let entryPhase=source.loop&&dest.loop&&source.kind==='move'&&dest.kind==='move'?'preserve-normalized':0;
  if(kind==='automatic'&&source.rawMetadata.nativeHandoff)entryPhase=source.rawMetadata.nativeHandoff.targetPhaseSeconds/dest.duration;
  // The kicks pack's older run reference is inventoried separately. Keep its
  // documented exit time while adapting to the current4.5m/s gait by a blend.
  if(kind==='automatic'&&source.sourceId==='running_kick'){entryPhase=source.rawMetadata.exit.phase/dest.duration;blendSeconds=.3;}
  edges.push({id:`${from}>${to}:${kind}`,from,to,kind,exitWindow:window,entryPhase,blendSeconds,priority:kind==='cancel'?200:dest.priority,guards:dest.guards,queueExpirySeconds:.45,cancellation:kind==='cancel'?'early-window-only':kind.startsWith('automatic')?'mandatory':'queue-when-locked'});
}
for(const c of CLIPS){
  if(c.loop){
    for(const d of CLIPS.filter(d=>d.role===c.role&&d.id!==c.id)){
      if(d.kind==='recovery')continue;
      if(d.kind==='bridge'){
        if(d.sourceId.startsWith('idle_to_')&&c.kind!=='idle')continue;
        if(!d.sourceId.startsWith('idle_to_')&&c.sourceId!==d.sourceId.split('_to_')[0])continue;
      }
      add(c.id,d.id,'request',[0,1]);
    }
  }else{
    add(c.id,automaticTarget(c),'automatic',[1,1],c.kind==='recovery'?.22:.18);
    if(c.kind==='bridge'&&c.sourceId.startsWith('idle_to_')||c.sourceId==='running_kick')add(c.id,HUBS[c.role],'automatic-fallback',[1,1],.22);
    if(c.kind!=='recovery')add(c.id,HUBS[c.role],'cancel',[0,.14],.2);
  }
}
export const TRANSITIONS=freeze(edges);
export const GRAPH=freeze({schemaVersion:1,apiVersion:API_VERSION,hubs:HUBS,nodes:CLIPS.map(({id,sourceId,sourcePackage,duration,loop,role,kind,priority,guards,speedMps,provenance})=>({id,sourceId,sourcePackage,duration,loop,role,kind,priority,guards,speedMps,provenance})),transitions:TRANSITIONS});
export function transitionsFrom(id){getClip(id);return TRANSITIONS.filter(t=>t.from===id);}
export function guardFailures(clip,role,context={}){
  const failures=[];
  for(const g of clip.guards){
    if(g.startsWith('role:')&&role!==g.slice(5))failures.push(g);
    if(g==='hasBall'&&context.hasBall!==true)failures.push(g);
    if(g==='canAct'&&(context.grounded===false||context.canAct===false))failures.push(g);
    if(g==='spaceForScissor'&&context.spaceForScissor!==true)failures.push(g);
    if(g.startsWith('maxSpeed:')&&Number.isFinite(context.speedMps)&&context.speedMps>Number(g.slice(9))+1e-9)failures.push(g);
    if(g.startsWith('minSpeed:')&&(!Number.isFinite(context.speedMps)||context.speedMps<Number(g.slice(9))-1e-9))failures.push(g);
    if(g.startsWith('height:')){const [,lo,hi]=g.split(':').map(Number);if(!Number.isFinite(context.ballHeightMeters)||context.ballHeightMeters<lo||context.ballHeightMeters>hi)failures.push(g);}
  }
  return failures;
}
export function chooseLocomotion(speedMps,role='field'){
  if(!Number.isFinite(speedMps)||speedMps<0)throw new RangeError('speedMps must be finite and nonnegative');
  if(!Object.hasOwn(HUBS,role))throw new RangeError('unknown role');
  if(speedMps>10.8)throw new RangeError('speed exceeds supported locomotion envelope10.8m/s');
  if(role==='keeper')return speedMps<.1?HUBS.keeper:'soccer-keeper-motion-v3:keeper_shuffle';
  if(role==='referee')return speedMps<.1?HUBS.referee:'soccer-run-cycles-v3:referee_run';
  return speedMps<.1?HUBS.field:`soccer-run-cycles-v3:${speedMps<3.4?'jog':speedMps<5.8?'run':'sprint'}`;
}
