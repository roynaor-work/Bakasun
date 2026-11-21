import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.ISLAND_PATCH_CHECKOUT;
const island='workout/island';
const load=file=>import(pathToFileURL(join(root,island,file)));
const {createQuestion,unpoint}=await load('learning/questions.mjs');
const {numberVoice,quantityVoice,feedbackVoice,roundVoice}=await load('learning/spoken-copy.mjs');
const {STATIONS}=await load('learning/state.mjs');
const {createLearningVoice}=await load('learning/voice.mjs');
const catalog=JSON.parse(readFileSync(join(root,island,'data/strings.he.json'),'utf8'));

const vowels=/[\u05b0-\u05bb\u05c7]/u;
const letters=/[א-ת][\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c7]*/gu;
const words=/[א-ת][א-ת\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c7׳]*/gu;
const forbidden=/[0-9!！﹗❗❕‼⁉]|\p{Script_Extensions=Arabic}|\p{Script=Latin}|\p{Extended_Pictographic}/u;

function pointed(text,label){
  assert.equal(typeof text,'string',label);
  assert.doesNotMatch(text,forbidden,label+': '+text);
  const tokens=text.normalize('NFD').match(words);
  assert.ok(tokens?.length,label+': '+text);
  for(const word of tokens){
    const characters=word.match(letters);
    assert.ok(vowels.test(word)||word.includes('וּ'),`${label}: unpointed word ${word} in ${text}`);
    for(const [index,char] of characters.entries()){
      const next=characters[index+1]??'';
      if(char.startsWith('ש'))assert.match(char,/[ׁׂ]/u,`${label}: missing shin/sin dot in ${word}`);
      if(vowels.test(char)||char==='וּ'||/^ו[ֹּ]/u.test(next))continue;
      if(index===characters.length-1&&char[0]!=='ך')continue;
      if(index>0&&'אהוי'.includes(char[0])&&vowels.test(characters[index-1]))continue;
      assert.fail(`${label}: partially pointed ${word} (${char}) in ${text}`);
    }
  }
}

const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const lexical=(a,b)=>a.localeCompare(b,'he-IL');

test('validator catches whole unpointed words, missing interior vowels and raw digits',()=>{
  for(const bad of ['כָּל הכבוד','הַמִּסְפר','שָלוֹם','מֶלֶך','רָמָה 5','★'])assert.throws(()=>pointed(bad,'negative control'));
  pointed('כָּל הַכָּבוֹד. שֶׁבַע מַטְבְּעוֹת.','positive control');
});

test('all station levels, templates, hints and answers are spoken with niqqud',()=>{
  const random=rng(17011),seen=new Set();
  const samples=120;
  for(const station of Object.keys(STATIONS)){
    for(let level=1;level<=7;level++){
      for(let index=0;index<samples;index++){
        const question=createQuestion(station,level,{rng:random,index});
        const label=`${station}/${level}/${question.template}/${index}`;
        seen.add(station+'/'+question.template);
        for(const field of ['voice','hintVoice','answerVoice'])pointed(question[field],label+'/'+field);
        for(const [correct,resolved] of [[true,true],[false,false],[false,true]]){
          pointed(feedbackVoice(question,{correct,resolved}),label+'/feedback');
        }
        if(level>=5){
          assert.equal(question.prompt,unpoint(question.prompt));
          assert.equal(question.hint,unpoint(question.hint));
        }
      }
    }
  }
  assert.equal(seen.size,30);
  pointed(catalog['placement.voiceHint'],'placement.voiceHint');
});

