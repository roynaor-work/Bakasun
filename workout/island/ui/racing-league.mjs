/** Racing league screens (07/11/2026): the entry card on the racing stage map, season and table, the upgrade shop and the race result.
 * Loaded on demand from ui/activity.mjs the first time the racing menu opens, so the cold start never pays for it.
 * Every change goes through engine.racingLeague (validates, saves, refuses while a game runs). Hebrew, 56px targets, no hidden info.
 * racing-deep-m6 (long league): a scrolling calendar of 12-18 races with circuit, time of day, direction and length tags; a drivers' table of
 * twelve with team colours and the player's row marked; a teams' table of six; the rival box ("היריב שלכם"); the season podium with the prize at
 * the end of a season; a replay of a season that missed its gate; the "short races" setting. Numbers are large for a seven-year-old. */
import {UPGRADES,UPGRADE_COST,MAX_LEVEL,PRIZE,POINTS,SEASONS,SEASON_PRIZE,TEAM_PRIZE,equipmentFor,DRIVERS,TEAMS,LEAGUE_IDS,driverById,LONG} from '../minigames/racing-league-core.mjs?v=island-v2-20261107-11';
import {calendar,describeRace} from '../minigames/racing-league.mjs?v=island-v2-20261107-11';
import {getRacingStage} from '../minigames/racing-tracks.mjs?v=island-v2-20261107-11';
import {leagueArtEnabled,crestImg,trophyImg,medalImg,markArt} from './racing-league-art.mjs?v=island-v2-20261107-11';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;if(text!=='')n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const num=v=>{const n=el('bdi','',String(v));n.dir='ltr';return n;};
/** Shop order and what each part does, in plain words. */
export const SHOP=Object.freeze([
  ['engine','האצה ומהירות שיא'],['brakes','בלימה מאוחרת לפני פניות'],['aero','יציבות במהירות גבוהה'],['steering','תגובת הגה'],['tires','אחיזה בפניות'],['ers','מאגר אנרגיה גדול יותר לניטרו']]);
export function ensureLeagueStyle(root=document.head){
  if(document.querySelector('link[data-racing-league-css]'))return;
  const link=el('link');link.rel='stylesheet';link.dataset.racingLeagueCss='true';link.href=new URL('./racing-league.css?v=island-v2-20261107-11',import.meta.url).href;root.append(link);
}
const ordinal=place=>`מקום ${place}`;
const FIELD=LEAGUE_IDS.length;
/** A small team-colour dot with the car number, the same colour racing-view paints on the car. */
function chip(id){const d=id==='player'?driverById('player'):driverById(id);const c=el('span','rl-chip');c.style.setProperty('--team',d?.color||'#8a98a6');const n=el('b','rl-chip-no',String(d?.number??''));n.dir='ltr';c.append(n);return c;}

