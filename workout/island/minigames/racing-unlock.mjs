/** Audio unlock for the racing session. Chrome and Safari do not treat a touch pointerdown as a user activation (pointerup, touchend and click are), and a
 * driver who keeps a thumb on the wheel never lifts it, so the first press alone could leave the audio suspended until a button was tapped (racing-sound-start).
 * Every activation-capable event retries the unlock, a timer retries while the context is suspended, and the session also unlocks once at start
 * (the Play tap that opened the race is usually still an activation). */
export function bindAudioUnlock({screen,canvas,audio,signal,retryMs=500,now=()=>Date.now(),setTimer=globalThis.setInterval,clearTimer=globalThis.clearInterval}){
  const unlock=()=>{try{audio.unlock();}catch{}};
  for(const type of ['pointerdown','pointerup','touchend','click','keydown'])screen?.addEventListener?.(type,unlock,{capture:true,passive:true,signal});
  canvas?.addEventListener?.('keydown',unlock,{signal});
  unlock();
  // while the context is suspended keep asking (cheap): the first activation that is allowed to start audio wins
  const timer=setTimer?.(()=>{const state=audio.engine?.().contextState;if(state==='running'){return;}unlock();},retryMs);
  signal?.addEventListener?.('abort',()=>clearTimer?.(timer),{once:true});
  return {unlock,stop(){clearTimer?.(timer);}};
}
