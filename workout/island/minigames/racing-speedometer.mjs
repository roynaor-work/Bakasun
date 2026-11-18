/** Original dashboard instrument; its value is the physics speed in km/h.
 * racing-deep-m3: the gear cluster next to the dial reads like a Formula 1 wheel display: a big gear number inside a rev arc and three shift lights
 * that come on one after the other as the revs climb (80%, 88%, 95%: all three = shift now). Same data as before (gear, rpm), no sound change. */
const LIGHTS=[.8,.88,.95];
export function createRacingSpeedometer({parent,document:doc=parent.ownerDocument}){
 const readout=doc.createElement('div');readout.className='racing-readout';readout.setAttribute('role','meter');readout.setAttribute('aria-label','מהירות בקילומטרים לשעה');readout.setAttribute('aria-valuemin','0');readout.setAttribute('aria-valuemax','240');
 const dial=doc.createElementNS('http://www.w3.org/2000/svg','svg');dial.setAttribute('viewBox','0 0 128 128');dial.setAttribute('aria-hidden','true');dial.classList.add('racing-speed-dial');
 const point=(angle,radius)=>{const a=angle*Math.PI/180;return [64+Math.cos(a)*radius,64+Math.sin(a)*radius];};
 const arc='M25.816 102.184 A54 54 0 1 1 102.184 102.184';
 let ticks='',labels='';
 for(let value=0;value<=240;value+=10){const angle=135+value/240*270,[x1,y1]=point(angle,value%40===0?43:47),[x2,y2]=point(angle,50);ticks+=`<path d="M${x1} ${y1} L${x2} ${y2}" class="racing-dial-tick${value>=200?' racing-dial-redline':''}"/>`;if(value%40===0&&value>0&&value<240){const [x,y]=point(angle,34);labels+=`<text x="${x}" y="${y+2.5}">${value}</text>`;}}
 dial.innerHTML=`<circle cx="64" cy="64" r="61" class="racing-dial-face"/><circle cx="64" cy="64" r="58" class="racing-dial-rim"/><path d="${arc}" class="racing-dial-track"/><path d="${arc}" class="racing-dial-progress"/>${ticks}<g class="racing-dial-labels">${labels}</g><g class="racing-speed-needle" transform="rotate(225 64 64)"><path d="M62.5 66 L64 22 L65.5 66Z"/><path d="M64 64 L64 72"/></g><circle cx="64" cy="64" r="4" class="racing-dial-pin"/>`;
 const value=doc.createElement('bdi');value.className='racing-speed';value.textContent='0';const unit=doc.createElement('small');unit.className='racing-speed-unit';unit.textContent='קמ״ש';
 // gear cluster: rev arc (270 degrees, radius 24 around 30,38: length 113.1), three shift lights above it, the gear number in the middle
 const gearBox=doc.createElement('div');gearBox.className='racing-gearbox';gearBox.hidden=true;gearBox.setAttribute('role','status');gearBox.setAttribute('aria-label','הילוך');
 const cluster=doc.createElementNS('http://www.w3.org/2000/svg','svg');cluster.setAttribute('viewBox','0 0 60 68');cluster.setAttribute('aria-hidden','true');cluster.classList.add('racing-gear-dial');
 const revArc='M13.03 54.97 A24 24 0 1 1 46.97 54.97';
 cluster.innerHTML=`<circle cx="30" cy="38" r="29" class="racing-gear-face"/><path d="${revArc}" class="racing-rev-track"/><path d="${revArc}" class="racing-rev-arc"/><g class="racing-shift-lights"><circle cx="17" cy="6" r="3.4"/><circle cx="30" cy="4.5" r="3.4"/><circle cx="43" cy="6" r="3.4"/></g><text x="30" y="47" class="racing-gear">1</text>`;
 const gearNo=cluster.querySelector('.racing-gear'),revArcEl=cluster.querySelector('.racing-rev-arc'),lights=[...cluster.querySelectorAll('.racing-shift-lights circle')];
 // the old inline rev bar stays in the DOM (hidden) for anything that still reads .racing-rev
 const rev=doc.createElement('span');rev.className='racing-rev';rev.hidden=true;const revFill=doc.createElement('i');rev.append(revFill);
 gearBox.append(cluster,rev);readout.append(dial,value,unit,gearBox);parent.append(readout);
 const needle=dial.querySelector('.racing-speed-needle'),progress=dial.querySelector('.racing-dial-progress');let previous=-1,previousRev=-1,previousLit=-1;
 function update(metresPerSecond,engine=null){
  if(engine){gearBox.hidden=false;const gearText=String(engine.gear);if(gearNo.textContent!==gearText){gearNo.textContent=gearText;gearBox.setAttribute('aria-label','הילוך '+gearText);}
   const rpm=Math.max(0,Math.min(1,Number(engine.rpm)||0)),revStep=Math.round(rpm*50);
   if(revStep!==previousRev){previousRev=revStep;revFill.style.transform=`scaleX(${rpm})`;revArcEl.style.strokeDashoffset=String(113.1*(1-rpm));revArcEl.classList.toggle('red',rpm>.9);}
   const lit=LIGHTS.filter(v=>rpm>=v).length;
   if(lit!==previousLit){previousLit=lit;lights.forEach((light,i)=>light.classList.toggle('on',i<lit));gearBox.dataset.shift=lit===LIGHTS.length?'now':lit?'soon':'';gearBox.dataset.lights=String(lit);}}
  const speed=Math.max(0,Number.isFinite(metresPerSecond)?metresPerSecond*3.6:0),rounded=Math.round(speed);if(rounded===previous)return;previous=rounded;const ratio=Math.min(1,speed/240);value.textContent=String(rounded);readout.dataset.speed=String(rounded);readout.setAttribute('aria-valuenow',String(Math.min(240,rounded)));readout.setAttribute('aria-valuetext',`${rounded} קמ״ש`);needle.setAttribute('transform',`rotate(${225+ratio*270} 64 64)`);progress.style.strokeDashoffset=String(254.469*(1-ratio));}
 update(0);return {element:readout,update,gearBox};
}
