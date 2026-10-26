/** Island Pro Basketball — the original league: eight invented clubs, generated players with
 * stable ids, ratings, overall, chemistry, a season schedule, standings and statistical results
 * for games the child does not play. Nothing here copies a real team, player or brand. */

export const TEAMS=[
 {id:'waves',name:'גלי האי',wordmark:'גלים',primary:'#1446a0',secondary:'#f2c230',trim:'#ffffff',shoe:'#e9edf5',darkText:false,strength:0},
 {id:'eagles',name:'נשרי הצוק',wordmark:'נשרים',primary:'#b3122e',secondary:'#111111',trim:'#ffffff',shoe:'#202020',darkText:false,strength:3},
 {id:'storm',name:'סערת המפרץ',wordmark:'סערה',primary:'#5b2a86',secondary:'#f2c230',trim:'#ffffff',shoe:'#efe7fb',darkText:false,strength:2},
 {id:'lions',name:'אריות הנמל',wordmark:'אריות',primary:'#e0661b',secondary:'#14213d',trim:'#ffffff',shoe:'#14213d',darkText:false,strength:1},
 {id:'bolts',name:'ברקי הגבעה',wordmark:'ברקים',primary:'#f2c230',secondary:'#141414',trim:'#141414',shoe:'#141414',darkText:true,strength:-1},
 {id:'reef',name:'כרישי השונית',wordmark:'כרישים',primary:'#0f8b8d',secondary:'#ffffff',trim:'#0b3b3c',shoe:'#ffffff',darkText:false,strength:-2},
 {id:'wolves',name:'זאבי היער',wordmark:'זאבים',primary:'#2c7a3f',secondary:'#c9ced6',trim:'#ffffff',shoe:'#c9ced6',darkText:false,strength:-3},
 {id:'stars',name:'כוכבי הלילה',wordmark:'כוכבים',primary:'#151821',secondary:'#30c5ff',trim:'#ffffff',shoe:'#151821',darkText:false,strength:4},
];

const FIRST=['איתן','נועם','עומר','יונתן','אורי','דניאל','אריאל','עידו','רון','גיא','ליאור','תומר','אלון','יואב','שחר','אמיר','נדב','עמית','אסף','טל','רועי','מאור','יאיר','בן','נתן','שגיא','זיו','עדי','אביב','ברק','אלעד','דור','ניר','אופיר','קובי','שי','אילן','מתן','צחי','אוהד'];
const LAST=['ברקן','שחר','גלעדי','רימון','סלע','אלמוג','כרמי','תבור','נחשון','ארזי','אגמון','שקדי','צור','רז','דגן','חרמון','גפני','לבנון','אשל','ברוש','ענבר','קדם','יערי','שגב','פלג','מרום','זהבי','נוף','אורן','גל'];
const POS=['PG','SG','SF','PF','C','PG','SG','SF','PF','C','SF','PF'];
const HEIGHT={PG:[185,192],SG:[191,198],SF:[198,204],PF:[202,208],C:[207,215]};
const BODY={PG:'guard',SG:'guard',SF:'wing',PF:'forward',C:'big'};
const SKINS=4,HAIR_TINTS=[null,'#2a1d14','#4a3424','#151515','#6b4a2e'];

