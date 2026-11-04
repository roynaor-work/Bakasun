"""Create an independent one-file device measurement surface from the viewer."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
addon=r'''
<style>.stage .phone-panel{display:block!important}.phone-panel{width:202px;padding:10px;font-size:11px;pointer-events:auto}.phone-panel h2{font-size:13px;font-weight:500;margin:0 0 6px}.phone-panel p{font-size:10px;line-height:1.5;margin:5px 0;color:#596a52}.phone-panel button{min-height:44px;width:100%;border:1px solid #afbea4;border-radius:3px;background:#e5ead8;margin-top:6px;font-size:11px}.phone-panel button:disabled{opacity:.6}.phone-panel output{display:block;font:11px/1.7 monospace;direction:ltr;white-space:pre-wrap;margin-top:8px}.phone-panel [hidden]{display:none}</style>
<script>
(function(){
function boot(){
 if(!window.tennis||!tennis.ready){setTimeout(boot,100);return;}
 const panel=document.createElement('aside');panel.className='scorebug phone-panel';panel.setAttribute('aria-label','בדיקת קצב במכשיר');
 panel.innerHTML='<h2>בדיקת המכשיר הזה</h2><p>בחרו משטח, תאורה ואיכות, סובבו את הטלפון ומדדו דקה. השאירו את החלון פתוח. המדידה נשארת במכשיר.</p><button id="phone-run">מדידת 60 שניות</button><p id="phone-status" role="status">מוכן למדידה</p><output id="phone-result" hidden></output><button id="phone-copy" hidden>העתקת תוצאה</button>';
 document.querySelector('.scorebug')?.remove();document.querySelector('.stage').append(panel);
 const run=document.getElementById('phone-run'),status=document.getElementById('phone-status'),output=document.getElementById('phone-result'),copy=document.getElementById('phone-copy');
 let last=null;
 async function measure(seconds=60){
  if(run.disabled)return;run.disabled=true;output.hidden=true;copy.hidden=true;const start=performance.now();status.textContent='המדידה רצה…';
  tennis.setState({playing:true});
  const timer=setInterval(()=>{status.textContent='נותרו '+Math.max(0,Math.ceil(seconds-(performance.now()-start)/1000))+' שניות';},1000);
  try{
   const data=await tennis.measure(seconds);last={source:'tennis-v7 phone-check',measuredAt:new Date().toISOString(),requestedSeconds:seconds,...data};window.phoneCheck.last=last;
   output.textContent='Average: '+data.fps.toFixed(2)+' fps\nLast window: '+data.tailWindow.fps.toFixed(2)+' fps\np95: '+data.frameMs.p95.toFixed(1)+' ms\nDPR: '+data.diagnostics.pixelRatio.toFixed(3);
   status.textContent='הסתיים. התוצאה מתייחסת למכשיר ולהגדרות שהוצגו.';output.hidden=false;copy.hidden=false;return last;
  }catch(error){status.textContent='המדידה לא הושלמה: '+error.message;throw error;}
  finally{clearInterval(timer);run.disabled=false;}
 }
 run.addEventListener('click',()=>measure(60));
 copy.addEventListener('click',async()=>{
  const text=JSON.stringify(last,null,2);
  try{await navigator.clipboard.writeText(text);}catch{
   const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const copied=document.execCommand('copy');
   if(!copied){area.style.opacity='1';area.style.inset='20px';area.style.zIndex='100';status.textContent='אפשר לסמן ולהעתיק מהתיבה';return;}area.remove();
  }
  copy.textContent='הועתק';setTimeout(()=>copy.textContent='העתקת תוצאה',1800);
 });
 window.phoneCheck={run:measure,last:null,ready:true};
}
boot();
})();
</script>
'''
html=(ROOT/'standalone.html').read_text();head,tail=html.rsplit('</body>',1)
(ROOT/'phone-check.html').write_text(head+addon+'</body>'+tail)
print('Phone-check one-file bytes:',(ROOT/'phone-check.html').stat().st_size)
