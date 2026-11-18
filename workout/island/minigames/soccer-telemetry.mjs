/** Light per-match telemetry, kept on the device only (localStorage, last 20 matches, no network).
 * It records what the headless simulation measures (possession, shots, passes, switches) plus the
 * frame times of the real phone, so 5-10 real matches can later calibrate the child proxy in
 * tools/soccer-gameplay-metrics.mjs. Pure apart from the storage object passed to `save`. */
export const SOCCER_TELEMETRY_KEY='island.soccer.telemetry';
export function createSoccerTelemetry({teams='6',stage=1,difficulty='normal',pitch=null}={}){
  const duel={t:0,id:null,clock:0},t={engaged:0,won:0,beaten:0,possession:[0,0],passes:[0,0],loft:[0,0],shots:[0,0],goals:[0,0],steals:[0,0],restarts:0,switches:0,playing:0,frames:0};
  const frameMs=[];let lastControlled=null;
  return {
    frame(state,dt,ms=null){
      if(state.phase!=='playing'||!(dt>0))return;
      const owner=state.ball.owner==null?null:state.players[state.ball.owner],team=owner?owner.team:state.ball.lastTeam;
      if(team===0||team===1)t.possession[team]+=dt;t.playing+=dt;t.frames++;
      if(lastControlled!==null&&state.controlled!==lastControlled)t.switches++;lastControlled=state.controlled;
      if(Number.isFinite(ms)&&ms>0&&frameMs.length<4000)frameMs.push(ms);
      // Defending duels (same definition as tools/soccer-gameplay-metrics.mjs): engaged within 2 m of a rival carrier; won = the ball changes
      // team within 1.5 s; beaten = the carrier is still the owner and more than 4 m away within 1.5 s.
      duel.clock+=dt;const me=state.players[state.controlled];
      if(owner&&owner.team===1&&owner.role!=='keeper'&&me){const d=Math.hypot(me.x-owner.x,me.z-owner.z);
        if(duel.id===null&&d<2){duel.id=owner.id;duel.t=duel.clock;t.engaged++;}
        else if(duel.id===owner.id){if(duel.clock-duel.t<=1.5&&d>4){t.beaten++;duel.id=null;}else if(duel.clock-duel.t>1.5)duel.id=null;}}
      else if(duel.id!==null){if(owner&&owner.team===0&&duel.clock-duel.t<=1.5)t.won++;if(!owner||owner.team===0||duel.clock-duel.t>1.5)duel.id=null;}
    },
    event(e){
      const team=e.team===1?1:0;
      if(e.type==='pass')t.passes[team]++;else if(e.type==='loft')t.loft[team]++;
      else if(e.type==='shot'&&!e.punt)t.shots[team]++;else if(e.type==='goal')t.goals[team]++;
      else if(e.type==='steal'&&e.won)t.steals[team]++;else if(e.type==='restart')t.restarts++;
    },
    summary(result=null){
      const sorted=[...frameMs].sort((a,b)=>a-b),q=f=>sorted.length?+sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))].toFixed(1):null;
      return {at:new Date().toISOString(),teams,stage,difficulty,pitch,seconds:+t.playing.toFixed(1),
        possessionHome:t.playing?+(t.possession[0]/t.playing).toFixed(3):null,shots:[...t.shots],goals:[...t.goals],passes:t.passes.map((n,i)=>n+t.loft[i]),steals:[...t.steals],restarts:t.restarts,duels:{engaged:t.engaged,won:t.won,beaten:t.beaten},switchesPerMinute:t.playing?+(t.switches/(t.playing/60)).toFixed(1):null,
        frameMsP50:q(.5),frameMsP95:q(.95),result:result?{won:!!result.won,goalsFor:result.goalsFor,goalsAgainst:result.goalsAgainst}:null};
    },
    save(storage,summary){
      try{
        const key=SOCCER_TELEMETRY_KEY,list=JSON.parse(storage?.getItem(key)||'[]');
        const next=[...(Array.isArray(list)?list:[]),summary].slice(-20);
        storage?.setItem(key,JSON.stringify(next));return next.length;
      }catch{return 0;}
    }
  };
}
