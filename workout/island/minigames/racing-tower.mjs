// racing-field-v1: a live timing tower in the style of a Formula 1 broadcast (position, team colour, name, gap to the car ahead). Top five plus the player when lower.
// DOM only, refreshed 4 times a second; off with ?racingTower=0. No brands: team colours and the rivals' own names.
const COLORS=['#d93228','#18b6bd','#d6aa3b','#566bd1','#b7c2ca','#e07b39','#7ac05a','#a05fc4','#e0c3a1','#4b6a88'];
export const towerEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingTower')!=='0';

export function createRacingTower(parent){
 const root=document.createElement('div');root.className='racing-tower';root.setAttribute('aria-hidden','true');
 Object.assign(root.style,{position:'absolute',left:'10px',top:'104px',zIndex:'4',display:'grid',gap:'1px',font:'600 11px/1.15 system-ui,sans-serif',color:'#fff',direction:'rtl',pointerEvents:'none',textShadow:'0 1px 2px #000a'});
 parent.append(root);let age=1;
 const rows=[];
 for(let i=0;i<6;i++){const row=document.createElement('div');Object.assign(row.style,{display:'grid',gridTemplateColumns:'16px 6px 54px 42px',alignItems:'center',gap:'4px',padding:'1px 6px 1px 3px',background:'#0b1624c8',borderInlineStart:'3px solid transparent',borderRadius:'2px'});
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
