// racing-league-v1 (Codex, CC0; assets/racing-league-v1, from design/racing-league): six team crests (by TEAMS id), two trophies, three medals, the season-end podium backdrop and
// the season screen banner. Off with ?racingLeagueArt=0: every screen of ui/racing-league.mjs is built exactly as before (no img, no rl-art class). Pure URL helpers plus a
// few DOM bits; the screens call them only when leagueArtEnabled().
export const leagueArtEnabled=(search=globalThis.location?.search||'')=>new URLSearchParams(search).get('racingLeagueArt')!=='0';
export const LEAGUE_ART_DIR='../assets/racing-league-v1/';
/** Crest files, one per id of TEAMS in racing-league-core.mjs. */
export const TEAM_CREST=Object.freeze({flame:'teams/flame.svg',ocean:'teams/ocean.svg',gold:'teams/gold.svg',silver:'teams/silver.svg',forest:'teams/forest.svg',night:'teams/night.svg'});
export const TROPHY=Object.freeze({driver:'trophies/driver-champion.svg',team:'trophies/team-champion.svg'});
export const MEDAL=Object.freeze({1:'medals/gold.svg',2:'medals/silver.svg',3:'medals/bronze.svg'});
export const BACKGROUND=Object.freeze({podium:'backgrounds/podium.webp',season:'backgrounds/season.webp'});
export const LEAGUE_ART_FILES=Object.freeze([...Object.values(TEAM_CREST),...Object.values(TROPHY),...Object.values(MEDAL),...Object.values(BACKGROUND),'LICENSES.md']);
export const leagueArtUrl=file=>new URL(LEAGUE_ART_DIR+file,import.meta.url).href;
/** <img> for a team crest / trophy / medal (decorative: the name next to it carries the meaning); null for an id without art. */
function image(file,cls,size){if(!file)return null;const img=document.createElement('img');img.className=cls;img.src=leagueArtUrl(file);img.alt='';img.width=img.height=size;img.decoding='async';img.draggable=false;return img;}
export const crestImg=(teamId,size=22)=>image(TEAM_CREST[teamId],'rl-crest',size);
export const trophyImg=(kind,size=56)=>image(TROPHY[kind],'rl-trophy',size);
export const medalImg=(place,size=72)=>image(MEDAL[place],'rl-medal-img',size);
/** Marks a screen root as art-enabled and gives the stylesheet the two backgrounds as custom properties (urls resolve from this module, not from the stylesheet). */
export function markArt(root){root.classList.add('rl-art');root.style.setProperty('--rl-podium-bg',`url("${leagueArtUrl(BACKGROUND.podium)}")`);root.style.setProperty('--rl-season-bg',`url("${leagueArtUrl(BACKGROUND.season)}")`);return root;}