/** Calendar strip of the season: finished races (with place), the next one, and the locked rest. Scrolls sideways; the next race is centred. */
function raceStrip(league){
  const s=league.season,list=el('ol','rl-races');list.setAttribute('aria-label','לוח המרוצים של העונה');
  calendar(s,{shortRaces:Boolean(league.shortRaces)}).forEach((entry,i)=>{
    const done=league.history.filter(h=>h.season===s&&h.race===i).at(-1),item=el('li','rl-race'),d=describeRace(entry);item.title=`${d.track} · ${d.tags.join(' · ')}`;
    item.dataset.state=done?'done':i===league.race?'next':'locked';item.dataset.race=String(i);
    item.append(el('span','rl-race-no',String(i+1)),el('span','rl-race-name',d.track.split(' · ')[0]));
    const tags=el('span','rl-race-tags');for(const t of [d.time,d.reverse?'הפוך':'',d.variantLabel.replace('מרוץ ','')].filter(Boolean))tags.append(el('i','rl-tag',t));item.append(tags);
    item.append(done?el('span','rl-race-result',`${ordinal(done.place)} · ${done.points} נק׳`):el('span','rl-race-result',i===league.race?'המרוץ הבא':`${entry.laps} הקפות`));
    list.append(item);
  });
  requestAnimationFrame(()=>{const next=list.querySelector('[data-state=next]')||list.querySelector('[data-state=done]:last-of-type');next?.scrollIntoView?.({inline:'center',block:'nearest'});});
  return list;
}
/** Drivers' table: place, car number in team colour, name, team, points. The player's row is marked and larger. */
function standingsTable(rows){
  const table=el('table','rl-table'),head=el('tr');for(const h of ['#','','נהג','קבוצה','נקודות'])head.append(el('th','',h));table.append(head);
  rows.forEach((r,i)=>{const tr=el('tr');if(r.id==='player')tr.className='mine';tr.dataset.driver=r.id;const pts=el('td','rl-pts');pts.append(num(r.points));const c=el('td','rl-chipcell');c.append(chip(r.id));
    tr.append(el('td','rl-place',String(i+1)),c,el('td','rl-driver',r.name),el('td','rl-team',r.team||''),pts);table.append(tr);});
  return table;
}
/** Teams' table (constructors): six rows, the player's team marked, both drivers named. */
function teamsTable(teams){
  const table=el('table','rl-table rl-teams'),head=el('tr');for(const h of ['#','קבוצה','נהגים','נקודות'])head.append(el('th','',h));table.append(head);
  teams.forEach((t,i)=>{const tr=el('tr');if(t.mine)tr.className='mine';tr.dataset.team=t.id;const name=el('td','rl-driver');const dot=el('i','rl-dot');dot.style.background=t.color;const crest=leagueArtEnabled()?crestImg(t.id):null;name.append(crest||dot,t.name);   // racing-league-v1: the crest replaces the colour dot
    const pts=el('td','rl-pts');pts.append(num(t.points));tr.append(el('td','rl-place',String(i+1)),name,el('td','rl-team',t.drivers.map(id=>id==='player'?'אתם':driverById(id)?.name||id).join(' · ')),pts);table.append(tr);});
  return table;
}
/** The rival box: who you are chasing (or who chases you), the points between you, and the head-to-head of this season. */
function rivalBox(rival){
  const box=el('section','rl-rival');box.dataset.rival=rival.id;
  const head=el('div','rl-rival-head');head.append(el('strong','','היריב שלכם: '+rival.name),chip(rival.id));box.append(head);
  const gap=rival.diff>0?`לפניכם ב-${rival.diff} נקודות`:rival.diff<0?`אחריכם ב-${-rival.diff} נקודות`:'באותן נקודות כמוכם';
  box.append(el('p','rl-line',`${rival.team} · ${rival.style} · ${gap}`));
  const cmp=el('div','rl-vs');
  for(const [label,mine,theirs] of [['נקודות',rival.myPoints,rival.points],['מקום',rival.myPlace,rival.place],['ניצחונות',rival.myWins,rival.wins],['פודיומים',rival.myPodiums,rival.podiums],['מי לפני מי',rival.ahead,rival.behind]]){
    const row=el('div','rl-vs-row');const a=el('b','rl-vs-mine');a.append(num(mine));const b=el('b','rl-vs-theirs');b.append(num(theirs));row.append(a,el('span','rl-vs-label',label),b);cmp.append(row);}
  const names=el('div','rl-vs-row rl-vs-names');names.append(el('b','rl-vs-mine','אתם'),el('span','rl-vs-label',''),el('b','rl-vs-theirs',rival.name));cmp.prepend(names);box.append(cmp);
  return box;
}
/** Season podium: the three steps (2-1-3), the champion team, the player's place and prize. Shown when the season is over. */
export function seasonPodiumBlock(sum,{compact=false}={}){
  const box=el('section','rl-podium'),art=leagueArtEnabled();box.dataset.seasonPodium=String(sum.seasonId);if(compact)box.classList.add('compact');if(art)markArt(box);
  box.append(el('h4','',sum.finalSeason?`סיום ${sum.season.name} · העונה האחרונה`:`סיום ${sum.season.name}`));
  const row=el('div','rl-podium-row');const ids=sum.podium||[];const order=[ids[1],ids[0],ids[2]];
  order.forEach((id,k)=>{if(!id)return;const place=[2,1,3][k],step=el('div','rl-podium-step place-'+place);if(id==='player')step.classList.add('you');
    step.append(chip(id),el('span','rl-podium-name',id==='player'?'אתם':driverById(id)?.name||id),el('b','rl-podium-place',String(place)));row.append(step);});
  box.append(row);
  const team=TEAMS.find(t=>t.id===sum.teamChampion);
  const facts=el('div','rl-podium-facts');
  if(team){const f=el('p','rl-line');const dot=el('i','rl-dot');dot.style.background=team.color;f.append('הקבוצה האלופה: ',(art&&crestImg(team.id))||dot,team.name+(team.drivers.includes('player')?' (הקבוצה שלכם)':''));facts.append(f);}
  if(art){const shelf=el('div','rl-trophies'),driver=sum.podium?.[0],cup=(kind,label)=>{const fig=el('figure','rl-cup');fig.append(trophyImg(kind),el('figcaption','',label));return fig;};
   if(driver)shelf.append(cup('driver',driver==='player'?'אלוף הנהגים: אתם':`אלוף הנהגים: ${driverById(driver)?.name||driver}`));if(team)shelf.append(cup('team',`הקבוצה האלופה: ${team.name}`));if(shelf.childElementCount)facts.append(shelf);}
  const mine=el('p','rl-line rl-big');mine.append(sum.place===1?'אתם האלופים של העונה':`סיימתם במקום ${sum.place} מתוך ${FIELD}`);facts.append(mine);
  if(sum.seasonPrize){const p=el('p','rl-prize');p.append('פרס סוף העונה: +',num(sum.seasonPrize),' מטבעות');facts.append(p);}
  box.append(facts);return box;
}
/** Short, honest status line under the title. */
function statusLine(sum){
  if(!sum.done)return `מרוץ ${sum.race+1} מתוך ${sum.total} · מקום ${sum.place} בטבלה · ${FIELD} נהגים`;
  if(sum.finalSeason)return `העונה האחרונה הסתיימה · מקום ${sum.place} בטבלה`;
  return sum.gate.ok?`העונה הסתיימה במקום ${sum.place} · ${sum.gate.name} נפתחת`:`העונה הסתיימה במקום ${sum.place} · ${sum.gate.name} נפתחת ממקום ${sum.gate.minRank} ומעלה`;
}
/** The buttons that move the league on: next race, next season, replay the season. */
function progressActions(engine,sum,go,refresh){
  const actions=el('div','rl-actions');
  if(engine.racingLeague.next())actions.append(button('למרוץ הבא','racing-league-go',go,'primary-button'));
  else if(sum.done&&!sum.finalSeason&&sum.gate.ok)actions.append(button(`לפתוח את ${sum.gate.name}`,'racing-league-next-season',()=>{const r=engine.racingLeague.nextSeason();if(r.ok)refresh();},'primary-button'));
  else if(sum.canRestart)actions.append(button('לשחק את העונה שוב','racing-league-restart',()=>{const r=engine.racingLeague.restartSeason();if(r.ok)refresh();},'primary-button'));
  return actions;
}
function nextRaceLine(next){
  const p=el('p','rl-next');p.append(`${next.track} · ${next.laps} הקפות`);
  if(next.tags?.length){for(const t of next.tags)p.append(' ',el('i','rl-tag',t));}
  p.append(` · ${FIELD} נהגים`);return p;
}

