/** Reused, accessible position labels; the 3D view remains the projection authority.
 * Default scope 'team': only the child's team-mates carry a label, smaller, and the
 * controlled player has none (the marker already shows him). Ten labels over the
 * whole court read as clutter. ?hoopsLabels=all restores the old behaviour. */
import {positionName,abilitySummary,ABILITY_NAMES} from './hoops-roles.mjs';
const ABILITY_KEYS=Object.keys(ABILITY_NAMES);
export const LABEL_SCOPES=['team','all'],TEAM_LABEL_SCALE=.8;
/** Which players get a label under a scope. The child's team is snapshot.userTeam,
 * or the team of the controlled player when a snapshot predates that field. */
export function labelledPlayers(snapshot,scope='team'){
 const players=snapshot?.players||[];if(scope==='all')return players;
 const mine=snapshot.userTeam??players.find(p=>p.controlled||p.id===snapshot.controlled)?.team;
 return players.filter(p=>p.team===mine&&!(p.controlled||p.id===snapshot.controlled));
}
export function arrangeRoleLabels(candidates,{width,height,top=58}={}){
 const placed=[];
 for(const c of candidates){if(!c.visible||c.x<0||c.x>width||c.y<top||c.y>height-12)continue;let y=c.y;
  for(let attempt=0;attempt<6;attempt++){if(!placed.some(p=>Math.abs(p.x-c.x)<34&&Math.abs(p.y-y)<20))break;y-=20;}
  if(y>=top)placed.push({...c,x:Math.round(Math.max(18,Math.min(width-18,c.x))),y:Math.round(y)});
 }return placed;
}
export function createHoopsRoleLabels(stage,{doc=stage.ownerDocument,scope='team'}={}){
 scope=LABEL_SCOPES.includes(scope)?scope:'team';
 const layer=doc.createElement('div');layer.className='hoops-role-labels';layer.dataset.scope=scope;layer.setAttribute('aria-label',scope==='all'?'תפקידי השחקנים':'תפקידי חברי הקבוצה');stage.append(layer);
 const nodes=new Map(),scale=scope==='all'?'':` scale(${TEAM_LABEL_SCALE})`;let disposed=false;
 return {update(snapshot,view){if(disposed||!view)return;const candidates=[];for(const p of labelledPlayers(snapshot,scope)){let item=nodes.get(p.id);if(!item){const node=doc.createElement('bdi');node.className='hoops-role-label';node.dir='ltr';node.dataset.playerId=p.id;const code=doc.createElement('span');code.className='hoops-role-code';code.textContent=p.pos;node.append(code);
   // six ability bars (no words on the court): shown on the player the child controls
   const bars=doc.createElement('span');bars.className='hoops-role-bars';bars.setAttribute('aria-hidden','true');for(const key of ABILITY_KEYS){const bar=doc.createElement('i');bar.dataset.ability=key;bar.style.setProperty('--v',String(((p.abilities?.[key]??50)-20)/79));bars.append(bar);}node.append(bars);
   node.title=(p.positionName||positionName(p.pos))+(p.abilities?' · '+abilitySummary(p):'');node.setAttribute('aria-label',node.title);layer.append(node);item={node,projection:{},last:''};nodes.set(p.id,item);}const q=view.project(p.x,p.y+2.22,p.z,item.projection);candidates.push({id:p.id,pos:p.pos,controlled:p.controlled,team:p.team,x:q.x,y:q.y,visible:q.visible});}
   candidates.sort((a,b)=>Number(b.controlled)-Number(a.controlled));const placed=arrangeRoleLabels(candidates,{width:stage.clientWidth,height:stage.clientHeight,top:stage.clientWidth>stage.clientHeight?60:112});
   const seen=new Set();for(const p of placed){const item=nodes.get(p.id),key=p.x+':'+p.y+':'+p.controlled+':'+p.team;item.node.hidden=false;seen.add(p.id);if(key!==item.last){item.last=key;item.node.style.transform=`translate3d(${p.x}px,${p.y}px,0)`+scale;item.node.dataset.controlled=String(p.controlled);item.node.dataset.team=String(p.team);}}
   for(const [id,item] of nodes)if(!seen.has(id))item.node.hidden=true;
  },dispose(){disposed=true;nodes.clear();layer.remove();},get count(){return nodes.size;},get scope(){return scope;}};
}
