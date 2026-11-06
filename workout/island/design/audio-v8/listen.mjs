import {createSportsAudio, SOUND_CATALOG, renderSound} from './runtime/sports-audio.mjs';
const $ = selector => document.querySelector(selector);
const audio = createSportsAudio();
const groups = {official:'שופט וזמן',basketball:'כדורסל',soccer:'כדורגל',movement:'צעדים ודשא',crowd:'קהל',tennis:'טניס',ski:'סקי',racing:'מירוצים'};
let audition = null, selected = null, generation = 0;
const status = text => { $('#status').textContent = text; };
function draw(samples) {
  const canvas = $('#wave'), context = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
  context.clearRect(0,0,width,height); context.strokeStyle = '#a2e3b9'; context.beginPath();
  for (let x = 0; x < width; x++) {
    let low = 0, high = 0;
    const begin = Math.floor(x * samples.length / width), end = Math.floor((x + 1) * samples.length / width);
    for (let i = begin; i < end; i++) { low = Math.min(low,samples[i]); high = Math.max(high,samples[i]); }
    context.moveTo(x,height/2 + low*height*.47); context.lineTo(x,height/2 + high*height*.47);
  }
  context.stroke();
}
function parameters() { return {intensity:Number($('#intensity').value),tone:Number($('#tone').value),seed:17}; }
function showMeasurement(name, params) {
  const rendered = renderSound(name, params); let peak = 0;
  for (const sample of rendered.samples) peak = Math.max(peak,Math.abs(sample));
  $('#measurement').textContent = `${SOUND_CATALOG[name].label} · ${rendered.duration.toFixed(3)} שנ׳ · שיא PCM ${peak.toFixed(3)} · תקרה ${rendered.maxDuration.toFixed(2)} שנ׳`;
  draw(rendered.samples);
}
async function enable() {
  const epoch = generation;
  const ready = await audio.unlock();
  if (epoch !== generation) return false;
  if (ready) {
    status('מכינים צלילים בזיכרון…'); $('#enable').disabled = true;
    try { await audio.prepare(['whistle','basketballBounce','netSwish','rimHit','soccerKick','goalpostHit','crowdBed','crowdCheer','crowdDisappoint'], parameters()); }
    finally { $('#enable').disabled = false; }
  }
  if (epoch !== generation) return false;
  status(ready ? 'השמע מוכן. בחרו צליל להקשבה.' : 'השמע לא הופעל. לחצו שוב או בדקו את הרשאת השמע בדפדפן.');
  return ready;
}
async function play(name) {
  const epoch = generation, ready = await audio.unlock();
  if (epoch !== generation) return null;
  if (!ready) { status('יש להפעיל שמע לפני ההקשבה.'); return null; }
  const params = parameters(), handle = audio[name](params);
  if (!handle) {
    status(Number($('#volume').value) === 0 ? 'עוצמת ההאזנה על אפס. הגבירו את העוצמה לשמיעה.' : 'הצליל לא נוגן. המתינו רגע ונסו שוב.');
    return null;
  }
  selected?.classList.remove('playing'); selected = $(`[data-sound="${name}"]`); selected?.classList.add('playing');
  status(`מתנגן: ${SOUND_CATALOG[name].label}`); showMeasurement(name, params);
  handle.ended.then(() => { $(`[data-sound="${name}"]`)?.classList.remove('playing'); });
  return handle;
}
function cancel() {
  generation++;
  audition?.abort(); audition = null; audio.stopAll();
  document.querySelectorAll('.playing').forEach(card=>card.classList.remove('playing'));
  $('#audition').textContent = 'הקשבה לכל הרשימה';
}
function wait(ms, signal) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort',finish); resolve(); };
    const timer = setTimeout(finish,ms);
    signal?.addEventListener('abort',finish,{once:true});
    if (signal?.aborted) finish();
  });
}
for (const [group,label] of Object.entries(groups)) {
  const option = document.createElement('option'); option.value=group; option.textContent=label; $('#group').append(option);
}
for (const [name,spec] of Object.entries(SOUND_CATALOG)) {
  const card = document.createElement('article'); card.className='card'; card.dataset.sound=name; card.dataset.group=spec.group;
  const heading=document.createElement('h2'); heading.textContent=spec.label;
  const code=document.createElement('code'); code.textContent=`${name}(options)`;
  const detail=document.createElement('small'); detail.textContent=`${spec.duration} שנ׳ · עד ${spec.maxDuration} שנ׳`;
  const button=document.createElement('button'); button.textContent='השמעה'; button.setAttribute('aria-label',`השמעת ${spec.label}`);
  button.addEventListener('click',()=>{cancel();void play(name);});
  card.append(heading,code,detail,button); $('#sounds').append(card);
}
$('#enable').addEventListener('click',enable);
$('#stop').addEventListener('click',()=>{cancel();status('כל הקולות נעצרו.');});
$('#volume').addEventListener('input',event=>audio.setVolume(Number(event.target.value)));
$('#group').addEventListener('change',event=>{
  cancel(); for (const card of document.querySelectorAll('.card')) card.hidden=event.target.value!=='all'&&card.dataset.group!==event.target.value;
});
$('#audition').addEventListener('click',async()=>{
  if (audition) { cancel();status('ההקשבה נעצרה.');return; }
  if (Number($('#volume').value) === 0) { status('עוצמת ההאזנה על אפס. הגבירו את העוצמה לשמיעה.');return; }
  if (!await enable()) return;
  const controller=new AbortController(); audition=controller; $('#audition').textContent='עצירת הרשימה';
  let played=0;
  for (const card of document.querySelectorAll('.card:not([hidden])')) {
    if (controller.signal.aborted) return;
    const handle=await play(card.dataset.sound); if (handle) { await handle.ended; played++; }
    await wait(300,controller.signal);
  }
  if (!controller.signal.aborted) { audition=null; $('#audition').textContent='הקשבה לכל הרשימה';status(`הושמעו ${played} צלילים ברשימה.`); }
});
$('#whistle-check').addEventListener('click',async()=>{
  cancel();const handle=await play('whistle');if (!handle)return;
  const controller=new AbortController();audition=controller;
  await handle.ended;if(controller.signal.aborted)return;
  status('השריקה הסתיימה. בדקו שאין שריקה או רשרוש שממשיכים.');
  await wait(3000,controller.signal);
  if (!controller.signal.aborted) { status(`בדיקת השקט הסתיימה · קולות פעילים: ${audio.metrics.activeVoices}`);audition=null; }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();status('ההקשבה נעצרה כשהדף עבר לרקע.');}});
window.addEventListener('pagehide',()=>{cancel();});
