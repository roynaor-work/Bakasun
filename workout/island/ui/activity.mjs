import {gameEmblem,gameArtwork} from './adventure-emblems.mjs?v=island-naval-aim-20261027-2';
import {navalUpgradePanel,ensureNavalTheme} from '../minigames/naval-upgrades.mjs?v=island-naval-aim-20261027-2';
import {hangarAction} from '../activity/hangar.mjs?v=island-naval-aim-20261027-2';
import {hangarPreview} from './hangar-preview.mjs?v=island-naval-aim-20261027-2';
import {createSound} from '../minigames/sound.mjs?v=island-naval-aim-20261027-2';
import {gameIcon,upgradeCard} from '../minigames/icons.mjs?v=island-naval-aim-20261027-2';
import {availableAlienUpgrades} from '../activity/alien-upgrades.mjs?v=island-naval-aim-20261027-2';
import {createAmmoVisual} from '../minigames/art.mjs?v=island-naval-aim-20261027-2';
import {equipmentOffer} from '../activity/equipment.mjs?v=island-naval-aim-20261027-2';
import {gameContext} from '../minigames/context.mjs?v=island-naval-aim-20261027-2';
import {gameAvailability} from '../activity/availability.mjs?v=island-naval-aim-20261027-2';
import {GameNavigation,GameShell,gamePresentation} from './game-shell.mjs?v=island-naval-aim-20261027-2';
import {playerCard,rosterCard} from './soccer-card.mjs?v=island-naval-aim-20261027-2';
import {rosterCards} from '../activity/soccer-roster.mjs?v=island-naval-aim-20261027-2';
import {soccerTeam} from '../activity/soccer-team.mjs?v=island-naval-aim-20261027-2';
import {hoopsClubPanel} from './hoops-club.mjs?v=island-naval-aim-20261027-2';

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const button=(text,action,fn,cls='secondary-button')=>{const n=el('button',cls,text);n.type='button';n.dataset.action=action;n.onclick=fn;return n;};

