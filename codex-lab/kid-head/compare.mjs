const views=[
  {key:'front',label:'קדמי',roi:[20,250,285,270]},
  {key:'side',label:'צד שמאל',roi:[330,250,280,270]},
  {key:'back',label:'גב',roi:[620,250,284,270]},
  {key:'frontRepeat',label:'קדמי נוסף',roi:[938,250,282,270]},
];
const $=id=>document.getElementById(id),panels=new Map();
const defaults={image:'reference.png',sourceSize:[1254,1254]};
let metrics={},config=defaults,rows=[],round=1,source=null,sourceLabel='',renderEpoch=0;
for(const v of views){
  const card=document.createElement('article');card.className='card';
  card.innerHTML=`<header><h2>${v.label}</h2><span class="score"></span></header><div class="pair"><figure class="pane"><canvas width="512" height="512" aria-label="יעד — ${v.label}"></canvas><div class="empty">הקובץ המקורי אינו זמין למדידה</div><figcaption>יעד</figcaption></figure><figure class="pane"><canvas width="512" height="512" aria-label="דמות פרוצדורלית — ${v.label}"></canvas><div class="empty" hidden></div><figcaption>דמות פרוצדורלית</figcaption></figure></div>`;
  $('comparisons').append(card);panels.set(v.key,{card,target:card.querySelectorAll('canvas')[0],generated:card.querySelectorAll('canvas')[1],score:card.querySelector('.score'),targetEmpty:card.querySelectorAll('.empty')[0],generatedEmpty:card.querySelectorAll('.empty')[1],targetCaption:card.querySelectorAll('figcaption')[0],generatedCaption:card.querySelectorAll('figcaption')[1]});
}
async function json(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error(path);return response.json();}
function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error(url));image.src=url;});}
function roiFor(v,image){
  const configured=config.views?.[v.key];
  if(Array.isArray(configured))return configured.map((n,i)=>n*(i%2===0?image.width/(config.sourceSize?.[0]||1254):image.height/(config.sourceSize?.[1]||1254)));
  if(Array.isArray(configured?.roi))return configured.roi;
  const scaleX=image.width/(config.sourceSize?.[0]||1254),scaleY=image.height/(config.sourceSize?.[1]||1254);
  return v.roi.map((n,i)=>n*(i%2===0?scaleX:scaleY));
}
// Bounding-box height matching is visual only; persisted IoU is calculated by measure.mjs.
function bounds(image,roi){
  const [x,y,w,h]=roi.map(Math.round),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,x,y,w,h,0,0,w,h);
  const pixels=context.getImageData(0,0,w,h).data,bits=new Uint8Array(w*h);
  for(let py=0;py<h;py++){
    const left=[0,0,0],right=[0,0,0];
    for(let k=0;k<6;k++)for(let c=0;c<3;c++){left[c]+=pixels[(py*w+k)*4+c]/6;right[c]+=pixels[(py*w+w-k-1)*4+c]/6;}
    for(let px=0;px<w;px++){let d=0;const i=(py*w+px)*4;for(let c=0;c<3;c++)d+=(pixels[i+c]-left[c]-(right[c]-left[c])*px/(w-1))**2;bits[py*w+px]=+(pixels[i+3]>128&&Math.sqrt(d)>30);}
  }
  let selected=bits;
  if(image===source){
    const visited=new Uint8Array(bits.length);let best=[];
    for(let start=0;start<bits.length;start++){if(!bits[start]||visited[start])continue;const q=[start];visited[start]=1;for(let j=0;j<q.length;j++){const k=q[j],px=k%w;for(const n of [px?k-1:-1,px<w-1?k+1:-1,k-w,k+w])if(n>=0&&n<bits.length&&bits[n]&&!visited[n]){visited[n]=1;q.push(n);}}if(q.length>best.length)best=q;}
    selected=new Uint8Array(bits.length);best.forEach(k=>selected[k]=1);
  }
  let minX=w,maxX=-1,minY=h,maxY=-1;
  for(let py=0;py<h;py++)for(let px=0;px<w;px++)if(selected[py*w+px]){minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}

  return maxY<minY?roi:[x+minX,y+minY,maxX-minX+1,maxY-minY+1];
}
function paint(canvas,image,roi=[0,0,image.width,image.height]){
  const context=canvas.getContext('2d');context.fillStyle='#f1eee7';context.fillRect(0,0,512,512);
  const [x,y,w,h]=bounds(image,roi),height=440,width=w*height/h;
  context.drawImage(image,x,y,w,h,(512-width)/2,36,width,height);
}
function blank(canvas){const context=canvas.getContext('2d');context.fillStyle='#f1eee7';context.fillRect(0,0,512,512);}
function format(value){return Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';}
function scoreFor(row,key){return row?.[key]??row?.views?.[key]??null;}
function modeText(){
  const mode=metrics.status||'blocked';$('status').dataset.mode=mode;
  if(mode==='manual-trace'){
    $('status').textContent='הקובץ המקורי אינו זמין למדידה. ציוני ה־IoU מחושבים מול קו מתאר שסומן ידנית מתוך התמונה המוצגת בצ׳אט; זו אינה מדידה מפיקסלי תמונת היעד. בחירת קובץ מקומי כאן מאפשרת השוואה חזותית בלבד ואינה משנה את הציונים השמורים.';
  }else if(mode==='measured'){
    $('status').textContent='הציונים חושבו מפיקסלי תמונת היעד ששמורה במעבדה, לאחר הפרדת הרקע ויישור לפי גובה הראש. בחירת קובץ מקומי כאן משנה רק את תמונת ההשוואה.';
  }else{
    $('status').textContent='הקובץ המקורי אינו זמין למדידה. ניתן לבחור את תמונת היעד מהמחשב כדי לראות אותה לצד הדמות; אין ציוני IoU תקפים עד הרצת סקריפט המדידה על הקובץ.';
  }
  $('method').textContent=mode==='manual-trace'?'מקור המדידה: קו מתאר ידני · נרמול אחיד של גובה הראש · ללא מתיחה לרוחב.':mode==='measured'?'מקור המדידה: פיקסלי תמונת היעד · נרמול אחיד של גובה הראש · ללא מתיחה לרוחב.':'מדידה חסרה; מקף מציין שאין תוצאה.';
}
function populate(){
  const best=Number(metrics.bestRound)||Number(rows[0]?.round)||1;
  round=Number(new URLSearchParams(location.search).get('round'))||best;
  if(!rows.some(row=>Number(row.round)===round))round=best;
  $('best').textContent=metrics.bestRound?`הסבב הטוב ביותר במדידה: ${best}`:'טרם נבחר סבב לפי מדידה';
  $('round').replaceChildren();$('results').replaceChildren();
  for(const row of rows){
    const option=document.createElement('option');option.value=row.round;option.textContent=`${row.round}${Number(row.round)===best?' · נבחר':''}`;$('round').append(option);
    const tr=document.createElement('tr');tr.dataset.best=String(Number(row.round)===best);const td=document.createElement('td'),button=document.createElement('button');button.textContent=`סבב ${row.round}`;button.addEventListener('click',()=>{round=Number(row.round);$('round').value=round;render();});td.append(button);tr.append(td);
    for(const value of [...views.map(v=>scoreFor(row,v.key)),row.mean]){const cell=document.createElement('td');cell.textContent=format(value);tr.append(cell);}$('results').append(tr);
  }
  $('round').value=round;modeText();
}
async function render(){
  const epoch=++renderEpoch,row=rows.find(item=>Number(item.round)===round);
  await Promise.allSettled(views.map(async v=>{
    const panel=panels.get(v.key);panel.score.textContent=`IoU ${format(scoreFor(row,v.key))}`;panel.generatedCaption.textContent=`דמות פרוצדורלית · סבב ${round}`;
    if(source){paint(panel.target,source,roiFor(v,source));panel.targetCaption.textContent=sourceLabel;panel.targetEmpty.hidden=true;}
    else{
      try{const image=await loadImage(`shots/target-trace/${v.key}.png`);if(epoch!==renderEpoch)return;paint(panel.target,image);panel.targetCaption.textContent='קו מתאר שסומן ידנית · לא תמונת היעד';panel.targetEmpty.hidden=true;}
      catch{if(epoch!==renderEpoch)return;blank(panel.target);panel.targetCaption.textContent='יעד חסר';panel.targetEmpty.hidden=false;}
    }
    try{let image;try{image=await loadImage(`shots/r${round}/${v.key}-head.png`);}catch(error){if(v.key!=='frontRepeat')throw error;image=await loadImage(`shots/r${round}/front-head.png`);panel.generatedCaption.textContent+= ' · אותו מבט קדמי';}if(epoch!==renderEpoch)return;paint(panel.generated,image);panel.generatedEmpty.hidden=true;}
    catch{if(epoch!==renderEpoch)return;blank(panel.generated);panel.generatedEmpty.textContent='הצילום אינו זמין';panel.generatedEmpty.hidden=false;}
  }));
  try{const image=await loadImage(`shots/r${round}/threeQuarter-head.png`);if(epoch===renderEpoch)paint($('three-quarter'),image);}catch{if(epoch===renderEpoch)blank($('three-quarter'));}
}
$('round').addEventListener('change',event=>{round=Number(event.target.value);render();});
$('reference').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;const url=URL.createObjectURL(file);
  try{source=await loadImage(url);sourceLabel='תמונת יעד · קובץ שנבחר במחשב';await render();}
  catch{$('status').textContent='לא ניתן לקרוא את הקובץ שנבחר. יש לבחור תמונת PNG, JPG או WebP.';}finally{URL.revokeObjectURL(url);}
});
const loaded=await Promise.allSettled([json('shots/metrics.json'),json('target.json'),json('rounds.json')]);
if(loaded[0].status==='fulfilled')metrics=loaded[0].value;
if(loaded[1].status==='fulfilled')config={...defaults,...loaded[1].value};
rows=metrics.results||metrics.rounds||[];
if(!rows.length&&loaded[2].status==='fulfilled')rows=loaded[2].value.map(row=>({round:row.round}));
if(!rows.length)rows=[{round:1}];
try{source=await loadImage(config.image||'reference.png');sourceLabel='תמונת היעד המקורית';}catch{}
populate();await render();
