import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
const load=p=>import(pathToFileURL(resolve(root,p)));
const {ActivityInterface}=await load('workout/island/ui/activity.mjs');
const {createTranslator}=await load('workout/island/ui/translate.mjs');
const {createRacing}=await load('workout/island/minigames/racing-physics.mjs');
const flags=await load('workout/island/minigames/racing-v24.mjs');
const {createNavalModel}=await load('workout/island/minigames/naval.mjs');
const strings=JSON.parse(await readFile(resolve(root,'workout/island/data/strings.he.json'),'utf8'));
const cfg=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames;
const t=createTranslator(strings,key=>{throw Error('Missing translation: '+key);});
function help(search,id){
 const old=globalThis.location,oldDoc=globalThis.document;globalThis.location={search};
 globalThis.document={createElement:()=>({children:[],append(n){this.children.push(n);}})};
 try{
  const spoken=[],announced=[],ctx={t,engine:{narration:{announce:k=>announced.push(k)}},ui:{narrate:k=>spoken.push(k)}};
  const node=ActivityInterface.prototype.helpLines.call(ctx,id);
  ActivityInterface.prototype.narrateHelp.call(ctx,id);
  const displayed=node.children.map(n=>n.textContent);
  assert.deepEqual(spoken,announced,'visual narration and announcement use the same selection');
  assert.deepEqual(displayed,spoken.map(k=>t(k)),'the spoken instructions match the displayed instructions');
  return displayed;
 }finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;}
}
function naval(search){const old=globalThis.location;globalThis.location={search};try{return createNavalModel({config:{...cfg,width:844,height:390},balance:cfg.navalDuel,level:3,seed:7});}finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;}}
test('V241-016: pit rollback and full pit disable describe the actual race rules',()=>{
 const search='?racingPitAuto=0',race=createRacing({stage:1,seed:7,config:{...flags.v24PhysicsConfig(flags.racingV24Flags(search)),pitAuto:flags.pitAutoEnabled(search),countdown:0}});
 try{assert.equal(race.pit.on,false);assert.equal(race.pit.auto,false);const line=help(search,'islandRacing')[1];assert.match(line,/שלוש הקפות/);assert.doesNotMatch(line,/בכל מרוץ|מבטלת/);}finally{race.dispose();}
 assert.doesNotMatch(help('?racingPit=0','islandRacing')[1],/פיטס|צמיגים/);
 assert.match(help('','islandRacing')[1],/בכל מרוץ/);
});
test('V241-016: radar and aerial-end rollback flags select matching displayed and spoken help independently',()=>{
 for(const search of ['?navalRadar=v24','?navalAirEnd=v24','?navalRadar=v24&navalAirEnd=v24','?navalAir=off','?navalAim=v23','?navalLock=0']){
  const model=naval(search),lines=help(search,'navalDuel'),s=model.snapshot();
  if(!s.v241.radarOn)assert.doesNotMatch(lines[0],/המכ״ם|מתמלאת בשנייה/,'no timed radar under '+search);else assert.match(lines[0],/המכ״ם/);
  if(search.includes('navalLock=0'))assert.doesNotMatch(lines[0],/נועל|ננעל/);
  if(!s.v241.airEnd||search.includes('navalAir=off'))assert.doesNotMatch(lines[2],/מחכים שיעופו/);else assert.match(lines[2],/מחכים שיעופו/);
 }
});
test('V241-016: reviewHelp=0 restores the original help keys and unrelated games retain their text',()=>{
 for(const id of ['islandRacing','navalDuel','alienDefense'])assert.deepEqual(help('?reviewHelp=0&racingPitAuto=0&navalRadar=v24&navalAirEnd=v24',id),[1,2,3].map(i=>strings[`minigame.${id}.help.${i}`]));
 assert.deepEqual(help('','alienDefense'),[1,2,3].map(i=>strings[`minigame.alienDefense.help.${i}`]));
});