// position templates: which ratings matter (added to the player's base level)
const TEMPLATE={
 PG:{speed:9,inside:-2,mid:3,three:5,ft:5,pass:12,handle:12,perimD:4,interiorD:-10,block:-14,steal:6,rebound:-12,strength:-8,vertical:2,stamina:5,dunk:-10,release:4},
 SG:{speed:6,inside:0,mid:5,three:9,ft:6,pass:3,handle:6,perimD:5,interiorD:-8,block:-10,steal:5,rebound:-8,strength:-5,vertical:4,stamina:4,dunk:-2,release:6},
 SF:{speed:3,inside:4,mid:4,three:3,ft:2,pass:0,handle:0,perimD:4,interiorD:0,block:-3,steal:2,rebound:0,strength:0,vertical:5,stamina:3,dunk:4,release:2},
 PF:{speed:-3,inside:7,mid:0,three:-6,ft:-3,pass:-4,handle:-8,perimD:-2,interiorD:6,block:5,steal:-3,rebound:8,strength:7,vertical:2,stamina:0,dunk:8,release:-2},
 C:{speed:-8,inside:10,mid:-6,three:-18,ft:-8,pass:-6,handle:-16,perimD:-8,interiorD:11,block:12,steal:-6,rebound:13,strength:11,vertical:-1,stamina:-2,dunk:10,release:-6},
};
export const RATING_KEYS=['speed','inside','mid','three','ft','pass','handle','perimD','interiorD','block','steal','rebound','strength','vertical','stamina','dunk','release'];
const OVR_W={
 PG:{speed:2,three:2,mid:1,pass:3,handle:3,perimD:2,steal:1,inside:1},
 SG:{speed:2,three:3,mid:2,handle:2,perimD:2,steal:1,inside:1,release:1},
 SF:{inside:2,mid:2,three:2,perimD:2,rebound:1,vertical:1,speed:1,dunk:1},
 PF:{inside:3,rebound:3,interiorD:2,block:1,strength:2,mid:1,dunk:1},
 C:{inside:3,rebound:3,interiorD:3,block:3,strength:2,dunk:1},
};

function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function overall(p){
 const w=OVR_W[p.pos]||OVR_W.SF;let s=0,n=0;
 for(const [k,x] of Object.entries(w)){s+=(p.ratings[k]||50)*x;n+=x;}
 return Math.round(s/n);
}

/** Twelve players for a club, stable for the same id. `level` shifts all ratings. */
export function generateRoster(teamId,level=72){
 const r=rng(hash(teamId)),used=new Set(),numbers=new Set();
 return POS.map((pos,i)=>{
  let first,last,key;do{first=FIRST[Math.floor(r()*FIRST.length)];last=LAST[Math.floor(r()*LAST.length)];key=first+last;}while(used.has(key));used.add(key);
  let number;do{number=[0,1,2,3,4,5,7,8,9,10,11,12,13,14,15,20,21,22,23,24,25,30,31,32,33,34,35,40,41,42,44,45,50,55][Math.floor(r()*34)];}while(numbers.has(number));numbers.add(number);
  const starter=i<5,tier=starter?level+r()*6-2:level-6+r()*6;
  const ratings={};
  for(const k of RATING_KEYS)ratings[k]=Math.round(clamp(tier+(TEMPLATE[pos][k]||0)+(r()-0.5)*10,35,97));
  const [h0,h1]=HEIGHT[pos];ratings.height=Math.round(h0+r()*(h1-h0));
  const look={body:BODY[pos],skin:Math.floor(r()*SKINS),hairTint:HAIR_TINTS[Math.floor(r()*HAIR_TINTS.length)]};
  const card={id:`${teamId}-${i+1}`,name:`${first} ${last}`,shortName:last,number,pos,ratings,look,potential:Math.round(clamp(tier+4+r()*10,60,96))};
  card.ovr=overall(card);
  return card;
 });
}

/** Team overall from the five starters and the next three. */
export function teamRating(players,lineup){
 const ids=lineup||players.slice(0,5).map(p=>p.id);
 const start=players.filter(p=>ids.includes(p.id)),bench=players.filter(p=>!ids.includes(p.id)).sort((a,b)=>overall(b)-overall(a)).slice(0,3);
 const avg=a=>a.reduce((s,p)=>s+overall(p),0)/Math.max(1,a.length);
 return Math.round(avg(start)*0.8+avg(bench)*0.2);
}

/** Chemistry 0..100: covered positions, shooters around a big, a ball handler, and games
 * the starters played together. The engine reads it as a small bonus to every rating. */
