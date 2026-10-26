import {createLearningVoice} from './voice.mjs?v=island-alpine-20261026-1';
import {STATIONS,levelForAge,questionsForAge} from './state.mjs?v=island-alpine-20261026-1';
import {unpoint} from './questions.mjs?v=island-alpine-20261026-1';
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='learning-answer')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};
const phrase=(text,q)=>q.level<=4?text:unpoint(text);
function townImage(seed) {
  const colors=['#e6a79a','#9cbfd6','#e8cf8a','#b3c89b'],sky=['#c9e7ee','#d2e5f3','#f6dfb5'][seed%3];
  const houses=Array.from({length:5},(_,i)=>{const x=12+i*57,y=105+(i%2)*24,c=colors[(seed+i)%4];return `<rect x="${x}" y="${y}" width="49" height="74" rx="3" fill="${c}"/><path d="M${x-3} ${y}l28 -32 28 32z" fill="#658b98"/><rect x="${x+7}" y="${y+13}" width="12" height="17" fill="#fff5d3"/><rect x="${x+28}" y="${y+13}" width="12" height="17" fill="#fff5d3"/><rect x="${x+20}" y="${y+46}" width="12" height="28" fill="#527b86"/>`;}).join('');
  const clouds=Array.from({length:5},(_,i)=>{const x=20+i*60,y=12+(seed+i*7)%25,r=8+(seed+i)%6;return `<g fill="#fff8ed" opacity=".8"><ellipse cx="${x}" cy="${y+7}" rx="${r+8}" ry="7"/><circle cx="${x-5}" cy="${y+2}" r="${r-2}"/><circle cx="${x+5}" cy="${y}" r="${r}"/></g>`;}).join('');
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2=".71"><stop stop-color="${sky}"/><stop offset="1" stop-color="#edf3ed"/></linearGradient></defs><rect width="300" height="300" fill="url(#sky)"/>${clouds}<circle cx="${45+seed%210}" cy="40" r="22" fill="#f8cd72"/><path d="M0 180Q70 145 150 182T300 173V300H0" fill="#91c9a3"/>${houses}<path d="M0 265L300 218" stroke="#dfc5a3" stroke-width="30"/><path d="M0 265L300 218" stroke="#fff3cf" stroke-width="2" stroke-dasharray="12 10"/><rect x="25" y="198" width="8" height="43" fill="#a27856"/><circle cx="29" cy="195" r="24" fill="#5f9e7e"/><rect x="263" y="176" width="8" height="43" fill="#a27856"/><circle cx="267" cy="173" r="25" fill="#659d78"/></svg>`);
}
export class LearningInterface {
  constructor({ui,engine}) {
    Object.assign(this,{ui,engine});ui.learningInterface=this;this.voice=createLearningVoice();
    this.stopVoiceListener=this.voice.subscribe(available=>{const q=this.engine.learningRound()?.question;if(this.dialog&&q){if(this.visualNode)this.visualNode.replaceWith(this.visualNode=this.visual(q));if(available)this.voice.speak(q.voice);}});
    this.panel=el('aside','learning-daily-panel panel');
    this.mapButton=button('','daily-mission',()=>this.daily(),'learning-daily-toggle');this.panel.append(this.mapButton);ui.root.querySelector('.hud').append(this.panel);
    this.unsubscribe=engine.subscribe(()=>this.render());this.render();
    this.dayTimer=setInterval(()=>this.render(),1000);
  }
  render(){
    this.engine.refreshLearningDay();
    const s=this.engine.learningStatus();this.mapButton.textContent=`${s.complete?'✅':'📚'} מְשִׂימַת הַיּוֹם · ${Math.min(s.target,s.rounds)}/${s.target}`;
    this.mapButton.dataset.complete=String(s.complete);this.mapButton.setAttribute('aria-label',this.mapButton.textContent);
    const signature=JSON.stringify(s),changed=this.dailySignature&&this.dailySignature!==signature;this.dailySignature=signature;
    if(changed){
      if(this.ui.modalRoot.querySelector('[data-daily-mission]'))this.daily();
      for(const card of this.ui.modalRoot.querySelectorAll('.game-card')){
        const available=this.ui.activityInterface.availability(card.dataset.game),play=card.querySelector('[data-action=game-play]');
        card.dataset.dailyLocked=String(s.locked);card.dataset.locked=String(s.locked||!available.ok);
        if(play)play.textContent=s.locked?'🔒 📚 משימת היום':this.ui.t(available.ok?'minigame.play':available.reason);
        let lock=card.querySelector('.game-locked');if(s.locked||!available.ok){if(!lock){lock=el('p','game-locked');card.append(lock);}lock.textContent=s.locked?'🔒 📚 קודם משלימים את משימת היום':this.ui.t(available.reason);}else lock?.remove();
      }
    }
  }
  pauseMap(){this.ui.view.paused=true;const cleanup=this.ui.modalCleanup;this.ui.modalCleanup=()=>{cleanup?.();this.ui.view.paused=false;};}
  daily(){
    const dialog=this.ui.openModal('learning.daily','learning.dailyHint'),s=this.engine.learningStatus();dialog.dataset.dailyMission='true';dialog.classList.add('learning-daily');this.pauseMap();dialog.querySelector('.modal-subtitle').textContent=s.target===1?'סבב קצר של 5 שאלות פותח את המשחקים':'שני סבבים של 8 שאלות פותחים את המשחקים';
    dialog.append(el('div','learning-daily-progress',`${s.complete?'✅':'📚'} ${Math.min(s.target,s.rounds)} / ${s.target}`));
    const progress=el('progress');progress.max=s.target;progress.value=Math.min(s.target,s.rounds);progress.setAttribute('aria-label','סבבי לימוד היום');dialog.append(progress);
    dialog.append(el('p','',s.complete?'הַמִּשְׂחָקִים פְּתוּחִים. אֶפְשָׁר לְהַמְשִׁיךְ לִלְמֹד!':s.firstDay?`בַּיּוֹם הָרִאשׁוֹן הַמִּשְׂחָקִים פְּתוּחִים. מָחָר נַתְחִיל בְּ־${s.target} סְבָבִים.`:!this.engine.state.learning.required?'חובת המשימה כבויה בהגדרות ההורה.':`בְּחַרוּ תַּחֲנָה וְסַיְּמוּ ${s.target} סְבָבִים, גַּם בְּאוֹתָהּ תַּחֲנָה.`));
    const choices=el('div','learning-stations');
    for(const [id,station]of Object.entries(STATIONS)){
      const built=this.engine.state.buildings.some(b=>b.typeId===station.building),level=this.engine.state.learning.stations[id].level;
      const b=button(`${station.icon} ${station.title}\n${built?`רָמָה ${level} · ${questionsForAge(this.engine.state.learning.age)} שְׁאֵלוֹת`:'בּוֹנִים בָּעִיר'}`,'daily-station',()=>{if(built)this.start(id);else{this.ui.closeModal();this.ui.openBuildingCatalog(station.building);}},'learning-station');b.dataset.station=id;choices.append(b);
    }
    dialog.append(choices,el('p','learning-workout','🏃 אִמּוּן הַיּוֹם · אֶפְשָׁר לְהִתְאַמֵּן גַּם בְּאַפְּלִיקַצְיַת הַכֹּשֶׁר.'));
  }
  decorateParent(dialog){
    this.pauseMap();
    const label=el('div','learning-parent'),input=button('','learning-required',()=>{this.engine.setLearningRequired(!this.engine.state.learning.required);render();},'learning-small');input.setAttribute('role','switch');input.setAttribute('aria-label','חובת משימת היום לפני משחקים');
    const render=()=>{const required=this.engine.state.learning.required;input.textContent=required?'✓':'○';input.setAttribute('aria-checked',String(required));};render();label.append(input,el('span','','חובת משימת היום לפני משחקים'));dialog.append(label);
    const ages=el('fieldset','learning-age');ages.append(el('legend','','גיל הילד או הילדה'));
    ages.append(el('p','','בחירת גיל קובעת את רמת ההתחלה בכל התחנות. לאחר מכן הרמה מסתגלת לתשובות.'));
    for(let age=4;age<=10;age++){const b=button(String(age),'learning-age',()=>{this.engine.setLearningAge(age);for(const n of ages.querySelectorAll('button'))n.setAttribute('aria-pressed',String(Number(n.textContent)===age));},'learning-small');b.dataset.age=age;b.setAttribute('aria-label',`גיל ${age}, רמת התחלה ${levelForAge(age)}`);b.setAttribute('aria-pressed',String(this.engine.state.learning.age===age));ages.append(b);}dialog.append(ages);
  }
  start(station){
    this.ui.closeModal();this.ui.closeInfo();this.ui.cancelPlacement();this.ui.closeDetails();this.ui.setDockOpen(false);
    const r=this.engine.startLearning(station);if(!r.ok){this.ui.result(r);return;}
    const dialog=this.ui.openModal('learning.title','learning.subtitle');dialog.classList.add('learning-screen');dialog.dataset.learning=station;this.dialog=dialog;this.ui.view.paused=true;
    this.ui.modalCleanup=()=>{this.clearQuestion();clearInterval(this.clockTimer);this.voice.stop();this.engine.cancelLearning();this.ui.view.paused=false;this.dialog=null;};
    const header=el('header','learning-header'),heading=dialog.querySelector('h2');heading.textContent=`${STATIONS[station].icon} ${STATIONS[station].title}`;
    this.speaker=button('🔊','learning-replay',()=>{const q=this.engine.learningRound()?.question;if(q)this.voice.speak(q.voice);},'learning-speaker');this.speaker.setAttribute('aria-label','השמעת השאלה שוב');
    this.counter=el('span','learning-counter');this.clock=el('span','learning-clock');const close=dialog.querySelector('[data-action=close-modal]');close.classList.remove('modal-close');close.classList.add('learning-close');close.textContent='×';header.append(heading,this.counter,this.clock,this.speaker,close);
    this.body=el('div','learning-body');this.feedback=el('div','learning-feedback');this.feedback.setAttribute('role','status');this.feedback.setAttribute('aria-live','polite');this.footer=el('div','learning-footer');
    dialog.replaceChildren(header,this.body,this.feedback,this.footer);const started=this.engine.now();const clock=()=>{const t=Math.floor((this.engine.now()-started)/1000);this.clock.textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};clock();this.clockTimer=setInterval(clock,1000);this.drawQuestion();
  }
  clearQuestion(){clearTimeout(this.memoryTimer);this.memoryTimer=null;}
  drawQuestion(){
    this.clearQuestion();const round=this.engine.learningRound();if(!round)return;const q=round.question;
    this.dialog.dataset.kind=q.kind;this.dialog.dataset.level=q.level;this.dialog.dataset.pictureOnly=String(q.level<=2);this.dialog.querySelector('h2').textContent=q.level<=2?STATIONS[round.station].icon:`${STATIONS[round.station].icon} ${phrase(STATIONS[round.station].title,q)}`;this.dialog.dataset.template=q.template;this.counter.textContent=q.level<=2?`${round.index+1}/${round.total} · ${q.level}`:`${round.index+1}/${round.total} · ${phrase('רָמָה',q)} ${q.level}`;
    this.visualNode=null;this.body.replaceChildren();this.footer.replaceChildren();this.feedback.textContent='';this.feedback.dataset.state='';
    const prompt=el('h3','learning-prompt',q.level<=2?'':q.prompt);prompt.setAttribute('aria-label',q.prompt);prompt.tabIndex=-1;this.body.append(prompt);
    if(q.kind==='choice'){
      this.body.append(this.visualNode=this.visual(q));const answers=el('div','learning-answers');
      q.options.forEach(value=>{const b=button(value,'learning-answer',()=>this.answer(value));b.dataset.value=value;if(q.optionSizes)b.style.fontSize=q.optionSizes[value]+'px';answers.append(b);});this.body.append(answers);
    }else if(q.kind==='word')this.word(q);else if(q.kind==='jigsaw')this.jigsaw(q);else this.memory(q);
    this.help=button(q.level<=2?'💡':phrase('💡 רֶמֶז',q),'learning-hint',()=>{this.feedback.textContent=q.level<=2?'💡':q.hint;this.voice.speak(q.hint);},'learning-small');this.help.setAttribute('aria-label','רמז');this.footer.append(this.help);
    const instance=this.engine.state.buildings.find(b=>b.typeId===STATIONS[round.station].building);if(instance){const manage=button('🏠','learning-building',()=>{this.ui.closeModal();this.ui.showInfo(instance.id,{manage:true});},'learning-small');manage.setAttribute('aria-label','ניהול מבנה הלימוד');this.footer.append(manage);}
    this.voice.speak(q.voice);queueMicrotask(()=>prompt.focus());
  }
  visual(q){
    const v=el('div','learning-visual');
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
  jigsaw(q){
    const image=townImage(q.scene),wrap=el('div','learning-jigsaw-wrap'),reference=el('img','learning-jigsaw-reference');reference.src=image;reference.alt='תמונת העיר השלמה להרכבה';
    const grid=el('div','learning-jigsaw');grid.dir='ltr';grid.style.setProperty('--grid',q.size);this.tileOrder=[...q.order];let selected=null;
    const render=()=>{grid.replaceChildren();this.tileOrder.forEach((tile,pos)=>{const b=button('','learning-tile',()=>{if(selected===null){selected=pos;render();return;}[this.tileOrder[pos],this.tileOrder[selected]]=[this.tileOrder[selected],this.tileOrder[pos]];selected=null;render();});b.style.backgroundImage=`url("${image}")`;b.style.backgroundSize=`${q.size*100}% ${q.size*100}%`;b.style.backgroundPosition=`${tile%q.size/(q.size-1)*100}% ${Math.floor(tile/q.size)/(q.size-1)*100}%`;b.setAttribute('aria-label',`מקום ${pos+1}, חלק ${tile+1}`);b.setAttribute('aria-pressed',String(pos===selected));b.dataset.tile=tile;b.dataset.position=pos;grid.append(b);});};render();
    wrap.append(reference,grid);this.body.append(wrap);this.footer.append(button(q.level<=2?'✓':phrase('בּוֹדְקִים',q),'learning-check',()=>this.answer(this.tileOrder.join(','))));
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
    const spoken=result.correct?phrase('⭐ כָּל הַכָּבוֹד! מַמְשִׁיכִים לִלְמֹד.',q):!result.resolved?`${phrase('נְנַסֶּה שׁוּב. ',q)}${result.hint}`:`${phrase('לוֹמְדִים בְּיַחַד. הַתְּשׁוּבָה: ',q)}${['memory','jigsaw'].includes(q.kind)?phrase('הִנֵּה הַתְּמוּנָה הַשְּׁלֵמָה.',q):(q.answerLabel||result.answer)}`;
    this.feedback.textContent=q.level<=2?(result.correct?'⭐':result.resolved?'👀 💡':'💡 ↻'):spoken;this.voice.speak(!result.correct&&result.resolved&&q.level<=2?`${phrase('הַתְּשׁוּבָה הִיא: ',q)}${q.answerVoice}`:spoken);
    if(!result.resolved){if(q.kind==='choice'){const b=[...this.body.querySelectorAll('[data-action=learning-answer]')].find(b=>b.dataset.value===value);if(b)b.disabled=true;}return;}
    if(['memory','jigsaw'].includes(q.kind))this.revealPuzzle?.();
    for(const b of this.body.querySelectorAll('button')){b.disabled=true;if(q.kind==='choice'&&b.dataset.value===q.answer)b.dataset.correct='true';}
    this.footer.replaceChildren(button(q.level<=2?'➜':phrase('מַמְשִׁיכִים ←',q),'learning-next',()=>{const next=this.engine.nextLearning();if(!next.ok)return;if(next.done)this.result(next.result);else this.drawQuestion();}));
    this.footer.firstChild.focus();
  }
  result(result){
    this.ui.closeModal();const dialog=this.ui.openModal('learning.done','learning.doneHint');dialog.classList.add('learning-result');dialog.dataset.learningResult=result.station;
    this.ui.modalCleanup=()=>this.voice.stop();
    const s=this.engine.learningStatus(),stars=el('div','learning-result-stars','★'.repeat(result.stars)+'☆'.repeat(3-result.stars)),money=el('div','learning-result-money',`🪙 +${result.money}`);
    if(result.pictureOnly){
      dialog.querySelector('h2').textContent='⭐';dialog.querySelector('.modal-subtitle').remove();
      dialog.append(stars,el('div','learning-result-station',STATIONS[result.station].icon),el('p','',`${result.firstTry}/${result.total} · 💡 ${result.retried}`),money,el('p','',`📚 ${Math.min(s.target,s.rounds)}/${s.target}`));
    }else{
      const f=text=>result.level>=5?unpoint(text):text;
      dialog.querySelector('h2').textContent=f(dialog.querySelector('h2').textContent);dialog.querySelector('.modal-subtitle').textContent=f(dialog.querySelector('.modal-subtitle').textContent);
      dialog.append(stars,el('h3','',f(STATIONS[result.station].title)),el('p','',f(`${result.firstTry} מִתּוֹךְ ${result.total} בַּנִּסָּיוֹן הָרִאשׁוֹן · ${result.retried} אַחֲרֵי רֶמֶז`)),money,el('p','',f(`רָמָה ${result.level} · ${Math.min(s.target,s.rounds)}/${s.target} סְבָבִים הַיּוֹם`)));
    }
    const daily=button(result.pictureOnly?'📚':'📚 משימת היום','learning-result-daily',()=>this.daily()),map=button(result.pictureOnly?'🏝️':'🏝️ חוזרים לעיר','learning-result-map',()=>this.ui.closeModal(),'learning-small');daily.setAttribute('aria-label','משימת היום');map.setAttribute('aria-label','חוזרים לעיר');dialog.append(daily,map);
    this.voice.speak(`כָּל הַכָּבוֹד! סִיַּמְתֶּם סֶבֶב. קִבַּלְתֶּם ${result.money} מַטְבְּעוֹת וְ־${result.stars} כּוֹכָבִים.`);
  }
  dispose(){this.clearQuestion();clearInterval(this.dayTimer);clearInterval(this.clockTimer);this.stopVoiceListener();this.voice.dispose();this.unsubscribe();this.panel.remove();}
}
