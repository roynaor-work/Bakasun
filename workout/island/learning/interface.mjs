import {createLearningVoice} from './voice.mjs?v=island-v2-20261107-24';
import {STATIONS,levelForAge,questionsForAge} from './state.mjs?v=island-v2-20261107-24';
import {unpoint} from './questions.mjs?v=island-v2-20261107-24';
import {correctVoice,retryVoice,pictureRevealVoice,feedbackVoice,roundVoice} from './spoken-copy.mjs?v=island-v2-20261107-24';
import {kidUx, kidUxStyle} from '../kid-ux.mjs?v=island-v2-20261107-24';

kidUxStyle('027', `
  .learning-voice-status { color: #243e4b; background: #fff9ed; border-radius: 12px; padding: 8px; font-size: 14px; font-weight: 700; }
  .learning-voice-status[hidden], .learning-picture-choice[hidden] { display: none; }
  .learning-picture-choice { min-width: 48px; min-height: 48px; padding: 4px; font-size: 22px; }
  .learning-picture-example { color: #243e4b; background: #fff9ed; border-radius: 16px; padding: 4px 12px; font-size: 24px; }
  .learning-screen[data-template=picture-association] .learning-answers button { min-width: 48px; }
`);
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='learning-answer')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const phrase=(text,q)=>q.level<=4?text:unpoint(text);
function townImage(seed) {
  const colors=['#e6a79a','#9cbfd6','#e8cf8a','#b3c89b'],sky=['#c9e7ee','#d2e5f3','#f6dfb5'][seed%3];
  const houses=Array.from({length:5},(_,i)=>{const x=12+i*57,y=105+(i%2)*24,c=colors[(seed+i)%4];return `<rect x="${x}" y="${y}" width="49" height="74" rx="3" fill="${c}"/><path d="M${x-3} ${y}l28 -32 28 32z" fill="#658b98"/><rect x="${x+7}" y="${y+13}" width="12" height="17" fill="#fff5d3"/><rect x="${x+28}" y="${y+13}" width="12" height="17" fill="#fff5d3"/><rect x="${x+20}" y="${y+46}" width="12" height="28" fill="#527b86"/>`;}).join('');
  const clouds=Array.from({length:5},(_,i)=>{const x=20+i*60,y=12+(seed+i*7)%25,r=8+(seed+i)%6;return `<g fill="#fff8ed" opacity=".8"><ellipse cx="${x}" cy="${y+7}" rx="${r+8}" ry="7"/><circle cx="${x-5}" cy="${y+2}" r="${r-2}"/><circle cx="${x+5}" cy="${y}" r="${r}"/></g>`;}).join('');
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2=".71"><stop stop-color="${sky}"/><stop offset="1" stop-color="#edf3ed"/></linearGradient></defs><rect width="300" height="300" fill="url(#sky)"/>${clouds}<circle cx="${45+seed%210}" cy="40" r="22" fill="#f8cd72"/><path d="M0 180Q70 145 150 182T300 173V300H0" fill="#91c9a3"/>${houses}<path d="M0 265L300 218" stroke="#dfc5a3" stroke-width="30"/><path d="M0 265L300 218" stroke="#fff3cf" stroke-width="2" stroke-dasharray="12 10"/><rect x="25" y="198" width="8" height="43" fill="#a27856"/><circle cx="29" cy="195" r="24" fill="#5f9e7e"/><rect x="263" y="176" width="8" height="43" fill="#a27856"/><circle cx="267" cy="173" r="25" fill="#659d78"/></svg>`);
}
kidUxStyle('028', `
  .modal.learning-daily[data-kid-daily-route]{width:min(680px,100%);padding:14px}
  .modal.learning-daily[data-kid-daily-route] .modal-subtitle{margin-block:3px 7px;font-size:14px;color:#24443c}
  .kid-daily-journey{display:flex;align-items:stretch;gap:8px;color:#203f36}
  .kid-daily-journey ol{list-style:none;display:flex;align-items:stretch;flex:1;gap:5px;margin:0;padding:0;min-width:0}
  .kid-daily-journey-item{min-width:0;flex:1;display:grid;text-align:center;align-content:center;gap:2px;padding:5px 3px;border-radius:8px;border:2px solid #c7d9c3;background:#edf3e8;font-size:14px;line-height:1.25}
  .kid-daily-journey-item[aria-current=step]{border-color:#436b39;background:#e7efcb}
  .kid-daily-journey-item[data-finished=true]{background:#d7e8ca}
  .kid-daily-journey-item.kid-daily-game{background:#f7e9bb;border-color:#d5b76b}
  .kid-daily-journey-icon{font-size:23px}
  .kid-daily-questions{letter-spacing:2px;overflow-wrap:anywhere}
  .kid-daily-journey button{align-self:center;min-width:48px;min-height:48px;font-size:21px}
  .modal.learning-daily[data-kid-daily-route] .learning-stations{margin-block:9px;gap:8px}
  .modal.learning-daily[data-kid-daily-route] .learning-station{min-height:48px;padding:5px;font-size:14px}
  .kid-daily-result-actions{display:flex;align-items:stretch;justify-content:center;flex-wrap:wrap;gap:8px;margin-block:8px}
  .kid-daily-result-actions button{font-size:14px;min-height:48px;flex:1 1 110px;padding:6px 8px}
  .kid-daily-result-actions [data-action=kid-daily-resume]{flex-basis:100%;background:#285f54;color:#fff}
  @media(max-width:450px){.kid-daily-journey{flex-wrap:wrap}.kid-daily-journey ol{flex-basis:100%}}
`);

const dailyGameIcons = {soccer:'⚽',tennis:'🎾',navalDuel:'⚓',fireRescue:'🚒',alienDefense:'🚀',islandRacing:'🏎️',streetSlam:'🏀',alpineRush:'🏂',boarDefense:'🐗',catchCriminal:'🚓'};

export class LearningInterface {
  constructor({ui,engine}) {
    Object.assign(this,{ui,engine});ui.learningInterface=this;this.voice=createLearningVoice({monitorErrors:kidUx('027')});
    this.stopVoiceListener=this.voice.subscribe(available=>{
      const q=this.engine.learningRound()?.question;
      if(!this.dialog||!q)return;
      if(kidUx('027')&&q.station==='language'){
        if(!available&&this.engine.useLearningPictures()){
          this.drawQuestion();
          return;
        }
        this.updateLanguageVoice(q);
      }
      if(this.visualNode)this.visualNode.replaceWith(this.visualNode=this.visual(q));
      if(available)this.voice.speak(q.voice);
    });
    this.panel=el('aside','learning-daily-panel panel');
    this.mapButton=button('','daily-mission',()=>this.daily(),'learning-daily-toggle');this.panel.append(this.mapButton);(ui.tasksContent||ui.root.querySelector('.hud')).append(this.panel);
    this.unsubscribe=engine.subscribe(()=>this.render());this.render();
    this.dayTimer=setInterval(()=>this.render(),1000);
  }
  render(){
    this.engine.refreshLearningDay();
    const s=this.engine.learningStatus();this.mapButton.textContent=`${s.complete?'✅':'📚'} מְשִׂימַת הַיּוֹם · ${Math.min(s.target,s.rounds)}/${s.target}`;
    this.mapButton.dataset.complete=String(s.complete);this.mapButton.setAttribute('aria-label',this.mapButton.textContent);
    const signature=JSON.stringify(s),changed=this.dailySignature&&this.dailySignature!==signature;this.dailySignature=signature;
    if(changed){
      if(this.ui.modalRoot.querySelector('[data-daily-mission]'))this.daily(this.dailyGameId);
      for(const card of this.ui.modalRoot.querySelectorAll('.game-card')){
        const available=this.ui.activityInterface.availability(card.dataset.game),play=card.querySelector('[data-action=game-play]');
        card.dataset.dailyLocked=String(s.locked);card.dataset.locked=String(s.locked||!available.ok);
        if(play)play.textContent=s.locked?'🔒 📚 משימת היום':this.ui.t(available.ok?'minigame.play':available.reason);
        let lock=card.querySelector('.game-locked');if(s.locked||!available.ok){if(!lock){lock=el('p','game-locked');card.append(lock);}lock.textContent=s.locked?'🔒 📚 קודם משלימים את משימת היום':this.ui.t(available.reason);}else lock?.remove();
      }
    }
  }
  pauseMap(){this.ui.view.paused=true;const cleanup=this.ui.modalCleanup;this.ui.modalCleanup=()=>{cleanup?.();this.ui.view.paused=false;};}
  daily(gameId=null){
    const selected = kidUx('028') ? this.engine.registry.minigames.get(gameId) : null;
    this.dailyGameId = selected?.id ?? null;
    const dialog=this.ui.openModal('learning.daily','learning.dailyHint'),s=this.engine.learningStatus();dialog.dataset.dailyMission='true';dialog.classList.add('learning-daily');this.pauseMap();dialog.querySelector('.modal-subtitle').textContent=s.target===1?'סבב קצר של 5 שאלות פותח את המשחקים':'שני סבבים של 8 שאלות פותחים את המשחקים';
    if (kidUx('028') && s.locked) {
      const title = selected ? this.ui.t(selected.title) : 'משחקי העיר';
      dialog.dataset.kidDailyRoute = selected?.id ?? 'games';
      dialog.querySelector('.modal-subtitle').textContent = selected ? `בוחרים תחנה. אחרי הלימוד חוזרים ל${title}.` : 'בוחרים תחנה. אחרי הלימוד המשחקים נפתחים.';
      const journey = el('div', 'kid-daily-journey');
      const steps = el('ol');
      steps.setAttribute('aria-label', 'הדרך למשחק');
      const questions = questionsForAge(this.engine.state.learning.age);
      for(let i=0;i<s.target;i++){
        const item = el('li', 'kid-daily-journey-item');
        const icon = el('span', 'kid-daily-journey-icon', i < s.rounds ? '✅' : '🧩');
        icon.setAttribute('aria-hidden', 'true');
        const dots = el('span', 'kid-daily-questions', '•'.repeat(questions));
        dots.setAttribute('aria-label', `${questions} שאלות`);
        if (i===s.rounds) item.setAttribute('aria-current', 'step');
        item.dataset.finished = String(i < s.rounds);
        item.setAttribute('aria-label', `סבב ${i+1}, ${questions} שאלות${i < s.rounds ? ', הושלם' : ''}`);
        item.append(icon, el('strong', '', `סבב ${i+1}`), dots);
        steps.append(item);
      }
      const goal = el('li', 'kid-daily-journey-item kid-daily-game');
      const icon = el('span', 'kid-daily-journey-icon', dailyGameIcons[selected?.id] ?? '🎮');
      icon.setAttribute('aria-hidden', 'true');
      goal.append(icon, el('strong', '', title)); steps.append(goal);
      const instruction = s.target===1 ? 'בִּחֲרוּ תַּחֲנָה וְסַיְּמוּ סֶבֶב אֶחָד.' : 'בִּחֲרוּ תַּחֲנָה וְסַיְּמוּ שְׁנֵי סְבָבִים.';
      const message = instruction + (selected ? ' אַחֲרֵי זֶה חוֹזְרִים לַמִּשְׂחָק.' : ' אַחֲרֵי זֶה הַמִּשְׂחָקִים נִפְתָּחִים.');
      const hear = button('🔊', 'kid-daily-hear', () => this.voice.speak(message), 'learning-small');
      hear.setAttribute('aria-label', 'שמיעת ההוראות');
      journey.append(steps, hear);
      dialog.append(journey);
    } else {
      dialog.append(el('div','learning-daily-progress',`${s.complete?'✅':'📚'} ${Math.min(s.target,s.rounds)} / ${s.target}`));
      const progress=el('progress');progress.max=s.target;progress.value=Math.min(s.target,s.rounds);progress.setAttribute('aria-label','סבבי לימוד היום');dialog.append(progress);
      dialog.append(el('p','',s.complete?'הַמִּשְׂחָקִים פְּתוּחִים. אֶפְשָׁר לְהַמְשִׁיךְ לִלְמֹד':s.firstDay?`בַּיּוֹם הָרִאשׁוֹן הַמִּשְׂחָקִים פְּתוּחִים. מָחָר נַתְחִיל בְּ־${s.target} סְבָבִים.`:!this.engine.state.learning.required?'חובת המשימה כבויה בהגדרות ההורה.':`בְּחַרוּ תַּחֲנָה וְסַיְּמוּ ${s.target} סְבָבִים, גַּם בְּאוֹתָהּ תַּחֲנָה.`));
    }
    const choices=el('div','learning-stations');
    for(const [id,station]of Object.entries(STATIONS)){
      const built=this.engine.state.buildings.some(b=>b.typeId===station.building),level=this.engine.state.learning.stations[id].level;
      const b=button(`${station.icon} ${station.title}\n${built?`רָמָה ${level} · ${questionsForAge(this.engine.state.learning.age)} שְׁאֵלוֹת`:'בּוֹנִים בָּעִיר'}`,'daily-station',()=>{if(built)this.start(id, selected?.id);else{this.ui.closeModal();this.ui.openBuildingCatalog(station.building);}},'learning-station');b.dataset.station=id;choices.append(b);
    }
    dialog.append(choices,el('p','learning-workout','🏃 אִמּוּן הַיּוֹם · אֶפְשָׁר לְהִתְאַמֵּן גַּם בְּאַפְּלִיקַצְיַת הַכֹּשֶׁר.'));
  }
  decorateParent(dialog){
    this.pauseMap();
    const label=el('div','learning-parent'),input=button('','learning-required',()=>{this.engine.setLearningRequired(!this.engine.state.learning.required);render();},'learning-small');input.setAttribute('role','switch');input.setAttribute('aria-label','חובת משימת היום לפני משחקים');
    const render=()=>{const required=this.engine.state.learning.required;input.textContent=required?'✓':'○';input.setAttribute('aria-checked',String(required));};render();label.append(input,el('span','','חובת משימת היום לפני משחקים'));dialog.append(label);
    const ages=el('fieldset','learning-age');ages.append(el('legend','','גיל הילד או הילדה'));
    ages.append(el('p','','הגיל קובע מאיזו רמה מתחילים בכל תחנה. אחר כך הרמה משתנה לפי התשובות.'));
    for(let age=4;age<=10;age++){const b=button(String(age),'learning-age',()=>{this.engine.setLearningAge(age);for(const n of ages.querySelectorAll('button'))n.setAttribute('aria-pressed',String(Number(n.textContent)===age));},'learning-small');b.dataset.age=age;b.setAttribute('aria-label',`גיל ${age}, רמת התחלה ${levelForAge(age)}`);b.setAttribute('aria-pressed',String(this.engine.state.learning.age===age));ages.append(b);}dialog.append(ages);
  }
  start(station, gameId=null){
    this.dailyGameId = kidUx('028') ? gameId : null;
    this.ui.closeModal();this.ui.closeInfo();this.ui.cancelPlacement();this.ui.closeDetails();this.ui.setDockOpen(false);
    const r=this.engine.startLearning(station,{languagePictures:kidUx('027')&&station==='language'&&!this.voice.available});if(!r.ok){this.ui.result(r);return;}
    const dialog=this.ui.openModal('learning.title','learning.subtitle');dialog.classList.add('learning-screen');dialog.dataset.learning=station;this.dialog=dialog;this.ui.view.paused=true;
    if(kidUx('038'))this.jigsawDemoShown=false;
    this.ui.modalCleanup=()=>{this.clearQuestion();clearInterval(this.clockTimer);this.voice.stop();this.engine.cancelLearning();this.ui.view.paused=false;this.dialog=null;};
    const header=el('header','learning-header'),heading=dialog.querySelector('h2');heading.textContent=`${STATIONS[station].icon} ${STATIONS[station].title}`;
    this.speaker=button('🔊','learning-replay',()=>{const q=this.engine.learningRound()?.question;if(q)this.voice.speak(q.voice);},'learning-speaker');this.speaker.setAttribute('aria-label','השמעת השאלה שוב');
    this.counter=el('span','learning-counter');this.clock=el('span','learning-clock');const close=dialog.querySelector('[data-action=close-modal]');close.classList.remove('modal-close');close.classList.add('learning-close');close.textContent='×';header.append(heading,this.counter,this.clock,this.speaker,close);
    if(kidUx('027')&&station==='language'){
      this.voiceStatus=el('span','learning-voice-status','🔇 קול בעברית לא זמין');
      this.voiceStatus.setAttribute('role','status');
      this.pictureChoice=button('🖼️','learning-picture-choice',()=>{
        if(this.engine.useLearningPictures())this.drawQuestion();
      },'learning-small learning-picture-choice');
      this.pictureChoice.setAttribute('aria-label','לשחק עם תמונות');
      this.speaker.before(this.voiceStatus,this.pictureChoice);
    }
    this.body=el('div','learning-body');this.feedback=el('div','learning-feedback');this.feedback.setAttribute('role','status');this.feedback.setAttribute('aria-live','polite');this.footer=el('div','learning-footer');
    dialog.replaceChildren(header,this.body,this.feedback,this.footer);const started=this.engine.now();const clock=()=>{const t=Math.floor((this.engine.now()-started)/1000);this.clock.textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};clock();this.clockTimer=setInterval(clock,1000);this.drawQuestion();
  }
  clearQuestion(){clearTimeout(this.memoryTimer);this.memoryTimer=null;}
  updateLanguageVoice(q){
    this.voiceStatus.hidden=this.voice.available;
    this.pictureChoice.hidden=!this.voice.available||q.pictureOnly||this.engine.learningRound().attempts>0;
    this.speaker.disabled=!this.voice.available;
  }
  drawQuestion(){
    this.clearQuestion();const round=this.engine.learningRound();if(!round)return;const q=round.question;
    if(kidUx('027')&&q.station==='language')this.updateLanguageVoice(q);
    this.dialog.dataset.kind=q.kind;this.dialog.dataset.level=q.level;this.dialog.dataset.pictureOnly=String(q.pictureOnly);this.dialog.querySelector('h2').textContent=q.pictureOnly?STATIONS[round.station].icon:`${STATIONS[round.station].icon} ${phrase(STATIONS[round.station].title,q)}`;this.dialog.dataset.template=q.template;this.counter.textContent=q.pictureOnly?`${round.index+1}/${round.total} · ${q.level}`:`${round.index+1}/${round.total} · ${phrase('רָמָה',q)} ${q.level}`;
    this.visualNode=null;this.body.replaceChildren();this.footer.replaceChildren();this.feedback.textContent='';this.feedback.dataset.state='';
    const prompt=el('h3','learning-prompt',q.pictureOnly?'':q.prompt);prompt.setAttribute('aria-label',q.prompt);prompt.tabIndex=-1;this.body.append(prompt);
    if(q.kind==='choice'){
      this.body.append(this.visualNode=this.visual(q));const answers=el('div','learning-answers');
      q.options.forEach(value=>{const b=button(value,'learning-answer',()=>this.answer(value));b.dataset.value=value;if(q.optionSizes)b.style.fontSize=q.optionSizes[value]+'px';answers.append(b);});this.body.append(answers);
    }else if(q.kind==='word')this.word(q);else if(q.kind==='jigsaw')this.jigsaw(q);else this.memory(q);
    this.help=button(q.pictureOnly?'💡':phrase('💡 רֶמֶז',q),'learning-hint',()=>{this.feedback.textContent=q.pictureOnly?'💡':q.hint;this.voice.speak(q.hintVoice);},'learning-small');this.help.setAttribute('aria-label','רמז');this.footer.append(this.help);
    const instance=this.engine.state.buildings.find(b=>b.typeId===STATIONS[round.station].building);if(instance){const manage=button('🏠','learning-building',()=>{this.ui.closeModal();this.ui.showInfo(instance.id,{manage:true});},'learning-small');manage.setAttribute('aria-label','ניהול מבנה הלימוד');this.footer.append(manage);}
    this.voice.speak(q.voice);queueMicrotask(()=>prompt.focus());
  }
  visual(q){
    const v=el('div','learning-visual');
    if(q.visualLanguage){
      const example=el('span','learning-picture-example','⛽ → 🚗 ✓');
      example.dir='ltr';
      example.setAttribute('aria-label','דוגמה: מכונית מתאימה לתחנת דלק');
      v.append(example);
    }
    const fallback=q.level<=2&&!this.voice.available&&q.visual.fallback;v.dataset.voiceFallback=String(Boolean(fallback));
    if(fallback){v.append(el('div','learning-symbols',q.visual.fallback));return v;}
    if(q.visual.letter){const letter=el('img','learning-letter-image');letter.alt=q.visual.letter;letter.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="76" text-anchor="middle" font-family="sans-serif" font-size="80" fill="#315d6c">${q.visual.letter}</text></svg>`);v.append(letter);}
    if(q.visual.shadow)v.append(el('div','learning-symbols learning-shadow',q.visual.shadow));
    if(q.visual.symbols)v.append(el('div','learning-symbols',q.visual.symbols));
    if(q.visual.caption)v.append(el('div','learning-caption',q.visual.caption));
    if(q.visual.equation){const equation=el('bdi','learning-equation',q.visual.equation);equation.dir='ltr';v.append(equation);}
    if(q.visual.groups){const groups=el('div','learning-groups');groups.append(el('span','',q.visual.groups[0]),el('b','','+'),el('span','',q.visual.groups[1]));groups.dir='ltr';v.append(groups);}
    if(q.visual.sequence){const row=el('div','learning-sequence');row.dir='ltr';q.visual.sequence.forEach(s=>row.append(el('span','',s)));v.append(row);}
    return v;
  }
  word(q){
    this.body.append(this.visualNode=this.visual(q));const row=el('div','learning-word-slots'),letters=el('div','learning-letters'),chosen=[];
    const render=()=>{row.textContent=chosen.map(i=>q.letters[i]).join('')||'＿ '.repeat(q.letters.length);};render();
    q.letters.forEach((letter,i)=>{const b=button(letter,'learning-letter',()=>{chosen.push(i);b.disabled=true;render();});letters.append(b);});
    const undo=button(phrase('↶ מְנַסִּים שׁוּב',q),'learning-word-clear',()=>{chosen.length=0;for(const b of letters.children)b.disabled=false;render();},'learning-small');
    this.body.append(row,letters,undo);this.footer.append(button(q.level<=2?'✓':phrase('בּוֹדְקִים',q),'learning-check',()=>this.answer(chosen.map(i=>q.letters[i]).join(''))));
  }
  jigsawDemo(){
    const demo=button('','learning-jigsaw-demo',replay,'learning-small learning-jigsaw-demo');
    demo.dir='ltr';
    demo.setAttribute('aria-label','הדגמה חוזרת של שתי נגיעות להחלפת חלקים');
    const before=el('span','learning-jigsaw-example'),after=el('span','learning-jigsaw-example');
    const first=el('span','learning-jigsaw-example-tile','🟦'),second=el('span','learning-jigsaw-example-tile','🟨');
    const tapHints=el('span','learning-jigsaw-example-taps');
    const hands=[el('span','','👆'),el('span','','👆')];
    tapHints.append(...hands);
    before.append(first,second,tapHints);
    after.append(el('span','learning-jigsaw-example-tile','🟨'),el('span','learning-jigsaw-example-tile','🟦'));
    const arrow=el('span','','→');
    for(const part of [before,arrow,after])part.setAttribute('aria-hidden','true');
    demo.append(before,arrow,after);

    function replay(){
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      demo.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
      const timing={duration:1450,easing:'linear'};
      hands[0].animate([{opacity:1,transform:'translateY(5px)'},{opacity:1,transform:'none',offset:.14},{opacity:.25,offset:.24},{opacity:.25,offset:.87},{opacity:1}],timing);
      hands[1].animate([{opacity:.25},{opacity:.25,offset:.28},{opacity:1,transform:'translateY(5px)',offset:.31},{opacity:1,transform:'none',offset:.43},{opacity:.25,offset:.55},{opacity:.25,offset:.87},{opacity:1}],timing);
      for(const [tile,shift] of [[first,'100%'],[second,'-100%']]){
        tile.animate([{transform:'none'},{transform:'none',offset:.55},{transform:`translateX(${shift})`,offset:.82},{transform:`translateX(${shift})`}],timing);
      }
      after.animate([{opacity:.45},{opacity:.45,offset:.8},{opacity:1}],timing);
    }
    if(!this.jigsawDemoShown){
      this.jigsawDemoShown=true;
      queueMicrotask(()=>{if(demo.isConnected)replay();});
    }
    return demo;
  }
  jigsaw(q){
    const image=townImage(q.scene),wrap=el('div','learning-jigsaw-wrap'),reference=el('img','learning-jigsaw-reference');reference.src=image;reference.alt='תמונת העיר השלמה להרכבה';
    const grid=el('div','learning-jigsaw');grid.dir='ltr';grid.style.setProperty('--grid',q.size);this.tileOrder=[...q.order];let selected=null;
    const render=()=>{grid.replaceChildren();this.tileOrder.forEach((tile,pos)=>{const b=button('','learning-tile',()=>{if(selected===null){selected=pos;render();return;}[this.tileOrder[pos],this.tileOrder[selected]]=[this.tileOrder[selected],this.tileOrder[pos]];selected=null;render();});b.style.backgroundImage=`url("${image}")`;b.style.backgroundSize=`${q.size*100}% ${q.size*100}%`;b.style.backgroundPosition=`${tile%q.size/(q.size-1)*100}% ${Math.floor(tile/q.size)/(q.size-1)*100}%`;b.setAttribute('aria-label',`מקום ${pos+1}, חלק ${tile+1}`);b.setAttribute('aria-pressed',String(pos===selected));b.dataset.tile=tile;b.dataset.position=pos;grid.append(b);});};render();
    wrap.append(reference,grid);
    if(kidUx('038'))wrap.append(this.jigsawDemo());
    this.body.append(wrap);this.footer.append(button(q.level<=2?'✓':phrase('בּוֹדְקִים',q),'learning-check',()=>this.answer(this.tileOrder.join(','))));
    this.revealPuzzle=()=>{this.tileOrder=Array.from({length:q.size*q.size},(_,i)=>i);selected=null;render();};
  }
  memory(q){
    const grid=el('div','learning-memory');grid.dir='ltr';const found=new Set();let opened=[],busy=false;
    const render=()=>{grid.replaceChildren();q.cards.forEach((card,i)=>{const visible=opened.includes(i)||found.has(card.icon),b=button(visible?card.icon:'?','learning-memory-card',()=>{
      if(busy||opened.includes(i)||found.has(card.icon)||this.engine.learningRound()?.resolved)return;
      opened.push(i);render();if(opened.length<2)return;
      const [a,c]=opened.map(i=>q.cards[i]);
      if(a.icon===c.icon){found.add(a.icon);opened=[];render();if(found.size===q.cards.length/2)this.answer(q.answer);}
      else{busy=true;this.memoryTimer=setTimeout(()=>{this.memoryTimer=null;this.answer('__mismatch__');opened=[];busy=false;if(!this.engine.learningRound()?.resolved)render();},650);}
    });b.dataset.card=i;b.setAttribute('aria-label',visible?card.icon:`קלף ${i+1}`);b.disabled=found.has(card.icon);grid.append(b);});};render();this.body.append(grid);
    this.revealPuzzle=()=>{q.cards.forEach(c=>found.add(c.icon));render();};
  }
  answer(value){
    const round=this.engine.learningRound(),q=round?.question;if(!q)return;const result=this.engine.answerLearning(value);if(!result.ok)return;
    this.feedback.dataset.state=result.correct?'correct':result.resolved?'revealed':'hint';
    const puzzle=q.kind==='memory'||q.kind==='jigsaw';
    const display=result.correct?phrase('⭐ '+correctVoice,q):!result.resolved?`${phrase(retryVoice,q)} ${result.hint}`:puzzle?phrase(pictureRevealVoice,q):`${phrase('לוֹמְדִים בְּיַחַד. הַתְּשׁוּבָה: ',q)}${q.answerLabel||result.answer}`;
    if(kidUx('027')&&q.station==='language')this.updateLanguageVoice(q);
    this.feedback.textContent=q.pictureOnly?(result.correct?'⭐':result.resolved?'👀 💡':'💡 ↻'):display;
    this.voice.speak(feedbackVoice(q,result));
    if(!result.resolved){if(q.kind==='choice'){const b=[...this.body.querySelectorAll('[data-action=learning-answer]')].find(b=>b.dataset.value===value);if(b)b.disabled=true;}return;}
    if(['memory','jigsaw'].includes(q.kind))this.revealPuzzle?.();
    for(const b of this.body.querySelectorAll('button')){b.disabled=true;if(q.kind==='choice'&&b.dataset.value===q.answer)b.dataset.correct='true';}
    this.footer.replaceChildren(button(q.pictureOnly?'➜':phrase('מַמְשִׁיכִים ←',q),'learning-next',()=>{const next=this.engine.nextLearning();if(!next.ok)return;if(next.done)this.result(next.result);else this.drawQuestion();}));
    if(q.visualLanguage)this.footer.firstChild.setAttribute('aria-label','ממשיכים לשאלה הבאה');
    this.footer.firstChild.focus();
  }
  result(result){
    this.ui.closeModal();const dialog=this.ui.openModal('learning.done','learning.doneHint');dialog.classList.add('learning-result');dialog.dataset.learningResult=result.station;
    this.ui.modalCleanup=()=>this.voice.stop();
    if(kidUx('028')&&this.dailyGameId)this.pauseMap();
    const s=this.engine.learningStatus(),stars=el('div','learning-result-stars','★'.repeat(result.stars)+'☆'.repeat(3-result.stars)),money=el('div','learning-result-money',`🪙 +${result.money}`);
    if(result.pictureOnly){
      dialog.querySelector('h2').textContent='⭐';dialog.querySelector('.modal-subtitle').remove();
      dialog.append(stars,el('div','learning-result-station',STATIONS[result.station].icon),el('p','',`${result.firstTry}/${result.total} · 💡 ${result.retried}`),money,el('p','',`📚 ${Math.min(s.target,s.rounds)}/${s.target}`));
    }else{
      const f=text=>result.level>=5?unpoint(text):text;
      dialog.querySelector('h2').textContent=f(dialog.querySelector('h2').textContent);dialog.querySelector('.modal-subtitle').textContent=f(dialog.querySelector('.modal-subtitle').textContent);
      dialog.append(stars,el('h3','',f(STATIONS[result.station].title)),el('p','',f(`${result.firstTry} מִתּוֹךְ ${result.total} בַּנִּסָּיוֹן הָרִאשׁוֹן · ${result.retried} אַחֲרֵי רֶמֶז`)),money,el('p','',f(`רָמָה ${result.level} · ${Math.min(s.target,s.rounds)}/${s.target} סְבָבִים הַיּוֹם`)));
    }
    const daily=button(result.pictureOnly?'📚':'📚 משימת היום','learning-result-daily',()=>this.daily(this.dailyGameId)),map=button(result.pictureOnly?'🏝️':'🏝️ חוזרים לעיר','learning-result-map',()=>this.ui.closeModal(),'learning-small');daily.setAttribute('aria-label','משימת היום');map.setAttribute('aria-label','חוזרים לעיר');
    const selected = kidUx('028') ? this.engine.registry.minigames.get(this.dailyGameId) : null;
    if (selected) {
      const actions = el('div', 'kid-daily-result-actions');
      actions.setAttribute('role', 'group');
      actions.setAttribute('aria-label', 'הצעד הבא');
      if (s.locked) {
        daily.textContent = '🧩 ממשיכים לסבב הבא';
        daily.setAttribute('aria-label', 'ממשיכים לסבב הבא');
      } else {
        const resume = button(`${dailyGameIcons[selected.id] ?? '🎮'} חוזרים ל${this.ui.t(selected.title)}`, 'kid-daily-resume', () => this.ui.activityInterface.gameHome(selected.id));
        actions.append(resume);
      }
      actions.append(daily,map);
      const anchor = dialog.querySelector('.modal-subtitle') ?? dialog.querySelector('h2');
      anchor.after(actions);
    } else {
      dialog.append(daily,map);
    }
    this.voice.speak(roundVoice(result));
  }
  dispose(){this.clearQuestion();clearInterval(this.dayTimer);clearInterval(this.clockTimer);this.stopVoiceListener();this.voice.dispose();this.unsubscribe();this.panel.remove();}
}

kidUxStyle('037', `
  .learning-memory { gap: 8px; }
  .learning-screen .learning-memory button { min-height: 52px; min-width: 44px; }
  @media (orientation: landscape) and (max-height: 600px) {
    .learning-memory { max-width: 280px; }
    .learning-screen .learning-memory button { height: 52px; }
    .learning-screen .learning-memory:has(button:nth-child(6):last-child) button { height: 64px; }
  }
  @media (max-width: 380px) {
    .learning-screen .learning-memory { grid-template-columns: repeat(4, minmax(44px, 1fr)); }
    .learning-screen .learning-memory:has(button:nth-child(6):last-child) { grid-template-columns: repeat(3, minmax(44px, 1fr)); }
  }
`);

kidUxStyle('038', `
  .learning-jigsaw-demo { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 44px; min-height: 64px; padding: 8px; font-size: 20px; direction: ltr; background: #fff9ed; color: #234c59; }
  .learning-jigsaw-example { position: relative; display: flex; padding-bottom: 10px; }
  .learning-jigsaw-example-tile { display: block; width: 24px; line-height: 24px; }
  .learning-jigsaw-example-taps { position: absolute; inset: 16px 0 auto; display: flex; font-size: 14px; text-align: center; }
  .learning-jigsaw-example-taps > span { width: 24px; }
  @media (orientation: landscape) and (max-height: 600px) {
    .learning-screen[data-kind=jigsaw] .learning-jigsaw-wrap { gap: 12px; }
    .learning-screen[data-kind=jigsaw] .learning-jigsaw-demo { flex-shrink: 0; }
  }
`);