/** The big start card on the racing stage map. `go`: start the next race. `season`/`shop`: open the screens. `refresh`: re-render the map. */
export function leagueCard({engine,go,season,shop,refresh}){
  ensureLeagueStyle();
  const sum=engine.racingLeague.summary(),next=engine.racingLeague.next(),root=el('section','rl-card');root.dataset.racingLeague='true';root.dataset.long=String(LONG);
  const head=el('div','rl-head'),title=el('h3','',`ליגת המירוצים · ${sum.season.name}`),coins=el('span','rl-coins');coins.append(num(sum.coins),document.createTextNode(' מטבעות'));
  head.append(title,coins);root.append(head,el('p','rl-line',statusLine(sum)));
  if(next)root.append(nextRaceLine(next));
  if(sum.rival&&!sum.done&&sum.race>0){const r=el('p','rl-line rl-rival-line');r.append('היריב שלכם: ',chip(sum.rival.id),' ',el('strong','',sum.rival.name),sum.rival.diff>0?` · לפניכם ב-${sum.rival.diff} נק׳`:sum.rival.diff<0?` · אחריכם ב-${-sum.rival.diff} נק׳`:' · באותן נקודות');root.append(r);}
  if(sum.done)root.append(seasonPodiumBlock(sum,{compact:true}));
  const actions=progressActions(engine,sum,go,refresh);
  actions.append(button('טבלה ועונה','racing-league-season',season),button('שדרוג הרכב','racing-league-shop',shop));
  root.append(actions,raceStrip(engine.state.islandRacingLeague));return root;
}