test('spoken cardinal numbers range from 0 to 100 and agree with the noun',()=>{
  for(let n=0;n<=100;n++){
    pointed(numberVoice(n),`number ${n}`);
    pointed(numberVoice(n,true),`masculine number ${n}`);
  }
  assert.equal(numberVoice(0),'אֶפֶס');
  assert.equal(numberVoice(100),'מֵאָה');
  assert.equal(numberVoice(23),'עֶשְׂרִים וְשָׁלֹשׁ');
  assert.equal(numberVoice(23,true),'עֶשְׂרִים וּשְׁלֹשָׁה');
  assert.equal(quantityVoice(1,'צַעַד','צְעָדִים',true),'צַעַד אֶחָד');
  assert.equal(quantityVoice(2,'פַּעַם','פְּעָמִים'),'שְׁתֵּי פְּעָמִים');
  assert.match(roundVoice({money:1,stars:1}),/מַטְבֵּעַ אֶחָד וְכוֹכָב אֶחָד\./u);
  assert.match(roundVoice({money:2,stars:2}),/שְׁנֵי מַטְבְּעוֹת וּשְׁנֵי כּוֹכָבִים\./u);
  for(let money=0;money<=100;money++){
    for(let stars=0;stars<=3;stars++)pointed(roundVoice({money,stars}),'round reward');
  }
});

test('stories and animal facts use the right gender and missing letters use their names',()=>{
  const girl=createQuestion('language',7,{index:0,rng:()=>0});
  assert.match(girl.prompt,/נועה ראתה.*ציירה.*מה ראתה נועה/);
  assert.match(girl.voice,/נֹעָה רָאֲתָה.*צִיְּרָה.*מָה רָאֲתָה נֹעָה/u);
  const boy=createQuestion('language',7,{index:0,rng:()=>.2});
  assert.match(boy.voice,/אוּרִי רָאָה.*צִיֵּר.*מָה רָאָה אוּרִי/u);
  const giraffe=createQuestion('animals',7,{index:0,rng:()=>.66});
  assert.match(giraffe.voice,/מָה עוֹזֵר לָהּ\?/u);
  assert.match(createQuestion('animals',1,{index:2,rng:()=>0}).voice,/הַחַיָּה הַזֹּאת/u);
  const letter=createQuestion('language',3,{index:1,rng:()=>0});
  assert.equal(letter.answer,'ת');
  assert.equal(letter.answerVoice,'תָּו');
});

test('saved question IDs, choices and solutions match the clean base',async()=>{
  const temp=mkdtempSync(join(tmpdir(),'island-question-base-'));
  try{
    for(const name of ['questions.mjs','banks.mjs']){
      const source=execFileSync('git',['-C',root,'show',`HEAD:${island}/learning/${name}`]);
      writeFileSync(join(temp,name),source);
    }
    const {createQuestion:original}=await import(pathToFileURL(join(temp,'questions.mjs')));
    for(const station of Object.keys(STATIONS)){
      for(let level=1;level<=7;level++){
        const oldRandom=rng(17011),newRandom=rng(17011);
        for(let index=0;index<120;index++){
          const before=original(station,level,{index,rng:oldRandom});
          const after=createQuestion(station,level,{index,rng:newRandom});
          assert.equal(after.id,before.id,`${station}/${level}/${index}`);
          assert.equal(after.answer,before.answer);
          assert.deepEqual(after.options?.slice().sort(lexical),before.options?.slice().sort(lexical));
        }
      }
    }
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('speech adapter gets the fully pointed prompt, retries and reveal without display text',()=>{
  const said=[];
  const speech=createLearningVoice({
    synthesis:{getVoices:()=>[{lang:'he-IL'}],cancel(){},speak(utterance){said.push(utterance);}},
    Utterance:class {constructor(text){this.text=text;}},
  });
  const q=createQuestion('language',7,{index:1,rng:()=>0});
  assert.notEqual(q.voice,q.prompt);
  assert.notEqual(q.hintVoice,q.hint);
  for(const message of [q.voice,q.hintVoice,feedbackVoice(q,{resolved:false}),feedbackVoice(q,{resolved:true})]){
    assert.equal(speech.speak(message),true);
  }
  assert.equal(said.length,4);
  for(const line of said){
    assert.equal(line.lang,'he-IL');
    pointed(line.text,'utterance');
  }
});
