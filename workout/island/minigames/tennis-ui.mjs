import {pointLabels} from './tennis.mjs?v=island-citydetail-20261025-1';
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
