import {WORDS,RHYMES,ANIMALS,OPPOSITES,SYNONYMS,FACTS,SOUNDS} from './banks.mjs?v=island-naval-aim-20261028-2';
export const unpoint = s=>String(s).replace(/[\u0591-\u05c7]/g,'');
export function shuffled(items,rng=Math.random) {
  const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
const pick=(a,r)=>a[Math.floor(r()*a.length)];
const number=(min,max,r)=>min+Math.floor(r()*(max-min+1));
function choice(prompt,visual,correct,others,hint,rng) {
  const answer=String(correct),pool=[...new Set(others.map(String))].filter(x=>x!==answer);
  if(pool.length<2)throw Error('learning distractors');
  return {kind:'choice',prompt,visual,answer,options:shuffled([answer,...shuffled(pool,rng).slice(0,2)],rng),hint};
}
const lowChoice=(prompt,visual,answer,others,hint,r)=>({...choice(prompt,visual,answer,others,hint,r),pictureOnly:true});
function language(level,r,index) {
  const w=pick(WORDS.filter(w=>(level>3||w.word.length<=4)&&(level<=2||level>=5||unpoint(w.pointed)===w.word)),r),visual={symbols:w.icon};let q,type;
  if(level<=2){
    type=index%2?'letter-picture':'initial-sound';
    const letter=w.word[0],letterNames={א:'אָלֶף',ב:'בֵּית',ג:'גִּימֶל',ד:'דָּלֶת',ה:'הֵא',ו:'וָו',ז:'זַיִן',ח:'חֵית',ט:'טֵית',י:'יוֹד',כ:'כָּף',ל:'לָמֶד',מ:'מֵם',נ:'נוּן',ס:'סָמֶךְ',ע:'עַיִן',פ:'פֵּא',צ:'צָדִי',ק:'קוּף',ר:'רֵישׁ',ש:'שִׁין',ת:'תָּו'};
    q=lowChoice(type==='initial-sound'?`אֵיזוֹ תְּמוּנָה מַתְחִילָה כְּמוֹ ${w.pointed}?`:`אֵיזוֹ תְּמוּנָה מַתְחִילָה בָּאוֹת ${letterNames[letter]}?`,{letter,symbols:type==='initial-sound'?'👄':'✍️',fallback:w.icon},w.icon,WORDS.filter(x=>x.word[0]!==letter).map(x=>x.icon),`אִמְרוּ בְּקוֹל ${w.pointed}. הַקְשִׁיבוּ לַצְּלִיל הָרִאשׁוֹן.`,r);
  }else if(level<=4){
    type=['picture','missing','rhyme','word'][index%4];
    if(type==='picture')q=choice('אֵיזוֹ מִלָּה מַתְאִימָה לַתְּמוּנָה?',visual,w.pointed,WORDS.map(x=>x.pointed),`הַמִּלָּה מַתְחִילָה בָּאוֹת ${w.word[0]}.`,r);
    if(type==='missing'){
      const letters=w.pointed.match(/[א-ת][\u0591-\u05c7]*/gu),pos=number(0,letters.length-1,r);letters[pos]='＿';
      q=choice('אֵיזוֹ אוֹת חֲסֵרָה?',{...visual,caption:letters.join('')},w.word[pos],[...'אבגדהוזחטיכלמנסעפצקרשת'],`הַמִּלָּה הַשְּׁלֵמָה הִיא ${w.pointed}.`,r);
    }
    if(type==='rhyme'){const row=pick(RHYMES,r);q=choice(`מָה מִתְחָרֵז עִם ${row[2]}?`,{symbols:row[4]},row[3],['כֶּלֶב','שֶׁמֶשׁ','בַּיִת','מְכוֹנִית','רַכֶּבֶת'],`הַקְשִׁיבוּ לַצְּלִיל בְּסוֹף: ${row[2]}.`,r);}
    if(type==='word')q={kind:'word',prompt:'בְּנוּ אֶת הַמִּלָּה מֵהָאוֹתִיּוֹת.',visual,answer:w.word,letters:shuffled([...w.word],r),hint:`הַמִּלָּה מַתְחִילָה בָּאוֹת ${w.word[0]}.`};
  }else{
    type=['sentence','opposite','synonym','sentence'][index%4];
    if(type==='sentence'){
      const child=pick(['נועה','אורי','מיה','איתי','תמר','רון'],r),other=pick(WORDS.filter(x=>x.word!==w.word),r);
      const where=pick(['ליד הבית','בגינה','ליד הספרייה','בדרך לבית הספר'],r);
      q=choice(`${child} ראה ${w.word} ${where}. אחר כך צייר ${other.word}. מה ראה ${child}?`,{},w.word,WORDS.filter(x=>x.word!==other.word).map(x=>x.word),'חזרו לתחילת הסיפור: מה הופיע אחרי המילה ״ראה״?',r);
    }else{
      const bank=type==='opposite'?OPPOSITES:SYNONYMS,[a,b]=pick(bank,r);
      q=choice(type==='opposite'?`מה ההפך של ״${a}״?`:`איזו מילה דומה במשמעותה ל״${a}״?`,{symbols:type==='opposite'?'↔️':'🟰'},b,bank.filter(x=>x[0]!==a).map(x=>x[1]),type==='opposite'?'דמיינו שני מצבים מנוגדים.':'חפשו מילה שאפשר להשתמש בה במקום המילה שבשאלה.',r);
    }
  }
  if(level<=2)q.answerVoice=w.pointed;if(q.kind==='word')q.answerLabel=w.pointed;
  return {...q,template:type};
}
function math(level,r,index) {
  if(level<=2){
    const type=['count','color','size','shape','count'][index%5];let q;
    if(type==='count'){const a=number(1,level===1?5:10,r),icon=pick(['🍎','🍓','⭐','🌸','🐟'],r);q=lowChoice('כַּמָּה חֲפָצִים יֵשׁ?',{symbols:Array(a).fill(icon).join(' ')},a,[a+1,a+2,Math.max(0,a-1)],'סִפְרוּ כָּל חֵפֶץ פַּעַם אַחַת.',r);q.answerVoice=String(a);}
    if(type==='color'){const [icon,name]=pick([['🔴','אָדֹם'],['🔵','כָּחֹל'],['🟡','צָהֹב'],['🟢','יָרֹק']],r);q=lowChoice(`אֵיזֶה עִגּוּל הוּא ${name}?`,{symbols:icon},icon,['🔴','🔵','🟡','🟢'],'חַפְּשׂוּ אֶת אוֹתוֹ הַצֶּבַע.',r);q.answerVoice=name;}
    if(type==='shape'){const [icon,name]=pick([['🔺','מְשֻׁלָּשׁ'],['🟩','רִבּוּעַ'],['🔵','עִגּוּל']],r);q=lowChoice(`אֵיזוֹ צוּרָה הִיא ${name}?`,{symbols:icon},icon,['🔺','🟩','🔵'],'הִסְתַּכְּלוּ עַל הַצּוּרָה שֶׁלְּמַעְלָה.',r);q.answerVoice=name;}
    if(type==='size'){
      const icons=shuffled(['🔴','🔵','🟡'],r),big=Boolean(number(0,1,r));q=lowChoice(big?'אֵיזֶה עִגּוּל הֲכִי גָּדוֹל?':'אֵיזֶה עִגּוּל הֲכִי קָטָן?',{symbols:big?'🐘':'🐭'},icons[big?2:0],icons,'הִסְתַּכְּלוּ עַל הַגֹּדֶל שֶׁל כָּל עִגּוּל.',r);q.answerVoice=big?'הָעִגּוּל הַגָּדוֹל':'הָעִגּוּל הַקָּטָן';q.optionSizes=Object.fromEntries(icons.map((v,i)=>[v,[32,50,72][i]]));
    }
    return {...q,template:type};
  }
  const max=level<=4?20:100,icon=pick(['🍎','🍓','⭐','🟠','🌸','🐟'],r);
  const type=(level<=4?['add','subtract','compare','picture']:['add','subtract','multiply','divide','picture','multiply','compare','divide'])[index% (level<=4?4:8)];
  let a=number(1,max-1,r),b=number(1,max-a,r),answer,prompt,visual,hint;
  if(type==='compare'){
    b=number(1,max,r);answer=a>b?'גָּדוֹל מִ־':a<b?'קָטָן מִ־':'שָׁוֶה לְ־';
    return {...choice('הַמִּסְפָּר הָרִאשׁוֹן הוּא…',{equation:`${a}  ?  ${b}`},answer,['גָּדוֹל מִ־','קָטָן מִ־','שָׁוֶה לְ־'],'חִשְׁבוּ אֵיזֶה מִסְפָּר קָרוֹב יוֹתֵר לְאֶפֶס.',r),template:type};
  }
  if(type==='add'||type==='picture'){
    if(type==='picture'){a=number(1,level<=4?6:9,r);b=number(1,level<=4?6:9,r);}
    answer=a+b;prompt=type==='picture'?'מְצָרְפִים אֶת שְׁתֵּי הַקְּבוּצוֹת. כַּמָּה בְּיַחַד?':'כַּמָּה הֵם בְּיַחַד?';
    visual=type==='picture'?{groups:[Array(a).fill(icon).join(' '),Array(b).fill(icon).join(' ')]}:{equation:`${a} + ${b} = ?`};hint=`הַתְחִילוּ בְּ־${a} וְהוֹסִיפוּ ${b}.`;
  }
  if(type==='subtract'){a=number(2,max,r);b=number(1,a,r);answer=a-b;prompt='כַּמָּה נִשְׁאַר?';visual={equation:`${a} − ${b} = ?`};hint=`הַתְחִילוּ בְּ־${a} וְסִפְרוּ ${b} צְעָדִים אָחוֹרָה.`;}
  if(type==='multiply'){a=number(2,level===5?5:10,r);b=number(2,level===5?5:10,r);answer=a*b;prompt='כַּמָּה הֵם בְּיַחַד?';visual={equation:`${a} × ${b} = ?`};hint=`חַבְּרוּ ${a} לְעַצְמוֹ ${b} פְּעָמִים.`;}
  if(type==='divide'){b=number(2,level===5?5:10,r);answer=number(1,level===5?5:10,r);a=b*answer;prompt='מְחַלְּקִים שָׁוֶה בְּשָׁוֶה. כַּמָּה בְּכָל קְבוּצָה?';visual={equation:`${a} ÷ ${b} = ?`};hint=`אֵיזֶה מִסְפָּר כָּפוּל ${b} נוֹתֵן ${a}?`;}
  return {...choice(prompt,visual,answer,[answer+1,answer+2,Math.max(0,answer-1),Math.max(0,answer-2)],hint,r),template:type};
}
function animals(level,r,index) {
  const type=level<=2?['identify','sound','habitat'][index%3]:level<=4?['food','baby','habitat','baby'][index%4]:['fact','local','food','baby','fact','local','habitat','fact'][index%8],a=pick(ANIMALS,r);let q;
  if(type==='identify'){q=lowChoice(`אֵיפֹה ${a.name}?`,{symbols:'🐾',fallback:a.icon},a.icon,ANIMALS.map(x=>x.icon),`חַפְּשׂוּ אֶת ${a.name}.`,r);q.answerVoice=a.name;}
  if(type==='sound'){const [icon,name,sound]=pick(SOUNDS,r);q=lowChoice(`מִי אוֹמֵר ${sound}?`,{symbols:'👄 🎵',fallback:icon},icon,SOUNDS.map(x=>x[0]),`זֶה הַקּוֹל שֶׁל ${name}.`,r);q.answerVoice=name;}
  if(type==='habitat'){
    const homes={'יָם':'🌊','יַבָּשָׁה':'🌳','אֲוִיר':'☁️'},hint=a.habitat==='יָם'?'הִיא שׂוֹחָה.':a.habitat==='אֲוִיר'?'הִיא עָפָה.':'הִיא הוֹלֶכֶת עַל הָאֲדָמָה.';
    q=level<=2?lowChoice(`אֵיפֹה ${a.name} נָעָה בְּעִקָּר?`,{symbols:a.icon},homes[a.habitat],Object.values(homes),hint,r):choice('אֵיפֹה הַחַיָּה נָעָה בְּעִקָּר?',{symbols:a.icon,caption:a.name},a.habitat,Object.keys(homes),hint,r);q.answerVoice=a.habitat;
  }
  if(type==='food'){
    const meat=a.food.includes('בָּשָׂר'),foods=meat?['עֵשֶׂב בִּלְבַד','עָלִים בִּלְבַד']:a.food==='עֵשֶׂב'||a.food==='צְמָחִים'||a.food==='עָלִים'?['בָּשָׂר','דָּגִים']:['עָלִים בִּלְבַד','פֵּרוֹת בִּלְבַד'];
    q=choice('מָה הַחַיָּה אוֹכֶלֶת?',{symbols:a.icon,caption:a.name},a.food,foods,'חִשְׁבוּ עַל הָאֹכֶל שֶׁהִיא מוֹצֵאת בַּטֶּבַע אוֹ בַּמֶּשֶׁק.',r);
  }
  if(type==='baby')q=choice('אֵיךְ קוֹרְאִים לַצָּעִיר שֶׁל הַחַיָּה?',{symbols:a.icon,caption:a.name},a.baby,ANIMALS.map(x=>x.baby),'הַצָּעִיר גָּדֵל וְנִהְיֶה כְּמוֹ הַהוֹרִים.',r);
  if(type==='local'){
    const local=pick(ANIMALS.filter(x=>x.local),r),others=ANIMALS.filter(x=>!x.local&&['🐘','🦒','🦁','🦓','🦘'].includes(x.icon));
    q=choice('איזו חיה חיה כיום בטבע בארץ ישראל?',{symbols:'🌳 ☀️ 🏞️'},`${local.icon} ${local.name}`,others.map(x=>`${x.icon} ${x.name}`),'בחרו חיה שאפשר לפגוש בטבע בארץ, גם בלי גן חיות.',r);
  }
  if(type==='fact'){
    const f=pick(FACTS,r),prompt=`${f[1]}: ${f[2]}. `+(['פיל','ג׳ירפה','קיפוד'].includes(f[1])?'מה עוזר לו?':f[1]==='דג'?'בעזרת מה הוא נושם?':f[1]==='תרנגולת'?'מה היא מטילה?':f[1]==='קנגורו'?'איפה נמצא הגור?':f[1]==='נשר'?'מה מכסה את גופו?':'מה נכון לגבי הדולפין?');
    q=choice(prompt,{symbols:f[0]},f[3],f.slice(4),'קראו שוב את העובדה הקצרה בתחילת השאלה.',r);
  }
  return {...q,template:type};
}
function puzzles(level,r,index) {
  const type=(level<=2?['shadow','memory','jigsaw','shadow','jigsaw']:['sequence','memory','sequence','jigsaw','sequence','memory','sequence','sequence'])[index%(level<=2?5:8)];
  if(type==='shadow'){
    const icon=pick(['🔺','🟩','🔵','⭐','◆','♥'],r);
    return {...lowChoice('אֵיזוֹ צוּרָה מַתְאִימָה לַצֵּל?',{shadow:icon},icon,['🔺','🟩','🔵','⭐','◆','♥'],'חַפְּשׂוּ אֶת אוֹתוֹ הַמִּתְאָר.',r),template:type};
  }
  if(type==='sequence'){
    const symbols=shuffled(['🔴','🟡','🔵','🟩','🔺','⭐','💜','◆'],r),patterns=level<=4?[[0,1],[0,0,1],[0,1,2]]:level===5?[[0,1,1,2],[0,0,1,2]]:[[0,1,2,2,1],[0,1,0,2],[0,0,1,2,1]],pattern=pick(patterns,r),length=number(level>=6?6:4,level>=6?9:7,r),sequence=Array.from({length},(_,i)=>symbols[pattern[i%pattern.length]]),answer=symbols[pattern[length%pattern.length]];
    return {...choice('מָה בָּא אַחֲרֵי הַסִּדְרָה?',{sequence:[...sequence,'?']},answer,symbols,'קִרְאוּ אֶת הַצּוּרוֹת מִשְּׂמֹאל לְיָמִין. חַפְּשׂוּ קְבוּצָה שֶׁחוֹזֶרֶת.',r),template:type};
  }
  if(type==='memory'){
    const icons=shuffled(WORDS.map(w=>w.icon),r).slice(0,level<=2?3:level<=4?6:8),cards=shuffled([...icons,...icons].map((icon,id)=>({icon,id})),r);
    return {kind:type,template:type,prompt:'מִצְאוּ אֶת כָּל הַזּוּגוֹת.',visual:{symbols:'🃏'},cards,answer:icons.slice().sort().join('|'),hint:'פִּתְחוּ שְׁנֵי קְלָפִים בְּכָל פַּעַם. זִכְרוּ אֵיפֹה כָּל תְּמוּנָה.'};
  }
  const size=level===1?2:level<=3?3:level===4?4:5,tiles=Array.from({length:size*size},(_,i)=>i),order=[...tiles];
  // A few swaps let young children complete a picture within a short round.
  const positions=shuffled(tiles,r),swaps=level<=2?2:level<=4?4:8;
  for(let i=0;i<Math.min(swaps,Math.floor(tiles.length/2));i++){const a=positions[i*2],b=positions[i*2+1];[order[a],order[b]]=[order[b],order[a]];}
  return {kind:type,template:type,prompt:'הַרְכִּיבוּ אֶת תְּמוּנַת הָעִיר.',visual:{symbols:'🏘️'},size,order,answer:tiles.join(','),scene:number(1,999999,r),hint:'לַחֲצוּ עַל שְׁנֵי חֲלָקִים כְּדֵי לְהַחְלִיף בֵּינֵיהֶם. הַשָּׁמַיִם לְמַעְלָה.'};
}
const generators={language,math,animals,puzzles};
export function createQuestion(station,level,{rng=Math.random,index=0,exclude=[]}={}) {
  if(!generators[station]||!Number.isInteger(level)||level<1||level>7)throw Error('learning station or level');
  for(let attempt=0;attempt<400;attempt++){
    const q=generators[station](level,rng,index+Math.floor(attempt/50));
    q.level=level;q.station=station;q.voice=q.prompt;q.pictureOnly=level<=2;q.answerVoice=q.answerVoice||q.answerLabel||q.answer;
    if(q.visual.equation)q.voice+=' '+q.visual.equation.replace('−','פָּחוֹת').replace('+','וְעוֹד').replace('×','כָּפוּל').replace('÷','חֶלְקֵי').replace('=','שָׁוֶה').replace('?','');
    if(level>=5){q.prompt=unpoint(q.prompt);q.hint=unpoint(q.hint);if(q.visual.caption)q.visual.caption=unpoint(q.visual.caption);if(q.kind==='choice'){q.answer=unpoint(q.answer);q.options=q.options.map(unpoint);}}
    q.id=JSON.stringify([q.template,q.prompt,q.visual,q.answer,q.cards,q.order,q.scene,q.optionSizes]);
    if(!exclude.includes(q.id))return q;
  }
  throw Error('learning question pool exhausted');
}
export function generateRound(station,level,options={}) {
  const exclude=[...(options.exclude||[])],questions=[];
  for(let index=0;index<(options.length??8);index++){const q=createQuestion(station,level,{...options,index,exclude});questions.push(q);exclude.push(q.id);}
  return questions;
}
