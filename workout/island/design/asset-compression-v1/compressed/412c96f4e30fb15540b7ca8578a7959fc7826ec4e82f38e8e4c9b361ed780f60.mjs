/** Validates an Island Pro Basketball result against the game that was started. The island
 * economy and the club's season credit it once; malformed or impossible results are refused. */
const FIELDS=['won','scoreFor','scoreAgainst','quarters','overtime','profile','stage','seed','gameSeconds','gameId','opponent','box','mvp'];
const BOX=['id','pts','reb','ast','stl','blk','sec','fgm','fga','tpm','tpa','ftm','fta','pf','tov'];

export function hoopsResult(raw,ctx,balance){
 const r=raw?.streetSlam;
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==FIELDS.length||!FIELDS.every(k=>Object.hasOwn(r,k)))return null;
 if(!['scoreFor','scoreAgainst','quarters','overtime'].every(k=>Number.isInteger(r[k])&&r[k]>=0)||r.scoreFor>balance.maximumScore||r.scoreAgainst>balance.maximumScore)return null;
 if(r.scoreFor===r.scoreAgainst||typeof r.won!=='boolean'||r.won!==(r.scoreFor>r.scoreAgainst))return null;
 if(!Number.isInteger(r.stage)||r.stage!==ctx.level||r.stage<1||r.stage>balance.levels.length)return null;
 if(!Number.isInteger(r.seed)||r.seed!==(ctx.seed>>>0))return null;
 const prof=balance.rules.profiles[r.profile];if(!prof)return null;
 if(r.quarters!==4+r.overtime)return null;
 const minimum=4*prof.quarterSeconds+r.overtime*prof.overtimeSeconds;
 if(!Number.isFinite(r.gameSeconds)||r.gameSeconds<minimum-1||r.gameSeconds>minimum+1)return null;
 if(r.gameId!==null&&(typeof r.gameId!=='string'||r.gameId!==(ctx.hoopsGame?.id??null)))return null;
 if(typeof r.opponent!=='string'||r.opponent.length>32)return null;
 if(!Array.isArray(r.box)||r.box.length<5||r.box.length>15)return null;
 let points=0;
 for(const p of r.box){
  if(!p||typeof p!=='object'||Object.keys(p).length!==BOX.length||!BOX.every(k=>Object.hasOwn(p,k)))return null;
  if(typeof p.id!=='string'||p.id.length>40)return null;
  if(!BOX.slice(1).every(k=>Number.isInteger(p[k])&&p[k]>=0&&p[k]<=1e5))return null;
  points+=p.pts;
 }
 if(points!==r.scoreFor)return null;
 if(r.mvp!==null&&!r.box.some(p=>p.id===r.mvp))return null;
 const scale=r.profile==='pro'?3:r.profile==='quick'?0.6:1;
 const margin=r.scoreFor-r.scoreAgainst,stars=r.won?margin>=Math.round(balance.stars.three*scale)?3:margin>=Math.round(balance.stars.two*scale)?2:1:0;
 if(raw.outcome!==(r.won?'win':'lose')||raw.score!==r.scoreFor)return null;
 const level=balance.levels[r.stage-1];
 return {outcome:raw.outcome,score:r.scoreFor,stars,money:r.won?level.winMoney+Math.floor(r.scoreFor/8):Math.floor(level.winMoney/4),
  hoops:{gameId:r.gameId,won:r.won,score:[r.scoreFor,r.scoreAgainst],opponent:r.opponent,box:r.box.map(p=>({...p})),mvp:r.mvp,profile:r.profile}};
}
