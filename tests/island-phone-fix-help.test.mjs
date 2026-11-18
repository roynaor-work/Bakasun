// v24.3: the help text (written and spoken) follows phone fixes B (naval lock 3.5 s, released after
// every shot) and D (no pit cancel); ?phoneFixB=0 / ?phoneFixD=0 / ?phoneFixes=0 bring back the v24.1 lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';
import {createTranslator} from '../workout/island/ui/translate.mjs';

const strings=JSON.parse(await readFile(new URL('../workout/island/data/strings.he.json',import.meta.url),'utf8'));
const t=createTranslator(strings,key=>{throw Error('Missing translation: '+key);});
function help(search,id){
 const old=globalThis.location,oldDoc=globalThis.document;globalThis.location={search};
 globalThis.document={createElement:()=>({children:[],append(n){this.children.push(n);}})};
 try{
  const spoken=[],announced=[],ctx={t,engine:{narration:{announce:k=>announced.push(k)}},ui:{narrate:k=>spoken.push(k)}};
  const node=ActivityInterface.prototype.helpLines.call(ctx,id);
  ActivityInterface.prototype.narrateHelp.call(ctx,id);
  assert.deepEqual(spoken,announced);
  const displayed=node.children.map(n=>n.textContent);
  assert.deepEqual(displayed,spoken.map(k=>t(k)),'written and spoken help are the same');
  return displayed;
 }finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;}
}

test('phone fix B help: the default describes the slow radar lock that is released after every shot',()=>{
 const line=help('','navalDuel')[0];
 assert.match(line,/שלוש וחצי שניות/);assert.match(line,/אחרי כל ירייה הנעילה מתבטלת/);assert.match(line,/כפתור הנעילה/);
 assert.doesNotMatch(line,/בשנייה בערך/);
 for(const q of ['?phoneFixB=0','?phoneFixes=0']){const old=help(q,'navalDuel')[0];assert.match(old,/בשנייה בערך/,q);assert.doesNotMatch(old,/אחרי כל ירייה/,q);}
 assert.match(help('?navalRadar=v24','navalDuel')[0],/נגיעה בספינת אויב נועלת עליה/,'the older rollbacks keep their own lines');
});
test('phone fix D help: the default no longer offers a pit cancel; the rollback does',()=>{
 const line=help('','islandRacing')[1];
 assert.match(line,/נכנסת לבד/);assert.doesNotMatch(line,/מבטלת/);
 for(const q of ['?phoneFixD=0','?phoneFixes=0'])assert.match(help(q,'islandRacing')[1],/„פיטס” מבטלת/,q);
 assert.match(help('?racingPitAuto=0','islandRacing')[1],/שלוש הקפות/);
});
