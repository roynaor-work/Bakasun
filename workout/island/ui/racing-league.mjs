/** Racing league screens (07/11/2026): the entry card on the racing stage map, season and table, the upgrade shop and the race result.
 * Loaded on demand from ui/activity.mjs the first time the racing menu opens, so the cold start never pays for it.
 * Every change goes through engine.racingLeague (validates, saves, refuses while a game runs). Hebrew, 56px targets, no hidden info. */
import {UPGRADES,UPGRADE_COST,MAX_LEVEL,PRIZE,POINTS,SEASONS,seasonStages,equipmentFor,DRIVERS} from '../minigames/racing-league-core.mjs?v=island-v2-20261107-5';
import {getRacingStage} from '../minigames/racing-tracks.mjs?v=island-v2-20261107-5';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;if(text!=='')n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const num=v=>{const n=el('bdi','',String(v));n.dir='ltr';return n;};
/** Shop order and what each part does, in plain words. */
export const SHOP=Object.freeze([
  ['engine','האצה ומהירות שיא'],['brakes','בלימה מאוחרת לפני פניות'],['aero','יציבות במהירות גבוהה'],['steering','תגובת הגה'],['tires','אחיזה בפניות']]);
export function ensureLeagueStyle(root=document.head){
  if(document.querySelector('link[data-racing-league-css]'))return;
  const link=el('link');link.rel='stylesheet';link.dataset.racingLeagueCss='true';link.href=new URL('./racing-league.css?v=island-v2-20261107-5',import.meta.url).href;root.append(link);
}
const trackOf=(seasonId,race)=>getRacingStage(seasonStages(seasonId)[race]).name;
const ordinal=place=>`מקום ${place}`;

/** Row of the six races of the season: finished (with place), the next one, and the locked rest. */
function raceStrip(league){
  const s=league.season,list=el('ol','rl-races');
  seasonStages(s).forEach((stageId,i)=>{
    const done=league.history.filter(h=>h.season===s&&h.race===i).at(-1),item=el('li','rl-race');item.title=getRacingStage(stageId).name;
    item.dataset.state=done?'done':i===league.race?'next':'locked';
    item.append(el('span','rl-race-no',String(i+1)),el('span','rl-race-name',getRacingStage(stageId).name));
    item.append(done?el('span','rl-race-result',`${ordinal(done.place)} · ${done.points} נק׳`):el('span','rl-race-result',i===league.race?'המרוץ הבא':'נעול'));
    list.append(item);
  });
  return list;
}
function standingsTable(rows){
  const table=el('table','rl-table'),head=el('tr');for(const h of ['#','נהג','נקודות'])head.append(el('th','',h));table.append(head);
  rows.forEach((r,i)=>{const tr=el('tr');if(r.id==='player')tr.className='mine';const pts=el('td');pts.append(num(r.points));tr.append(el('td','',String(i+1)),el('td','',r.name),pts);table.append(tr);});
  return table;
}
/** Short, honest status line under the title. */
function statusLine(sum){
  if(!sum.done)return `מרוץ ${sum.race+1} מתוך ${sum.total} · מקום ${sum.place} בטבלה`;
  if(sum.finalSeason)return `העונה האחרונה הסתיימה · מקום ${sum.place} בטבלה`;
  return sum.gate.ok?`העונה הסתיימה במקום ${sum.place} · ${sum.gate.name} נפתחת`:`העונה הסתיימה במקום ${sum.place} · ${sum.gate.name} נפתחת ממקום ${sum.gate.minRank} ומעלה`;
}

/** The big start card on the racing stage map. `go`: start the next race. `season`/`shop`: open the screens. `refresh`: re-render the map. */
export function leagueCard({engine,go,season,shop,refresh}){
  ensureLeagueStyle();
  const sum=engine.racingLeague.summary(),next=engine.racingLeague.next(),root=el('section','rl-card');root.dataset.racingLeague='true';
  const head=el('div','rl-head'),title=el('h3','',`ליגת המירוצים · ${sum.season.name}`),coins=el('span','rl-coins');coins.append(num(sum.coins),document.createTextNode(' מטבעות'));
  head.append(title,coins);root.append(head,el('p','rl-line',statusLine(sum)));
  if(next)root.append(el('p','rl-next',`${next.track} · ${next.laps} הקפות · נהגי ${DRIVERS.map(d=>d.name).join(', ')}`));
  const actions=el('div','rl-actions');
  if(next)actions.append(button('למרוץ הבא','racing-league-go',go,'primary-button'));
  else if(sum.done&&!sum.finalSeason&&sum.gate.ok)actions.append(button(`לפתוח את ${sum.gate.name}`,'racing-league-next-season',()=>{const r=engine.racingLeague.nextSeason();if(r.ok)refresh();},'primary-button'));
  actions.append(button('טבלה ועונה','racing-league-season',season),button('שדרוג הרכב','racing-league-shop',shop));
  root.append(actions,raceStrip(engine.state.islandRacingLeague));return root;
}