export function chemistry(players,lineup,together=0){
 const ids=lineup||players.slice(0,5).map(p=>p.id);
 const five=players.filter(p=>ids.includes(p.id));
 const parts={positions:0,handler:0,spacing:0,size:0,together:0};
 parts.positions=new Set(five.map(p=>p.pos)).size*8;                       // up to 40
 parts.handler=five.some(p=>p.ratings.handle>=75&&p.ratings.pass>=72)?15:five.some(p=>p.ratings.handle>=68)?8:0;
 parts.spacing=Math.min(15,five.filter(p=>p.ratings.three>=72).length*5);
 parts.size=five.some(p=>p.ratings.rebound>=75&&p.ratings.block>=68)?15:five.some(p=>p.ratings.rebound>=70)?8:0;
 parts.together=Math.min(15,Math.floor(together/2));
 const total=Object.values(parts).reduce((a,b)=>a+b,0);
 return {total:Math.min(100,total),parts};
}

/** Double round robin: every club meets every other club home and away. */
export function seasonSchedule(teamIds,seed=1){
 const ids=teamIds.slice(),n=ids.length,rounds=[];
 const list=ids.slice();
 for(let r=0;r<n-1;r++){
  const games=[];
  for(let i=0;i<n/2;i++){const a=list[i],b=list[n-1-i];games.push(r%2?[b,a]:[a,b]);}
  rounds.push(games);
  list.splice(1,0,list.pop());
 }
 const second=rounds.map(g=>g.map(([a,b])=>[b,a]));
 const all=[...rounds,...second];
 return all.map((games,i)=>({round:i+1,games:games.map(([home,away],k)=>({id:`r${i+1}g${k+1}`,home,away,score:null}))}));
}

export function standings(schedule,teamIds){
 const t=Object.fromEntries(teamIds.map(id=>[id,{id,w:0,l:0,pf:0,pa:0,streak:0}]));
 for(const r of schedule)for(const g of r.games){
  if(!g.score)continue;const [h,a]=g.score,H=t[g.home],A=t[g.away];
  H.pf+=h;H.pa+=a;A.pf+=a;A.pa+=h;
  if(h>a){H.w++;A.l++;H.streak=H.streak>0?H.streak+1:1;A.streak=A.streak<0?A.streak-1:-1;}
  else{A.w++;H.l++;A.streak=A.streak>0?A.streak+1:1;H.streak=H.streak<0?H.streak-1:-1;}
 }
 return Object.values(t).sort((a,b)=>(b.w-a.w)||((b.pf-b.pa)-(a.pf-a.pa)));
}

/** A result for a game between two computer clubs, from their ratings (not a full simulation). */
export function quickResult(homeRating,awayRating,seed,profile){
 const r=rng(seed),scale=profile==='pro'?1:profile==='quick'?0.42:0.62;
 const edge=(homeRating-awayRating)*1.1+2.5;
 const base=104*scale;
 let h=Math.round(base+edge*scale/2+(r()-0.5)*22*scale),a=Math.round(base-edge*scale/2+(r()-0.5)*22*scale);
 if(h===a)h+=r()<0.5?2:-2;
 return [Math.max(10,h),Math.max(10,a)];
}

/** Training: a drill raises the ratings it trains, with diminishing returns towards the
 * player's potential. Returns the change so the UI can show it before it is bought. */
export const DRILLS={
 shooting:{keys:['mid','three','ft','release'],gain:1.6},
 finishing:{keys:['inside','dunk','strength'],gain:1.5},
 handling:{keys:['handle','pass','speed'],gain:1.4},
 defense:{keys:['perimD','interiorD','steal','block'],gain:1.4},
 athletic:{keys:['speed','vertical','stamina','rebound'],gain:1.2},
};
export function drillPreview(card,drill,quality=1){
 const d=DRILLS[drill];if(!d)return null;
 const out={};
 for(const k of d.keys){
  const cur=card.ratings[k],room=Math.max(0,card.potential+4-cur);
  const add=Math.min(room,Math.round(d.gain*quality*(room>12?1:room>5?0.6:0.3)*10)/10);
  if(add>0)out[k]=+(cur+add).toFixed(1);
 }
 return out;
}
