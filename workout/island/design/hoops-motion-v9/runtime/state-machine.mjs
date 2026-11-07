/**
 * Presentation transition policy for the original v9 clips. The game alone owns
 * possession, scoring and physics. Only a newer authoritative possession epoch
 * can clear the dribble-ended latch; clip events never change game authority.
 */
import {CATALOG,CLIPS,CLIP_IDS} from './catalog.mjs';
const choose=predicate=>Object.freeze(CATALOG.filter(predicate).map(c=>c.id));
export const DRIBBLE_STATES=choose(c=>c.ball&&(['gait','cut'].includes(c.kind)||['crossover','between_legs','hesitation'].includes(c.kind)));
export const SHOT_STATES=choose(c=>['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(c.kind));
export const RECEIVE_STATES=choose(c=>['rebound','rebound_land','dive'].includes(c.kind));
export const PASS_STATES=Object.freeze([]); // v8's passing clips remain in v8, not copied here.
export const STATE_IDS=Object.freeze(['idle',...CLIP_IDS]);
const dribble=new Set(DRIBBLE_STATES),shot=new Set(SHOT_STATES),incoming=new Set(RECEIVE_STATES);
const held=choose(c=>c.ball&&!dribble.has(c.id)&&!shot.has(c.id)&&!incoming.has(c.id));
const empty=choose(c=>!c.ball);
const defense=choose(c=>['defensive_stance','slide','closeout','block','steal','deflect'].includes(c.kind));
const recovery=choose(c=>['get_up'].includes(c.kind));
const fall=choose(c=>c.kind==='dive');
const possessionActions=new Set(CATALOG.filter(c=>c.ball&&!incoming.has(c.id)).map(c=>c.id));
const gather=new Set(CATALOG.filter(c=>c.kind==='brake'&&c.ball||shot.has(c.id)).map(c=>c.id));
const unique=values=>[...new Set(values)];
// Expanding these named action families produces a concrete, exported edge map.
// There is no wildcard edge and finishing a clip never makes a transition.
const next={idle:unique([...empty,...DRIBBLE_STATES,...held,...SHOT_STATES,...RECEIVE_STATES])};
for(const c of CATALOG){
 if(c.kind==='dive')next[c.id]=unique([...recovery,'idle']);
 else if(c.kind==='get_up')next[c.id]=unique([...empty,...RECEIVE_STATES,'idle']);
 else if(shot.has(c.id))next[c.id]=unique([...defense,...empty,...RECEIVE_STATES,'idle']);
 else if(dribble.has(c.id))next[c.id]=unique([...DRIBBLE_STATES,...held,...SHOT_STATES,...defense,...fall,'idle']);
 else if(incoming.has(c.id))next[c.id]=unique([...held,...DRIBBLE_STATES,...SHOT_STATES,...empty,...RECEIVE_STATES,'idle']);
 else next[c.id]=unique([...empty,...held,...DRIBBLE_STATES,...SHOT_STATES,...RECEIVE_STATES,'idle']);
}
export const TRANSITION_GRAPH=Object.freeze(Object.fromEntries(STATE_IDS.map(id=>[id,Object.freeze(next[id])])));
export const LEGAL_TRANSITIONS=Object.freeze(STATE_IDS.flatMap(from=>next[from].map(to=>Object.freeze({from,to,requiresPossession:possessionActions.has(to),requiresDribbleAvailable:dribble.has(to)}))));
export function effectiveTransitionGraph(context={}){
 const ownsBall='owner'in context?context.owner==='self':context.hasPossession===true;
 return Object.freeze(Object.fromEntries(STATE_IDS.map(from=>[from,Object.freeze(next[from].filter(to=>(!possessionActions.has(to)||ownsBall)&&(!dribble.has(to)||!context.dribbleEnded)))])));
}
export function createStateMachine({initialState='idle',possession}={}){
 if(!STATE_IDS.includes(initialState))throw new RangeError(`Unknown initial state: ${initialState}`);
 let state=initialState,epoch=-1,owner=null,started=dribble.has(initialState),ended=gather.has(initialState);
 const snapshot=()=>Object.freeze({state,possessionEpoch:epoch<0?null:epoch,owner,hasPossession:owner==='self',dribbleStarted:started,dribbleEnded:ended});
 function authorizePossession(context){
   if(!context||typeof context!=='object')throw new TypeError('An authoritative possession context is required');
   if(!Number.isSafeInteger(context.epoch)||context.epoch<0)throw new TypeError('Possession epoch must be a nonnegative safe integer');
   if(context.epoch<=epoch)throw new RangeError('Possession epoch must increase; replay cannot clear the dribble lock');
   if(!['self','other',null].includes(context.owner))throw new TypeError('Possession owner must be self, other or null');
   epoch=context.epoch;owner=context.owner;started=false;ended=false;return snapshot();
 }
 function canTransition(to){
   if(!STATE_IDS.includes(to))return Object.freeze({ok:false,reason:'unknown-state'});
   if(!next[state].includes(to))return Object.freeze({ok:false,reason:'edge-not-listed'});
   if(possessionActions.has(to)&&owner!=='self')return Object.freeze({ok:false,reason:'authoritative-possession-required'});
   if(dribble.has(to)&&ended)return Object.freeze({ok:false,reason:'dribble-ended-this-possession'});
   return Object.freeze({ok:true,reason:null});
 }
 function transition(to){const result=canTransition(to);if(!result.ok)return Object.freeze({...result,...snapshot()});if(gather.has(to)||started&&!dribble.has(to))ended=true;if(dribble.has(to))started=true;state=to;return Object.freeze({...result,...snapshot()});}
 if(possession){authorizePossession(possession);started=dribble.has(initialState);ended=gather.has(initialState);}
 return Object.freeze({get state(){return state;},get context(){return snapshot();},snapshot,authorizePossession,canTransition,transition,effectiveGraph(){return effectiveTransitionGraph(snapshot());},legalNext(){return Object.freeze(next[state].map(to=>Object.freeze({to,...canTransition(to)})));},handlePresentationEvent(event){if(!event||event.domain!=='presentation')throw new TypeError('Expected a presentation event');return snapshot();}});
}
