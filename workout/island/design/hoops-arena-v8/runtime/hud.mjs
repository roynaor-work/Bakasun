/** Scoped broadcast graphics. Call update with real game state; defaults are fictional. */
export function createBroadcastHUD(container,{onView=()=>{},onReplay=()=>{},onQuality=()=>{},onSeek=()=>{}}={}) {
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./hud.css',import.meta.url).href;
  const host=document.createElement('div');host.className='arenaHud';host.dir='rtl';
  host.innerHTML=`<div class="arenaHud__mast"><div class="arenaHud__edition"><span>אולם 08</span><small>כדורסל · ערב משחק</small></div><div class="arenaHud__live"><i></i><span data-live>שידור חי</span></div></div>
  <nav class="arenaHud__tools" aria-label="מבט באולם"><button type="button" data-view="far" aria-pressed="true">רחב</button><button type="button" data-view="near" aria-pressed="false">קרוב</button><button type="button" data-replay aria-pressed="false">ריפליי</button><button type="button" data-quality aria-label="איכות אוטומטית">איכות</button></nav>
  <div class="arenaHud__replayTag" hidden><span>ריפליי</span><b>×0.5</b><small>מבט סל</small></div>
  <div class="arenaHud__insetLabel" hidden>שידור חי</div>
  <div class="arenaHud__bottom"><div class="arenaHud__timeline" hidden><button type="button" data-resume>חזרה לשידור</button><label>ריפליי<input type="range" min="0" max="1000" value="0" aria-label="נקודה בריפליי"></label><output data-replay-time>00.0</output></div>
  <section class="arenaHud__score" aria-label="לוח תוצאות"><div class="arenaHud__team arenaHud__team--home"><div><b data-home-name>טורקיז</b><span class="arenaHud__fouls">עבירות <em data-home-fouls>3</em><span data-home-dots></span></span></div><strong data-home-score>68</strong></div><div class="arenaHud__time"><span data-period>רבע 4</span><b data-clock>02:18</b></div><div class="arenaHud__shot"><small>שעון זריקה</small><b data-shot>24</b></div><div class="arenaHud__team arenaHud__team--away"><strong data-away-score>64</strong><div><b data-away-name>ענבר</b><span class="arenaHud__fouls">עבירות <em data-away-fouls>4</em><span data-away-dots></span></span></div></div></section>
  <div class="arenaHud__caption"><span>ערב משחק</span><span>מגרש מרכזי · <b data-view-caption>מבט שידור</b></span></div></div>`;
  host.prepend(link);container.append(host);
  const q=s=>host.querySelector(s);let replay=false,quality='auto';
  const click=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.view){setView(b.dataset.view);onView(b.dataset.view);}
    else if(b.hasAttribute('data-replay')){setReplay(!replay);onReplay(replay);}
    else if(b.hasAttribute('data-resume')){setReplay(false);onReplay(false);}
    else if(b.hasAttribute('data-quality')){quality=quality==='auto'?2:quality===2?0:'auto';b.textContent=quality==='auto'?'איכות':quality===2?'חסכוני':'מלא';b.setAttribute('aria-label',quality==='auto'?'איכות אוטומטית':quality===2?'איכות חסכונית':'איכות מלאה');onQuality(quality);}
  };
  host.addEventListener('click',click);
  const seek=e=>onSeek(Number(e.target.value)/1000);q('input').addEventListener('input',seek);
  function setView(view) {
    host.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    q('[data-view-caption]').textContent=view==='near'?'מבט סל':'מבט שידור';
  }
  function setReplay(active) {
    replay=!!active;host.classList.toggle('arenaHud--replay',replay);
    q('[data-replay]').setAttribute('aria-pressed',String(replay));
    for(const s of ['.arenaHud__replayTag','.arenaHud__timeline','.arenaHud__insetLabel'])q(s).hidden=!replay;
    q('[data-live]').textContent=replay?'שידור חוזר':'שידור חי';
  }
  function update(s={}) {
    const values={home:68,away:64,homeName:'טורקיז',awayName:'ענבר',homeFouls:3,awayFouls:4,period:4,clock:'02:18',shot:24,...s};
    for(const [key,sel]of Object.entries({home:'home-score',away:'away-score',homeName:'home-name',awayName:'away-name',homeFouls:'home-fouls',awayFouls:'away-fouls',clock:'clock',shot:'shot'}))q('[data-'+sel+']').textContent=String(values[key]);
    q('[data-period]').textContent='רבע '+values.period;
    for(const side of ['home','away']) {
      const wrap=q('[data-'+side+'-dots]');wrap.replaceChildren();
      for(let i=0;i<5;i++){const dot=document.createElement('i');dot.className=i<values[side+'Fouls']?'is-on':'';wrap.append(dot);}
    }
    q('.arenaHud__shot').classList.toggle('is-urgent',Number(values.shot)<=5);
  }
  function progress(time,duration){q('input').value=String(duration?Math.round(time/duration*1000):0);q('[data-replay-time]').textContent=time.toFixed(1).padStart(4,'0');}
  update();
  return {host,update,setView,setReplay,progress,destroy(){host.removeEventListener('click',click);q('input').removeEventListener('input',seek);host.remove();}};
}
