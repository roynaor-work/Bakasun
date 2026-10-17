/** Only earned permanent ranks live in the save; timed bonuses never do. */
export function initialAlienUpgrades(data){return Object.fromEntries(data.config.minigames.alienDefense.campaign.choiceIds.map(id=>[id,0]));}
export function validAlienUpgrades(ranks,data){const c=data.config.minigames.alienDefense.campaign;return ranks&&typeof ranks==='object'&&!Array.isArray(ranks)&&Object.keys(ranks).length===c.choiceIds.length&&c.choiceIds.every(id=>Number.isInteger(ranks[id])&&ranks[id]>=0&&ranks[id]<=c.maxStack);}
export function availableAlienUpgrades(ranks,balance,equipment={},careerWins=0){return balance.campaign.choiceIds.filter(id=>ranks[id]<balance.campaign.maxStack&&(id!=='wing'||careerWins>=balance.hangar.firstDoubleWin&&ranks.wing+(equipment.weapon||0)<balance.campaign.maxWings));}
