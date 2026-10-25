import { levelFactor, levelValue } from '../engine/metrics.mjs?v=island-cityscape-20261025-1';
import { placementAvailability, upgradeAvailability } from '../engine/rules.mjs?v=island-cityscape-20261025-1';
import {nearestPlacement} from '../engine/placement-help.mjs?v=island-cityscape-20261025-1';

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== '') node.textContent = text;
  return node;
};
const button = (label, action, className = '') => {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
};
const compactStat = (icon, value, label) => {
  const node = el('span', 'status-value');
  node.append(el('span', '', icon), el('b', '', value));
  node.setAttribute('aria-label', `${label} ${value}`);
  return node;
};
const list = value => Array.isArray(value) ? value : Object.values(value ?? {});

export class IslandInterface {
  constructor({ root, engine, view, data, t }) {
    Object.assign(this, { root, engine, view, data, t });
    this.category = 'basic';
    this.selected = null;
    this.currentGhost = null;
    this.infoId = null;
    this.movingId = null;
    this.cityHallIntro=true;
    try{this.placementHints=new Set(JSON.parse(localStorage.getItem(data.config.ui.placementHintsKey)||'[]'));}catch{this.placementHints=new Set();}
    this.dev = new URLSearchParams(location.search).get('dev') === '1';
    this.modalRoot = document.querySelector('#modal-root');
    root.replaceChildren();
    root.className = 'island-ui';
    this.buildShell();
    this.unsubscribe = engine.subscribe((state,event) => {if(event.type==='tutorial'&&state.tutorial.step===0&&!state.tutorial.skipped)this.cityHallIntro=true;this.refresh();});
    this.refresh();
    if (!engine.state.avatar.created) this.showAvatar();
  }
  label(record, prefix) { return this.t(record?.title ?? record?.nameId ?? record?.labelId ?? `${prefix}.${record?.id}`); }
  getBuilding(id) { return this.engine.registry?.buildings?.get(id) ?? list(this.data.buildings).find(b => b.id === id); }
  steps() { return this.data.tutorial.steps ?? this.data.tutorial; }
  tutorialStep() {
    if (!this.data.featureFlags.tutorial) return null;
    const state = this.engine.state.tutorial;
    if (state.completed || state.skipped) return null;
    return this.steps()[state.step ?? 0];
  }
  toast(id, values) {
    const node = document.querySelector('#toast');
    node.textContent = this.t(id, values);
    node.classList.add('visible');
    // The HUD is inert behind a modal. Keep modal feedback in its own flow
    // below the subtitle, so errors remain visible and announced there too.
    const modal = this.modalRoot.querySelector('.modal');
    let feedback = modal?.querySelector('.modal-toast');
    if (modal && !feedback) {
      feedback = el('div', 'modal-toast'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
      const anchor=modal.querySelector('.modal-subtitle')??modal.querySelector('.game-header');
      if(anchor)anchor.after(feedback);else modal.append(feedback);
    }
    if (feedback) { feedback.textContent = node.textContent; feedback.hidden = false; }
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { node.classList.remove('visible'); if (feedback) feedback.hidden = true; }, this.data.config.ui.toastMs);
    this.narrate(id, values);
  }
  narrate(id, values) { window.dispatchEvent(new CustomEvent('island:narrate', { detail: { id, values } })); }
  buildShell() {
    const hud = el('div', 'hud');
    const header = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.append(el('span', 'brand-mark', '🏝️'));
    const brandText = el('div');
    brandText.append(el('h1', '', this.t('app.title')), el('p', '', this.t('app.subtitle')));
    brand.append(brandText);
    this.wallet = el('div', 'wallet');
    const utilities = el('div', 'utilities');
    const help = button('?', 'help', 'round-button');
    help.title = this.t('app.help'); help.setAttribute('aria-label', this.t('app.help'));
    help.onclick = () => this.toast(this.movingId ? 'help.move' : this.infoId ? 'help.info' : this.selected ? 'help.build' : 'help.world');
    const undo = button('↶', 'undo', 'round-button');
    undo.title = this.t('app.undo'); undo.setAttribute('aria-label', this.t('app.undo'));
    undo.onclick = () => this.result(this.engine.undo());
    const parent = button('⚙', 'parent', 'round-button');
    parent.title = this.t('parent.hold'); parent.setAttribute('aria-label', this.t('app.parent'));
    this.setupParentGate(parent);
    parent.hidden = !this.data.featureFlags.parentTransfer;
    utilities.append(help, undo, parent);
    header.append(brand, this.wallet);

    this.city = el('aside', 'city-panel panel');
    const cityTitle = el('div', 'panel-heading');
    cityTitle.append(el('span', '', '✦'), el('strong', '', this.t('app.city')));
    this.metricsNode = el('div', 'metrics');
    this.resourcesNode = el('div', 'resources');
    this.cityToggle = button('', 'toggle-city', 'status-strip');
    this.cityToggle.setAttribute('aria-label', this.t('app.city'));
    this.cityToggle.setAttribute('aria-expanded', 'false');
    this.cityToggle.setAttribute('aria-controls', 'city-details');
    this.cityToggle.onclick = () => this.toggleDetails('city');
    this.cityDetails = el('div', 'city-details'); this.cityDetails.id = 'city-details'; this.cityDetails.hidden = true;
    this.cityDetails.append(header, cityTitle, this.metricsNode, this.resourcesNode);
    this.city.append(this.cityToggle, this.cityDetails);

    this.mission = el('aside', 'mission panel');
    this.missionToggle = button('', 'toggle-mission', 'mission-strip');
    this.missionToggle.setAttribute('aria-expanded', 'false');
    this.missionToggle.setAttribute('aria-live', 'polite');
    this.missionToggle.setAttribute('aria-controls', 'mission-details');
    this.missionToggle.onclick = () => this.toggleDetails('mission');
    this.missionDetails = el('div', 'mission-details'); this.missionDetails.id = 'mission-details'; this.missionDetails.hidden = true;
    this.mission.append(this.missionToggle, this.missionDetails);

    const camera = el('div', 'camera-controls');
    const home = button(`⌂ ${this.t('app.home')}`, 'home', 'home-button'); home.onclick = () => this.view.home();
    home.title = this.t('app.home');
    camera.append(utilities);
    const edit = button('☺', 'avatar-edit', 'round-button'); edit.setAttribute('aria-label', this.t('avatar.edit')); edit.onclick = () => this.showAvatar();
    const cityHall=button('🏛', 'open-city-hall', 'round-button');cityHall.setAttribute('aria-label',this.t('building.cityHall'));cityHall.title=this.t('building.cityHall');
    cityHall.onclick=()=>{this.cancelPlacement();const hall=this.engine.state.buildings.find(b=>b.typeId==='cityHall');if(hall){this.showInfo(hall.id);this.view.focusCell(hall.x,hall.z);}};
    camera.append(cityHall,edit, home);

    this.placement = el('div', 'placement panel');
    this.placement.hidden = true;
    this.ghostStatus = el('div', 'ghost-status'); this.ghostStatus.id = 'ghost-status';
    this.ghostStatus.setAttribute('role', 'status');
    this.placeButton = button(this.t('app.place'), 'place', 'primary-button');
    this.placeButton.onclick = () => this.commitPlacement();
    const cancel = this.cancelButton = button('×', 'cancel', 'round-button'); cancel.setAttribute('aria-label', this.t('app.cancel')); cancel.onclick = () => this.cancelPlacement();
    this.placeHelp=button('', 'help-placement', 'secondary-button placement-help');
    this.placeHelp.innerHTML='<span aria-hidden="true">☝ ✦</span>';this.placeHelp.append(el('span','',this.t('placement.help')));this.placeHelp.setAttribute('aria-label',this.t('placement.help'));
    this.placeHelp.onclick=()=>{const cell=this.findCell(this.selected,this.movingId);this.updateGhost(cell,false);this.view.focusCell(cell.x,cell.z);this.placeHelp.classList.remove('placement-cue');this.placeButton.classList.add('placement-confirm-cue');};
    this.placement.append(this.ghostStatus,this.placeHelp, this.placeButton, cancel);

    this.info = el('aside', 'info-card panel'); this.info.hidden = true;
    const dock = this.dock = el('section', 'build-dock');
    dock.dataset.open = 'false';
    const dockTop = el('div', 'dock-top');
    this.dockToggle = button('⌃', 'toggle-build', 'dock-handle');
    this.dockToggle.setAttribute('aria-label', this.t('app.choose'));
    this.dockToggle.setAttribute('aria-expanded', 'false');
    this.dockToggle.setAttribute('aria-controls', 'building-catalog');
    this.dockToggle.onclick = () => this.setDockOpen(dock.dataset.open !== 'true');
    this.categories = el('nav', 'categories'); this.categories.setAttribute('aria-label', this.t('app.build'));
    for (const category of list(this.data.categories)) {
      const b = button(`${category.icon} ${this.label(category, 'category')}`, 'category', 'category-button');
      b.dataset.category = category.id;
      b.style.setProperty('--category-color', category.color);
      b.onclick = () => { this.category = category.id; this.drawCatalog(); this.setDockOpen(true); };
      this.categories.append(b);
    }
    this.catalog = el('div', 'catalog');
    this.catalog.id = 'building-catalog'; this.catalog.hidden = true;
    dockTop.append(this.dockToggle, this.categories);
    this.catalogHint = el('div', 'catalog-caption'); this.catalogHint.hidden = true;
    this.catalogHint.append(el('strong', '', this.t('app.choose')), el('span', '', this.t('app.cameraHint')));
    dock.append(dockTop, this.catalogHint, this.catalog, this.placement);
    this.saveBadge = el('div', 'save-badge', `✓ ${this.t('app.saved')}`);
    hud.append(this.city, this.mission, document.querySelector('#toast'), this.saveBadge);
    this.root.append(hud, camera, this.info, dock);
    // A world tap opens a card on pointerup. Chromium can then retarget its
    // compatibility click to a new button under the finger. Only the control
    // where this gesture started may receive that click; keyboard clicks pass.
    document.addEventListener('pointerdown', event => {
      this.pointerOrigin = event.target.closest('button') ?? event.target;
      if (!this.city.contains(event.target) && !this.mission.contains(event.target)) this.closeDetails();
    }, true);
    document.addEventListener('pointercancel', () => { this.pointerOrigin = null; }, true);
    document.addEventListener('click', event => {
      const origin = this.pointerOrigin;
      if (!event.isTrusted || event.detail === 0 || !origin) return;
      this.pointerOrigin = null;
      const target = event.target.closest('button') ?? event.target;
      if (target !== origin) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.closeDetails(); });
    this.hudObserver = new ResizeObserver(() => {
      const height=hud.getBoundingClientRect().height;
      const details=[...hud.querySelectorAll('.city-details,.mission-details,.event-details')].reduce((sum,node)=>sum+node.getBoundingClientRect().height,0);
      this.root.style.setProperty('--hud-height', `${height}px`);
      this.root.style.setProperty('--hud-base-height', `${height-details}px`);
    });
    this.hudObserver.observe(hud);
    this.drawCatalog();
  }
  closeDetails() {
    this.dock.hidden = false;
    for (const name of ['city', 'mission']) {
      this[`${name}Details`].hidden = true;
      this[`${name}Toggle`].setAttribute('aria-expanded', 'false');
    }
  }
  toggleDetails(name) {
    const open = this[`${name}Details`].hidden;
    this.closeDetails(); this.closeInfo();
    this.dock.hidden = open;
    this[`${name}Details`].hidden = !open;
    this[`${name}Toggle`].setAttribute('aria-expanded', String(open));
  }
  setDockOpen(open) {
    this.dock.dataset.open = String(open);
    this.dockToggle.setAttribute('aria-expanded', String(open));
    this.dockToggle.textContent = open ? '⌄' : '⌃';
    this.catalog.hidden = !open;
    this.catalogHint.hidden = !open;
    if (open) this.closeInfo();
  }
  syncPlacementLayout() {
    this.dock.dataset.placing = String(Boolean(this.selected));
    if (this.selected) { this.closeDetails(); this.setDockOpen(false); }
  }
  refresh() {
    const s = this.engine.state;
    this.view.setWorld(s);
    const activeStep = this.tutorialStep() ?? this.engine.nextObjective?.();
    if (activeStep && this.activeStepId !== activeStep.id) {
      this.activeStepId = activeStep.id;
      if (activeStep.buildType) this.category = this.getBuilding(activeStep.buildType).category;
      this.drawCatalog();
    }
    this.wallet.replaceChildren();
    const money = el('div', 'money');
    money.append(el('span', 'coin', '●'), el('strong', '', Math.floor(s.money).toLocaleString('he-IL')), el('small', '', this.t('app.money')));
    const population = this.engine.population?.() ?? s.buildings.reduce((sum, b) => sum + (this.getBuilding(b.typeId)?.population ?? 0) * b.level, 0);
    const pop = el('div', 'population', `♟ ${Math.round(population)} ${this.t('app.population')}`);
    this.wallet.append(money, pop);
    this.cityToggle.replaceChildren();
    const balance = compactStat('●', Math.floor(s.money).toLocaleString('he-IL'), this.t('app.money'));
    this.cityToggle.append(balance);
    this.metricsNode.replaceChildren();
    const values = this.engine.metrics();
    for (const metric of this.engine.registry.metrics.values()) {
      if (!this.data.featureFlags.metrics || (metric.featureFlag && !this.data.featureFlags[metric.featureFlag])) continue;
      const value = Math.round(values[metric.id]?.value ?? values[metric.id] ?? 0);
      const compact = compactStat(metric.icon, String(value), this.label(metric, 'metric'));
      this.cityToggle.append(compact);
      const row = el('div', 'metric');
      const label = el('div', 'metric-label');
      label.append(el('span', '', `${metric.icon} ${this.label(metric, 'metric')}`), el('b', '', value));
      const track = el('div', 'metric-track');
      const fill = el('span'); fill.style.width = `${Math.min(100, value)}%`; fill.style.background = metric.color;
      track.append(fill); row.append(label, track); this.metricsNode.append(row);
    }
    this.resourcesNode.replaceChildren();
    for (const [key, icon] of [['food', '🌽'], ['materials', '🧱'], ['energy', '⚡']]) {
      const cell = el('span', 'resource', `${icon} ${Math.floor(s.resources[key])}`);
      cell.title = this.t(`app.${key}`); cell.setAttribute('aria-label', `${this.t(`app.${key}`)} ${Math.floor(s.resources[key])}`);
      this.resourcesNode.append(cell); this.cityToggle.append(compactStat(icon, String(Math.floor(s.resources[key])), this.t(`app.${key}`)));
    }
    const saveFailed = !this.engine.storageStatus.ok;
    const saveReason = this.engine.storageStatus.reason === 'reason.invalid' ? 'error.saveInvalid' : this.engine.storageStatus.reason ?? 'reason.storage';
    this.saveBadge.textContent = this.t(saveFailed ? saveReason : 'app.saved');
    this.saveBadge.classList.toggle('save-error', saveFailed);
    this.root.dataset.saveStatus = saveFailed ? 'error' : 'saved';
    this.drawMission();
    if (this.currentGhost) this.updateGhost(this.currentGhost);
    if (this.infoId && this.infoSignature !== this.currentInfoSignature()) this.drawInfo();
    this.updateCatalogState();
  }
  drawMission() {
    const step = this.tutorialStep();
    if(step&&this.engine.state.tutorial.step===0&&this.cityHallIntro){
      if(this.missionSignature==='cityHallIntro')return;
      this.missionSignature='cityHallIntro';
      this.missionToggle.replaceChildren(el('span','','🏛️'),el('strong','',this.t('tutorial.cityHall')),el('span','','⌄'));
      this.missionToggle.setAttribute('aria-label',this.t('tutorial.cityHall'));
      this.missionDetails.replaceChildren(el('p','',this.t('tutorial.cityHallHint')));
      const start=button(this.t('tutorial.cityHallContinue'),'tutorial-city-hall','primary-button');
      start.onclick=()=>{this.cityHallIntro=false;this.missionSignature=null;this.drawMission();const hall=this.engine.state.buildings.find(b=>b.typeId==='cityHall');if(hall){this.view.focusCell(hall.x,hall.z);this.showInfo(hall.id);}};
      this.missionDetails.append(start);return;
    }
    const objective = step ?? this.engine.nextObjective?.();
    const signature = JSON.stringify([objective, this.selected === step?.buildType, this.engine.state.tutorial.step]);
    if (signature === this.missionSignature) return;
    this.missionSignature = signature;
    const objectiveId = objective?.id ?? 'free-play';
    if (this.missionObjectiveId !== undefined && this.missionObjectiveId !== objectiveId) {
      this.mission.classList.remove('mission-complete');
      void this.mission.offsetWidth;
      this.mission.classList.add('mission-complete');
      clearTimeout(this.missionTimer);
      this.missionTimer = setTimeout(() => this.mission.classList.remove('mission-complete'), 900);
    }
    this.missionObjectiveId = objectiveId;
    this.missionToggle.replaceChildren(el('span', '', '🧑‍✈️'), el('strong', '', this.t(objective?.title ?? 'app.freePlay')), el('span', '', '⌄'));
    this.missionToggle.setAttribute('aria-label', `${this.t('app.next')}: ${this.t(objective?.title ?? 'app.freePlay')}`);
    this.missionDetails.replaceChildren();
    const eyebrow = el('div', 'mission-eyebrow', `↙ ${this.t('app.next')}`);
    const row = el('div', 'mission-main');
    row.append(el('div', 'guide-avatar', '🧑‍✈️'));
    const text = el('div');
    text.append(el('small', '', this.t('tutorial.guide')), el('strong', '', this.t(objective?.title ?? 'app.freePlay')));
    row.append(text);
    this.missionDetails.append(eyebrow, row);
    if (step) {
      const count = el('div', 'tutorial-count');
      count.append(el('span', '', this.t('tutorial.step', { current: this.engine.state.tutorial.step + 1, total: this.steps().length })), el('b', 'reward', `● +${step.reward?.money ?? 0}`));
      const dots = el('div', 'tutorial-dots');
      for (let i = 0; i < this.steps().length; i++) dots.append(el('span', i < this.engine.state.tutorial.step ? 'done' : i === this.engine.state.tutorial.step ? 'current' : ''));
      const skip = button(this.t('tutorial.skip'), 'skip-tutorial', 'text-button');
      skip.onclick = event => { event.stopPropagation(); this.engine.skipTutorial(); };
      this.missionDetails.append(count, dots, el('p', 'mission-hint', this.t(this.selected === step.buildType ? 'tutorial.place' : 'tutorial.select')), skip);
    } else {
      this.missionDetails.append(el('p', 'mission-hint', this.t('app.explore')));
      if (objective?.reward?.money) this.missionDetails.append(el('b', 'reward', `${this.t('app.reward')} ● +${objective.reward.money}`));
    }
  }
  drawCatalog() {
    this.catalog.replaceChildren();
    for (const building of [...this.engine.registry.buildings.values()].filter(b => b.category === this.category)) {
      if ((building.category === 'sports' && !this.data.featureFlags.sportFacilities) || (building.featureFlag && !this.data.featureFlags[building.featureFlag])) continue;
      const b = button('', 'select-building', 'building-card');
      b.dataset.building = building.id;
      b.append(el('span', 'building-icon', building.icon), el('strong', '', this.label(building, 'building')), el('span', 'building-cost', building.locked ? `🔒 ${this.t('app.locked')}` : `● ${building.cost}`));
      b.append(el('span', 'building-hint'));
      b.onclick = () => this.selectBuilding(building.id);
      this.catalog.append(b);
    }
    this.updateCatalogState();
  }
  updateCatalogState() {
    const step = this.tutorialStep() ?? this.engine.nextObjective?.();
    for (const b of this.categories.children) {
      b.setAttribute('aria-current', String(b.dataset.category === this.category));
      const required = step && this.getBuilding(step.buildType)?.category === b.dataset.category;
      b.classList.toggle('required-category', !!required);
    }
    for (const b of this.catalog.children) {
      const record = this.getBuilding(b.dataset.building);
      b.classList.toggle('selected', b.dataset.building === this.selected);
      b.classList.toggle('guided', b.dataset.building === step?.buildType);
      b.classList.toggle('locked', !!record.locked);
      b.setAttribute('aria-pressed', String(b.dataset.building === this.selected));
      const availability = placementAvailability(this.engine.state, this.engine.registry, record.id);
      if(availability.reason==='reason.learningOrder')b.classList.add('locked');
      const hint = b.querySelector('.building-hint');
      const label = record.locked ? null : !availability.ok ? record.limit.kind === 'capacity' && availability.reason === record.limit.reason ? 'app.noNeed' : 'app.atLimit' : availability.recommended ? 'app.recommended' : null;
      hint.textContent = availability.reason==='reason.learningOrder'?`${this.t('reason.learningOrder')}: ${this.label(this.getBuilding(record.unlockAfter),'building')}`:label?this.t(label):'';
      if (!record.locked && !availability.ok && availability.reason!=='reason.learningOrder' && record.limit.kind === 'unique' && record.levels.length>1) hint.textContent += ` · ${this.t('app.upgradeExisting')}`;
      hint.hidden = !label;
      b.dataset.limit = record.limit?.kind ?? 'free';
      b.dataset.availability = !availability.ok ? 'limited' : availability.recommended ? 'recommended' : 'available';
      b.title = !record.locked && !availability.ok ? this.t(availability.reason) : '';
    }
  }
  selectBuilding(id) {
    const building = this.getBuilding(id);
    if (!building) return;
    if (building.locked) { this.toast('reason.locked'); return; }
    if(placementAvailability(this.engine.state,this.engine.registry,id).reason==='reason.learningOrder'){this.toast('reason.learningOrder');return;}
    this.closeInfo();
    this.movingId = null;
    this.selected = id;
    this.category = building.category;
    this.drawCatalog();
    this.placement.hidden = false;
    this.syncPlacementLayout();
    let cell = this.currentGhost;
    if (!cell || !this.engine.validatePlacement(id, cell.x, cell.z).ok) cell = this.findCell(id);
    this.updateGhost(cell);
    this.drawMission();
    this.narrate(building.title ?? building.nameId ?? `building.${id}`);
    this.placeHelp.classList.add('placement-cue');this.placeButton.classList.remove('placement-confirm-cue');
    if(!this.placementHints.has(id)){
      this.placementHints.add(id);try{localStorage.setItem(this.data.config.ui.placementHintsKey,JSON.stringify([...this.placementHints]));}catch{}
      const voice=globalThis.speechSynthesis?.getVoices?.().find(v=>/^he(?:-|$)/i.test(v.lang));
      if(voice&&!this.activityInterface?.sound.muted&&globalThis.SpeechSynthesisUtterance){const utterance=new SpeechSynthesisUtterance(this.t('placement.voiceHint'));utterance.lang='he-IL';utterance.voice=voice;speechSynthesis.speak(utterance);}
    }
  }
  openBuildingCatalog(id){
    const building=this.getBuilding(id);if(!building)return;
    this.cancelPlacement();this.closeDetails();this.category=building.category;this.drawCatalog();this.setDockOpen(true);
    const card=[...this.catalog.children].find(node=>node.dataset.building===id);
    if(card){card.classList.add('required-building');card.scrollIntoView({block:'nearest',inline:'center'});card.focus();}
  }
  findCell(id, ignoreId) {
    const state=this.engine.state;
    return nearestPlacement(state,this.engine.registry,id,{x:state.world.size/2,z:state.world.size/2},ignoreId,this.data.featureFlags)??{x:1,z:1};
  }
  onHover(cell) { if (this.selected) this.updateGhost(cell); }
  onCell(cell) { if (this.selected) this.updateGhost(cell); else this.closeInfo(); }
  updateGhost(cell,snap=true) {
    if (!this.selected) return;
    this.currentGhost = { x: Math.floor(cell.x), z: Math.floor(cell.z) };
    if(snap)this.currentGhost=nearestPlacement(this.engine.state,this.engine.registry,this.selected,this.currentGhost,this.movingId,this.data.featureFlags)||this.currentGhost;
    const result = this.engine.validatePlacement(this.selected, this.currentGhost.x, this.currentGhost.z, this.movingId);
    const building = this.getBuilding(this.selected);
    const moving = this.engine.state.buildings.find(row => row.id === this.movingId);
    this.view.setGhost({ ...building, previewLevel: moving?.level ?? 1 }, this.currentGhost.x, this.currentGhost.z, result.ok);
    this.ghostStatus.dataset.valid = String(result.ok);
    this.ghostStatus.dataset.reason = result.reason ?? 'reason.ok';
    this.ghostStatus.textContent = `${this.movingId ? this.t('app.moveHint', { building: this.label(building, 'building') }) + ' ' : ''}${result.ok ? '✓' : result.reason === 'reason.money' ? '●' : result.reason === 'reason.road' ? '🛣️' : '✕'} ${this.t(result.ok ? this.movingId ? 'app.moveAllowed' : 'reason.ok' : result.reason)}`;
    this.placeButton.disabled = !result.ok;
    this.placeButton.textContent = `✓ ${this.t(this.movingId ? 'app.moveHere' : 'app.place')}`;
    this.cancelButton.textContent = this.movingId ? this.t('app.cancelMove') : '×';
    this.cancelButton.setAttribute('aria-label', this.t(this.movingId ? 'app.cancelMove' : 'app.cancel'));
  }
  commitPlacement() {
    if (!this.currentGhost || !this.selected) return;
    const { x, z } = this.currentGhost;
    const before = this.engine.state.tutorial.step;
    const result = this.movingId ? this.engine.move(this.movingId, x, z) : this.engine.place(this.selected, x, z);
    if (result.ok) {
      this.cancelPlacement();
      if (this.engine.state.tutorial.step > before && result.reward?.paid) this.toast('tutorial.reward', { money: this.steps()[before].reward.money });
      if (this.engine.state.tutorial.completed && before < this.steps().length) this.toast('tutorial.complete');
    } else this.result(result);
  }
  cancelPlacement() {
    this.selected = null; this.movingId = null; this.currentGhost = null;
    this.placement.hidden = true; this.syncPlacementLayout(); this.view.clearGhost(); this.updateCatalogState(); this.drawMission();
  }
  result(result) { if (result && !result.ok) this.toast(result.reason); return result; }
  showInfo(id, {manage=false}={}) {
    const instance=this.engine.state.buildings.find(b=>b.id===id),station=this.getBuilding(instance?.typeId)?.learningStation;
    if(!this.selected&&station&&!manage&&this.learningInterface){this.learningInterface.start(station);return;}
    if (this.selected) {
      const b = this.engine.state.buildings.find(b => b.id === id);
      if (b) this.updateGhost({ x: b.x, z: b.z });
      return;
    }
    this.closeDetails(); this.setDockOpen(false);
    this.infoId = id;
    this.drawInfo();
  }
  closeInfo() { this.infoId = null; this.infoSignature = null; this.info.hidden = true; this.view.showRadius(null); }
  currentInfoSignature() {
    const state = this.engine.state;
    const instance=state.buildings.find(row=>row.id===this.infoId);
    return JSON.stringify([instance, state.events?.repairs?.[this.infoId], state.world.stage, this.engine.population(), upgradeAvailability(state, this.engine.registry, this.infoId).reason,instance?.typeId==='cityHall'?[state.team,this.engine.metrics()]:null,this.engine.learningStatus().locked]);
  }
  drawInfo() {
    const instance = this.engine.state.buildings.find(b => b.id === this.infoId);
    if (!instance) { this.closeInfo(); return; }
    this.infoSignature = this.currentInfoSignature();
    const record = this.getBuilding(instance.typeId);
    this.info.dataset.type=record.id;
    const factor = levelFactor(instance, this.data.config);
    const amount = value => Number((value * factor).toFixed(1)).toLocaleString('he-IL');
    this.info.hidden = false; this.info.replaceChildren();
    const close = button('×', 'close-info', 'round-button'); close.onclick = () => this.closeInfo(); close.setAttribute('aria-label', this.t('app.close'));
    const title = el('div', 'info-title');
    title.append(el('span', 'building-icon', record.icon), el('h2', '', this.label(record, 'building')), close);
    const currentLevel = record.levels[instance.level - 1];
    this.info.append(title, el('span', 'level-badge', `${currentLevel.title ? this.t(currentLevel.title) + ' · ' : ''}${this.t('app.level')} ${instance.level}`));
    const effects = el('div', 'info-effects');
    for (const [id, value] of Object.entries(record.effects ?? record.metrics ?? {})) effects.append(el('span', '', `${this.t(`metric.${id}`)} +${amount(value)}`));
    const residents = levelValue(instance, record, 'population', this.data.config);
    if (residents) effects.append(el('span', '', `♟ ${residents.toLocaleString('he-IL')} ${this.t('app.population')}`));
    if (record.supply) {
      const supply = levelValue(instance, record, 'supply', this.data.config), population = this.engine.population();
      effects.append(el('span', 'service-supply', this.t('app.serves', { supply: Math.min(supply, population), population })), el('span', '', this.t('app.supply', { supply })));
    }
    if (record.income) effects.append(el('span', '', `● +${amount(record.income)} ${this.t('app.income')}`));
    for (const [key, value] of Object.entries(record.resources ?? {})) effects.append(el('span', '', `${this.t(`app.${key}`)} +${amount(value)}`));
    if (record.capacity) effects.append(el('span', '', `${this.t('app.capacity')} ${amount(record.capacity)}`));
    if (!effects.children.length) effects.append(el('span', '', this.t('app.explore')));
    const actions = el('div', 'info-actions');
    const upgradeStatus = upgradeAvailability(this.engine.state, this.engine.registry, instance.id);
    const nextLevel = upgradeStatus.nextLevel;
    const upgrade = button('', 'upgrade', 'primary-button');
    upgrade.append(el('span', '', `✦ ${this.t('app.upgrade')}`), el('small', '', nextLevel ? `● ${nextLevel.cost}` : this.t('app.maxLevel')));
    if (!upgradeStatus.ok && nextLevel) upgrade.append(el('small', 'upgrade-reason', this.t(upgradeStatus.reason)));
    upgrade.disabled = !upgradeStatus.ok;
    upgrade.onclick = () => this.result(this.engine.upgrade(instance.id));
    const move = button(`↔ ${this.t('app.move')}`, 'move', 'secondary-button');
    move.onclick = () => {
      this.closeInfo(); this.selected = record.id; this.movingId = instance.id; this.placement.hidden = false;
      this.syncPlacementLayout();
      this.updateGhost({ x: instance.x, z: instance.z }); this.updateCatalogState();
    };
    const [width,depth]=record.footprint;
    if(record.id==='soccer'&&!this.findMoveCell(record.id,instance))this.info.append(el('p','move-space-reason',this.t('app.noMoveSpace',{width,depth})));
    const remove = button(`↩ ${this.t('app.remove')}`, 'remove', 'secondary-button');
    remove.onclick = () => {
      remove.textContent = this.t('app.removeYes');
      remove.dataset.action = 'remove-yes';
      this.info.append(el('p', '', this.t('app.removeConfirm')));
      remove.onclick = () => { this.closeInfo(); this.result(this.engine.remove(instance.id)); };
    };
    actions.append(move);if(record.id!=='cityHall')actions.append(upgrade);if(record.removable!==false)actions.append(remove);this.info.append(actions);
    this.activityInterface?.decorateInfo(instance,actions);
    if(record.learningStation){const learn=button(`${record.icon} לומדים`,'building-learn','primary-button');learn.onclick=()=>this.learningInterface.start(record.learningStation);actions.append(learn);}
    if(record.id==='cityHall'){this.view.showRadius(null);return;}
    if (nextLevel) {
      const nextInstance = { ...instance, level: instance.level + 1 };
      const details = el('p', 'upgrade-details');
      if (nextLevel.title) details.append(el('strong', '', this.t(nextLevel.title)));
      for (const [field, label] of [['population', 'app.upgradePopulation'], ['supply', 'app.upgradeSupply']]) {
        const delta = levelValue(nextInstance, record, field, this.data.config) - levelValue(instance, record, field, this.data.config);
        if (delta) details.append(el('span', '', this.t(label, { amount: delta })));
      }
      if (record.income) details.append(el('span', '', this.t('app.upgradeReward', { before: amount(record.income), after: Number((record.income * levelFactor(nextInstance, this.data.config)).toFixed(1)) })));
      if (record.radius) details.append(el('span', '', this.t('app.upgradeEffects')));
      this.info.append(details);
    }
    this.info.append(el('h3', '', this.t('app.gives')), effects, el('p', 'radius-label', `◯ ${amount(record.radius ?? 0)} ${this.t('app.radius')}`));
    this.view.showRadius({ ...record, radius: (record.radius ?? 0) * factor }, instance);
  }
  setupParentGate(node) {
    let timer;
    const cancel = () => { clearTimeout(timer); timer = null; node.classList.remove('holding'); };
    const start = event => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      if (timer) return;
      event.preventDefault(); node.classList.add('holding');
      timer = setTimeout(() => { cancel(); this.showParent(); }, this.data.config.ui.parentHoldMs);
    };
    node.addEventListener('pointerdown', event => { node.setPointerCapture(event.pointerId); start(event); });
    node.addEventListener('keydown', start);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture', 'keyup', 'blur']) node.addEventListener(name, cancel);
    node.onclick = () => this.toast('parent.hold');
  }
  findMoveCell(typeId,instance){
    const size=this.engine.state.world.size;
    for(let z=0;z<size;z++)for(let x=0;x<size;x++)if((x!==instance.x||z!==instance.z)&&this.engine.validatePlacement(typeId,x,z,instance.id).ok)return {x,z};
    return null;
  }
  openModal(titleId, subtitleId) {
    this.modalCleanup?.(); this.modalCleanup = null;
    this.modalRoot.replaceChildren();
    const overlay = el('div', 'modal-overlay');
    const modal = el('section', 'modal panel'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const heading = el('h2', '', this.t(titleId)); heading.id = 'modal-title'; modal.setAttribute('aria-labelledby', heading.id);
    const close = button('×', 'close-modal', 'round-button modal-close'); close.setAttribute('aria-label', this.t('app.close'));
    close.onclick = () => this.closeModal();
    modal.append(close, heading, el('p', 'modal-subtitle', this.t(subtitleId)));
    overlay.append(modal); this.modalRoot.append(overlay);
    this.previousFocus = document.activeElement;
    this.root.inert = true;
    this.modalKeyHandler = event => {
      if (event.key === 'Escape' && this.engine.state.avatar.created) {
        if(modal.classList.contains('game-screen')){event.preventDefault();this.activityInterface?.shell?.pause('exit');}
        else this.closeModal();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button,input')].filter(n => !n.disabled && !n.hidden && !n.closest('[inert]') && n.getClientRects().length);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { focusable.at(-1).focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { focusable[0].focus(); event.preventDefault(); }
    };
    modal.addEventListener('keydown', this.modalKeyHandler);
    queueMicrotask(() => modal.querySelector('button')?.focus());
    return modal;
  }
  closeModal() {
    const cleanup=this.modalCleanup;this.modalCleanup=null;cleanup?.();
    this.view.detachAvatarPreview?.();
    this.modalRoot.replaceChildren(); this.root.inert = false;
    this.previousFocus?.focus();
    // Landscape info cards hide the HUD, so its city toggle cannot receive focus.
    if(document.activeElement!==this.previousFocus)(this.info.hidden?this.cityToggle:this.info.querySelector('button:not(:disabled)'))?.focus();
    this.view.setAvatar(this.engine.state.avatar);
  }
  showAvatar() {
    const modal = this.openModal('avatar.title', 'avatar.subtitle');
    modal.classList.add('avatar-modal');
    if (!this.engine.state.avatar.created) modal.querySelector('[data-action=close-modal]').hidden = true;
    const content = el('div', 'avatar-scroll');
    const close = modal.querySelector('[data-action=close-modal]');
    content.append(...[...modal.children].filter(node => node !== close));
    modal.append(content);
    const draft = { ...this.engine.state.avatar };
    const preview = el('div', 'avatar-preview');
    content.append(preview);
    const previewCanvas = el('canvas', 'avatar-preview-canvas');
    previewCanvas.setAttribute('aria-label', this.t('avatar.preview'));
    preview.append(previewCanvas);
    this.view.attachAvatarPreview?.(previewCanvas);
    const fields = [
      ['nameId', 'avatar.name', this.data.avatar.names],
      ['gender', 'avatar.gender', this.data.avatar.genders],
      ['skinColor', 'avatar.skin', this.data.avatar.skinColors],
      ['hairstyle', 'avatar.hairstyle', this.data.avatar.hairstyles],
      ['hairColor', 'avatar.hair', this.data.avatar.hairColors],
      ['shirtColor', 'avatar.shirt', this.data.avatar.shirtColors],
      ['pantsColor', 'avatar.pants', this.data.avatar.pantsColors]
    ];
    for (const [key, title, options] of fields) {
      const field = el('fieldset', 'avatar-field'); field.append(el('legend', '', this.t(title)));
      const choices = el('div', 'choices');
      for (const option of options) {
        const value = option.color ?? (key === 'nameId' ? option.labelId ?? option.id : option.id);
        const label = this.t(option.labelId ?? option.nameId ?? `avatar.${option.id}`);
        const b = button(option.color ? '' : label, 'avatar-option', option.color ? 'swatch' : 'choice');
        b.dataset.field = key; b.dataset.value = value;
        b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(draft[key] === value));
        if (option.color) b.style.background = option.color;
        b.onclick = () => {
          draft[key] = value;
          for (const sibling of choices.children) sibling.setAttribute('aria-pressed', String(sibling === b));
          this.view.setAvatar(draft);
          preview.style.setProperty('--shirt', draft.shirtColor);
          preview.style.setProperty('--skin', draft.skinColor);
        };
        choices.append(b);
      }
      field.append(choices); content.append(field);
    }
    const start = button(this.t('avatar.start'), 'avatar-start', 'primary-button avatar-start');
    start.onclick = () => { this.engine.setAvatar({ ...draft, created: true }); this.closeModal(); this.toast('tutorial.welcome'); };
    const footer = el('footer', 'avatar-footer'); footer.append(start); modal.append(footer);
  }
  exportBackup() {
    const blob = new Blob([this.engine.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = el('a'); anchor.href = url; anchor.download = this.t('parent.exportName'); anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), this.data.config.ui.toastMs);
  }
  showReset() {
    const modal = this.openModal('parent.reset', 'parent.resetWarning');
    modal.classList.add('reset-modal');
    const backup = button(this.t('parent.resetBackup'), 'reset-backup', 'primary-button');
    backup.onclick = () => this.exportBackup();
    const keep = el('input'); keep.type = 'checkbox'; keep.id = 'reset-keep-avatar'; keep.checked = true;
    const keepLabel = el('label', 'reset-keep'); keepLabel.append(keep, document.createTextNode(this.t('parent.keepAvatar')));
    const cancel = button(this.t('parent.resetCancel'), 'reset-cancel', 'secondary-button'); cancel.onclick = () => this.showParent();
    const next = button(this.t('parent.resetNext'), 'reset-next', 'danger-button');
    const first = el('div', 'reset-stage'); first.append(backup, el('p', '', this.t('parent.resetBackupHint')), keepLabel, next, cancel);
    modal.append(first);
    next.onclick = () => {
      const keepAvatar = keep.checked;
      const label = el('label', 'reset-confirm-label', this.t('parent.resetType')); label.htmlFor = 'reset-confirmation';
      const confirmation = el('input'); confirmation.id = 'reset-confirmation'; confirmation.type = 'text'; confirmation.autocomplete = 'off';
      const confirm = button(this.t('parent.resetConfirm'), 'reset-confirm', 'danger-button'); confirm.disabled = true;
      confirmation.oninput = () => { confirm.disabled = confirmation.value.trim() !== this.t('parent.resetWord'); };
      confirm.onclick = () => {
        if (confirmation.value.trim() !== this.t('parent.resetWord')) return;
        confirm.disabled = true;
        const result = this.engine.reset({ keepAvatar });
        if (!result.ok) { this.result(result); confirm.disabled = false; return; }
        // The engine already holds the fresh state, including for pagehide/beforeunload saves.
        window.location.reload();
      };
      first.replaceChildren(el('p', '', this.t(keepAvatar ? 'parent.resetKeepsAvatar' : 'parent.resetDropsAvatar')), label, confirmation, confirm, cancel);
      confirmation.focus();
    };
  }
  showParent() {
    const modal = this.openModal('parent.title', 'parent.subtitle');
    this.learningInterface?.decorateParent(modal);
    const exportButton = button(`↓ ${this.t('parent.export')}`, 'export', 'primary-button');
    exportButton.onclick = () => this.exportBackup();
    const file = el('input', 'import-file'); file.type = 'file'; file.accept = '.json,application/json'; file.id = 'island-import';
    file.setAttribute('aria-label', this.t('parent.import'));
    const importButton = button(`↑ ${this.t('parent.import')}`, 'import', 'secondary-button'); importButton.onclick = () => file.click();
    file.onchange = async () => {
      try {
        const selected = file.files[0]; if (!selected) return;
        const result = this.engine.importJSON(await selected.text());
        if (result.ok) { this.closeModal(); this.toast('parent.imported'); } else this.result(result);
      } catch { this.toast('parent.failed'); }
    };
    const copy = button(this.t('parent.copy'), 'copy', 'secondary-button');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(this.engine.exportJSON()); this.toast('parent.copied'); }
      catch { exportButton.click(); }
    };
    const restart = button(this.t('tutorial.restart'), 'restart-tutorial', 'secondary-button'); restart.onclick = () => { this.engine.restartTutorial(); this.closeModal(); };
    const edit = button(this.t('avatar.edit'), 'edit-avatar', 'secondary-button'); edit.onclick = () => this.showAvatar();
    const reset = button(this.t('parent.reset'), 'reset-game', 'danger-button');
    reset.onclick = () => this.showReset();
    const controls = el('div', 'parent-controls'); controls.append(exportButton, importButton, copy, restart, edit, reset, file);
    modal.append(controls, el('p', '', this.t('parent.importHint')), el('small', '', `${this.t('parent.version')} ${this.engine.state.version}`));
    if (this.dev && this.data.featureFlags.devParts) {
      const dev = button(this.t('dev.parts'), 'dev-parts', 'secondary-button');
      dev.onclick = () => { window.islandApi.grantParts(this.data.world.partGroup, this.data.config.devGrantParts); this.toast('dev.granted'); };
      modal.append(dev);
    }
  }
}
