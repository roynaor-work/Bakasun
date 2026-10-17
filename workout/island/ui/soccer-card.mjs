import {attributes,cardRating} from '../activity/soccer-card.mjs?v=g7-g3f-20261017-1';
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;n.textContent=text??'';return n;};
/** Local SVG portrait uses only the validated avatar palette; names remain text. */
export function playerCard(state,balance,t,{starsAdded}={}) {
  const card=state.soccerCard,rating=cardRating(card,balance),root=node('article',`soccer-player-card ${rating.tier}`);
  root.dataset.playerCard=rating.tier;root.setAttribute('aria-label',t('soccer.card'));
  root.append(node('strong','soccer-overall',String(rating.overall)),node('h3','soccer-card-name',t(state.avatar.nameId)));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 160 142');svg.setAttribute('aria-hidden','true');svg.classList.add('soccer-portrait');
  const shape=(tag,properties)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [key,value]of Object.entries(properties))n.setAttribute(key,String(value));svg.append(n);};
  const a=state.avatar;
  shape('path',{d:'M22 142 L26 110 Q40 88 66 86 L94 86 Q120 88 134 110 L138 142Z',fill:a.shirtColor,stroke:'#193c4c','stroke-width':3});
  shape('rect',{x:67,y:73,width:26,height:27,rx:9,fill:a.skinColor});
  shape('ellipse',{cx:80,cy:49,rx:32,ry:39,fill:a.skinColor,stroke:'#193c4c','stroke-width':2});
  shape('path',{d:a.hairstyle==='short'?'M48 46 Q40 0 80 4 Q120 0 112 44 L100 27 L59 28Z':'M48 48 Q37 2 80 3 Q123 1 112 48 L104 24 Q74 39 54 27Z',fill:a.hairColor});
  for(const cx of [68,92])shape('ellipse',{cx,cy:50,rx:3,ry:4,fill:'#19313b'});
  shape('path',{d:'M69 68 Q80 77 91 68',fill:'none',stroke:'#7b453b','stroke-width':3,'stroke-linecap':'round'});
  shape('path',{d:'M63 98 Q80 113 97 98',fill:'none',stroke:'#fff6d5','stroke-width':4});root.append(svg);
  const list=node('dl','soccer-card-attributes');
  for(const key of attributes){const row=node('div','');row.append(node('dt','',t(`soccer.attribute.${key}`)),node('dd','',String(card.attributes[key])));list.append(row);}root.append(list);
  root.append(node('p','soccer-wallet',t('soccer.wallet',{stars:card.stars})));
  if(starsAdded!==undefined)root.append(node('p','soccer-stars-added',t('soccer.starsAdded',{stars:starsAdded})));
  return root;
}