/** Season screen body: calendar, drivers, teams, rival, podium, gates and the short-races setting. */
export function seasonBody({engine,go,refresh}){
  ensureLeagueStyle();
  const sum=engine.racingLeague.summary(),l=engine.state.islandRacingLeague,root=el('section','rl-season');root.dataset.racingSeason='true';if(leagueArtEnabled())markArt(root);   // racing-league-v1: banner above the season (css ::before)
  root.append(el('p','rl-line',statusLine(sum)),el('h4','','לוח המרוצים'),raceStrip(l));
  if(sum.done)root.append(seasonPodiumBlock(sum));
  root.append(el('h4','','טבלת הנהגים'),standingsTable(sum.table));
  if(LONG){root.append(el('h4','','טבלת הקבוצות'),teamsTable(sum.teams));if(sum.rival&&sum.race>0)root.append(rivalBox(sum.rival));}
  const gates=el('ul','rl-gates');
  SEASONS.forEach(s=>{const open=s.id<=l.season,li=el('li','rl-gate');li.dataset.open=String(open);
    const rule=s.minRank?`נפתחת ממקום ${s.minRank} ומעלה בעונה הקודמת`:'פתוחה מההתחלה',len=LONG?`${s.races} מרוצים`:`${s.laps} הקפות`;
    const won=l.champion?.[s.id]==='player';
    li.append(el('strong','',s.name+(won?' · אלופים':'')),el('span','',`${len} · ${rule}`),el('em','',open?(s.id===l.season?'כרגע':'נפתחה'):'נעולה'));gates.append(li);});
  root.append(el('h4','','עונות'),gates,el('p','rl-line',`נקודות לפי מקום: ${POINTS.join(' · ')} (ועוד נקודה להקפה המהירה). נקודות כולל בכל העונות: ${sum.career}${sum.titles?` · אליפויות: ${sum.titles}`:''}`));
  if(LONG){
    const pr=el('p','rl-line');pr.append(`פרס סוף העונה: ${SEASON_PRIZE[0]} מטבעות לאלוף, ${SEASON_PRIZE[1]} לשני, ${SEASON_PRIZE[2]} לשלישי, ועוד ${TEAM_PRIZE} כשהקבוצה שלכם אלופה.`);root.append(pr);
    const setting=el('label','rl-setting');const cb=el('input');cb.type='checkbox';cb.checked=Boolean(l.shortRaces);cb.dataset.action='racing-league-short';
    cb.onchange=()=>{const r=engine.racingLeague.setShortRaces(cb.checked);if(!r.ok){cb.checked=!cb.checked;return;}refresh?.();};
    setting.append(cb,el('span','','מרוצים קצרים (פחות הקפות בכל מרוץ)'));root.append(setting);
  }
  const actions=progressActions(engine,sum,go,refresh||(()=>{}));if(actions.childElementCount)root.append(actions);
  return root;
}

/** Shop body: six parts, five levels each, paid with league coins. */
export function shopBody({engine,refresh}){
  ensureLeagueStyle();
  const l=engine.state.islandRacingLeague,root=el('section','rl-shop');root.dataset.racingShop='true';
  const bar=el('p','rl-coins-bar');bar.append('מטבעות ליגה: ',num(l.coins));const note=el('p','rl-line');note.setAttribute('role','status');root.append(bar,note);
  const eq=equipmentFor(l.upgrades);
  for(const [key,what] of SHOP){
    const spec=UPGRADES[key],level=l.upgrades[key]||0,row=el('article','rl-part');row.dataset.part=key;row.dataset.level=String(level);
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

/** Result card after a league race: place, points, coins, where the season stands now, and the season podium when the season just ended. */
export function resultBody({engine,result,go,season,shop,refresh}){
  ensureLeagueStyle();
  const r=result.league,sum=engine.racingLeague.summary(),root=el('section','rl-result');root.dataset.racingLeagueResult='true';
  const medal=el('div','rl-medal',String(r.place));medal.dataset.place=String(r.place);medal.setAttribute('aria-label',ordinal(r.place));
  {const img=leagueArtEnabled()?medalImg(r.place):null;if(img){medal.textContent='';medal.classList.add('art');medal.append(img);}}   // racing-league-v1: gold, silver and bronze medal for places 1-3
  const rows=el('div','rl-rows');
  // numbers are LTR islands; text that mixes Hebrew and numbers stays in the page direction
  const list=[['place','מקום',`${r.place} / ${FIELD}`],['points','נקודות במרוץ',`+${r.points}`],['coins','מטבעות ליגה',`+${r.coins}`],['table','מקום בטבלה',`${sum.place} · ${sum.points} נק׳`,true],['season',`${sum.season.name}`,sum.done?'הסתיימה':`מרוץ ${sum.race} מתוך ${sum.total}`,true]];
  if(r.seasonPrize)list.push(['prize','פרס סוף העונה',`+${r.seasonPrize}`]);
  for(const [key,label,value,plain] of list){const row=el('p','result-row');row.dataset.leagueRow=key;row.append(el('span','',label),plain?el('span','',value):num(value));rows.append(row);}
  const main=el('div','rl-result-main');main.append(medal,rows);
  root.append(main);
  if(sum.done)root.append(seasonPodiumBlock(sum));
  else if(sum.rival&&LONG){const line=el('p','rl-line rl-rival-line');line.append('היריב שלכם: ',chip(sum.rival.id),' ',el('strong','',sum.rival.name),sum.rival.diff>0?` · לפניכם ב-${sum.rival.diff} נק׳`:sum.rival.diff<0?` · אחריכם ב-${-sum.rival.diff} נק׳`:' · באותן נקודות');root.append(line);}
  const actions=progressActions(engine,sum,go,refresh);let note=null;
  if(!actions.childElementCount)note=el('p','rl-line',statusLine(sum));
  actions.append(button('טבלה ועונה','racing-league-season',season),button('שדרוג הרכב','racing-league-shop',shop));
  root.append(actions);if(note)root.append(note);root.append(standingsTable(sum.table));return root;
}
export {PRIZE};
