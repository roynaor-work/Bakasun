/** Island Pro Basketball club screen (menu, not the court): next game and table, the starting
 * five, training with its cost and result shown before buying, and match settings. Every
 * change goes through engine.hoops, which saves and refuses while a game is running. */
import {kidUx,kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-24';
import {DRILLS} from '../minigames/hoops-league.mjs?v=island-v2-20261107-24';
import {positionName,abilitySummary} from '../minigames/hoops-roles.mjs';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;if(text!=='')n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const POS=['PG','SG','SF','PF','C'];

/** The simple start: who we play next, where we stand, and one big button. Everything else
 * (lineup, training, settings, stages) waits behind "manage the team". */
export function hoopsStartCard({engine,t,play,actionBar}){
 const h=engine.state.hoops,sum=engine.hoops.summary(),root=el('section','hoops-start');root.dataset.hoopsStart='true';
 const teamName=id=>sum.teams.find(x=>x.id===id)?.name||id;
 const crest=(id,team)=>{const c=el('span','hoops-club-crest');const look=sum.teams.find(x=>x.id===id)||team;if(look?.primary){c.style.setProperty('--team',look.primary);c.style.setProperty('--team2',look.secondary);}return c;};
 const matchup=el('div','hoops-start-matchup');
 const me=el('div','hoops-start-team');me.append(crest(h.team,sum.team),el('strong','',sum.team.name));
 matchup.append(me);
 if(sum.next){
  const opp=sum.next.home===h.team?sum.next.away:sum.next.home;
  const them=el('div','hoops-start-team');them.append(crest(opp),el('strong','',teamName(opp)));
  matchup.append(el('span','hoops-start-vs','מול'),them);
  root.append(matchup,el('p','hoops-start-line',t(sum.next.home===h.team?'hoops.club.nextHome':'hoops.club.nextAway',{round:sum.next.round,opponent:teamName(opp)})));
 } else root.append(matchup,el('p','hoops-start-line',t('hoops.club.seasonOver',{champion:teamName(h.season.champion)})));
 const place=sum.table.findIndex(r=>r.id===h.team)+1;
 if(place)root.append(el('p','hoops-start-place',t('hoops.start.place',{place,teams:sum.table.length})));
 const go=button(t('hoops.start.play'),'hoops-play-next',play,'primary-button hoops-start-play');
 if(!sum.next){go.textContent=t('hoops.club.newSeason');go.dataset.action='hoops-new-season';go.onclick=()=>{const r=engine.hoops.newSeason();if(r?.ok)play.refresh?.();};}
 if(actionBar){
  root.classList.add('kid-hoops-next-game');
  actionBar.prepend(go);
 }else root.append(go);
 return root;
}

/** Keep the primary and return actions in view while the management pane scrolls. */
export function prepareHoopsClubLayout(dialog){
 if(!kidUx('020'))return null;
 dialog.classList.add('kid-hoops-club-layout');
 kidUxStyle('020',`
  .modal[data-stage-map=streetSlam].kid-hoops-club-layout{max-height:100%;overflow:hidden;display:grid;
   grid-template-rows:auto auto minmax(0,1fr) auto;gap:6px;padding:12px}
  .modal[data-stage-map=streetSlam].kid-hoops-club-layout > .modal-close{position:absolute;top:6px;right:auto;left:6px}
  .modal.kid-hoops-club-layout > [data-action=shell-install]{position:absolute;top:6px;left:68px;margin:0;min-width:48px;min-height:48px}
  .modal[data-stage-map=streetSlam].kid-hoops-club-layout > h2{grid-row:1;padding-top:0;margin:0 0 0 204px}
  .modal.kid-hoops-club-layout > .modal-subtitle{grid-row:2;font-size:14px;margin:0 0 0 204px}
  .modal.kid-hoops-club-layout > .sound-toggle{position:absolute;top:6px;left:122px;right:auto;min-height:48px;max-width:80px;font-size:14px}
  .modal.kid-hoops-club-layout > .shell-install-help{position:absolute;z-index:6;top:54px;right:8px;left:8px;
   max-height:calc(100% - 116px);overflow:auto;margin:0;color:#182c3d}
  .kid-hoops-club-scroll{grid-row:3;overflow:auto;overscroll-behavior:contain;padding:0 5px 10px;min-height:0}
  .kid-hoops-club-actions{grid-row:4;display:flex;justify-content:center;gap:8px;padding:4px 0}
  @media(max-width:440px){
   .modal[data-stage-map=streetSlam].kid-hoops-club-layout > h2{padding-top:48px;margin-left:0}
   .modal.kid-hoops-club-layout > .modal-subtitle{margin-left:0}
  }
  .modal.kid-hoops-club-layout .kid-hoops-club-actions > button{
   margin:0;min-width:48px;min-height:48px;font-size:16px;padding:6px 13px;color:#172b3a;background:#f2e3ae;
   border:1px solid #e6d5ad
  }
  .modal.kid-hoops-club-layout .kid-hoops-club-actions > .adventure-back{color:#fff;background:#24495d;border-color:#c8e0eb}
  .modal.kid-hoops-club-layout .kid-hoops-next-game{gap:5px;padding:6px 8px;color:#fff;background:#142d40}
  .modal.kid-hoops-club-layout .kid-hoops-next-game :is(.hoops-start-place,.hoops-start-line){font-size:14px;opacity:1}
  .kid-hoops-club-layout .hoops-more > summary{display:list-item;min-height:48px;font-size:16px;color:#fff}
  .kid-hoops-club-layout :is(.hoops-club-pos,.hoops-club-line){font-size:14px;opacity:1}
 `);
 const scroll=el('div','kid-hoops-club-scroll'),actions=el('div','kid-hoops-club-actions');
 dialog.append(scroll,actions);
 return {scroll,actions};
}

export function hoopsClubPanel({engine,t,refresh,result=()=>{}}){
 const h=engine.state.hoops,sum=engine.hoops.summary(),root=el('section','hoops-club');root.dataset.hoopsClub='true';
 const teamName=id=>sum.teams.find(x=>x.id===id)?.name||id;
 const done=r=>{if(r?.ok)refresh();else result(r);};

 // header: club, rating, chemistry, credits
 const head=el('div','hoops-club-head');
 const crest=el('span','hoops-club-crest');crest.style.setProperty('--team',sum.team.primary);crest.style.setProperty('--team2',sum.team.secondary);
 head.append(crest,el('h3','',sum.team.name),
  el('span','hoops-club-stat',t('hoops.club.rating',{value:sum.rating})),
  el('span','hoops-club-stat',t('hoops.club.chemistry',{value:sum.chemistry.total})),
  el('span','hoops-club-stat',t('hoops.club.credits',{value:h.credits})));
 root.append(head);

 // season: next game and the table
 const season=el('div','hoops-club-season');
 if(sum.next){const opp=sum.next.home===h.team?sum.next.away:sum.next.home;
  season.append(el('p','hoops-club-next',t(sum.next.home===h.team?'hoops.club.nextHome':'hoops.club.nextAway',{round:sum.next.round,opponent:teamName(opp)})));}
 else season.append(el('p','hoops-club-next',t('hoops.club.seasonOver',{champion:teamName(h.season.champion)})),button(t('hoops.club.newSeason'),'hoops-new-season',()=>done(engine.hoops.newSeason())));
 const table=el('table','hoops-club-table');const hr=el('tr');for(const k of ['place','team','won','lost','diff'])hr.append(el('th','',t('hoops.club.col.'+k)));table.append(hr);
 sum.table.forEach((row,i)=>{const tr=el('tr');if(row.id===h.team)tr.className='mine';tr.append(el('td','',String(i+1)),el('td','',teamName(row.id)),el('td','',String(row.w)),el('td','',String(row.l)),el('td','',String(row.pf-row.pa)));table.append(tr);});
 season.append(el('h4','',t('hoops.club.season',{n:h.season.n})),table);
 root.append(season);

 // starting five: pick five cards, then save
 const pick=new Set(h.lineup);
 const lineup=el('div','hoops-club-lineup');lineup.append(el('h4','',t('hoops.club.lineup')),el('p','hoops-club-hint',t('hoops.club.lineupHint')));
 const grid=el('div','hoops-club-cards'),save=button(t('hoops.club.saveLineup'),'hoops-save-lineup',()=>done(engine.hoops.setLineup(sum.cards.filter(c=>pick.has(c.id)).sort((a,b)=>POS.indexOf(a.pos)-POS.indexOf(b.pos)).map(c=>c.id))));
 const sync=()=>{save.disabled=pick.size!==5||sum.cards.every(c=>pick.has(c.id)===h.lineup.includes(c.id));for(const b of grid.children)b.setAttribute('aria-pressed',String(pick.has(b.dataset.id)));};
 for(const c of [...sum.cards].sort((a,b)=>Number(pick.has(b.id))-Number(pick.has(a.id))||b.ovr-a.ovr)){
  const card=button('','hoops-lineup-card',()=>{if(pick.has(c.id))pick.delete(c.id);else if(pick.size<5)pick.add(c.id);sync();},'hoops-club-card');card.dataset.id=c.id;
  card.append(el('bdi','hoops-club-num',String(c.number)),el('span','hoops-club-name',c.name),el('span','hoops-club-pos',positionName(c.pos)),el('bdi','hoops-club-ovr',String(c.ovr)));
  card.title=abilitySummary(c);
  card.append(el('small','hoops-club-line hoops-club-abilities',abilitySummary(c)));
  const p=h.roster.find(r=>r.id===c.id);if(p?.gp)card.append(el('small','hoops-club-line',t('hoops.club.statLine',{gp:p.gp,pts:(p.pts/p.gp).toFixed(1),reb:(p.reb/p.gp).toFixed(1),ast:(p.ast/p.gp).toFixed(1)})));
  card.setAttribute('aria-label',t('hoops.club.cardLabel',{number:c.number,name:c.name,pos:positionName(c.pos),ovr:c.ovr})+' · '+abilitySummary(c));grid.append(card);
 }
 sync();lineup.append(grid,save);root.append(lineup);

 // training: player, drill, the result before paying
 const training=el('div','hoops-club-training');training.append(el('h4','',t('hoops.club.training')));
 const who=el('select','hoops-club-select');who.dataset.action='hoops-train-player';who.setAttribute('aria-label',t('hoops.club.trainWho'));
 for(const c of sum.cards){const o=el('option','',`${c.number} · ${c.name} · ${c.ovr}`);o.value=c.id;who.append(o);}
 const drills=el('div','hoops-club-drills'),preview=el('p','hoops-club-preview');
 let drill=null;
 const show=()=>{preview.textContent='';if(!drill)return;const offer=engine.hoops.offer(who.value,drill);if(!offer)return;
  const card=sum.cards.find(c=>c.id===who.value),changes=Object.entries(offer.after).map(([k,v])=>`${t('hoops.rating.'+k)} ${Math.round(card.ratings[k])}→${Math.round(v)}`);
  preview.textContent=changes.length?t('hoops.club.preview',{cost:offer.cost,changes:changes.join(' · ')}):t('hoops.club.maxed');
  go.disabled=!changes.length||h.credits<offer.cost;};
 for(const key of Object.keys(DRILLS)){const b=button(t('hoops.drill.'+key),'hoops-drill',()=>{drill=key;for(const x of drills.children)x.setAttribute('aria-pressed',String(x===b));show();});b.dataset.drill=key;b.setAttribute('aria-pressed','false');drills.append(b);}
 const go=button(t('hoops.club.train'),'hoops-train',()=>done(engine.hoops.train(who.value,drill)));go.disabled=true;
 who.onchange=show;training.append(who,drills,preview,go);root.append(training);

 // settings
 const settings=el('div','hoops-club-settings');settings.append(el('h4','',t('hoops.club.settings')));
 const choice=(key,values,current)=>{const f=el('fieldset','hoops-club-choice');f.append(el('legend','',t('hoops.club.'+key)));
  for(const v of values){const b=button(t(`hoops.${key}.${v}`),'hoops-setting',()=>done(engine.hoops.settings({[key]:v})));b.dataset.setting=key;b.dataset.value=v;b.setAttribute('aria-pressed',String(current===v));f.append(b);}return f;};
 settings.append(choice('profile',['quick','standard','pro'],h.profile),choice('difficulty',['easy','normal','hard'],h.difficulty),
  choice('offense',['motion','pnr','iso'],h.tactics.offense),choice('defense',['man','zone'],h.tactics.defense));
 const auto=el('label','hoops-club-toggle'),box=el('input');box.type='checkbox';box.setAttribute('role','switch');box.checked=h.autoSub;box.dataset.action='hoops-autosub';
 box.onchange=()=>done(engine.hoops.settings({autoSub:box.checked}));auto.append(box,el('span','',t('hoops.club.autoSub')));settings.append(auto);
 root.append(settings);
 return root;
}
