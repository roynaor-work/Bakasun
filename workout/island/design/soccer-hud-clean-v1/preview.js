// Local-only demonstration fixture. No game modules or persistent data are changed.
(()=>{
'use strict';
const $=id=>document.getElementById(id),size=256;
const positions={h:[[48,211],[181,126],[170,215],[189,308],[282,159],[275,279],[394,237],[556,163],[499,318],[637,241],[688,326]],a:[[803,220],[700,124],[706,281],[626,316],[606,101],[586,250],[477,201],[453,113],[382,317],[332,108],[321,282]]};
const players=Object.entries(positions).flatMap(([team,points])=>points.map(([x,y],i)=>({id:team+i,team,x,y,keeper:i===0})));
let format='svg',running=false,startedAt=0,elapsed=0;
const assets=[['control-ring-small','טבעת קטנה'],['control-ring-medium','טבעת בינונית'],['control-ring-large','טבעת גדולה'],['control-arrow','השחקן הנשלט'],['pass-direction-low','מסירה חלשה'],['pass-direction-medium','מסירה בינונית'],['pass-direction-high','מסירה חזקה'],['receiver-open','חופשי למסירה'],['ball-nearest','קרוב לכדור'],['shot-power-track','רקע מד בעיטה'],['shot-power-fill','מילוי מד בעיטה'],['ball-offscreen','כדור מחוץ למסך'],['scoreboard-plate','לוח תוצאה']];
for(const p of players){
 const node=document.createElement('div');node.className='player';node.dataset.player=p.id;node.style.left=p.x+'px';node.style.top=p.y+'px';node.setAttribute('role','img');node.setAttribute('aria-label',`${p.team==='h'?'בית':'חוץ'} ${p.keeper?'שוער':'שחקן'} ${p.id.slice(1)}`);
 const kit=p.keeper?'#e9ba57':p.team==='h'?'#6dbbc5':'#eb947f';
 // Abstract jersey tokens: layout fixtures, not replacement character assets.
 node.innerHTML=`<svg class="player-token" viewBox="0 0 26 39" aria-hidden="true"><path d="m8 24-2 12 5 1 3-13m3 0 3 12-5 1-3-13" fill="#142a35"/><path d="m8 10-6 5 3 8 4-3-1 9h12l-1-9 4 3 2-8-7-5Z" fill="${kit}" stroke="#142a35" stroke-width=".8"/><path d="m11 11 2 4 3-4" fill="#fffdf4" opacity=".7"/><circle cx="13" cy="6" r="4.5" fill="#d5b794" stroke="#142a35" stroke-width="1"/><path d="M9 4q4-5 8 0" fill="none" stroke="#142a35" stroke-width="2.5"/></svg>`;
 $('players').append(node);
}
const src=id=>`${format}/${id}.${format}`;
function sprite(parent,id,x,y,canvas,anchor=[128,128],rotation=0){
 const image=document.createElement('img');image.className='sprite';image.dataset.asset=id;image.src=src(id);image.alt='';image.width=image.height=canvas;
 const scale=canvas/size;Object.assign(image.style,{left:(x-anchor[0]*scale)+'px',top:(y-anchor[1]*scale)+'px',transformOrigin:`${anchor[0]*scale}px ${anchor[1]*scale}px`,transform:`rotate(${rotation}deg)`});parent.append(image);return image;
}
function edgePoint(ball,{width=844,height=390,padding=34}={}){
 const cx=width/2,cy=height/2,dx=ball.x-cx,dy=ball.y-cy;
 if(ball.x>=0&&ball.x<=width&&ball.y>=0&&ball.y<=height)return null;
 const t=Math.min(dx?((width/2-padding)/Math.abs(dx)):Infinity,dy?((height/2-padding)/Math.abs(dy)):Infinity);
 let x=cx+dx*t,y=cy+dy*t;
 // Keep the score and the future touch control zones free. Stay on the same edge.
 const reserved=[[6,2,266,78],[0,height-100,148,height],[width-200,height-112,width,height]];
 for(const [l,top,r,bottom] of reserved){if(x>=l&&x<=r&&y>=top&&y<=bottom){if(Math.abs(x-padding)<.01||Math.abs(x-(width-padding))<.01)y=Math.max(padding,Math.min(height-padding,top-14< padding?bottom+14:top-14));else x=Math.max(padding,Math.min(width-padding,r+14<width-padding?r+14:l-14));}}
 return {x,y,angle:Math.atan2(dy,dx)*180/Math.PI+90};
}
const outside={right:{x:1200,y:195},left:{x:-360,y:195},up:{x:422,y:-300},down:{x:422,y:700},nw:{x:-100,y:-100},ne:{x:1000,y:-100},sw:{x:-100,y:550},se:{x:1000,y:550}};
function render(){
 for(const id of ['ground','pass-guide','heads','edge'])$(id).replaceChildren();
 const selected=players.find(p=>p.id===$('controlled').value),open=players.find(p=>p.id==='h7'),charge=Math.max(0,Math.min(1,Number($('charge').value)/100));
 const ball=$('ball-position').value==='loose'?{x:608,y:231}:outside[$('ball-position').value]||{x:selected.x+25,y:selected.y+7};
 sprite($('ground'),'control-ring-'+$('ring').value,selected.x,selected.y,72);
 sprite($('heads'),'control-arrow',selected.x,selected.y-49,88,[128,133]);
 $('charge-value').value=Math.round(charge*100)+'%';
 if(charge>0){
  sprite($('heads'),'shot-power-track',selected.x-47,selected.y-7,72);
  const fill=sprite($('heads'),'shot-power-fill',selected.x-47,selected.y-7,72);
  fill.style.clipPath=`inset(0 ${(256-39-178*charge)/256*100}% 0 ${39/256*100}%)`;
 }
 const eligible=$('open').checked&&selected.id!==open.id;
 if(eligible){
  sprite($('heads'),'receiver-open',open.x,open.y-48,82,[128,144]);
  const label=document.createElement('span');label.className='open-label';label.dir='rtl';label.lang='he';label.textContent='חופשי';Object.assign(label.style,{left:open.x+'px',top:(open.y-84)+'px'});$('heads').append(label);
  const angle=Math.atan2(open.y-selected.y,open.x-selected.x)*180/Math.PI+90;
  sprite($('pass-guide'),'pass-direction-'+$('pass').value,selected.x+10,selected.y+4,100,[128,234],angle);
 }
 // Match state should supply this ranking in the eventual integration.
 const nearest=players.reduce((a,b)=>Math.hypot(a.x-ball.x,a.y-ball.y)<=Math.hypot(b.x-ball.x,b.y-ball.y)?a:b);
 if(nearest.id!==selected.id)sprite($('ground'),'ball-nearest',nearest.x,nearest.y+6,72,[128,112]);
 document.querySelectorAll('[data-player]').forEach(n=>{n.dataset.controlled=String(n.dataset.player===selected.id);n.dataset.nearest=String(n.dataset.player===nearest.id);});
 const edge=edgePoint(ball);$('ball').hidden=Boolean(edge);$('edge').hidden=!edge;
 if(edge)sprite($('edge'),'ball-offscreen',edge.x,edge.y,80,[128,128],edge.angle);
 else Object.assign($('ball').style,{left:ball.x+'px',top:ball.y+'px'});
 $('scoreboard').querySelector('img').src=src('scoreboard-plate');
 $('stage').dataset.format=format;$('stage').dataset.nearest=nearest.id;$('stage').dataset.open=String(eligible);
 $('status').textContent=`טבעת ${$('ring').selectedOptions[0].textContent}, מסירה ${$('pass').selectedOptions[0].textContent}, ${edge?'הכדור מחוץ למסך':'הכדור במגרש'}`;
}
for(const [id,label] of assets){
 const card=document.createElement('article');card.className='asset-card';
 card.innerHTML=`<div class="asset-swatch"><img src="svg/${id}.svg" data-asset="${id}" alt="${label}" width="128" height="128"></div><p>${label}</p><code>${id}</code><div class="asset-links"><a href="svg/${id}.svg" download>SVG ↓</a><a href="png/${id}.png" download>PNG ↓</a></div>`;$('asset-grid').append(card);
}
for(const id of ['ring','pass','ball-position','controlled','charge','open'])$(id).addEventListener('input',render);
$('format').addEventListener('click',()=>{format=format==='svg'?'png':'svg';$('format').setAttribute('aria-pressed',String(format==='png'));$('format').textContent=format==='svg'?'SVG → PNG':'PNG → SVG';document.querySelectorAll('[data-asset]').forEach(n=>n.src=src(n.dataset.asset));render();});
$('lighting').addEventListener('click',()=>{const night=$('stage').classList.toggle('evening');$('lighting').setAttribute('aria-pressed',String(night));$('lighting').textContent=night?'תאורת יום':'תאורת ערב';});
$('play').addEventListener('click',()=>{if(running)elapsed+=performance.now()-startedAt;else startedAt=performance.now();running=!running;$('play').setAttribute('aria-pressed',String(running));$('play').textContent=running?'השהה שעון':'הפעל שעון';});
setInterval(()=>{const seconds=34*60+28+Math.floor((elapsed+(running?performance.now()-startedAt:0))/1000);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');},200);
function resize(){const width=Math.min(844,document.documentElement.clientWidth-(innerHeight<=500?0:24)),scale=width/844;document.querySelector('.stage-wrap').style.width=width+'px';document.querySelector('.stage-wrap').style.height=390*scale+'px';$('stage').style.transform=`scale(${scale})`;$('stage').style.transformOrigin='top left';}
addEventListener('resize',resize);resize();render();
// Exposes pure geometry only, for deterministic verification of edge directions.
window.soccerHudPreview={edgePoint};
})();
