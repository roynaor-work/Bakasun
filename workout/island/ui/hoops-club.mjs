/** Island Pro Basketball club screen (menu, not the court): next game and table, the starting
 * five, training with its cost and result shown before buying, and match settings. Every
 * change goes through engine.hoops, which saves and refuses while a game is running. */
import {DRILLS} from '../minigames/hoops-league.mjs?v=island-naval-aim-20261029-1';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;if(text!=='')n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const POS=['PG','SG','SF','PF','C'];

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
  card.append(el('bdi','hoops-club-num',String(c.number)),el('span','hoops-club-name',c.name),el('span','hoops-club-pos',t('hoops.pos.'+c.pos)),el('bdi','hoops-club-ovr',String(c.ovr)));
  const p=h.roster.find(r=>r.id===c.id);if(p?.gp)card.append(el('small','hoops-club-line',t('hoops.club.statLine',{gp:p.gp,pts:(p.pts/p.gp).toFixed(1),reb:(p.reb/p.gp).toFixed(1),ast:(p.ast/p.gp).toFixed(1)})));
  card.setAttribute('aria-label',t('hoops.club.cardLabel',{number:c.number,name:c.name,pos:t('hoops.pos.'+c.pos),ovr:c.ovr}));grid.append(card);
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
