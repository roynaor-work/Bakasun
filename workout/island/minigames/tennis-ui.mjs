import {pointLabels} from './tennis.mjs?v=island-v2-20261107-8';
// Broadcast-style point cells: 40/40 at deuce, AD beside the leader only.
export function tennisScoreCells(score,rules){return pointLabels(score,rules).map(v=>v==='deuce'?'40':v==='advantage'?'AD':String(v));}
/** Event feedback describes the actual outcome; proximity alone is never a hit. */
export function tennisEventFeedback(state){
 const e=state.feedback||state.event||{},kind=e.kind||e.type;
 if(kind==='hit'&&e.side===0)return {mode:'hit',key:e.edge?'edge':'hit'};
 if(kind==='missSwing')return {mode:'miss',key:['height','bounce','side','turn'].includes(e.reason)?e.reason:e.reason==='timing'?(state.contact?.eta>0?'early':'late'):'miss'};
 if(kind==='timing')return {mode:'miss',key:state.contact?.eta>0?'early':'late'};
 if(['point','game','complete','fault'].includes(kind)){
  if(e.reason==='net'||e.impact==='net')return {mode:'miss',key:'net'};
  if(e.reason==='out'||e.impact==='out')return {mode:'miss',key:'out'};
  if(e.winner!==undefined)return {mode:e.winner===0?'hit':'miss',key:e.winner===0?'pointFor':'pointAgainst'};
 }
 return null;
}
export function tennisLiveFeedback(state){
 if(['serve','toss'].includes(state.phase))return {mode:'serve',key:state.server===0?'serve':'incoming'};
 if(state.players?.[0]?.preparing)return {mode:'prepare',key:state.assist?.active?'assist':'prepare'};
 if(state.phase==='rally'&&(state.contactWindow?.eligible||state.contact?.side===0&&state.contact.eta>=-state.timingWindow/2&&state.contact.eta<.85))return {mode:'incoming',key:'incoming'};
 return {mode:'rally',key:'rally'};
}
export function tennisIcon(kind){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');
 const paths={hit:'M5 25 13 17 M12 7 C17 1 28 5 27 13 C26 21 17 24 12 19 C8 15 8 11 12 7 M13 8 24 17 M10 12 21 20 M17 5 12 18 M22 7 17 21',serve:'M9 27 9 20 M5 23 9 19 13 23 M22 15 22 5 M18 9 22 4 26 9 M15 27 20 21 M19 17 C23 13 29 18 27 22 C25 27 20 28 18 24',lob:'M4 25 C6 2 25 2 28 22 M23 19 28 23 30 17 M8 26 13 21'};
 paths.drop='M4 14 Q12 2 19 16 Q21 22 27 23 M23 19 27 23 23 27 M4 27 H17 M10 22 V30';
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}

/** Timing rating as a pictogram (no words): star = perfect, ring = good, down arrow = early, up arrow = late. */
export function ratingIcon(kind){
 const shapes={perfect:'<path d="M14 2l3.6 7.6 8.4 1-6.2 5.8 1.7 8.3L14 20.4 6.5 24.7l1.7-8.3L2 10.6l8.4-1z" fill="#ffd16f" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>',good:'<circle cx="14" cy="14" r="9" fill="none" stroke="#67d398" stroke-width="3.2"/>',early:'<path d="M14 5v15M7 14l7 7 7-7" fill="none" stroke="#efc355" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',late:'<path d="M14 23V8M7 14l7-7 7 7" fill="none" stroke="#efc355" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'};
 return `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">${shapes[kind]||''}</svg>`;
}
