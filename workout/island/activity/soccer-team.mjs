/** Soccer reads the city's identity; purchased ranks, rather than playerDefaults,
 * determine the match's starting abilities. The simulation remains unchanged. */
export function soccerAvailability(state) {
  return state.buildings.some(row=>row.typeId==='soccer') ? {ok:true} : {ok:false,reason:'minigame.soccer.locked'};
}
export function teamRank(wins,balance) {
  return balance.teamRanks.reduce((rank,row,index)=>wins>=row.wins?index:rank,0);
}
export function validTeamProgress(team,balance) {
  return Number.isSafeInteger(team.wins)&&team.wins>=0&&Number.isInteger(team.rank)&&team.rank>=0&&team.rank<balance.teamRanks.length&&team.rank===teamRank(team.wins,balance);
}
export function recordTeamWin(state,balance,sport='soccer') {
  if(state.team.sportWins)state.team.sportWins[sport]=Math.min(Number.MAX_SAFE_INTEGER,(state.team.sportWins[sport]||0)+1);
  state.team.wins=Math.min(Number.MAX_SAFE_INTEGER,state.team.wins+1);
  state.team.rank=teamRank(state.team.wins,balance);
}
export function soccerTeam(ctx,balance) {
  const state=ctx.state,bonus=balance.teamRanks[state.team.rank].bonus;
  return {...state.team,colors:[...state.team.colors],players:balance.team.players.map(template=>{
    const player=state.players.find(row=>row.id===template.id);
    const ranks=Object.fromEntries(['speed','kick','guard'].map(key=>[key,Math.max(balance.team.minRank,Math.min(balance.team.maxRank,Math.round((ctx.equipment[key]+bonus)*(ctx.power||1))))]));
    return {...template,...player,...ranks};
  })};
}
export function soccerViewConfig(ctx,balance) {
  return {...balance,team:soccerTeam(ctx,balance),opponent:balance.opponents[(ctx.level-1)%balance.opponents.length]};
}
