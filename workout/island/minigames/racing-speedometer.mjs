/** Original dashboard instrument; its value is the physics speed in km/h. */
export function createRacingSpeedometer({parent,document:doc=parent.ownerDocument}){
 const readout=doc.createElement('div');readout.className='racing-readout';readout.setAttribute('role','meter');readout.setAttribute('aria-label','מהירות בקילומטרים לשעה');readout.setAttribute('aria-valuemin','0');readout.setAttribute('aria-valuemax','240');
 const dial=doc.createElementNS('http://www.w3.org/2000/svg','svg');dial.setAttribute('viewBox','0 0 128 128');dial.setAttribute('aria-hidden','true');dial.classList.add('racing-speed-dial');
 const point=(angle,radius)=>{const a=angle*Math.PI/180;return [64+Math.cos(a)*radius,64+Math.sin(a)*radius];};
 const arc='M25.816 102.184 A54 54 0 1 1 102.184 102.184';
 let ticks='',labels='';
 for(let value=0;value<=240;value+=10){const angle=135+value/240*270,[x1,y1]=point(angle,value%40===0?43:47),[x2,y2]=point(angle,50);ticks+=`<path d="M${x1} ${y1} L${x2} ${y2}" class="racing-dial-tick${value>=200?' racing-dial-redline':''}"/>`;if(value%40===0&&value>0&&value<240){const [x,y]=point(angle,34);labels+=`<text x="${x}" y="${y+2.5}">${value}</text>`;}}
 dial.innerHTML=`<circle cx="64" cy="64" r="61" class="racing-dial-face"/><circle cx="64" cy="64" r="58" class="racing-dial-rim"/><path d="${arc}" class="racing-dial-track"/><path d="${arc}" class="racing-dial-progress"/>${ticks}<g class="racing-dial-labels">${labels}</g><g class="racing-speed-needle" transform="rotate(225 64 64)"><path d="M62.5 66 L64 22 L65.5 66Z"/><path d="M64 64 L64 72"/></g><circle cx="64" cy="64" r="4" class="racing-dial-pin"/>`;
 const value=doc.createElement('bdi');value.className='racing-speed';value.textContent='0';const unit=doc.createElement('small');unit.className='racing-speed-unit';unit.textContent='קמ״ש';readout.append(dial,value,unit);parent.append(readout);
 const needle=dial.querySelector('.racing-speed-needle'),progress=dial.querySelector('.racing-dial-progress');let previous=-1;
 function update(metresPerSecond){const speed=Math.max(0,Number.isFinite(metresPerSecond)?metresPerSecond*3.6:0),rounded=Math.round(speed);if(rounded===previous)return;previous=rounded;const ratio=Math.min(1,speed/240);value.textContent=String(rounded);readout.dataset.speed=String(rounded);readout.setAttribute('aria-valuenow',String(Math.min(240,rounded)));readout.setAttribute('aria-valuetext',`${rounded} קמ״ש`);needle.setAttribute('transform',`rotate(${225+ratio*270} 64 64)`);progress.style.strokeDashoffset=String(254.469*(1-ratio));}
 update(0);return {element:readout,update};
}
