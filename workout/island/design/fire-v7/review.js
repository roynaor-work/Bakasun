(function(){
  'use strict';const $=id=>document.getElementById(id),data=window.FireReviewData;
  for(const id of ['round-a','round-b'])for(const round of data.rounds){const option=document.createElement('option');option.value=round.id;option.textContent='סבב '+round.id;$(id).append(option);}
  $('round-a').value='01';$('round-b').value=data.rounds.at(-1).id;
  function update(){
    const a=$('round-a').value,b=$('round-b').value,orientation=$('orientation').value,camera=$('camera').value;
    const landscape=orientation==='844x390';$('photo').classList.toggle('landscape',landscape);document.querySelector('.comparison-layout').classList.toggle('landscape',landscape);
    for(const[side,id]of [['a',a],['b',b]]){
      const round=data.rounds.find(r=>r.id===id),shot=round.captures.find(c=>c.file===orientation+'-'+camera+'.webp');
      $('image-'+side).src='iterations/'+id+'/'+shot.file;$('image-'+side).alt='סבב '+id+', '+orientation+', '+(camera==='near'?'קרוב':'רחב');$('tag-'+side).textContent='סבב '+id;
      const box=$('summary-'+side);box.replaceChildren();const title=document.createElement('strong');title.textContent='סבב '+id+' · '+round.title;
      const text=document.createElement('p');text.textContent=round.summary;const link=document.createElement('a');link.href='iterations/'+id+'/CRITIQUE.md';link.textContent='לביקורת המלאה ↗';box.append(title,text,link);
      $('tris-'+side).textContent=shot.triangles.toLocaleString('en-US');$('draws-'+side).textContent=shot.drawCalls;$('fx-'+side).textContent=shot.particles;
    }
  }
  function reveal(value){const n=Math.max(0,Math.min(100,Number(value)));$('slider').value=n;$('reveal').style.clipPath=`inset(0 ${100-n}% 0 0)`;$('divider').style.left=n+'%';}
  for(const id of ['round-a','round-b','orientation','camera'])$(id).addEventListener('change',update);
  $('slider').addEventListener('input',()=>reveal($('slider').value));
  let dragging=false;$('photo').addEventListener('pointerdown',e=>{dragging=true;$('photo').setPointerCapture(e.pointerId);const r=$('photo').getBoundingClientRect();reveal((e.clientX-r.left)/r.width*100);});
  $('photo').addEventListener('pointermove',e=>{if(!dragging)return;const r=$('photo').getBoundingClientRect();reveal((e.clientX-r.left)/r.width*100);});$('photo').addEventListener('pointerup',()=>dragging=false);$('photo').addEventListener('pointercancel',()=>dragging=false);
  update();reveal(50);
})();
