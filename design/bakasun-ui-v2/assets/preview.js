'use strict';
(() => {
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const frame=$('#screen-frame'),space=$('.frame-space');let size=[390,844],fitting=true;
 const screens=[...$('#screen').options].map(o=>o.value);
 function setScale(value){const scale=Math.min(1.5,Math.max(.2,value));$('#scale').value=String(Math.round(scale*100));$('#scale-output').textContent=Math.round(scale*100)+'%';frame.style.transform=`scale(${scale})`;space.style.width=size[0]*scale+'px';space.style.height=size[1]*scale+'px'}
 function fit(){const available=Math.max(200,$('.preview-stage').clientWidth-48);setScale(Math.min(1,available/size[0]));fitting=true}
 function update(){
   const screen=$('#screen').value,theme=$('#theme').value,tab=screen==='event'?'#'+$('#case-tab').value:'';frame.src=screen+'.html?theme='+theme+tab;
   frame.title=$('#screen').selectedOptions[0].textContent+' · הדגמה מקומית';$('#open-screen').href=frame.src;$('#case-tab-label').hidden=screen!=='event';document.documentElement.dataset.theme=theme;
   frame.width=size[0];frame.height=size[1];$('#preview-status').textContent=$('#screen').selectedOptions[0].textContent+' · '+size[0]+'×'+size[1]+' · '+(theme==='dark'?'כהה':'בהיר');
   if(fitting)fit();else setScale(Number($('#scale').value)/100);evidence();
 }
 function evidence(){
   const round=$('#round').value,theme=$('#shot-theme').value,distance=$('#shot-distance').value,screen=$('#screen').value;
   for(const [name,dimensions] of [['portrait','390x844'],['landscape','844x390']]){
     const path=`iterations/${round}/${screen}-${theme}-${dimensions}-${distance}.webp`;$('#'+name+'-shot').src=path;$('#'+name+'-link').href=path;$('#'+name+'-shot').alt=`צילום ${$('#screen').selectedOptions[0].textContent} · ${dimensions} · סבב ${round} · ${theme==='light'?'בהיר':'כהה'} · ${distance==='near'?'קרוב':'רחוק'}`;
   }
   $('#critique-link').href='iterations/'+round+'/CRITIQUE.md';
 }
 $$('[data-size]').forEach(b=>b.addEventListener('click',()=>{size=b.dataset.size.split(',').map(Number);$$('[data-size]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));update()}));
 ['screen','theme','case-tab'].forEach(id=>$('#'+id).addEventListener('change',update));
 ['round','shot-theme','shot-distance'].forEach(id=>$('#'+id).addEventListener('change',evidence));
 $('#scale').addEventListener('input',()=>{fitting=false;setScale(Number($('#scale').value)/100)});$('#fit').addEventListener('click',fit);addEventListener('resize',()=>{if(fitting)fit()});
 // Reflect supported local frame navigation and theme changes without reloading the frame.
 let observer;
 function syncFromFrame(){
   try{
     const location=frame.contentWindow.location,path=location.pathname.split('/').pop().replace('.html',''),doc=frame.contentDocument;
     if(!screens.includes(path))return;$('#screen').value=path;$('#case-tab-label').hidden=path!=='event';$('#open-screen').href=location.href;frame.title=$('#screen').selectedOptions[0].textContent+' · הדגמה מקומית';
     const theme=doc.documentElement.dataset.theme;if(['light','dark'].includes(theme)){$('#theme').value=theme;document.documentElement.dataset.theme=theme}
     if(path==='event'){const key=location.hash.slice(1);if([...$('#case-tab').options].some(o=>o.value===key))$('#case-tab').value=key}
     $('#preview-status').textContent=$('#screen').selectedOptions[0].textContent+' · '+size[0]+'×'+size[1]+' · '+(theme==='dark'?'כהה':'בהיר');evidence();
   }catch(_){/* Some file:// browsers isolate sibling frames; standalone links remain usable. */}
 }
 frame.addEventListener('load',()=>{
   observer?.disconnect();syncFromFrame();
   try{observer=new MutationObserver(syncFromFrame);observer.observe(frame.contentDocument.documentElement,{attributes:true,attributeFilter:['data-theme']});frame.contentDocument.addEventListener('click',()=>queueMicrotask(syncFromFrame));frame.contentDocument.addEventListener('change',()=>queueMicrotask(syncFromFrame))}catch(_){}
 });
 update();
})();
