const cssURL=new URL('./broadcast.css',import.meta.url).href;

/** Presentation only. Host supplies match state and elapsed time. No timers,
 * storage, network calls or game-state changes. Arbitrary names are text. */
export function createBroadcastHUD(parent,{home='בית',away='חוץ',reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}={}) {
  if(!parent?.append)throw new TypeError('A HUD parent element is required');
  const host=document.createElement('div');host.className='stadium-broadcast';
  const shadow=host.attachShadow({mode:'open'});
  const link=document.createElement('link');link.rel='stylesheet';link.href=cssURL;shadow.append(link);
  const ready=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(new Error('Broadcast stylesheet failed to load'));});
  const wrapper=document.createElement('div');wrapper.className='broadcast';wrapper.dataset.motion=reducedMotion?'reduced':'full';
  wrapper.innerHTML=`<div class="topline"><div class="scorebug" role="group" aria-label="תוצאה ושעון"><span class="team home"></span><strong class="score home-score">0</strong><span class="separator">:</span><strong class="score away-score">0</strong><span class="team away"></span><time class="clock">00:00</time></div><span class="live"><i></i>שידור חי</span></div><div class="opening" hidden><div class="opening-kicker">כדורגל · משחק ערב</div><div class="opening-title">מתחת לאורות</div><div class="matchup"><span class="opening-home"></span><span class="versus">מול</span><span class="opening-away"></span></div><div class="opening-detail">הערב מתחיל כאן</div><div class="opening-rule"></div></div><div class="caption"><span class="caption-rule"></span><span class="caption-text">כדורגל · מבט שידור</span></div>`;
  shadow.append(wrapper);parent.append(host);
  const $=selector=>wrapper.querySelector(selector),names={home:String(home).slice(0,24),away:String(away).slice(0,24)};
  for(const key of ['home','away']){ $('.team.'+key).textContent=names[key];$('.opening-'+key).textContent=names[key];}
  const nonnegative=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
  const homeNode=$('.home-score'),awayNode=$('.away-score'),clockNode=$('.clock'),scorebug=$('.scorebug'),opening=$('.opening'),captionNode=$('.caption-text');
  let lastHome,lastAway,lastSeconds,lastOpening,lastCaption;
  return {element:host,ready,
    update({homeScore=0,awayScore=0,seconds=0,phase='live',caption}={}){
      const h=nonnegative(homeScore),a=nonnegative(awayScore),s=nonnegative(seconds);
      const changed=h!==lastHome||a!==lastAway||s!==lastSeconds;
      if(h!==lastHome)homeNode.textContent=h;if(a!==lastAway)awayNode.textContent=a;
      if(changed){
        const clock=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        if(s!==lastSeconds){clockNode.textContent=clock;clockNode.dateTime=`PT${s}S`;}
        scorebug.setAttribute('aria-label',`${names.home} ${h}, ${names.away} ${a}, ${clock}`);
      }
      lastHome=h;lastAway=a;lastSeconds=s;
      const isOpening=phase==='opening';
      if(isOpening!==lastOpening){opening.hidden=!isOpening;scorebug.hidden=isOpening;lastOpening=isOpening;}
      if(caption!==undefined){const text=String(caption).slice(0,100);if(text!==lastCaption){captionNode.textContent=text;lastCaption=text;}}
    },
    dispose(){host.remove();},
  };
}