export class ActivityInterface {
  constructor({ui,engine,activity,data,t,now=Date.now}) {
    Object.assign(this,{ui,engine,activity,data,t,now});this.current=null;this.closing=false;this.eventOpen=false;
    this.navigation=new GameNavigation({onGameBack:()=>this.shell?.pause('exit'),onMenuBack:()=>this.ui.closeModal(),onMapBack:()=>this.confirmMapExit()});
    let storage;try{storage=window.localStorage;}catch{}
    this.sound=createSound({storage,soccerVoices:data.config.minigames.soccer.sound});this.soundEvents=new AbortController();
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
    this.ui.view.paused=true;
    dialog.append(this.soundToggle());
    this.ui.previousFocus=this.ui.cityToggle;
    this.ui.modalCleanup=()=>this.cleanup(eventId);return dialog;
  }
  enabledGames(){return [...this.engine.registry.minigames.values()].filter(g=>this.data.featureFlags.minigames&&(!g.featureFlag||this.data.featureFlags[g.featureFlag]));}
  availability(id){return gameAvailability(this.engine.state,this.data.config,id);}
  requireDaily(id){if(['soccer','tennis','navalDuel','fireRescue','alienDefense','islandRacing','streetSlam'].includes(id)&&this.engine.learningStatus().locked){this.ui.learningInterface.daily();return true;}return false;}
  requireBuilding(id){if(this.requireDaily(id))return true;const available=this.availability(id);if(available.ok)return false;this.ui.closeModal();this.ui.openBuildingCatalog(available.buildingId);return true;}
  playButton(id,action,play){const available=this.availability(id),locked=this.engine.learningStatus().locked;return button(locked?'🔒 📚 משימת היום':this.t(available.ok?'minigame.play':available.reason),action,()=>{if(this.requireDaily(id))return;available.ok?play():this.requireBuilding(id);},'primary-button');}
  teamLabel(){const team=this.engine.state.team;return this.t('minigame.soccer.teamRank',{team:this.t(team.nameId),wins:team.wins,rank:this.t(this.data.config.minigames.soccer.teamRanks[team.rank].title)});}
  team(){
    const dialog=this.modal('minigame.soccer.teamCard','minigame.soccer.stagesHint');dialog.dataset.team='soccer';
    dialog.append(el('h3','',this.teamLabel()),el('p','',this.t('minigame.soccer.roster',{players:this.engine.state.players.map(row=>this.t(row.nameId)).join(' · ')})),button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment('soccer')));
    for(const p of this.engine.state.soccerRoster.players){const original=this.engine.state.players.find(x=>x.id===p.id),row=el('div','soccer-name-editor'),name=el('input'),number=el('input'),label=el('label','',this.t(original.nameId)),numberLabel=el('label','',this.t('soccer.number'));name.value=p.name;name.placeholder=this.t(original.nameId);name.maxLength=this.data.config.minigames.soccer.roster.nameMaxLength;name.autocomplete='off';number.type='number';number.min='1';number.max='99';number.value=p.number;label.append(name);numberLabel.append(number);row.append(label,numberLabel,button(this.t('app.save'),'soccer-save-name',()=>{const r=this.engine.editSoccerPlayer(p.id,{name:name.value,number:Number(number.value)});if(r.ok)this.team();else this.ui.result(r);}),button(this.t('soccer.resetName'),'soccer-reset-name',()=>{this.engine.editSoccerPlayer(p.id,{name:'',number:this.data.config.minigames.soccer.roster.numbers[this.engine.state.soccerRoster.players.indexOf(p)]});this.team();}));dialog.append(row);}
    dialog.append(button(this.t('soccer.rosters'),'soccer-rosters',()=>this.rosters()));
  }
  rosters(stage=this.engine.state.minigameProgress.soccer.stage){
    const c=this.data.config.minigames.soccer,state=this.engine.state,ctx={...gameContext(this.engine,this.data.config.minigames,this.now(),'soccer',stage),state},cards=rosterCards(c,soccerTeam(ctx,c),state.soccerCard,stage,state.soccerCard.difficulty),dialog=this.modal('soccer.rosters','soccer.rostersHint');
    dialog.dataset.rosters='true';const choose=el('select');choose.setAttribute('aria-label',this.t('minigame.stages'));for(let i=1;i<=c.levels.length;i++){const option=el('option','',this.t('minigame.stage',{stage:i}));option.value=i;option.selected=i===stage;choose.append(option);}choose.onchange=()=>this.rosters(Number(choose.value));dialog.append(choose);
    for(const team of [0,1]){dialog.append(el('h3','',this.t(team?'soccer.awayCards':'soccer.homeCards')));const grid=el('div','soccer-roster-grid');for(const card of cards.filter(p=>p.team===team))grid.append(rosterCard(card,this.t));dialog.append(grid);}dialog.append(button(this.t('soccer.editTeam'),'soccer-edit-team',()=>this.team()));
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
    const c=this.data.config.minigames.soccer,state=this.engine.state,r=state.soccerRoster,player=r.players[r.role==='keeper'?2:0];
    dialog.append(playerCard(state,c,this.t));
    const grid=el('div','soccer-drill-choices');
    for(const kind of ['targets','penalties','cones']){const key=kind==='cones'?'pass':'shot',progress=el('progress');progress.max=c.training.pointsPerAttribute;progress.value=player.points[key];progress.setAttribute('aria-label',this.t('soccer.stat.'+key));const row=el('article','');row.append(button(this.t('soccer.drill.'+kind),'soccer-drill',()=>this.launch('soccer',undefined,1,kind),'primary-button'),el('p','',this.t('soccer.practice.progress',{attribute:this.t('soccer.stat.'+key),points:player.points[key],total:c.training.pointsPerAttribute})),progress);row.firstChild.dataset.drill=kind;grid.append(row);}
    dialog.append(grid,el('p','',this.t('soccer.practice.daily',{cap:c.training.dailyCap})),button(this.t('minigame.stages'),'training-stages',()=>this.stages('soccer')));
  }

  menu() {
    const dialog=this.modal('minigame.title','minigame.subtitle');dialog.dataset.gameLibrary='true';
    const heading=dialog.querySelector?.('h2'),subtitle=dialog.querySelector?.('.modal-subtitle');
    if(heading)heading.textContent='משחקי האי';if(subtitle)subtitle.textContent='בחרו משחק כדי להתחיל.';
    const cards=el('div','adventure-game-grid');cards.setAttribute('aria-label','משחקי האי');
    for(const game of this.enabledGames()){
      const card=el('article','adventure-game-card');card.dataset.game=game.id;
      card.append(gameEmblem(game.id),el('p','adventure-game-category',gameArtwork(game.id).category),el('h3','',this.t(game.title)));
      const enter=button('כניסה','game-enter',()=>this.gameHome(game.id),'adventure-enter');enter.dataset.gameId=game.id;enter.setAttribute('aria-label','כניסה · '+this.t(game.title));card.append(enter);cards.append(card);
    }
    dialog.append(cards);
  }
  gameHome(id){
    const game=this.engine.registry.minigames.get(id),art=gameArtwork(id),dialog=this.modal(game.title,'minigame.subtitle');dialog.dataset.gameHome=id;
    const subtitle=dialog.querySelector?.('.modal-subtitle');if(subtitle)subtitle.textContent=art.description;
    const hero=el('div','adventure-game-hero');hero.append(gameEmblem(id),el('p','adventure-game-category',art.category));dialog.append(hero);
    const actions=el('div','adventure-home-actions');
    actions.append(this.playButton(id,'game-play',()=>this.stages(id)),button('איך לשחק','game-help',()=>this.intro(id)),button('שדרוגים','equipment-shop',()=>this.gameUpgrades(id)));
    dialog.append(actions,button('כל המשחקים','game-library-back',()=>this.menu(),'adventure-back'));
  }
  gameUpgrades(id){
    const game=this.engine.registry.minigames.get(id),dialog=this.modal(game.title,'equipment.hint');dialog.dataset.gameUpgrades=id;
    const level=this.engine.state.minigameLevels[id],next=this.data.config.minigameLevels[id]?.[level];
    dialog.append(gameEmblem(id),el('p','',this.t('minigame.level',{level,difficulty:gameContext(this.engine,this.data.config.minigames,this.now(),id).level})));
    const upgrade=button(next?this.t('minigame.upgrade',{cost:next.cost}):this.t('app.maxLevel'),'game-upgrade',()=>{const result=this.activity.upgrade(id);if(result.ok)this.gameUpgrades(id);else this.ui.result(result);},'primary-button');upgrade.disabled=!next;
    dialog.append(upgrade,button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment(id)),button('חזרה למשחק','game-home-back',()=>this.gameHome(id)));
    if(id==='soccer')dialog.append(button(this.t('soccer.training'),'soccer-training',()=>this.training()));
  }
  equipment(id) {
    if(id==='navalDuel')return this.stages(id);
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
  certificateCard(c,stage){const card=el('article','fire-certificate');card.dataset.certificate=String(stage);card.append(el('h3','',this.t('fire.certificate')),el('p','',this.t('fire.certificateName',{name:this.engine.state.avatar.name||this.t(this.engine.state.avatar.nameId)})),el('p','',this.t('minigame.stage',{stage})),el('strong','certificate-stars','★'.repeat(c.stars)+'☆'.repeat(3-c.stars)));for(const key of ['fast','rescue','careful'])card.append(el('p',c[key]?'earned':'',this.t('fire.'+key)));return card;}
  certificates(){const dialog=this.modal('fire.certificates','minigame.progressHint');let count=0;for(const [i,c]of this.engine.state.fireCertificates.entries())if(c){dialog.append(this.certificateCard(c,i+1));count++;}if(!count)dialog.append(el('p','',this.t('fire.noCertificates')));dialog.append(this.playButton('fireRescue','certificate-play',()=>this.stages('fireRescue')));}
  hangar(){
    const dialog=this.modal('hangar.title','hangar.hint'),h=this.engine.state.hangar,c=this.data.config.minigames.alienDefense,canvas=el('canvas','hangar-preview');dialog.dataset.hangar='true';canvas.width=canvas.height=c.hangar.previewSize;
    const preview=hangarPreview(canvas,c,c.hangar.paints[h.paint]),cleanup=this.ui.modalCleanup;this.ui.modalCleanup=()=>{preview.dispose();cleanup?.();};
    dialog.append(canvas,el('p','',this.t('hangar.stats',{damage:h.damage,coins:h.coins,credits:h.credits})));const actions=el('div','hangar-actions');
    for(const key of ['repair','upgrade','paint']){const choose=button(this.t('hangar.'+key),'hangar-'+key,()=>{if(key==='upgrade'){choices.hidden=false;return;}if(hangarAction(h,key,c.hangar)){this.engine.save();this.hangar();}});if(key==='repair')choose.disabled=!h.damage||h.coins<h.damage*c.hangar.repairCost;actions.append(choose);}
    const choices=el('div','hangar-choices');choices.hidden=true;for(const key of ['rapid','shield']){const choose=button(this.t('hangar.'+key),'hangar-'+key,()=>{if(hangarAction(h,key,c.hangar)){this.engine.save();this.hangar();}});choose.disabled=!h.credits||h[key]>=c.hangar.maxRank;choices.append(choose);}dialog.append(actions,choices,this.playButton('alienDefense','hangar-play',()=>this.stages('alienDefense')));
  }
  stages(id) {
    if(this.requireBuilding(id))return;
    const game=this.engine.registry.minigames.get(id),p=this.engine.state.minigameProgress[id];
    const dialog=this.modal(game.title,'minigame.progressHint');dialog.dataset.stageMap=id;if(id==='fireRescue')dialog.append(button(this.t('fire.certificates'),'open-certificates',()=>this.certificates()));if(id==='alienDefense')dialog.append(button(this.t('hangar.title'),'open-hangar',()=>this.hangar()));
    dialog.append(el('p','',this.t('minigame.totalStars',{stars:p.stars.reduce((sum,n)=>sum+n,0)})));
    if(id==='streetSlam'&&this.engine.hoops)dialog.append(hoopsClubPanel({engine:this.engine,t:this.t,refresh:()=>this.stages(id),result:r=>this.ui.result(r)}));
    if(id==='navalDuel')dialog.append(navalUpgradePanel({engine:this.engine,activity:this.activity,data:this.data,t:this.t,refresh:()=>this.stages(id)}));
    if(id==='tennis'){const choices=el('fieldset','soccer-difficulties');choices.append(el('legend','',this.t('soccer.difficulty')));for(const key of Object.keys(this.data.config.minigames.tennis.difficulties)){const choose=button(this.t('soccer.difficulty.'+key),'tennis-difficulty',()=>{const r=this.engine.setTennisDifficulty(key);if(r.ok)this.stages(id);else this.ui.result(r);});choose.dataset.difficulty=key;choose.setAttribute('aria-pressed',String(this.engine.state.tennisDifficulty===key));choices.append(choose);}dialog.append(choices,this.soccerHandedness('tennis'));}
    if(id==='soccer'){
      dialog.append(playerCard(this.engine.state,this.data.config.minigames.soccer,this.t));
      const choices=el('fieldset','soccer-difficulties');choices.append(el('legend','',this.t('soccer.difficulty')));
      for(const key of Object.keys(this.data.config.minigames.soccer.difficulties)){
        const choose=button(this.t(`soccer.difficulty.${key}`),'soccer-difficulty',()=>{const r=this.engine.setSoccerDifficulty(key);if(r.ok)this.stages(id);else this.ui.result(r);});choose.dataset.difficulty=key;choose.setAttribute('aria-pressed',String(this.engine.state.soccerCard.difficulty===key));choices.append(choose);
      }dialog.append(choices,this.soccerHandedness(),button(this.t('soccer.training'),'soccer-training',()=>this.training()),button(this.t('soccer.rosters'),'soccer-rosters',()=>this.rosters()));
      const roles=el('fieldset','soccer-role-choice');roles.append(el('legend','',this.t('soccer.chooseRole')));for(const role of ['field','keeper']){const choice=button(this.t('soccer.playRole.'+role),'soccer-role',()=>{this.engine.setSoccerRole(role);this.stages(id);});choice.dataset.role=role;choice.setAttribute('aria-pressed',String(this.engine.state.soccerRoster.role===role));roles.append(choice);}dialog.append(roles);
    }
    for(const bonus of this.data.config.minigames.starBonuses)dialog.append(el('p','',this.t('minigame.starBonus',{stars:bonus.stars,level:bonus.upgradeLevel})));
    const map=el('div','stage-map');
    p.stars.forEach((stars,i)=>{
      const stage=i+1,locked=stage>p.stage;
      const node=button(`${this.t('minigame.stage',{stage})} ${locked?'🔒':'★'.repeat(stars)+'☆'.repeat(3-stars)}`,'stage-play',()=>this.start(id,undefined,stage));
      node.title=this.t(this.data.config.minigames[id].levels[i].feature);node.append(el('small','stage-feature',node.title));node.dataset.stage=stage;node.disabled=locked;node.setAttribute('aria-label',this.t(locked?'minigame.stageLocked':'minigame.stageStars',{stage,stars}));map.append(node);
    });dialog.append(map,button('חזרה למשחק','game-home-back',()=>this.gameHome(id),'adventure-back'));
  }
  autoLaunch(choice) {
    if(this.requireDaily(choice.gameId)){this.activity.cancel(choice.eventId);return;}
    this.eventOpen=false;
    const highest=this.engine.state.minigameProgress[choice.gameId].stage;
    const stage=Math.max(1,Math.min(highest,highest+this.data.config.events.eventStageOffset));
    // Event countdown is the introduction; play opens directly and help stays reachable.
    this.launch(choice.gameId,choice.eventId,stage);
  }
  narrateHelp(id) {for(let i=1;i<=3;i++){const key=`minigame.${id}.help.${i}`;this.engine.narration.announce(key);this.ui.narrate(key);}}
  helpLines(id) {const lines=el('div','game-help-lines');for(let i=1;i<=3;i++)lines.append(el('p','',this.t(`minigame.${id}.help.${i}`)));return lines;}
  soccerHandedness(id='soccer'){
    const c=this.data.config.minigames[id].controls,label=el('label','soccer-hand-setting'),toggle=el('input'),text=el('span');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.dataset.action=id+'-hand';
    let right=c.rightHanded;try{const saved=localStorage.getItem(c.handednessKey);if(saved!==null)right=saved==='right';}catch{}
    const render=()=>{toggle.checked=right;text.textContent=this.t(right?'soccer.leftStick':'soccer.rightStick');};
    toggle.onchange=()=>{right=toggle.checked;try{localStorage.setItem(c.handednessKey,right?'right':'left');}catch{}render();};render();label.append(toggle,text);return label;
  }
  intro(id,eventId,stage) {
    if(id==='navalDuel')ensureNavalTheme();
    const game=this.engine.registry.minigames.get(id),dialog=this.modal(game.title,'minigame.subtitle',eventId);
    dialog.dataset.intro=id;
    if(['soccer','tennis'].includes(id))dialog.append(this.soccerHandedness(id));
    dialog.append(this.helpLines(id),this.playButton(id,'game-understood',()=>{this.activity.instructions(id);this.launch(id,eventId,stage);}),button(this.t('minigame.helpAgain'),'game-help-again',()=>this.narrateHelp(id)));
    this.narrateHelp(id);
  }
  start(id,eventId,stage) {
    if(this.requireBuilding(id))return;
    if(!this.engine.state.instructionsSeen.includes(id))this.intro(id,eventId,stage);else this.launch(id,eventId,stage);
  }
  launch(id,eventId,stageNumber,drill) {
    if(id==='navalDuel')ensureNavalTheme();
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
    let gauges,turnLabel,novaButton,spreadButton,ammoButtons,fleetMeters,upgradePanel,upgradeButtons,warning;let fireSummary,racingSummary;
    if(id==='alienDefense'){upgradePanel=el('div','game-upgrade-panel');upgradePanel.hidden=true;upgradePanel.setAttribute('role','group');upgradePanel.setAttribute('aria-label',this.t('minigame.chooseUpgrade'));upgradePanel.append(el('h3','',this.t('minigame.chooseUpgrade')));upgradeButtons=Array.from({length:balance.campaign.choiceCount},()=>button('','run-upgrade',()=>{}));upgradePanel.append(...upgradeButtons);stage.append(upgradePanel);spreadButton=control('spread',this.t('minigame.spreadReady'));controls.append(spreadButton);novaButton=control('nova',this.t('minigame.nova'));novaButton.prepend(gameIcon('nova'));novaButton.title=this.t('minigame.novaHint');const zone=el('div','soccer-stick-zone'),stick=el('div','soccer-joystick'),knob=el('span','soccer-knob');stick.id='joystick';knob.id='knob';stick.append(knob);zone.append(stick);const fire=control('fire',this.t('minigame.fire'));fire.id='shoot';novaButton.id='pass';spreadButton.id='sprint';controls.append(zone,fire,novaButton);}
    if(id==='fireRescue') {
      const zone=el('div','soccer-stick-zone'),stick=el('div','soccer-joystick'),knob=el('span','soccer-knob');stick.id='joystick';knob.id='knob';stick.append(knob);zone.append(stick);controls.append(zone);gauges={};for(const key of ['water','pressure']){const label=el('label','game-gauge',this.t(`minigame.${key}`)),meter=el('progress');meter.max=1;meter.value=1;label.append(meter);controls.append(label);gauges[key]=meter;}
      const refill=control('refill',this.t('minigame.refill')),pump=control('charge',this.t('minigame.charge'));refill.prepend(gameIcon('tap'));pump.prepend(gameIcon('pump'));const rescue=control('rescue',this.t('minigame.rescue')),spray=control('fire',this.t('minigame.spray'));rescue.id='pass';spray.id='shoot';rescue.prepend(gameIcon('ladder'));controls.append(spray,refill,pump,rescue);
    }
    if(id==='navalDuel') {
      const zone=el('div','naval-stick-zone soccer-stick-zone'),stick=el('div','naval-stick soccer-joystick'),knob=el('span','naval-knob soccer-knob');stick.id='joystick';knob.id='knob';stick.hidden=true;stick.append(knob);zone.append(stick);controls.append(zone);const fire=control('fire',this.t('minigame.launch'));fire.id='shoot';fire.prepend(gameIcon('cannon'));controls.append(fire);
      const rack=el('div','ammo-rack');ammoButtons=balance.ammo.map((ammo,i)=>{const node=control('ammo-select','');node.append(gameIcon(['shell','double','torpedo','absorb','cannon','ladder'][i]),el('span','ammo-copy'));node.dataset.ammoIndex=i;node.setAttribute('aria-label',this.t(ammo.title));node.setAttribute('aria-pressed',String(i===0));rack.append(node);return node;});controls.append(rack);
      fleetMeters={};for(const [key,title]of [['player','minigame.fleet'],['enemy','minigame.enemyFleet']]){const label=el('label','game-gauge',this.t(title)),meter=el('progress');meter.max=1;meter.value=1;label.append(meter);controls.append(label);fleetMeters[key]=meter;}turnLabel=el('p','game-turn');controls.append(turnLabel);
    }
    warning=el('p','game-warning');warning.hidden=true;warning.setAttribute('role','alert');stage.append(warning);
    dialog.replaceChildren(header,status,stage,controls);
    this.ui.view.paused=true;
    const context=gameContext(this.engine,this.data.config.minigames,this.now(),id,stageNumber);
    if(id==='soccer'&&drill){context.drill=drill;dialog.dataset.drill=drill;}
    if(id==='navalDuel')context.previousFleet=this.lastNavalFleet;
    if(id==='fireRescue')controls.querySelector('[data-game-control=rescue]').disabled=context.level<3;
    heading.textContent=this.t('minigame.stageTitle',{title:this.t(game.title),stage:context.level});
    dialog.dataset.stage=context.level;
    this.navigation.game();
    this.shell=new GameShell({dialog,stage,controls,pauseButton:pause,sound:this.sound,t:this.t,onExit:()=>this.ui.closeModal(),landscape:gamePresentation(this.data.config,id).orientation==='landscape'});
    const eventBonuses=eventId?this.activity.bonuses():{};
    const response=this.engine.startMinigame(id,{...context,bonuses:{...context.bonuses,...eventBonuses},config:this.data.config.minigames,canvas,controls,status,dialog,gauges,warning,turnLabel,novaButton,spreadButton,ammoButtons,fleetMeters,upgradePanel,upgradeButtons,gameId:id,t:this.t,sound:event=>this.sound.play(event),onUpgrade:ranks=>this.saveAlienUpgrades(ranks),
      onFireSummary:summary=>{fireSummary=summary;},onRacingSummary:summary=>{racingSummary=summary;},onError:reason=>this.ui.toast(reason),
      onFinish:result=>{
        this.current=null;
        this.shell?.dispose();this.shell=null;
        if(result.cancelled){if(!this.closing)this.ui.closeModal();return;}
        if(eventId)this.activity.resolve(eventId,result);
        this.showResult(id,eventId,result,fireSummary,racingSummary);
      }
    });
    if(!response.ok){this.ui.closeModal();this.ui.result(response);return;}
    this.current=response;if(id==='navalDuel')this.lastNavalFleet=response.session.snapshot.composition;
    this.shell.bind(response.session);
    if(id==='navalDuel')status.textContent=this.t('minigame.aimCircle');
    canvas.focus();
  }
  outdoorPrompt(dialog){
    const phrases=this.data.config.minigames.soccer.training.outdoorMessages,index=this.engine.state.soccerRoster.training.completed+(this.engine.state.minigameWins.soccer||0);
    dialog.append(el('p','soccer-outdoor-message',this.t(phrases[(index||0)%phrases.length])),button(this.t('soccer.practice.outdoor'),'soccer-outdoor',()=>{const r=this.engine.soccerOutdoorPractice();this.ui.toast(r.ok?'soccer.practice.outdoorThanks':r.reason);dialog.querySelector('[data-action=soccer-outdoor]').disabled=true;}));
  }
  showResult(id,eventId,result,fireSummary,racingSummary) {
    if(result.drill){this.ui.modalCleanup=null;const dialog=this.modal('soccer.practice.done','soccer.practice.doneHint');dialog.dataset.drillResult=result.drill.kind;dialog.append(el('p','',this.t('soccer.practice.score',{hits:result.drill.hits,total:result.drill.attempts})),el('p','soccer-practice-gain',result.practice.ok?this.t('soccer.practice.progress',{attribute:this.t('soccer.stat.'+result.practice.key),points:result.practice.points,total:result.practice.required}):this.t(result.practice.reason)),playerCard(this.engine.state,this.data.config.minigames.soccer,this.t),button(this.t('soccer.training'),'soccer-training',()=>this.training(),'primary-button'));if(result.practice.gained)dialog.classList.add('soccer-card-improved');this.outdoorPrompt(dialog);return;}
    const game=this.engine.registry.minigames.get(id);
    this.ui.modalCleanup=null;
    const dialog=this.modal(result.outcome==='win'?'minigame.win':'minigame.lose','minigame.resultHint',eventId);
    dialog.dataset.result=id;this.sound.play(result.outcome==='win'?'win':'lose');
    const summary=el('div','game-result');
    for(const key of ['score','money','parts','stars']){const row=el('p','result-row'),value=el('bdi','',String(result[key]));row.append(el('span','',this.t(`minigame.result.${key}`)),value);summary.append(row);}
    if(id==='fireRescue'&&fireSummary)for(const key of ['out','rescued','water']){const row=el('p','result-row');row.dataset.fireSummary=key;row.append(el('span','',this.t(`minigame.result.${key}`)),el('bdi','',String(fireSummary[key])));summary.append(row);}
    if(id==='islandRacing'&&racingSummary)for(const [key,value]of [['rank',racingSummary.rank],['time',`${Number(racingSummary.durationSeconds).toFixed(1)} שנ׳`],['laps',racingSummary.laps]]){const row=el('p','result-row');row.dataset.racingSummary=key;row.append(el('span','',this.t(`racing.result.${key}`)),el('bdi','',String(value)));summary.append(row);}
    if(id==='fireRescue'&&result.certificate)dialog.append(this.certificateCard(result.certificate,result.stage));
    dialog.append(el('h3','',this.t(game.title)),summary,
      button(this.t('minigame.again'),'game-again',()=>{
        const active=this.engine.state.events.active;
        if(eventId&&active?.id===eventId){
          this.ui.modalCleanup=null;this.ui.closeModal();
          const choice=this.activity.choose('play');if(!choice.ok){this.ui.view.paused=false;this.ui.result(choice);return;}
        }
        this.start(id,active?.id===eventId?eventId:undefined,result.stage);
      },'primary-button'),button(this.t('minigame.exit'),'game-exit',()=>this.ui.closeModal()));
    if(id==='soccer')this.outdoorPrompt(dialog);
    if(id==='soccer')dialog.insertBefore(playerCard(this.engine.state,this.data.config.minigames.soccer,this.t,{starsAdded:result.trainingStars}),summary);
    dialog.append(button(this.t('minigame.stages'),'game-stages',()=>this.stages(id)),button(this.t('equipment.shop'),'equipment-shop',()=>this.equipment(id)));
    if(result.outcome==='win'&&result.stage<this.engine.state.minigameProgress[id].stage)dialog.append(button(this.t('minigame.continue'),'game-next-stage',()=>id==='navalDuel'?this.stages(id):this.start(id,undefined,result.stage+1),'primary-button'));
    if(id==='alienDefense')dialog.append(button(this.t('hangar.title'),'open-hangar',()=>this.hangar()));
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
      const b=button(action.id==='play'&&this.engine.learningStatus().locked?'🔒 📚 משימת היום':this.t(action.id==='play'&&!available.ok?available.reason:action.labelId),`event-${action.id}`,()=>{
        if(action.id==='play'&&this.requireDaily(type.gameId))return;
        if(action.id==='play'&&!available.ok){this.requireBuilding(type.gameId);return;}
        const result=this.activity.choose(action.id);if(!result.ok){this.ui.result(result);return;}
        if(result.gameId){this.eventOpen=false;this.start(result.gameId,result.eventId);}
        else this.ui.toast(result.deferred?'event.deferred':'event.handled');this.render();
      });
      b.disabled=event.phase==='playing'||(action.id==='defer'?event.deferred:event.phase!=='ready');this.details.append(b);
    }
  }
  decorateInfo(instance,actions) {
    for(const game of this.enabledGames())if(this.data.config.minigames[game.id].requiresBuilding===instance.typeId)actions.append(button(this.engine.learningStatus().locked?'🔒 📚 משימת היום':this.t('minigame.soccer.play'),`${instance.typeId}-building-play`,()=>this.stages(game.id),'primary-button'));
    if(instance.typeId==='soccer')actions.append(button(this.t('soccer.training'),'soccer-training',()=>this.training()));
    if(instance.typeId==='cityHall'){
      const metrics=el('div','city-hall-metrics');
      const values=this.engine.metrics();
      for(const metric of this.engine.registry.metrics.values()){const value=values[metric.id];if(value!==undefined)metrics.append(el('p','',`${metric.icon} ${this.t(metric.title)}: ${Math.round(value.value??value)}`));}
      this.ui.info.append(metrics,el('p','team-rank',this.teamLabel()));
      actions.append(button(this.t('minigame.open'),'city-hall-games',()=>this.menu(),'primary-button'),button(this.t('minigame.soccer.teamCard'),'city-hall-team',()=>this.team()));
    }
    if(this.engine.city||!(this.engine.state.events.repairs[instance.id]>this.now()))return;
    this.ui.info.append(el('p','repair-status',this.t('event.repair')));
    actions.append(button(this.t('event.repairNow',{cost:this.data.config.events.repairCost}),'repair-building',()=>{const result=this.activity.repair(instance.id);if(result.ok){this.ui.drawInfo();this.ui.toast('event.repaired');}else this.ui.result(result);}));
  }
  dispose(){this.soundEvents.abort();this.cleanup();this.navigation.dispose();this.sound.dispose();this.unsubscribe();this.unsubscribeEngine();this.panel.remove();this.openButton.remove();this.teamButton.remove();}
}
