/** Aliens v24.9 laser chip: the laser icon and the seconds left at the top edge, only while the laser bonus clock runs (alien-v249.mjs).
 * One stable node, text changed only when the second changes; nothing listens to input. */
const NS='http://www.w3.org/2000/svg';
export function laserChipState(model,blinkSeconds=2){
 const left=model?.laserTime||0;if(!(left>0))return {visible:false,seconds:0,blink:false,beam:false};
 return {visible:true,seconds:Math.ceil(left),blink:left<blinkSeconds&&Math.floor((model.time||0)*6)%2===0,beam:(model.laserBurst?.left||0)>0};
}
export function createAlienLaserChip({dialog,documentTarget=globalThis.document}={}){
 const root=documentTarget.createElement('aside');root.className='alien-laser-chip';root.hidden=true;root.setAttribute('aria-label','לייזר');
 const svg=documentTarget.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 14 16');svg.setAttribute('aria-hidden','true');
 for(const [d,width,color] of [['M7 15V1',5,'#4fe8ff'],['M7 15V1',1.8,'#ffffff'],['M2 3h2M10 13h2',1.2,'#bff9ff']]){const path=documentTarget.createElementNS(NS,'path');path.setAttribute('d',d);path.setAttribute('stroke',color);path.setAttribute('stroke-width',String(width));path.setAttribute('stroke-linecap','round');path.setAttribute('fill','none');svg.append(path);}
 const count=documentTarget.createElement('span');root.append(svg,count);dialog.append(root);
 let last={visible:false,seconds:0,blink:false,beam:false};
 return {
  update(model,paused=false){
   const s=laserChipState(model,model?.laser25?.blinkSeconds);last=s;const hidden=paused||!s.visible;if(root.hidden!==hidden)root.hidden=hidden;if(hidden)return;
   const text=String(s.seconds);if(count.textContent!==text)count.textContent=text;const blink=s.blink?'on':'off';if(root.dataset.blink!==blink)root.dataset.blink=blink;
  },
  state(){return {...last,shown:!root.hidden,text:root.hidden?'':root.querySelector?.('span')?.textContent??''};},
  dispose(){root.remove();}
 };
}
