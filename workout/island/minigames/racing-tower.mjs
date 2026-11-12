// racing-field-v1: a live timing tower in the style of a Formula 1 broadcast (position, team colour, name, gap to the car ahead). Top five plus the player when lower.
// DOM only, refreshed 4 times a second; off with ?racingTower=0. No brands: team colours and the rivals' own names.
// racing-deep-m4: with a `broadcast` option (from racing-broadcast.mjs) the tower lists the whole field (as many rows as fit above the wheel, 5..10,
// the player always among them) with the car number, the team colour, a real time gap to the car ahead, an up/down arrow for 2.5 s after a
// position change and a purple mark on the fastest lap. The old five-row tower stays for ?racingBroadcast=0.
import {towerRows} from './racing-broadcast.mjs?v=island-v2-20261107-11';
import {broadcastArtEnabled,crestUrl} from './racing-broadcast-art.mjs?v=island-v2-20261107-11';
const COLORS=['#d93228','#18b6bd','#d6aa3b','#566bd1','#b7c2ca','#e07b39','#7ac05a','#a05fc4','#e0c3a1','#4b6a88'];
export const towerEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingTower')!=='0';
export const ROW_HEIGHT=12,TOWER_TOP=120,MIN_ROWS=5,MAX_ROWS=10;

/** How many rows fit between the tower's top and the steering wheel (fallback: the viewport formula of racing.css, wheel = clamp(96px, 32vh, 128px)). */
export function rowsThatFit({height=390,top=TOWER_TOP,wheelTop=null,row=ROW_HEIGHT}={}){
 const wheel=wheelTop??(height-17-Math.max(96,Math.min(128,height*.32)));
 return Math.max(MIN_ROWS,Math.min(MAX_ROWS,Math.floor((wheel-top-4)/row)));
}

export function createRacingTower(parent,{broadcast=null,art=broadcast?.art??broadcastArtEnabled()}={}){
 const root=document.createElement('div');root.className='racing-tower';root.setAttribute('aria-hidden','true');
 parent.append(root);let age=1;
 const rows=[];
 if(broadcast){
  root.classList.add('broadcast');if(art)root.classList.add('rb-art');   // racing-broadcast-v1: the team crest replaces the colour bar
  for(let i=0;i<MAX_ROWS;i++){const row=document.createElement('div');row.className='rt-row';
   const pos=document.createElement('b'),bar=document.createElement('i'),no=document.createElement('span'),name=document.createElement('span'),gap=document.createElement('small'),arrow=document.createElement('em');
   pos.className='rt-pos';bar.className='rt-bar';no.className='rt-no';no.dir='ltr';name.className='rt-name';gap.className='rt-gap';gap.dir='ltr';arrow.className='rt-arrow';
   row.append(pos,bar,no,name,gap,arrow);root.append(row);rows.push({row,pos,bar,no,name,gap,arrow});}
  let limit=0;
  const fit=()=>{const screen=parent.closest?.('.game-screen')||parent,wheel=screen.querySelector?.('.racing-wheel'),h=screen.clientHeight||globalThis.innerHeight||390;
   const wheelTop=wheel?wheel.getBoundingClientRect().top-screen.getBoundingClientRect().top:null;limit=rowsThatFit({height:h,top:root.offsetTop||TOWER_TOP,wheelTop:wheelTop&&wheelTop>0?wheelTop:null});};
  const onResize=()=>{limit=0;};globalThis.addEventListener?.('resize',onResize);
  function update(state,dt){age+=dt;if(age<.25)return;age=0;if(!limit)fit();
   const list=towerRows(state,{tracker:broadcast.tracker,now:state.time,limit,watch:broadcast.watch,fastest:broadcast.fastest?.()||null,trackLength:broadcast.trackLength||0});
   rows.forEach((r,i)=>{const car=list[i];r.row.style.display=car?'grid':'none';if(!car)return;
    r.row.classList.toggle('you',car.isPlayer);r.row.classList.toggle('fastest',car.fastest);r.row.classList.toggle('traffic',!car.scoring);r.row.dataset.id=car.id;r.row.dataset.delta=String(car.delta);
    r.pos.textContent=String(car.rank);if(art){const crest=crestUrl(car.number);if(r.crest!==crest){r.crest=crest;r.bar.style.background=crest?`url("${crest}") center/contain no-repeat`:car.color;}}else r.bar.style.background=car.color;r.no.textContent=String(car.number);r.name.textContent=car.name;r.gap.textContent=car.gapText;r.arrow.textContent=car.delta>0?'▲':car.delta<0?'▼':'';});}
  return {update,rows:()=>limit,dispose(){globalThis.removeEventListener?.('resize',onResize);root.remove();}};
 }
 Object.assign(root.style,{position:'absolute',left:'10px',top:'128px',zIndex:'4',display:'grid',gap:'1px',font:'600 11px/1.15 system-ui,sans-serif',color:'#fff',direction:'rtl',pointerEvents:'none',textShadow:'0 1px 2px #000a'});
 for(let i=0;i<6;i++){const row=document.createElement('div');Object.assign(row.style,{display:'grid',gridTemplateColumns:'16px 6px 62px 38px',alignItems:'center',gap:'4px',padding:'1px 6px 1px 3px',background:'#0b1624c8',borderInlineStart:'3px solid transparent',borderRadius:'2px'});
  const pos=document.createElement('b'),dot=document.createElement('i'),name=document.createElement('span'),gap=document.createElement('small');
  Object.assign(dot.style,{width:'6px',height:'12px',borderRadius:'1px'});Object.assign(name.style,{overflow:'hidden',whiteSpace:'nowrap',textOverflow:'clip'});Object.assign(gap.style,{opacity:'.8',textAlign:'end',direction:'ltr',fontVariantNumeric:'tabular-nums'});
  row.append(pos,dot,name,gap);root.append(row);rows.push({row,pos,dot,name,gap});}
 function update(state,dt){age+=dt;if(age<.25)return;age=0;
  const cars=[...state.cars].sort((a,b)=>a.rank-b.rank),player=state.player;if(cars.length<=5){root.style.display='none';return;}root.style.display='grid';
  const shown=cars.slice(0,5);if(!shown.includes(player))shown.push(player);
  rows.forEach((r,i)=>{const car=shown[i];r.row.style.display=car?'grid':'none';if(!car)return;
   const ahead=cars[car.rank-2],gap=ahead?Math.max(0,(ahead.progress-car.progress)/Math.max(15,car.speed)):0,idx=state.cars.indexOf(car);
   r.pos.textContent=String(car.rank);r.dot.style.background=COLORS[idx%COLORS.length];r.name.textContent=car.isPlayer?'אתם':car.name;
   r.gap.textContent=car.finished?'סיים':ahead?'+'+gap.toFixed(1):'';r.row.style.borderInlineStartColor=car.isPlayer?'#ffd54a':'transparent';r.row.style.background=car.isPlayer?'#2a2410d8':'#0b1624c8';});}
 return {update,dispose(){root.remove();}};
}
