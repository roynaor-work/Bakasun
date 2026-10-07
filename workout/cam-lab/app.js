import {fullBody, RepCounter, reasons} from './counter.mjs';
const $=id=>document.getElementById(id);
const instructions={
  squats:'עומדים מול המצלמה בזווית קלה, רגליים ברוחב הכתפיים. יורדים כמו לשבת על כיסא ועולים לעמידה. לא צריך למהר.',
  'jumping-jacks':'עומדים מול המצלמה. פותחים יחד את הרגליים ואת הידיים מעל הראש, וחוזרים לעמידה עם ידיים למטה.',
  'high-knees':'עומדים מול המצלמה. מרימים ברך אחת, מורידים אותה ואז מרימים את השנייה. כל הרמת ברך וחזרה נספרת פעם אחת.',
};
const cues={
  partial:'מְנַסִּים תְּנוּעָה קְצָת יוֹתֵר גְּדוֹלָה, בְּקֶצֶב נָעִים. אִם לֹא בָּרוּר, אֶפְשָׁר לִשְׁאֹל מְבֻגָּר.',
  knees:'בַּסְּקְוָואט, מְכַוְּנִים אֶת הַבִּרְכַּיִם לְאוֹתוֹ כִּוּוּן כְּמוֹ כַּפּוֹת הָרַגְלַיִם. יוֹרְדִים וְעוֹלִים בְּנַחַת.',
  arms:'פּוֹתְחִים יַחַד אֶת הַיָּדַיִם וְאֶת הָרַגְלַיִם, וְאָז חוֹזְרִים לַעֲמִידָה.',
  tracking:'הַמַּצְלֵמָה לֹא רוֹאָה בְּבֵרוּר. חוֹזְרִים לַמֶּרְכָּז. אִם לֹא בָּרוּר, כְּדַאי לִשְׁאֹל מְבֻגָּר.',
  fast:'מְנַסִּים לָנוּעַ קְצָת יוֹתֵר לְאַט, מִתְּחִלַּת הַתְּנוּעָה וְעַד הַסּוֹף.',
  timeout:'חוֹזְרִים לַעֲמִידָה וּמְנַסִּים שׁוּב. אִם לֹא בָּרוּר, אֶפְשָׁר לִשְׁאֹל מְבֻגָּר.',
};
const partialCues={
  squats:'בַּתְּנוּעָה שֶׁל סְקְוָואט, יוֹרְדִים כְּמוֹ לָשֶׁבֶת עַל כִּסֵּא דִּמְיוֹנִי, וְאָז חוֹזְרִים לַעֲמִידָה, בְּטֶוַח נָעִים. אִם לֹא בָּרוּר, שׁוֹאֲלִים מְבֻגָּר.',
  'high-knees':'בַּתְּנוּעָה הַזֹּאת מְרִימִים אֶת הַבֶּרֶךְ קָדִימָה, וְאָז מוֹרִידִים אֶת הָרֶגֶל לָרִצְפָּה. אִם לֹא בָּרוּר, שׁוֹאֲלִים מְבֻגָּר.',
};
let worker=null, stream=null, counter=null, stage='settings', session=0, busy=false, raf=0;
let ready=false, goodSince=null, baseline=null, bodySamples=[], lastVideoTime=-1;
let lastPoseTime=null, lastSpeech=-Infinity, perf=[], profile=null;
function speak(text, force=false) {
  if(!$('voice').checked || !('speechSynthesis' in window)) return;
  const now=performance.now();if(!force&&now-lastSpeech<6500)return;
  // A remote TTS voice is intentionally never used. No child data goes to speech services.
  const voice=speechSynthesis.getVoices().find(v=>v.localService&&/^he(?:-|_)/i.test(v.lang));
  if(!voice)return;
  lastSpeech=now;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);
  u.voice=voice;u.lang='he-IL';u.rate=.85;speechSynthesis.speak(u);
}
function show(screen){for(const id of ['settings','camera','results'])$(id).hidden=id!==screen;}
function cleanup(){
  session++;cancelAnimationFrame(raf);worker?.terminate();worker=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;
  busy=false;ready=false;window.speechSynthesis?.cancel();
  $('overlay').getContext('2d').clearRect(0,0,$('overlay').width,$('overlay').height);
}
function fail(message){cleanup();stage='settings';show('settings');$('error').textContent=message;}
function receiveEvent(event){
  if(!event)return;
  $('count').value=counter.count;
  if(event.kind==='rejected'){
    const cue=event.reason==='partial'?(partialCues[counter.exercise]||cues.partial):cues[event.reason];
    $('feedback').textContent=cue;speak(cue);
  }
  else $('feedback').textContent='נספרה חזרה. ממשיכים בקצב נעים.';
}
function finish(){
  if(counter)receiveEvent(counter.interrupt());
  const summary=counter?.summary()||{count:0,rejected:0,reasons:{}};
  cleanup();stage='results';show('results');
  $('result-count').textContent=`${summary.count} חזרות נספרו · ${summary.rejected} ניסיונות לא נספרו`;
  $('result-reasons').replaceChildren();
  for(const [reason,n]of Object.entries(summary.reasons)){
    const li=document.createElement('li');li.textContent=`${reasons[reason]}: ${n}`;$('result-reasons').append(li);
  }
  if(!summary.rejected){const li=document.createElement('li');li.textContent='לא נפסלו ניסיונות.';$('result-reasons').append(li);}
}
function draw(points){
  const canvas=$('overlay'),v=$('video');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
  const ctx=canvas.getContext('2d');if(!points)return;
  ctx.fillStyle=fullBody(points)?'#73ffa5':'#ffcf85';
  for(const i of [0,11,12,13,14,15,16,23,24,25,26,27,28]){
    const p=points[i];if(!p||p.visibility<.65)continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,5,0,Math.PI*2);ctx.fill();
  }
}
function record(data){
  const now=performance.now();const fps=lastPoseTime===null?0:1000/(now-lastPoseTime);lastPoseTime=now;
  const row={frame:(perf.at(-1)?.frame||0)+1,fps:+fps.toFixed(1),processingMs:+data.ms.toFixed(1),roundtripMs:+(now-data.timestamp).toFixed(1)};
  perf.push(row);if(perf.length>600)perf.shift();
  // Console and bounded on-screen log contain metrics only, never landmarks or images.
  console.debug('[cam-lab perf]',row);
  $('metrics').textContent=`FPS: ${row.fps} · עיבוד: ${row.processingMs} ms · סבב: ${row.roundtripMs} ms`;
  $('perf-log').textContent=perf.slice(-5).map(x=>JSON.stringify(x)).join('\n');
}
async function frame(){
  if(!worker)return;
  raf=requestAnimationFrame(frame);
  const video=$('video');
  if(!ready||busy||video.readyState<2||video.currentTime===lastVideoTime)return;
  busy=true;lastVideoTime=video.currentTime;const stamp=performance.now(), id=session;
  try {
    const bitmap=await createImageBitmap(video);
    if(id!==session||!worker){bitmap.close();return;}
    worker.postMessage({type:'frame',bitmap,timestamp:stamp,session:id},[bitmap]);
  }catch {if(id===session)fail('לא ניתן לעבד את המצלמה בדפדפן הזה. נסו Chrome או Safari מעודכן עם מבוגר.');}
}
$('profile').addEventListener('submit',async e=>{
  e.preventDefault();if(!$('profile').reportValidity())return;
  cleanup();const id=session;
  profile={age:Number($('age').value),height:Number($('height').value)};
  counter=new RepCounter($('exercise').value,profile);stage='placement';show('camera');
  $('error').textContent='';$('feedback').textContent='';$('count').value=0;
  $('start').disabled=true;$('start').hidden=false;$('finish').hidden=true;
  $('stage-title').textContent='מציבים את המכשיר';$('instruction').textContent=instructions[$('exercise').value];
  $('placement-text').textContent='מניחים את המכשיר יציב בגובה המותניים, במרחק כ־2–3 מטרים. עומדים מולו כך שרואים ראש, ידיים וקרסוליים. משאירים מקום מעל הראש לקפיצות.';
  goodSince=null;baseline=null;bodySamples=[];perf=[];lastPoseTime=null;lastVideoTime=-1;
  speak('מַנִּיחִים אֶת הַמַּכְשִׁיר יָצִיב בְּגֹבַהּ הַמָּתְנַיִם. עוֹמְדִים מוּלוֹ בְּמֶרְחָק שְׁנַיִם עַד שְׁלוֹשָׁה מֶטְרִים. צָרִיךְ לִרְאוֹת אֶת הָרֹאשׁ וְאֶת הָרַגְלַיִם.',true);
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){fail('מצלמה דורשת HTTPS. פתחו את המעבדה בכתובת מאובטחת, עם מבוגר.');return;}
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){fail('הדפדפן אינו תומך בעיבוד המקומי הנדרש. נסו דפדפן מעודכן.');return;}
  worker=new Worker('./pose-worker.js');
  let initTimeout=setTimeout(()=>{if(id===session&&!ready)fail('טעינת המודל ארכה יותר מדי. בדקו שקובצי המודל המקומיים קיימים ורעננו.');},45000);
  worker.onerror=()=>{clearTimeout(initTimeout);if(id===session)fail('טעינת מעבד התנוחה נכשלה. בדקו את הדפדפן ואת הקבצים המקומיים.');};
  worker.onmessage=({data})=>{
    if(id!==session)return;
    if(data.type==='ready'){clearTimeout(initTimeout);ready=true;$('status').textContent='המודל מוכן. עומדים ישר בתוך המסגרת.';return;}
    if(data.type==='error'){clearTimeout(initTimeout);fail('לא ניתן להפעיל את זיהוי התנוחה. בדקו את קובצי המודל וה־WASM המקומיים.');return;}
    if(data.type!=='pose'||data.session!==session)return;
    busy=false;draw(data.points);record(data);
    if(stage==='placement'){
      // Calibrate only an upright, still pose; body height cannot shrink the target mid-rep.
      const valid=fullBody(data.points);
      const p=data.points;
      const upright=valid && Math.min(p[25].y-p[23].y,p[26].y-p[24].y)>.12 &&
        Math.abs(p[27].y-p[28].y)<.035 && Math.abs(p[11].x-p[12].x)>.07;
      if(!upright){goodSince=null;bodySamples=[];$('start').disabled=true;$('status').textContent='עומדים ישר במרכז: ראש, ידיים ושני קרסוליים בתוך המסגרת.';speak('עוֹמְדִים יָשָׁר בַּמֶּרְכָּז. צָרִיךְ לִרְאוֹת אֶת כָּל הַגּוּף, מֵהָרֹאשׁ עַד הַקַּרְסֻלַּיִם.');return;}
      goodSince??=data.timestamp;bodySamples.push((p[27].y+p[28].y)/2-p[0].y);
      if(bodySamples.length>120)bodySamples.shift();
      const settled=data.timestamp-goodSince>=1500;
      $('start').disabled=!settled;
      $('status').textContent=settled?'כל הגוף בתמונה. אפשר להתחיל.':'רואים את הגוף. נשארים בעמידה עוד רגע…';
      if(settled)baseline=[...bodySamples].sort((a,b)=>a-b)[Math.floor(bodySamples.length/2)];
    }else if(stage==='active'){
      $('status').textContent=fullBody(data.points)?'המצלמה רואה את הגוף':'הספירה ממתינה — חוזרים למרכז המסגרת';
      receiveEvent(counter.update(data.points,data.timestamp,data.world,baseline));
      if(!fullBody(data.points))speak(cues.tracking);
    }
  };
  worker.postMessage({type:'init'});
  try {
    const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false});
    if(id!==session){acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;stream.getVideoTracks()[0].addEventListener('ended',()=>{if(id===session)stage==='active'?finish():fail('המצלמה נעצרה. אפשר לפתוח אותה שוב.');});
    $('video').srcObject=stream;await $('video').play();if(id===session)frame();
  }catch {clearTimeout(initTimeout);if(id===session)fail('לא ניתן לפתוח מצלמה. בדקו הרשאת מצלמה בדפדפן וסגרו אפליקציות אחרות שמשתמשות בה.');}
});
$('start').onclick=()=>{
  if($('start').disabled||!baseline)return;
  stage='active';counter.interrupt();$('stage-title').textContent=$('exercise').selectedOptions[0].textContent;
  $('start').hidden=true;$('finish').hidden=false;
  $('placement-text').textContent='נשארים בתוך המסגרת. אפשר לעצור בכל רגע. הספירה מתחילה מעמידה.';
  const spoken={squats:'עוֹמְדִים בְּרֹחַב הַכְּתֵפַיִם. יוֹרְדִים כְּמוֹ לָשֶׁבֶת עַל כִּסֵּא וְעוֹלִים בְּנַחַת.',
    'jumping-jacks':cues.arms,'high-knees':'מְרִימִים בֶּרֶךְ אַחַת וּמוֹרִידִים. אָז מְרִימִים אֶת הַשְּׁנִיָּה. כָּל בֶּרֶךְ הִיא חֲזָרָה.'};
  speak(spoken[$('exercise').value],true);
};
$('finish').onclick=finish;$('cancel').onclick=()=>{if(stage==='active')finish();else{cleanup();stage='settings';show('settings');}};
$('again').onclick=()=>{stage='settings';show('settings');};
$('copy-log').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify({exercise:$('exercise').value,frames:perf},null,2));$('metrics').textContent='לוג הביצועים הועתק.';}catch{$('metrics').textContent='העתקה לא זמינה. הלוג מופיע גם בקונסול הדפדפן.';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream){if(stage==='active')finish();else{cleanup();stage='settings';show('settings');}}});
window.addEventListener('pagehide',cleanup);
