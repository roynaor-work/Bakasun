import {WORDS,RHYMES,ANIMALS,OPPOSITES,SYNONYMS,FACTS,SOUNDS,PICTURE_LANGUAGE} from './banks.mjs?v=island-v2-20261107-21';
import {numberVoice,quantityVoice,pictureRevealVoice} from './spoken-copy.mjs?v=island-v2-20261107-21';
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
const letterNames={א:'אָלֶף',ב:'בֵּית',ג:'גִּימֶל',ד:'דָּלֶת',ה:'הֵא',ו:'וָו',ז:'זַיִן',ח:'חֵית',ט:'טֵית',י:'יוֹד',כ:'כָּף',ל:'לָמֶד',מ:'מֵם',נ:'נוּן',ס:'סָמֶךְ',ע:'עַיִן',פ:'פֵּא',צ:'צָדִי',ק:'קוּף',ר:'רֵישׁ',ש:'שִׁין',ת:'תָּו',ך:'כָּף סוֹפִית',ם:'מֵם סוֹפִית',ן:'נוּן סוֹפִית',ף:'פֵּא סוֹפִית',ץ:'צָדִי סוֹפִית'};
const children=[['נועה','נֹעָה',true],['אורי','אוּרִי',false],['מיה','מִיָּה',true],['איתי','אִתַּי',false],['תמר','תָּמָר',true],['רון','רוֹן',false]];
const places=[['ליד הבית','לְיַד הַבַּיִת'],['בגינה','בַּגִּנָּה'],['ליד הספרייה','לְיַד הַסִּפְרִיָּה'],['בדרך לבית הספר','בַּדֶּרֶךְ לְבֵית הַסֵּפֶר']];
const symbolNames={'🔺':'מְשֻׁלָּשׁ','🟩':'רִבּוּעַ יָרֹק','🔵':'עִגּוּל כָּחֹל','🔴':'עִגּוּל אָדֹם','🟡':'עִגּוּל צָהֹב','⭐':'כּוֹכָב','◆':'מְעֻיָּן','♥':'לֵב','💜':'לֵב סָגֹל'};
const lowChoice=(prompt,visual,answer,others,hint,r)=>({...choice(prompt,visual,answer,others,hint,r),pictureOnly:true});
function visualLanguage(rng){
  const [[scene,objects],...distractors]=shuffled(PICTURE_LANGUAGE,rng);
  return {
    ...choice('אֵיזוֹ תְּמוּנָה מַתְאִימָה?',{symbols:scene},pick(objects,rng),
      distractors.slice(0,2).map(([,icons])=>pick(icons,rng)),
      'חַפְּשׂוּ מַשֶּׁהוּ שֶׁמַּתְאִים לַתְּמוּנָה לְמַעְלָה.',rng),
    template:'picture-association',visualLanguage:true,
  };
}
function language(level,r,index) {
  const w=pick(WORDS.filter(w=>(level>3||w.word.length<=4)&&(level<=2||level>=5||unpoint(w.pointed)===w.word)),r),visual={symbols:w.icon};let q,type;
  if(level<=2){
    type=index%2?'letter-picture':'initial-sound';
    const letter=w.word[0];
    q=lowChoice(type==='initial-sound'?`אֵיזוֹ תְּמוּנָה מַתְחִילָה כְּמוֹ ${w.pointed}?`:`אֵיזוֹ תְּמוּנָה מַתְחִילָה בָּאוֹת ${letterNames[letter]}?`,{letter,symbols:type==='initial-sound'?'👄':'✍️',fallback:w.icon},w.icon,WORDS.filter(x=>x.word[0]!==letter).map(x=>x.icon),`אִמְרוּ בְּקוֹל ${w.pointed}. הַקְשִׁיבוּ לַצְּלִיל הָרִאשׁוֹן.`,r);
  }else if(level<=4){
    type=['picture','missing','rhyme','word'][index%4];
    if(type==='picture')q=choice('אֵיזוֹ מִלָּה מַתְאִימָה לַתְּמוּנָה?',visual,w.pointed,WORDS.map(x=>x.pointed),`הַמִּלָּה מַתְחִילָה בָּאוֹת ${w.word[0]}.`,r);
    if(type==='missing'){
      const letters=w.pointed.match(/[א-ת][\u0591-\u05c7]*/gu),pos=number(0,letters.length-1,r);letters[pos]='＿';
      q=choice('אֵיזוֹ אוֹת חֲסֵרָה?',{...visual,caption:letters.join('')},w.word[pos],[...'אבגדהוזחטיכלמנסעפצקרשת'],`הַמִּלָּה הַשְּׁלֵמָה הִיא ${w.pointed}.`,r);
      q.answerVoice=letterNames[q.answer];
    }
    if(type==='rhyme'){const row=pick(RHYMES,r);q=choice(`מָה מִתְחָרֵז עִם ${row[2]}?`,{symbols:row[4]},row[3],['כֶּלֶב','שֶׁמֶשׁ','בַּיִת','מְכוֹנִית','רַכֶּבֶת'],`הַקְשִׁיבוּ לַצְּלִיל בְּסוֹף: ${row[2]}.`,r);}
    if(type==='word')q={kind:'word',prompt:'בְּנוּ אֶת הַמִּלָּה מֵהָאוֹתִיּוֹת.',visual,answer:w.word,letters:shuffled([...w.word],r),hint:`הַמִּלָּה מַתְחִילָה בָּאוֹת ${w.word[0]}.`};
  }else{
    type=['sentence','opposite','synonym','sentence'][index%4];
    if(type==='sentence'){
      const [child,childVoice,feminine]=pick(children,r),other=pick(WORDS.filter(x=>x.word!==w.word),r);
      const [where,whereVoice]=pick(places,r),saw=feminine?'ראתה':'ראה',drew=feminine?'ציירה':'צייר';
      q=choice(`${child} ${saw} ${w.word} ${where}. אחר כך ${drew} ${other.word}. מה ${saw} ${child}?`,{},w.word,WORDS.filter(x=>x.word!==other.word).map(x=>x.word),'חוזרים למשפט הראשון. מה הדמות ראתה?',r);
      const sawVoice=feminine?'רָאֲתָה':'רָאָה',drewVoice=feminine?'צִיְּרָה':'צִיֵּר';
      q.voice=`${childVoice} ${sawVoice} ${w.pointed} ${whereVoice}. אַחַר כָּךְ ${drewVoice} ${other.pointed}. מָה ${sawVoice} ${childVoice}?`;
      q.hintVoice='חוֹזְרִים לַמִּשְׁפָּט הָרִאשׁוֹן. מָה הַדְּמוּת רָאֲתָה?';
      q.answerVoice=w.pointed;
      q.identityPrompt=`${child} ראה ${w.word} ${where}. אחר כך צייר ${other.word}. מה ראה ${child}?`;
    }else{
      const opposite=type==='opposite',bank=opposite?OPPOSITES:SYNONYMS,[a,b,aVoice,bVoice]=pick(bank,r);
      q=choice(opposite?`מה ההפך של ״${a}״?`:`איזו מילה דומה במשמעותה ל״${a}״?`,{symbols:opposite?'↔️':'🟰'},b,bank.filter(x=>x[0]!==a).map(x=>x[1]),opposite?'דמיינו שני מצבים מנוגדים.':'חפשו מילה שאפשר להשתמש בה במקום המילה שבשאלה.',r);
      q.voice=opposite?`מָה הַהֶפֶךְ שֶׁל ${aVoice}?`:`אֵיזוֹ מִלָּה אוֹמֶרֶת כִּמְעַט אוֹתוֹ דָּבָר כְּמוֹ ${aVoice}?`;
      q.hintVoice=opposite?'דַּמְיְנוּ שְׁנֵי מַצָּבִים הֲפוּכִים.':'חַפְּשׂוּ מִלָּה שֶׁאוֹמֶרֶת כִּמְעַט אוֹתוֹ דָּבָר.';
      q.answerVoice=bVoice;
    }
  }
  if(type==='picture'||type==='word')q.hintVoice=`הַמִּלָּה מַתְחִילָה בָּאוֹת ${letterNames[w.word[0]]}.`;
  if(level<=2)q.answerVoice=w.pointed;if(q.kind==='word')q.answerLabel=w.pointed;
  return {...q,template:type};
}
function math(level,r,index) {
  if(level<=2){
    const type=['count','color','size','shape','count'][index%5];let q;
    if(type==='count'){const a=number(1,level===1?5:10,r),icon=pick(['🍎','🍓','⭐','🌸','🐟'],r);q=lowChoice('כַּמָּה חֲפָצִים יֵשׁ?',{symbols:Array(a).fill(icon).join(' ')},a,[a+1,a+2,Math.max(0,a-1)],'סִפְרוּ כָּל חֵפֶץ פַּעַם אַחַת.',r);q.answerVoice=numberVoice(a);}
    if(type==='color'){const [icon,name]=pick([['🔴','אָדֹם'],['🔵','כָּחֹל'],['🟡','צָהֹב'],['🟢','יָרֹק']],r);q=lowChoice(`אֵיזֶה עִגּוּל הוּא ${name}?`,{symbols:icon},icon,['🔴','🔵','🟡','🟢'],'חַפְּשׂוּ אֶת אוֹתוֹ הַצֶּבַע.',r);q.answerVoice=name;}
    if(type==='shape'){const [icon,name]=pick([['🔺','מְשֻׁלָּשׁ'],['🟩','רִבּוּעַ'],['🔵','עִגּוּל']],r);q=lowChoice(`אֵיזוֹ צוּרָה הִיא ${name}?`,{symbols:icon},icon,['🔺','🟩','🔵'],'הִסְתַּכְּלוּ עַל הַצּוּרָה שֶׁלְּמַעְלָה.',r);q.answerVoice=name;}
    if(type==='size'){
      const icons=shuffled(['🔴','🔵','🟡'],r),big=Boolean(number(0,1,r));q=lowChoice(big?'אֵיזֶה עִגּוּל הֲכִי גָּדוֹל?':'אֵיזֶה עִגּוּל הֲכִי קָטָן?',{symbols:big?'🐘':'🐭'},icons[big?2:0],icons,'הִסְתַּכְּלוּ עַל הַגֹּדֶל שֶׁל כָּל עִגּוּל.',r);q.answerVoice=big?'הָעִגּוּל הַגָּדוֹל':'הָעִגּוּל הַקָּטָן';q.optionSizes=Object.fromEntries(icons.map((v,i)=>[v,[32,50,72][i]]));
    }
    return {...q,template:type};
  }
  const max=level<=4?20:100,icon=pick(['🍎','🍓','⭐','🟠','🌸','🐟'],r);
  const type=(level<=4?['add','subtract','compare','picture']:['add','subtract','multiply','divide','picture','multiply','compare','divide'])[index% (level<=4?4:8)];
  let a=number(1,max-1,r),b=number(1,max-a,r),answer,prompt,visual,hint,hintVoice,operationVoice;
  if(type==='compare'){
    b=number(1,max,r);answer=a>b?'גָּדוֹל מִ־':a<b?'קָטָן מִ־':'שָׁוֶה לְ־';
    const first=numberVoice(a),second=numberVoice(b);
    return {
      ...choice('הַמִּסְפָּר הָרִאשׁוֹן הוּא…',{equation:`${a}  ?  ${b}`},answer,['גָּדוֹל מִ־','קָטָן מִ־','שָׁוֶה לְ־'],'חִשְׁבוּ אֵיזֶה מִסְפָּר קָרוֹב יוֹתֵר לְאֶפֶס.',r),
      voice:`מַשְׁוִים אֶת ${first} וְאֶת ${second}. הַאִם הַמִּסְפָּר הָרִאשׁוֹן גָּדוֹל יוֹתֵר, קָטָן יוֹתֵר אוֹ שָׁוֶה?`,
      answerVoice:`${first} ${answer}${second}`,template:type,
    };
  }
  if(type==='add'||type==='picture'){
    if(type==='picture'){a=number(1,level<=4?6:9,r);b=number(1,level<=4?6:9,r);}
    answer=a+b;prompt=type==='picture'?'מְצָרְפִים אֶת שְׁתֵּי הַקְּבוּצוֹת. כַּמָּה בְּיַחַד?':'כַּמָּה הֵם בְּיַחַד?';
    visual=type==='picture'?{groups:[Array(a).fill(icon).join(' '),Array(b).fill(icon).join(' ')]}:{equation:`${a} + ${b} = ?`};hint=`הַתְחִילוּ בְּ־${a} וְהוֹסִיפוּ ${b}.`;
    hintVoice=`הַתְחִילוּ בַּמִּסְפָּר ${numberVoice(a)} וְהוֹסִיפוּ ${numberVoice(b)}.`;
    operationVoice='וְעוֹד';
  }
  if(type==='subtract'){
    a=number(2,max,r);b=number(1,a,r);answer=a-b;prompt='כַּמָּה נִשְׁאַר?';visual={equation:`${a} − ${b} = ?`};
    hint=`הַתְחִילוּ בְּ־${a} וְסִפְרוּ ${b} צְעָדִים אָחוֹרָה.`;
    hintVoice=`הַתְחִילוּ בַּמִּסְפָּר ${numberVoice(a)} וְסִפְרוּ ${quantityVoice(b,'צַעַד','צְעָדִים',true)} אָחוֹרָה.`;
    operationVoice='פָּחוֹת';
  }
  if(type==='multiply'){
    a=number(2,level===5?5:10,r);b=number(2,level===5?5:10,r);answer=a*b;prompt='כַּמָּה הֵם בְּיַחַד?';visual={equation:`${a} × ${b} = ?`};
    hint=`חַבְּרוּ ${a} לְעַצְמוֹ ${b} פְּעָמִים.`;
    hintVoice=`חַבְּרוּ אֶת הַמִּסְפָּר ${numberVoice(a)} בְּסַךְ הַכֹּל ${quantityVoice(b,'פַּעַם','פְּעָמִים')}.`;
    operationVoice='כָּפוּל';
  }
  if(type==='divide'){
    b=number(2,level===5?5:10,r);answer=number(1,level===5?5:10,r);a=b*answer;
    prompt='מְחַלְּקִים שָׁוֶה בְּשָׁוֶה. כַּמָּה בְּכָל קְבוּצָה?';visual={equation:`${a} ÷ ${b} = ?`};
    hint=`אֵיזֶה מִסְפָּר כָּפוּל ${b} נוֹתֵן ${a}?`;
    hintVoice=`אֵיזֶה מִסְפָּר כָּפוּל ${numberVoice(b)} נוֹתֵן ${numberVoice(a)}?`;
    operationVoice='חֶלְקֵי';
  }
  return {
    ...choice(prompt,visual,answer,[answer+1,answer+2,Math.max(0,answer-1),Math.max(0,answer-2)],hint,r),
    voice:visual.equation?`${prompt} ${numberVoice(a)} ${operationVoice} ${numberVoice(b)} שָׁוֶה?`:prompt,
    hintVoice,answerVoice:numberVoice(answer),template:type,
  };
}
const factQuestions={
  'דולפין':['מה נכון לגבי הדולפין?','מָה נָכוֹן לְגַבֵּי הַדּוֹלְפִין?'],
  'פיל':['מה עוזר לו?','מָה עוֹזֵר לוֹ?'],
  'קיפוד':['מה עוזר לו?','מָה עוֹזֵר לוֹ?'],
  'נשר':['מה מכסה את גופו?','מָה מְכַסֶּה אֶת גּוּפוֹ?'],
  'דג':['בעזרת מה הוא נושם?','בְּעֶזְרַת מָה הוּא נוֹשֵׁם?'],
  'ג׳ירפה':['מה עוזר לה?','מָה עוֹזֵר לָהּ?'],
  'תרנגולת':['מה היא מטילה?','מָה הִיא מְטִילָה?'],
  'קנגורו':['איפה נמצא הגור?','אֵיפֹה נִמְצָא הַגּוּר?'],
};
function animals(level,r,index) {
  const type=level<=2?['identify','sound','habitat'][index%3]:level<=4?['food','baby','habitat','baby'][index%4]:['fact','local','food','baby','fact','local','habitat','fact'][index%8],a=pick(ANIMALS,r);let q;
  if(type==='identify'){q=lowChoice(`אֵיפֹה ${a.name}?`,{symbols:'🐾',fallback:a.icon},a.icon,ANIMALS.map(x=>x.icon),`חַפְּשׂוּ אֶת ${a.name}.`,r);q.answerVoice=a.name;}
  if(type==='sound'){const [icon,name,sound]=pick(SOUNDS,r);q=lowChoice(`מִי אוֹמֵר ${sound}?`,{symbols:'👄 🎵',fallback:icon},icon,SOUNDS.map(x=>x[0]),`זֶה הַקּוֹל שֶׁל ${name}.`,r);q.answerVoice=name;}
  if(type==='habitat'){
    const homes={'יָם':'🌊','יַבָּשָׁה':'🌳','אֲוִיר':'☁️'};
    const movement=a.habitat==='יָם'?'שׂוֹחָה':a.habitat==='אֲוִיר'?'עָפָה':'הוֹלֶכֶת עַל הָאֲדָמָה';
    const prompt='אֵיפֹה הַחַיָּה הַזֹּאת נָעָה בְּעִקָּר?',hint=`הַחַיָּה הַזֹּאת ${movement}.`;
    q=level<=2?lowChoice(prompt,{symbols:a.icon},homes[a.habitat],Object.values(homes),hint,r):choice(prompt,{symbols:a.icon,caption:a.name},a.habitat,Object.keys(homes),hint,r);
    q.voice=level<=2?`${a.name}. ${prompt}`:prompt;
    q.answerVoice=a.habitat;
    q.identityPrompt=level<=2?`אֵיפֹה ${a.name} נָעָה בְּעִקָּר?`:'אֵיפֹה הַחַיָּה נָעָה בְּעִקָּר?';
  }
  if(type==='food'){
    const meat=a.food.includes('בָּשָׂר'),foods=meat?['עֵשֶׂב בִּלְבַד','עָלִים בִּלְבַד']:a.food==='עֵשֶׂב'||a.food==='צְמָחִים'||a.food==='עָלִים'?['בָּשָׂר','דָּגִים']:['עָלִים בִּלְבַד','פֵּרוֹת בִּלְבַד'];
    q=choice('מָה הַחַיָּה אוֹכֶלֶת?',{symbols:a.icon,caption:a.name},a.food,foods,'חִשְׁבוּ עַל הָאֹכֶל שֶׁהִיא מוֹצֵאת בַּטֶּבַע אוֹ בַּמֶּשֶׁק.',r);
  }
  if(type==='baby')q=choice('אֵיךְ קוֹרְאִים לַצָּעִיר שֶׁל הַחַיָּה?',{symbols:a.icon,caption:a.name},a.baby,ANIMALS.map(x=>x.baby),'הַצָּעִיר גָּדֵל וְנִהְיֶה כְּמוֹ הַהוֹרִים.',r);
  if(type==='local'){
    const local=pick(ANIMALS.filter(x=>x.local),r),others=ANIMALS.filter(x=>!x.local&&['🐘','🦒','🦁','🦓','🦘'].includes(x.icon));
    q=choice('איזו חיה חיה כיום בטבע בארץ ישראל?',{symbols:'🌳 ☀️ 🏞️'},`${local.icon} ${local.name}`,others.map(x=>`${x.icon} ${x.name}`),'בחרו חיה שאפשר לפגוש בטבע בארץ, גם בלי גן חיות.',r);
    q.voice='אֵיזוֹ חַיָּה חַיָּה בַּטֶּבַע בְּיִשְׂרָאֵל?';
    q.hintVoice='בִּחֲרוּ חַיָּה שֶׁאֶפְשָׁר לִפְגֹּשׁ בַּטֶּבַע בְּיִשְׂרָאֵל, גַּם מִחוּץ לְגַן חַיּוֹת.';
    q.answerVoice=local.name;
  }
  if(type==='fact'){
    const [icon,[name,fact,answer,...others],[nameVoice,factVoice,answerVoice]]=pick(FACTS,r);
    const [followup,followupVoice]=factQuestions[name];
    q=choice(`${name}: ${fact}. ${followup}`,{symbols:icon},answer,others,'קראו שוב את העובדה הקצרה בתחילת השאלה.',r);
    q.voice=`${nameVoice}: ${factVoice}. ${followupVoice}`;
    q.hintVoice='קִרְאוּ שׁוּב אֶת הַמִּשְׁפָּט הָרִאשׁוֹן.';
    q.answerVoice=answerVoice;
    if(name==='ג׳ירפה')q.identityPrompt=`${name}: ${fact}. מה עוזר לו?`;
  }
  return {...q,template:type};
}
function puzzles(level,r,index) {
  const type=(level<=2?['shadow','memory','jigsaw','shadow','jigsaw']:['sequence','memory','sequence','jigsaw','sequence','memory','sequence','sequence'])[index%(level<=2?5:8)];
  if(type==='shadow'){
    const icon=pick(['🔺','🟩','🔵','⭐','◆','♥'],r);
    return {...lowChoice('אֵיזוֹ צוּרָה מַתְאִימָה לַצֵּל?',{shadow:icon},icon,['🔺','🟩','🔵','⭐','◆','♥'],'חַפְּשׂוּ אֶת אוֹתוֹ הַמִּתְאָר.',r),answerVoice:symbolNames[icon],template:type};
  }
  if(type==='sequence'){
    const symbols=shuffled(['🔴','🟡','🔵','🟩','🔺','⭐','💜','◆'],r),patterns=level<=4?[[0,1],[0,0,1],[0,1,2]]:level===5?[[0,1,1,2],[0,0,1,2]]:[[0,1,2,2,1],[0,1,0,2],[0,0,1,2,1]],pattern=pick(patterns,r),length=number(level>=6?6:4,level>=6?9:7,r),sequence=Array.from({length},(_,i)=>symbols[pattern[i%pattern.length]]),answer=symbols[pattern[length%pattern.length]];
    return {...choice('מָה בָּא אַחֲרֵי הַסִּדְרָה?',{sequence:[...sequence,'?']},answer,symbols,'קִרְאוּ אֶת הַצּוּרוֹת מִשְּׂמֹאל לְיָמִין. חַפְּשׂוּ קְבוּצָה שֶׁחוֹזֶרֶת.',r),answerVoice:symbolNames[answer],template:type};
  }
  if(type==='memory'){
    const icons=shuffled(WORDS.map(w=>w.icon),r).slice(0,level<=2?3:level<=4?6:8),cards=shuffled([...icons,...icons].map((icon,id)=>({icon,id})),r);
    return {kind:type,template:type,prompt:'מִצְאוּ אֶת כָּל הַזּוּגוֹת.',visual:{symbols:'🃏'},cards,answer:icons.slice().sort().join('|'),answerVoice:pictureRevealVoice,hint:'פִּתְחוּ שְׁנֵי קְלָפִים בְּכָל פַּעַם. זִכְרוּ אֵיפֹה כָּל תְּמוּנָה.'};
  }
  const size=level===1?2:level<=3?3:level===4?4:5,tiles=Array.from({length:size*size},(_,i)=>i),order=[...tiles];
  // A few swaps let young children complete a picture within a short round.
  const positions=shuffled(tiles,r),swaps=level<=2?2:level<=4?4:8;
  for(let i=0;i<Math.min(swaps,Math.floor(tiles.length/2));i++){const a=positions[i*2],b=positions[i*2+1];[order[a],order[b]]=[order[b],order[a]];}
  return {kind:type,template:type,prompt:'הַרְכִּיבוּ אֶת תְּמוּנַת הָעִיר.',visual:{symbols:'🏘️'},size,order,answer:tiles.join(','),answerVoice:pictureRevealVoice,scene:number(1,999999,r),hint:'לַחֲצוּ עַל שְׁנֵי חֲלָקִים כְּדֵי לְהַחְלִיף בֵּינֵיהֶם. הַשָּׁמַיִם לְמַעְלָה.'};
}
const generators={language,math,animals,puzzles};
export function createQuestion(station,level,{rng=Math.random,index=0,exclude=[],languagePictures=false}={}) {
  if(!generators[station]||!Number.isInteger(level)||level<1||level>7)throw Error('learning station or level');
  for(let attempt=0;attempt<400;attempt++){
    const {identityPrompt,...q}=languagePictures&&station==='language'&&level>=3?visualLanguage(rng):generators[station](level,rng,index+Math.floor(attempt/50));
    q.level=level;q.station=station;q.pictureOnly=level<=2||Boolean(q.visualLanguage);
    q.voice??=q.prompt;q.hintVoice??=q.hint;q.answerVoice??=q.answerLabel??q.answer;
    if(level>=5){q.prompt=unpoint(q.prompt);q.hint=unpoint(q.hint);if(q.visual.caption)q.visual.caption=unpoint(q.visual.caption);if(q.kind==='choice'){q.answer=unpoint(q.answer);q.options=q.options.map(unpoint);}}
    // The recent-question list in existing saves still recognizes the revised prompts.
    const idPrompt=identityPrompt===undefined?q.prompt:level>=5?unpoint(identityPrompt):identityPrompt;
    q.id=JSON.stringify([q.template,idPrompt,q.visual,q.answer,q.cards,q.order,q.scene,q.optionSizes]);
    if(!exclude.includes(q.id))return q;
  }
  throw Error('learning question pool exhausted');
}
export function generateRound(station,level,options={}) {
  const exclude=[...(options.exclude||[])],questions=[];
  for(let index=0;index<(options.length??8);index++){const q=createQuestion(station,level,{...options,index,exclude});questions.push(q);exclude.push(q.id);}
  return questions;
}
