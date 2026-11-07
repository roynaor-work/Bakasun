const prepared=Symbol('soccerMatchSquad');
const ROLE_BY_SLOT=['CF','RCM','GK','LW'];
/** Extra players per side, in the order they are added: 6-a-side adds the first two, 8-a-side the first four,
 * 11-a-side all seven. Kickoff fractions are of half-length (x, own half) and half-width (z). */
export const SOCCER_EXTRAS=[
 {role:'support',template:1,tacticalRole:'LCB',matchNumber:15,kickoff:[-.55,-.32]},
 {role:'wing',template:3,tacticalRole:'RCB',matchNumber:18,kickoff:[-.55,.32]},
 {role:'wing',template:3,tacticalRole:'RW',matchNumber:11,kickoff:[-.2,.62]},
 {role:'support',template:1,tacticalRole:'LCM',matchNumber:14,kickoff:[-.3,-.35]},
 {role:'wing',template:3,tacticalRole:'LB',matchNumber:3,kickoff:[-.5,-.8]},
 {role:'wing',template:3,tacticalRole:'RB',matchNumber:2,kickoff:[-.5,.8]},
 {role:'support',template:1,tacticalRole:'DM',matchNumber:6,kickoff:[-.38,0]}
];
/** Extend only a match's roster. The saved four player cards and their IDs,
 * ranks, training and migration contracts are never expanded or rewritten. */
export function expandSoccerConfig(config){
 const extras=config.squad?.extraPlayersPerTeam??0;
 if(!Number.isInteger(extras)||extras<0||extras>SOCCER_EXTRAS.length)throw new RangeError('Soccer extraPlayersPerTeam must be an integer from 0 to '+SOCCER_EXTRAS.length);
 if(config[prepared]===extras)return config;
 const original=config.players.roster.filter(entry=>!entry.soccerExtra);
 const roster=original.map(entry=>({...entry,tacticalRole:entry.tacticalRole||ROLE_BY_SLOT[entry.template]}));
 for(let i=0;i<extras;i++)for(const team of [0,1]){const e=SOCCER_EXTRAS[i];roster.push({team,role:e.role,template:e.template,tacticalRole:e.tacticalRole,soccerExtra:true,matchNumber:e.matchNumber});}
 const lengthen=list=>Array.isArray(list)?Array.from({length:roster.length},(_,i)=>list[i%list.length]):list;
 const appearance=Object.fromEntries(Object.entries(config.view.appearance||{}).map(([key,value])=>[key,lengthen(value)]));
 return {...config,[prepared]:extras,players:{...config.players,roster},view:{...config.view,appearance,athlete:{...config.view.athlete,profiles:lengthen(config.view.athlete?.profiles)}}};
}

export function soccerMatchCards(config,team,createCards,...args){
 const cards=createCards(config,team,...args);
 for(let id=0;id<cards.length;id++)if(config.players.roster[id].soccerExtra)cards[id]={...cards[id],number:config.players.roster[id].matchNumber};
 return cards;
}
