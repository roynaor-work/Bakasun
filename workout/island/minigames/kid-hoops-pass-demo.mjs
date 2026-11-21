import {kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-21';

const steps=[
 {id:'tap',label:'נגיעה אחת',path:'M60 88H276'},
 {id:'double',label:'שתי נגיעות מהירות',path:'M60 88L168 131L276 88'},
 {id:'hold',label:'החזקה ושחרור',path:'M60 88Q168 -24 276 88'},
];

export function installHoopsPassDemo({screen,help,signal,onOpen,onClose}){
 kidUxStyle('019',`
  .game-screen[data-game=streetSlam] .hoops-input-help.kid-hoops-pass-description{
   display:none
  }
  .game-screen[data-game=streetSlam] .kid-hoops-roles .hoops-role-label{
   direction:rtl;width:56px;height:22px;border-radius:6px;color:#fff;background:#101828;
   font-size:14px;line-height:20px
  }
  .game-screen[data-game=streetSlam] .kid-hoops-roles .hoops-role-label[data-controlled=true]{
   background:#ffd16a;color:#172033
  }
  .game-screen[data-game=streetSlam] .kid-hoops-pass-launch{
   position:absolute;right:max(16px,env(safe-area-inset-right));bottom:calc(192px + env(safe-area-inset-bottom));
   z-index:6;min-width:44px;min-height:44px;padding:6px 10px;
   border:1px solid #a6bdec;border-radius:10px;color:#fff;background:#172e53;font-size:14px
  }
  .game-screen[data-game=streetSlam]:is([data-paused=true],[data-starting=true],[data-orientation-blocked=true]) .kid-hoops-pass-launch{display:none}
  .game-screen[data-game=streetSlam] .kid-hoops-pass-demo{
   box-sizing:border-box;width:min(400px,calc(100% - 32px));max-height:calc(100% - 24px);
   margin:auto;padding:14px 18px;border:1px solid #a6bdec;border-radius:15px;
   background:#14223b;color:#fff;text-align:center
  }
  .game-screen[data-game=streetSlam] .kid-hoops-pass-demo::backdrop{background:#020912b8}
  .game-screen[data-game=streetSlam] .kid-hoops-pass-demo h3{font-size:19px;margin:0 0 4px}
  .kid-hoops-pass-illustration{position:relative;width:100%;height:142px;margin:auto;background:#223454;border-radius:10px}
  .kid-hoops-pass-illustration svg{display:block;width:100%;height:100%}
  .kid-hoops-pass-illustration .kid-pass-path{fill:none;stroke:#dbe8ff;stroke-width:3;stroke-dasharray:5 5}
  .kid-hoops-pass-illustration .kid-pass-hand{position:absolute;left:10%;bottom:6%;font-size:32px;line-height:1}
  .kid-hoops-pass-illustration .kid-pass-gesture{position:absolute;left:24%;bottom:7%;font-size:23px;color:#fff9c7}
  .kid-hoops-pass-illustration[data-step=hold] .kid-pass-gesture{
   width:40px;height:8px;bottom:12%;border:1px solid #f8dea6;border-radius:6px;background:#f8dea6;
   transform-origin:left
  }
  .kid-hoops-pass-illustration[data-playing=true] .kid-pass-hand{animation:kid-hoops-tap .75s ease-out}
  .kid-hoops-pass-illustration[data-playing=true][data-step=double] .kid-pass-hand{animation:kid-hoops-tap .35s ease-out 2}
  .kid-hoops-pass-illustration[data-playing=true][data-step=hold] .kid-pass-gesture{animation:kid-hoops-hold .75s ease-out}
  @keyframes kid-hoops-tap{35%{transform:translateY(-14px)}}
  @keyframes kid-hoops-hold{from{transform:scaleX(0)}}
  .kid-hoops-pass-actions{display:flex;gap:8px;justify-content:center;margin-top:8px}
  .kid-hoops-pass-actions button{min-width:44px;min-height:44px;padding:6px 10px;border:1px solid #e5ecff;
   border-radius:9px;color:#14223b;background:#e5ecff;font-size:14px}
  .kid-hoops-pass-demo p{margin:4px 0;color:#fff;font-size:16px;font-weight:700}
  @media(prefers-reduced-motion:reduce){
   .kid-hoops-pass-illustration[data-playing] *{animation:none!important}
  }
 `);
 const doc=screen.ownerDocument;
 const make=(tag,className,text)=>{
  const node=doc.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
 };
 const button=(className,text)=>{
  const node=make('button',className,text);
  node.type='button';
  return node;
 };
 const launcher=button('kid-hoops-pass-launch','🏀 מסירות');
 const demo=make('dialog','kid-hoops-pass-demo');
 demo.setAttribute('role','dialog');
 demo.setAttribute('aria-labelledby','kid-hoops-pass-title');
 const title=make('h3','','מסירות בכדורסל');title.id='kid-hoops-pass-title';
 const illustration=make('div','kid-hoops-pass-illustration');
 illustration.setAttribute('aria-hidden','true');
 illustration.innerHTML=`<svg viewBox="0 0 336 148" xmlns="http://www.w3.org/2000/svg">
  <path class="kid-pass-path" d="M60 88H276"/>
  <circle cx="47" cy="65" r="10" fill="#d9e6ff"/><path d="M47 77V115M35 87H59" stroke="#d9e6ff" stroke-width="7" stroke-linecap="round"/>
  <circle cx="289" cy="65" r="10" fill="#d9e6ff"/><path d="M289 77V115M277 87H301" stroke="#d9e6ff" stroke-width="7" stroke-linecap="round"/>
  <circle class="kid-pass-ball" cx="0" cy="0" r="9" fill="#ffac60" stroke="#171a21" stroke-width="1">
   <animateMotion begin="indefinite" dur="0.75s" fill="freeze" path="M60 88H276"/>
  </circle>
 </svg>`;
 const hand=make('span','kid-pass-hand','👆'),gesture=make('span','kid-pass-gesture');
 illustration.append(hand,gesture);
 const caption=make('p','kid-hoops-pass-caption');caption.setAttribute('aria-live','polite');
 const actions=make('div','kid-hoops-pass-actions');
 const replay=button('kid-hoops-pass-replay','↻ שוב'),next=button('kid-hoops-pass-next','← הבא');
 const close=button('kid-hoops-pass-close','סגירה');
 actions.append(replay,next,close);demo.append(title,illustration,caption,actions);
 const path=illustration.querySelector('.kid-pass-path');
 const ball=illustration.querySelector('.kid-pass-ball');
 const motion=illustration.querySelector('animateMotion');
 let step=0,playTimer;
 function draw(){
  const lesson=steps[step];
  clearTimeout(playTimer);
  illustration.dataset.step=lesson.id;
  illustration.dataset.playing='false';
  gesture.textContent=['●','● ●',''][step];
  caption.textContent=lesson.label;
  next.textContent=step===steps.length-1?'▶ לשחק':'← הבא';
  path.setAttribute('d',lesson.path);
  motion.removeAttribute('begin');
  motion.setAttribute('begin','indefinite');
  motion.setAttribute('path',lesson.path);
  if(doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches){
   ball.setAttribute('transform','translate(276 88)');
   return;
  }
  ball.removeAttribute('transform');
  void illustration.offsetWidth;
  illustration.dataset.playing='true';
  playTimer=setTimeout(()=>motion.beginElement(),740);
 }
 launcher.addEventListener('click',()=>{
  onOpen();
  step=0;
  demo.showModal();
  draw();
 },{signal});
 demo.addEventListener('keydown',event=>event.stopPropagation(),{signal});
 demo.addEventListener('close',()=>{
  clearTimeout(playTimer);
  onClose();
  launcher.focus();
 },{signal});
 replay.addEventListener('click',draw,{signal});
 next.addEventListener('click',()=>{
  if(step===steps.length-1)demo.close();
  else{step++;draw();}
 },{signal});
 close.addEventListener('click',()=>demo.close(),{signal});
 signal.addEventListener('abort',()=>clearTimeout(playTimer),{once:true});
 help.classList.add('kid-hoops-pass-description');
 screen.append(launcher,demo);
}
