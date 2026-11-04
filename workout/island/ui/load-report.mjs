// "Last load report" for each island game: what loaded, what fell back, how long,
// and how many assets came from the device. Stored under island.<game>.lastLoadReport
// (the soccer key predates this module) so a phone test can be copied into the chat.
import {DATA_VERSION} from '../release.mjs';
import {OFFLINE_GAMES,isManagedPath} from './offline.mjs';

export const reportKey=game=>`island.${game}.lastLoadReport`;
function store(){try{return globalThis.localStorage||null;}catch{return null;}}
/** Managed assets this page requested, split into served by the worker cache and fetched from the network. */
export function assetSources(entries=globalThis.performance?.getEntriesByType?.('resource')||[]){
  let cache=0,network=0;
  for(const entry of entries){let pathname;try{pathname=new URL(entry.name).pathname;}catch{continue;}if(!isManagedPath(pathname))continue;(entry.workerStart>0&&entry.transferSize===0?cache++:network++);}
  return {cache,network};
}
const manualLines={};
/** A manual restart ("אתחול ידני N") goes into the stored report at once and into the next
 * report this page writes for the game, because the restarted session overwrites it. */
export function noteManualRestart(game,text){
  const line=`${new Date().toISOString()} · ${text}`;(manualLines[game]??=[]).push(line);
  try{const old=readGameReport(game);store()?.setItem(reportKey(game),(old?old+'\n':'')+line);}catch{}
  return line;
}
export const manualReportLines=game=>[...(manualLines[game]||[])];
/** lines: game specific lines (status, fallbacks). Returns the stored text. */
export function saveGameReport(game,{status,ms,lines=[]}){
  try{
    const {cache,network}=assetSources();
    const head=[`${OFFLINE_GAMES[game]||game} · island ${DATA_VERSION} · ${new Date().toISOString()}`,`status ${status}${ms!==undefined?` · ${Math.round(ms)} ms`:''} · assets from device ${cache} · from network ${network}`,`screen ${globalThis.innerWidth}x${globalThis.innerHeight} @${globalThis.devicePixelRatio} · saveData ${Boolean(navigator.connection?.saveData)} · online ${navigator.onLine}`,`ua ${navigator.userAgent}`];
    const text=[...head,...lines,...(manualLines[game]||[])].join('\n');store()?.setItem(reportKey(game),text);return text;
  }catch{return null;}
}
export const readGameReport=game=>{try{return store()?.getItem(reportKey(game))||null;}catch{return null;}};
/** Collapsed block with the text and a copy button. Null when there is no report yet. */
export function reportPanel(game,doc=document){
  const text=readGameReport(game);if(!text)return null;
  const details=doc.createElement('details');details.className='load-report';details.dataset.report=game;
  const summary=doc.createElement('summary');summary.textContent=`דוח הטעינה האחרון · ${OFFLINE_GAMES[game]||game}`;
  const copy=doc.createElement('button');copy.type='button';copy.className='secondary-button';copy.dataset.action='report-copy';copy.textContent='העתקה';
  copy.addEventListener('click',()=>{navigator.clipboard?.writeText(text).then(()=>{copy.textContent='הועתק';},()=>{copy.textContent='בחרו את הטקסט והעתיקו';});});
  const pre=doc.createElement('pre');pre.textContent=text;pre.dir='ltr';
  details.append(summary,copy,pre);return details;
}