/** Season screen body: races, table, and what unlocks the next season. */
export function seasonBody({engine,go}){
  ensureLeagueStyle();
  const sum=engine.racingLeague.summary(),l=engine.state.islandRacingLeague,root=el('section','rl-season');root.dataset.racingSeason='true';
  root.append(el('p','rl-line',statusLine(sum)),raceStrip(l),standingsTable(sum.table));
  const gates=el('ul','rl-gates');
  SEASONS.forEach(s=>{const open=s.id<=l.season,li=el('li','rl-gate');li.dataset.open=String(open);
    const rule=s.minRank?`נפתחת ממקום ${s.minRank} ומעלה בעונה הקודמת`:'פתוחה מההתחלה';
    li.append(el('strong','',s.name),el('span','',`${s.laps} הקפות · ${rule}`),el('em','',open?(s.id===l.season?'כרגע':'נפתחה'):'נעולה'));gates.append(li);});
  root.append(el('h4','','עונות'),gates,el('p','rl-line',`נקודות לפי מקום: ${POINTS.join(' · ')} (ועוד נקודה להקפה המהירה). נקודות כולל בכל העונות: ${sum.career}`));
  if(engine.racingLeague.next())root.append(button('למרוץ הבא','racing-league-go',go,'primary-button'));
  return root;
}

/** Shop body: five parts, five levels each, paid with league coins. */
export function shopBody({engine,refresh}){
  ensureLeagueStyle();
  const l=engine.state.islandRacingLeague,root=el('section','rl-shop');root.dataset.racingShop='true';
  const bar=el('p','rl-coins-bar');bar.append('מטבעות ליגה: ',num(l.coins));const note=el('p','rl-line');note.setAttribute('role','status');root.append(bar,note);
  const eq=equipmentFor(l.upgrades);
  for(const [key,what] of SHOP){
    const spec=UPGRADES[key],level=l.upgrades[key],row=el('article','rl-part');row.dataset.part=key;row.dataset.level=String(level);
    const pips=el('span','rl-pips');pips.setAttribute('role','img');pips.setAttribute('aria-label',`רמה ${level} מתוך ${MAX_LEVEL}`);
    for(let i=0;i<MAX_LEVEL;i++){const p=el('i','rl-pip');if(i<level)p.className='rl-pip on';pips.append(p);}
    const gain=Math.round((eq[spec.key]-1)*100);
    const what2=el('span','rl-part-what',what);if(gain){const g=el('bdi','rl-gain',`+${gain}%`);g.dir='ltr';what2.append(' · ',g);}row.append(el('strong','rl-part-name',spec.name),pips,what2);
    const cost=level>=MAX_LEVEL?null:UPGRADE_COST[level],buy=button(cost===null?'רמה מקסימלית':`שדרוג ב-${cost}`,'racing-league-buy',()=>{const r=engine.racingLeague.buy(key);if(r.ok)refresh();else note.textContent=r.reason==='coins'?`חסרים ${r.need} מטבעות לשדרוג הזה`:'אי אפשר לשדרג עכשיו';},'primary-button');
    buy.dataset.part=key;buy.disabled=cost===null||l.coins<cost;row.append(buy);root.append(row);
  }
  root.append(el('p','rl-line','מטבעות הליגה מגיעים רק ממרוצי ליגה ונפרדים מכסף האי. השדרוגים נשמרים בין עונות.'));
  return root;
}

/** Result card after a league race: place, points, coins, and where the season stands now. */
export function resultBody({engine,result,go,season,shop,refresh}){
  ensureLeagueStyle();
  const r=result.league,sum=engine.racingLeague.summary(),root=el('section','rl-result');root.dataset.racingLeagueResult='true';
  const medal=el('div','rl-medal',String(r.place));medal.dataset.place=String(r.place);medal.setAttribute('aria-label',ordinal(r.place));
  const rows=el('div','rl-rows');
  // numbers are LTR islands; text that mixes Hebrew and numbers stays in the page direction
  for(const [key,label,value,plain] of [['place','מקום',`${r.place} / 5`],['points','נקודות במרוץ',`+${r.points}`],['coins','מטבעות ליגה',`+${r.coins}`],['table','מקום בטבלה',`${sum.place} · ${sum.points} נק׳`,true],['season',`${sum.season.name}`,sum.done?'הסתיימה':`מרוץ ${sum.race} מתוך ${sum.total}`,true]]){
    const row=el('p','result-row');row.dataset.leagueRow=key;row.append(el('span','',label),plain?el('span','',value):num(value));rows.append(row);}
  const main=el('div','rl-result-main');main.append(medal,rows);
  const actions=el('div','rl-actions');let note=null;
  if(engine.racingLeague.next())actions.append(button('למרוץ הבא','racing-league-go',go,'primary-button'));
  else if(sum.done&&!sum.finalSeason&&sum.gate.ok)actions.append(button(`לפתוח את ${sum.gate.name}`,'racing-league-next-season',()=>{const x=engine.racingLeague.nextSeason();if(x.ok)refresh();},'primary-button'));
  else note=el('p','rl-line',statusLine(sum));
  actions.append(button('טבלה ועונה','racing-league-season',season),button('שדרוג הרכב','racing-league-shop',shop));
  root.append(main,actions);if(note)root.append(note);root.append(standingsTable(sum.table));return root;
}
export {PRIZE};
