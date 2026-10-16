import {createSound} from '../minigames/sound.mjs?v=g3c-20261016-1';
import {gameIcon,upgradeCard} from '../minigames/icons.mjs?v=g3c-20261016-1';
import {availableAlienUpgrades} from '../activity/alien-upgrades.mjs?v=g3c-20261016-1';
import {createAmmoVisual} from '../minigames/art.mjs?v=g3c-20261016-1';
import {equipmentOffer} from '../activity/equipment.mjs?v=g3c-20261016-1';
import {gameContext} from '../minigames/context.mjs?v=g3c-20261016-1';
import {gameAvailability} from '../activity/availability.mjs?v=g3c-20261016-1';
import {GameNavigation,GameShell} from './game-shell.mjs?v=g3c-20261016-1';
import {playerCard} from './soccer-card.mjs?v=g3c-20261016-1';
import {attributes} from '../activity/soccer-card.mjs?v=g3c-20261016-1';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};

export class ActivityInterface {
  constructor({ui,engine,activity,data,t,now=Date.now}) {
    Object.assign(this,{ui,engine,activity,data,t,now});this.current=null;this.closing=false;this.eventOpen=false;
    this.navigation=new GameNavigation({onGameBack:()=>this.shell?.pause('exit'),onMenuBack:()=>this.ui.closeModal(),onMapBack:()=>this.confirmMapExit()});
    let storage;try{storage=window.localStorage;}catch{}
    this.sound=createSound({storage});this.soundEvents=new AbortController();
    document.addEventListener('pointerdown',event=>{this.sound.unlock();if(event.target.closest('button')&&ui.modalRoot.contains(event.target))this.sound.play('button');},{capture:true,signal:this.soundEvents.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.sound.suspend();},{signal:this.soundEvents.signal});
    ui.activityInterface=this;
    this.openButton=button(t('minigame.open'),'open-games',()=>this.menu());
    this.openButton.hidden=!data.featureFlags.minigames;ui.cityDetails.append(this.openButton);
    this.teamButton=button(t('minigame.soccer.teamCard'),'open-team',()=>this.team());
    this.teamButton.hidden=!data.featureFlags.soccer;ui.cityDetails.append(this.teamButton);
    this.panel=el('aside','event-panel panel');this.panel.hidden=true;
    this.indicator=button('','toggle-event',()=>{this.eventOpen=!this.eventOpen;this.render();});
    this.indicator.setAttribute('aria-expanded','false');this.details=el('div','event-details');this.details.hidden=true;
    this.panel.append(this.indicator,this.details);ui.root.querySelector('.hud').append(this.panel);
    this.unsubscribe=activity.subscribe(()=>{this.render();ui.refresh();});
    this.unsubscribeEngine=engine.subscribe(()=>this.render());this.render();
  }
  cleanup(eventId) {
    this.closing=true;const current=this.current;this.current=null;current?.cancel();
    this.shell?.dispose();this.shell=null;
    if(eventId)this.activity.cancel(eventId);
    if(!this.switching)this.navigation.leave();
    this.ui.view.paused=false;this.closing=false;
  }
  soundToggle(){
    const toggle=button('','game-sound',()=>{this.sound.setMuted(!this.sound.muted);render();},'secondary-button sound-toggle');
    const render=()=>{toggle.replaceChildren(gameIcon(this.sound.muted?'muted':'sound'),el('span','',this.t(this.sound.muted?'sound.off':'sound.on')));toggle.setAttribute('aria-label',this.t(this.sound.muted?'sound.unmute':'sound.mute'));toggle.setAttribute('aria-pressed',String(this.sound.muted));};render();return toggle;
  }
  saveAlienUpgrades(ranks){this.engine.state.alienUpgrades={...ranks};const saved=this.engine.save();if(!saved.ok)this.ui.toast(saved.reason);}
  modal(title,subtitle,eventId) {
    this.switching=true;const dialog=this.ui.openModal(title,subtitle);this.switching=false;
    this.navigation.menu();
    dialog.append(this.soundToggle());
    this.ui.previousFocus=this.ui.cityToggle;
    this.ui.modalCleanup=()=>this.cleanup(eventId);return dialog;
  }
  enabledGames(){return [...this.engine.registry.minigames.values()].filter(g=>this.data.featureFlags.minigames&&(!g.featureFlag||this.data.featureFlags[g.featureFlag]));}
  availability(id){return gameAvailability(this.engine.state,this.data.config,id);}
  requireBuilding(id){const available=this.availability(id);if(available.ok)return false;this.ui.closeModal();this.ui.openBuildingCatalog(available.buildingId);return true;}
  playButton(id,action,play){const available=this.availability(id);return button(this.t(available.ok?'minigame.play':available.reason),action,()=>available.ok?play():this.requireBuilding(id),'primary-button');}
  teamLabel(){const team=this.engine.state.team;return this.t('minigame.soccer.teamRank',{team:this.t(team.nameId),wins:team.wins,rank:this.t(this.data.config.minigames.soccer.teamRanks[team.rank].title)});}
  team(){
    const dialog=this.modal('minigame.soccer.teamCard','minigame.soccer.stagesHint');dialog.dataset.team='soccer';
    dialog.append(el('h3','',this.teamLabel()),el('p','',this.t('minigame.soccer.roster',{players:this.engine.state.players.map(row=>this.t(row.nameId)).join(' · ')})),button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment('soccer')));
  }
  confirmMapExit(){
    const dialog=this.ui.openModal('soccer.exitIsland','soccer.exitIslandHint');dialog.dataset.mapExit='true';
    const stay=()=>{this.ui.closeModal();this.navigation.stayOnMap();};
    dialog.querySelector('[data-action=close-modal]').onclick=stay;
    const primary=button(this.t('game.stay'),'map-stay',stay,'primary-button');
    dialog.append(primary,button(this.t('game.leave'),'map-exit',()=>this.navigation.exitIsland()));queueMicrotask(()=>primary.focus());
    this.ui.modalCleanup=()=>this.navigation.stayOnMap();
  }
  training(){
    if(this.engine.isMinigameActive()){this.ui.toast('reason.gameBusy');return;}
    if(this.requireBuilding('soccer'))return;
    const dialog=this.modal('soccer.training','soccer.training.hint');dialog.dataset.soccerTraining='true';
    const balance=this.data.config.minigames.soccer,card=playerCard(this.engine.state,balance,this.t),countdown=el('p','soccer-training-countdown'),list=el('div','soccer-training-list');
    dialog.append(card,countdown,list);const rows=[];
    for(const key of attributes){
      const row=el('div','soccer-training-row'),reason=el('span','soccer-training-reason');
      const train=button('','soccer-train',()=>{const r=this.engine.trainSoccer(key);if(r.ok)this.training();else{this.ui.result(r);update();}});train.dataset.attribute=key;row.append(train,reason);list.append(row);rows.push({key,train,reason});
    }
    const update=()=>{
      let remaining=0;
      for(const {key,train,reason}of rows){const offer=this.engine.soccerTrainingOffer(key);remaining=Math.max(remaining,offer.remaining||0);train.disabled=!offer.ok;
        train.textContent=this.t('soccer.training.buy',{attribute:this.t(`soccer.attribute.${key}`),gain:Math.min(balance.training.gain,balance.card.max-this.engine.state.soccerCard.attributes[key]),cost:offer.cost??0});
        reason.textContent=offer.ok?'':this.t(offer.reason);}
      countdown.textContent=remaining?this.t('soccer.training.countdown',{minutes:Math.ceil(remaining/balance.training.millisecondsPerSecond/60)}):this.t('soccer.training.ready');
    };update();
    const timer=setInterval(update,1000),cleanup=this.ui.modalCleanup;this.ui.modalCleanup=()=>{clearInterval(timer);cleanup?.();};
    dialog.append(button(this.t('minigame.stages'),'training-stages',()=>this.stages('soccer')));
  }
  menu() {
    const dialog=this.modal('minigame.title','minigame.subtitle');
    const cards=el('div','game-cards');
    for(const game of this.enabledGames()) {
      const card=el('article','game-card');card.dataset.game=game.id;
      const context=gameContext(this.engine,this.data.config.minigames,this.now(),game.id),level=this.engine.state.minigameLevels[game.id];
      card.append(el('h3','',`${game.icon} ${this.t(game.title)}`),el('p','',this.t('minigame.level',{level,difficulty:context.level})),el('p','',this.t('minigame.power',{power:Math.round(context.power*this.data.config.minigames.percentScale)})),el('p','',this.t('minigame.best',{score:this.engine.state.highScores[game.id]||0})));
      if(game.id==='soccer')card.append(el('p','team-rank',this.teamLabel()));
      const actions=el('div','game-card-actions');
      actions.append(this.playButton(game.id,'game-play',()=>this.stages(game.id)),button(this.t('minigame.help'),'game-help',()=>this.intro(game.id)));
      if(game.id==='soccer')actions.append(button(this.t('soccer.training'),'soccer-training',()=>this.training()));
      const available=this.availability(game.id);
      if(!available.ok){card.dataset.locked='true';card.append(el('p','game-locked',this.t(available.reason)));}
      const next=this.data.config.minigameLevels[game.id]?.[level];
      const upgrade=button(next?this.t('minigame.upgrade',{cost:next.cost}):this.t('app.maxLevel'),'game-upgrade',()=>{const result=this.activity.upgrade(game.id);if(result.ok)this.menu();else this.ui.result(result);});
      upgrade.disabled=!next;actions.append(upgrade,button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment(game.id)));card.append(actions);cards.append(card);
    }
    dialog.append(cards);
  }
  equipment(id) {
    const game=this.engine.registry.minigames.get(id),dialog=this.modal(game.title,'equipment.hint');dialog.dataset.equipment=id;
    dialog.append(el('p','',this.t('minigame.totalStars',{stars:this.engine.state.minigameProgress[id].stars.reduce((sum,n)=>sum+n,0)})));
    const list=el('div','equipment-list');
    for(const [key,track]of Object.entries(this.data.config.minigames[id].equipment)){
      const rank=this.engine.state.minigameEquipment[id][key],offer=equipmentOffer(this.engine.state,this.data,id,key),row=el('article','equipment-row');
      const buy=button(this.t(offer.cost!==undefined?'equipment.buy':'equipment.owned',{title:this.t(track.title),level:offer.rank||rank,cost:offer.cost}),'equipment-buy',()=>{
        const result=this.activity.upgrade(id,key);if(result.ok){this.equipment(id);this.ui.toast('equipment.bought');}else this.ui.result(result);
      });buy.dataset.track=key;buy.disabled=!offer.ok;row.append(buy,el('p','',this.t(track.description)));
      if(!offer.ok&&offer.reason==='reason.money')row.append(el('p','',this.t(offer.reason)));
      if(offer.stars>this.engine.state.minigameProgress[id].stars.reduce((sum,n)=>sum+n,0))row.append(el('p','',this.t('equipment.locked',{stars:offer.stars})));
      list.append(row);
    }
    dialog.append(list,this.playButton(id,'equipment-play',()=>this.stages(id)));
  }
  stages(id) {
    if(this.requireBuilding(id))return;
    const game=this.engine.registry.minigames.get(id),p=this.engine.state.minigameProgress[id];
    const dialog=this.modal(game.title,'minigame.progressHint');dialog.dataset.stageMap=id;
    dialog.append(el('p','',this.t('minigame.totalStars',{stars:p.stars.reduce((sum,n)=>sum+n,0)})));
    if(id==='soccer'){
      dialog.append(playerCard(this.engine.state,this.data.config.minigames.soccer,this.t));
      const choices=el('fieldset','soccer-difficulties');choices.append(el('legend','',this.t('soccer.difficulty')));
      for(const key of Object.keys(this.data.config.minigames.soccer.difficulties)){
        const choose=button(this.t(`soccer.difficulty.${key}`),'soccer-difficulty',()=>{const r=this.engine.setSoccerDifficulty(key);if(r.ok)this.stages(id);else this.ui.result(r);});choose.dataset.difficulty=key;choose.setAttribute('aria-pressed',String(this.engine.state.soccerCard.difficulty===key));choices.append(choose);
      }dialog.append(choices,button(this.t('soccer.training'),'soccer-training',()=>this.training()));
    }
    for(const bonus of this.data.config.minigames.starBonuses)dialog.append(el('p','',this.t('minigame.starBonus',{stars:bonus.stars,level:bonus.upgradeLevel})));
    const map=el('div','stage-map');
    p.stars.forEach((stars,i)=>{
      const stage=i+1,locked=stage>p.stage;
      const node=button(`${this.t('minigame.stage',{stage})} ${locked?'🔒':'★'.repeat(stars)+'☆'.repeat(3-stars)}`,'stage-play',()=>this.start(id,undefined,stage));
      node.title=this.t(this.data.config.minigames[id].levels[i].feature);node.append(el('small','stage-feature',node.title));node.dataset.stage=stage;node.disabled=locked;node.setAttribute('aria-label',this.t(locked?'minigame.stageLocked':'minigame.stageStars',{stage,stars}));map.append(node);
    });dialog.append(map);
  }
  autoLaunch(choice) {
    this.eventOpen=false;
    const highest=this.engine.state.minigameProgress[choice.gameId].stage;
    const stage=Math.max(1,Math.min(highest,highest+this.data.config.events.eventStageOffset));
    // Event countdown is the introduction; play opens directly and help stays reachable.
    this.launch(choice.gameId,choice.eventId,stage);
  }
  narrateHelp(id) {for(let i=1;i<=3;i++){const key=`minigame.${id}.help.${i}`;this.engine.narration.announce(key);this.ui.narrate(key);}}
  helpLines(id) {const lines=el('div','game-help-lines');for(let i=1;i<=3;i++)lines.append(el('p','',this.t(`minigame.${id}.help.${i}`)));return lines;}
  intro(id,eventId,stage) {
    const game=this.engine.registry.minigames.get(id),dialog=this.modal(game.title,'minigame.subtitle',eventId);
    dialog.append(this.helpLines(id),this.playButton(id,'game-understood',()=>{this.activity.instructions(id);this.launch(id,eventId,stage);}),button(this.t('minigame.helpAgain'),'game-help-again',()=>this.narrateHelp(id)));
    this.narrateHelp(id);
  }
  start(id,eventId,stage) {
    if(this.requireBuilding(id))return;
    if(!this.engine.state.instructionsSeen.includes(id))this.intro(id,eventId,stage);else this.launch(id,eventId,stage);
  }
  launch(id,eventId,stageNumber) {
    if(this.requireBuilding(id))return;
    // Switching from instructions must retain the event's playing state.
    this.ui.modalCleanup=null;
    const game=this.engine.registry.minigames.get(id),dialog=this.modal(game.title,'minigame.subtitle',eventId);
    dialog.classList.add('game-screen');dialog.dataset.game=id;
    const close=dialog.querySelector('[data-action="close-modal"]');close.remove();
    const header=el('header','game-header'),heading=dialog.querySelector('h2');
    dialog.querySelector('.modal-subtitle').remove();
    const pause=button(this.t('game.pause'),'game-pause',()=>{},'secondary-button game-pause');pause.setAttribute('aria-label',this.t('game.pause'));header.append(heading,dialog.querySelector('.sound-toggle'),pause);
    const status=el('p','game-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const stage=el('div','game-stage'),canvas=el('canvas','minigame-canvas');canvas.setAttribute('aria-label',this.t(game.title));canvas.tabIndex=0;stage.append(canvas);
    const controls=el('div','game-controls'),balance=this.data.config.minigames[id];
    const control=(key,label)=>{const node=button(label,`control-${key}`,()=>{});node.dataset.gameControl=key;return node;};
    let gauges,turnLabel,novaButton,spreadButton,ammoButtons,fleetMeters,upgradePanel,upgradeButtons,warning;let fireSummary;
    if(id==='alienDefense'){upgradePanel=el('div','game-upgrade-panel');upgradePanel.hidden=true;upgradePanel.setAttribute('role','group');upgradePanel.setAttribute('aria-label',this.t('minigame.chooseUpgrade'));upgradePanel.append(el('h3','',this.t('minigame.chooseUpgrade')));upgradeButtons=Array.from({length:balance.campaign.choiceCount},()=>button('','run-upgrade',()=>{}));upgradePanel.append(...upgradeButtons);stage.append(upgradePanel);spreadButton=control('spread',this.t('minigame.spreadReady'));controls.append(spreadButton);novaButton=control('nova',this.t('minigame.nova'));novaButton.prepend(gameIcon('nova'));novaButton.title=this.t('minigame.novaHint');controls.append(control('left',`◀ ${this.t('minigame.left')}`),control('fire',this.t('minigame.fire')),control('right',`${this.t('minigame.right')} ▶`),novaButton);}
    if(id==='fireRescue') {
      gauges={};for(const key of ['water','pressure']){const label=el('label','game-gauge',this.t(`minigame.${key}`)),meter=el('progress');meter.max=1;meter.value=1;label.append(meter);controls.append(label);gauges[key]=meter;}
      const refill=control('refill',this.t('minigame.refill')),pump=control('charge',this.t('minigame.charge'));refill.prepend(gameIcon('tap'));pump.prepend(gameIcon('pump'));const rescue=control('rescue',this.t('minigame.rescue')),spray=control('fire',this.t('minigame.spray'));rescue.prepend(gameIcon('ladder'));controls.append(spray,refill,pump,rescue);
    }
    if(id==='navalDuel') {
      const fire=control('fire',this.t('minigame.launch'));fire.prepend(gameIcon('cannon'));controls.append(fire);
      const rack=el('div','ammo-rack');ammoButtons=balance.ammo.map((ammo,i)=>{const node=control('ammo-select','');node.append(createAmmoVisual(i,this.data.config.minigames),el('span','ammo-copy'));node.dataset.ammoIndex=i;node.setAttribute('aria-label',this.t(ammo.title));node.setAttribute('aria-pressed',String(i===0));rack.append(node);return node;});controls.append(rack);
      fleetMeters={};for(const [key,title]of [['player','minigame.fleet'],['enemy','minigame.enemyFleet']]){const label=el('label','game-gauge',this.t(title)),meter=el('progress');meter.max=1;meter.value=1;label.append(meter);controls.append(label);fleetMeters[key]=meter;}turnLabel=el('p','game-turn');controls.append(turnLabel);
    }
    warning=el('p','game-warning');warning.hidden=true;warning.setAttribute('role','alert');stage.append(warning);
    dialog.replaceChildren(header,status,stage,controls);
    this.ui.view.paused=true;
    const context=gameContext(this.engine,this.data.config.minigames,this.now(),id,stageNumber);
    if(id==='fireRescue')controls.querySelector('[data-game-control=rescue]').disabled=context.level<3;
    heading.textContent=this.t('minigame.stageTitle',{title:this.t(game.title),stage:context.level});
    dialog.dataset.stage=context.level;
    this.navigation.game();
    this.shell=new GameShell({dialog,stage,controls,pauseButton:pause,sound:this.sound,t:this.t,onExit:()=>this.ui.closeModal()});
    const eventBonuses=eventId?this.activity.bonuses():{};
    const response=this.engine.startMinigame(id,{...context,bonuses:{...context.bonuses,...eventBonuses},config:this.data.config.minigames,canvas,controls,status,dialog,gauges,warning,turnLabel,novaButton,spreadButton,ammoButtons,fleetMeters,upgradePanel,upgradeButtons,gameId:id,t:this.t,sound:event=>this.sound.play(event),onUpgrade:ranks=>this.saveAlienUpgrades(ranks),
      onFireSummary:summary=>{fireSummary=summary;},onError:reason=>this.ui.toast(reason),
      onFinish:result=>{
        this.current=null;
        this.shell?.dispose();this.shell=null;
        if(result.cancelled){if(!this.closing)this.ui.closeModal();return;}
        if(eventId)this.activity.resolve(eventId,result);
        this.showResult(id,eventId,result,fireSummary);
      }
    });
    if(!response.ok){this.ui.closeModal();this.ui.result(response);return;}
    this.current=response;
    this.shell.bind(response.session);
    if(id==='navalDuel')status.textContent=this.t('minigame.aimCircle');
    const help=button(this.t('minigame.help'),'game-help',()=>{
      const content=el('div','game-help-lines');content.append(this.helpLines(id),button(this.t('minigame.helpAgain'),'game-help-again',()=>this.narrateHelp(id)));
      this.shell?.pause('help',content);this.narrateHelp(id);
    });(id==='soccer'?controls.querySelector('.soccer-utilities'):controls).append(help);canvas.focus();
  }
  showResult(id,eventId,result,fireSummary) {
    const game=this.engine.registry.minigames.get(id);
    this.ui.modalCleanup=null;
    const dialog=this.modal(result.outcome==='win'?'minigame.win':'minigame.lose','minigame.resultHint',eventId);
    dialog.dataset.result=id;this.sound.play(result.outcome==='win'?'win':'lose');
    const summary=el('div','game-result');
    for(const key of ['score','money','parts','stars']){const row=el('p','result-row'),value=el('bdi','',String(result[key]));row.append(el('span','',this.t(`minigame.result.${key}`)),value);summary.append(row);}
    if(id==='fireRescue'&&fireSummary)for(const key of ['out','rescued','water']){const row=el('p','result-row');row.dataset.fireSummary=key;row.append(el('span','',this.t(`minigame.result.${key}`)),el('bdi','',String(fireSummary[key])));summary.append(row);}
    dialog.append(el('h3','',this.t(game.title)),summary,
      button(this.t('minigame.again'),'game-again',()=>{
        const active=this.engine.state.events.active;
        if(eventId&&active?.id===eventId){
          this.ui.modalCleanup=null;this.ui.closeModal();
          const choice=this.activity.choose('play');if(!choice.ok){this.ui.view.paused=false;this.ui.result(choice);return;}
        }
        this.start(id,active?.id===eventId?eventId:undefined,result.stage);
      },'primary-button'),button(this.t('minigame.exit'),'game-exit',()=>this.ui.closeModal()));
    if(id==='soccer')dialog.insertBefore(playerCard(this.engine.state,this.data.config.minigames.soccer,this.t,{starsAdded:result.trainingStars}),summary);
    dialog.append(button(this.t('minigame.stages'),'game-stages',()=>this.stages(id)),button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment(id)));
    if(result.outcome==='win'&&result.stage<this.engine.state.minigameProgress[id].stage)dialog.append(button(this.t('minigame.continue'),'game-next-stage',()=>this.start(id,undefined,result.stage+1),'primary-button'));
    if(id==='alienDefense'&&result.outcome==='win'){
      const balance=this.data.config.minigames.alienDefense,available=availableAlienUpgrades(this.engine.state.alienUpgrades,balance,gameContext(this.engine,this.data.config.minigames,this.now(),id,result.stage).equipment),cards=el('div','result-upgrades');cards.append(el('h3','',this.t(available.length?'minigame.chooseUpgrade':'minigame.upgradesFull')));
      // Results and Continue are usable immediately; taking a reward is optional.
      for(const upgrade of available.slice(0,balance.campaign.choiceCount)){const choose=button('','result-upgrade',()=>{const ranks={...this.engine.state.alienUpgrades,[upgrade]:this.engine.state.alienUpgrades[upgrade]+1};this.saveAlienUpgrades(ranks);this.sound.play('upgrade');cards.replaceChildren(el('p','',this.t('minigame.upgradeSaved')));});upgradeCard(choose,upgrade,this.t('minigame.upgradeStack',{name:this.t('runUpgrade.'+upgrade),rank:this.engine.state.alienUpgrades[upgrade]+1}),this.t('runUpgrade.'+upgrade+'.hint'));cards.append(choose);}dialog.append(cards);
    }
    this.engine.narration.announce(result.outcome==='win'?'minigame.win':'minigame.lose');
    this.engine.narration.announce('minigame.result',result);
  }
  render() {
    const event=this.engine.state.events.active;this.panel.hidden=!event||!this.data.featureFlags.events||(event&&!this.data.featureFlags[this.data.config.events.types[event.typeId].featureFlag]);
    if(!event){this.eventOpen=false;this.signature=null;return;}
    const type=this.data.config.events.types[event.typeId],seconds=Math.max(0,Math.ceil((event.warningUntil-this.now())/this.data.config.events.millisecondsPerSecond));
    this.indicator.textContent=`${type.icon} ${this.t(type.titleId)}${event.phase==='warning'?` · ${this.t('event.shortTime',{seconds})}`:''}`;
    const countdown=event.phase==='warning'?this.t('event.warningTime',{seconds}):this.t('event.ready');
    const signature=JSON.stringify([event,this.eventOpen,this.engine.state.events.repairs,this.availability(type.gameId)]);
    if(signature===this.signature){this.countdown.textContent=countdown;return;}this.signature=signature;
    this.indicator.setAttribute('aria-expanded',String(this.eventOpen));this.details.hidden=!this.eventOpen;
    this.countdown=el('p','',countdown);
    this.details.replaceChildren(el('p','',this.t(type.warningId)),this.countdown);
    if(this.activity.bonuses().fireWater)this.details.append(el('p','',this.t('event.bonus')));
    this.details.append(button(this.t('event.go'),'event-go',()=>{
      const target=this.engine.state.buildings.find(b=>b.id===event.targetId);
      this.ui.view.focusCell(target?.x??0,target?.z??Math.floor(this.engine.state.world.size/2));
      this.eventOpen=false;this.signature=null;this.render();
    }));
    for(const action of this.data.config.events.actions){
      const available=this.availability(type.gameId);
      const b=button(this.t(action.id==='play'&&!available.ok?available.reason:action.labelId),`event-${action.id}`,()=>{
        if(action.id==='play'&&!available.ok){this.requireBuilding(type.gameId);return;}
        const result=this.activity.choose(action.id);if(!result.ok){this.ui.result(result);return;}
        if(result.gameId){this.eventOpen=false;this.start(result.gameId,result.eventId);}
        else this.ui.toast(result.deferred?'event.deferred':'event.handled');this.render();
      });
      b.disabled=event.phase==='playing'||(action.id==='defer'?event.deferred:event.phase!=='ready');this.details.append(b);
    }
  }
  decorateInfo(instance,actions) {
    for(const game of this.enabledGames())if(this.data.config.minigames[game.id].requiresBuilding===instance.typeId)actions.append(button(this.t('minigame.soccer.play'),`${instance.typeId}-building-play`,()=>this.stages(game.id),'primary-button'));
    if(instance.typeId==='soccer')actions.append(button(this.t('soccer.training'),'soccer-training',()=>this.training()));
    if(instance.typeId==='cityHall'){
      const metrics=el('div','city-hall-metrics');
      const values=this.engine.metrics();
      for(const metric of this.engine.registry.metrics.values()){const value=values[metric.id];if(value!==undefined)metrics.append(el('p','',`${metric.icon} ${this.t(metric.title)}: ${Math.round(value.value??value)}`));}
      this.ui.info.append(metrics,el('p','team-rank',this.teamLabel()));
      actions.append(button(this.t('minigame.open'),'city-hall-games',()=>this.menu(),'primary-button'),button(this.t('minigame.soccer.teamCard'),'city-hall-team',()=>this.team()));
    }
    if(!(this.engine.state.events.repairs[instance.id]>this.now()))return;
    this.ui.info.append(el('p','repair-status',this.t('event.repair')));
    actions.append(button(this.t('event.repairNow',{cost:this.data.config.events.repairCost}),'repair-building',()=>{const result=this.activity.repair(instance.id);if(result.ok){this.ui.drawInfo();this.ui.toast('event.repaired');}else this.ui.result(result);}));
  }
  dispose(){this.soundEvents.abort();this.cleanup();this.navigation.dispose();this.sound.dispose();this.unsubscribe();this.unsubscribeEngine();this.panel.remove();this.openButton.remove();this.teamButton.remove();}
}
