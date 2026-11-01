const prepared=Symbol('soccerMatchSquad');
const ROLE_BY_SLOT=['CF','RCM','GK','LW'];
/** Extend only a match's roster. The saved four player cards and their IDs,
 * ranks, training and migration contracts are never expanded or rewritten. */
export function expandSoccerConfig(config){
 const extras=config.squad?.extraPlayersPerTeam??0;
 if(!Number.isInteger(extras)||extras<0||extras>2)throw new RangeError('Soccer extraPlayersPerTeam must be 0, 1 or 2');
 if(config[prepared]===extras)return config;
 const original=config.players.roster.filter(entry=>!entry.soccerExtra);
 const roster=original.map(entry=>({...entry,tacticalRole:entry.tacticalRole||ROLE_BY_SLOT[entry.template]}));
 for(let i=0;i<extras;i++)for(const team of [0,1])roster.push({team,role:i?'wing':'support',template:i?3:1,tacticalRole:i?'RCB':'LCB',soccerExtra:true,matchNumber:i?18:15});
 const lengthen=list=>Array.isArray(list)?Array.from({length:roster.length},(_,i)=>list[i%list.length]):list;
 const appearance=Object.fromEntries(Object.entries(config.view.appearance||{}).map(([key,value])=>[key,lengthen(value)]));
 return {...config,[prepared]:extras,players:{...config.players,roster},view:{...config.view,appearance,athlete:{...config.view.athlete,profiles:lengthen(config.view.athlete?.profiles)}}};
}

export function soccerMatchCards(config,team,createCards,...args){
 const cards=createCards(config,team,...args);
 for(let id=0;id<cards.length;id++)if(config.players.roster[id].soccerExtra)cards[id]={...cards[id],number:config.players.roster[id].matchNumber};
 return cards;
}
