import { levelFactor } from '../engine/metrics.mjs';

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
const list = value => Array.isArray(value) ? value : Object.values(value ?? {});

export class IslandInterface {
  constructor({ root, engine, view, data, t }) {
    Object.assign(this, { root, engine, view, data, t });
    this.category = 'basic';
    this.selected = null;
    this.currentGhost = null;
    this.infoId = null;
    this.movingId = null;
    this.dev = new URLSearchParams(location.search).get('dev') === '1';
    this.modalRoot = document.querySelector('#modal-root');
    root.replaceChildren();
    root.className = 'island-ui';
    this.buildShell();
    this.unsubscribe = engine.subscribe(() => this.refresh());
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
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => node.classList.remove('visible'), this.data.config.ui.toastMs);
    this.narrate(id, values);
  }
  narrate(id, values) { window.dispatchEvent(new CustomEvent('island:narrate', { detail: { id, values } })); }
  buildShell() {
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
    help.onclick = () => this.toast(this.infoId ? 'help.info' : this.selected ? 'help.build' : 'help.world');
    const undo = button('↶', 'undo', 'round-button');
    undo.title = this.t('app.undo'); undo.setAttribute('aria-label', this.t('app.undo'));
    undo.onclick = () => this.result(this.engine.undo());
    const parent = button('⚙', 'parent', 'round-button');
    parent.title = this.t('parent.hold'); parent.setAttribute('aria-label', this.t('app.parent'));
    this.setupParentGate(parent);
    parent.hidden = !this.data.featureFlags.parentTransfer;
    utilities.append(help, undo, parent);
    header.append(brand, this.wallet, utilities);

    this.city = el('aside', 'city-panel panel');
    const cityTitle = el('div', 'panel-heading');
    cityTitle.append(el('span', '', '✦'), el('strong', '', this.t('app.city')));
    this.metricsNode = el('div', 'metrics');
    this.resourcesNode = el('div', 'resources');
    this.city.append(cityTitle, this.metricsNode, this.resourcesNode);

    // A large click target here makes Chrome redirect nearby touches away from the island.
    this.mission = el('aside', 'mission panel');
    this.mission.setAttribute('aria-live', 'polite');

    const camera = el('div', 'camera-controls');
    const home = button(`⌂ ${this.t('app.home')}`, 'home', 'home-button'); home.onclick = () => this.view.home();
    camera.append(home);
    const edit = button('☺', 'avatar-edit', 'round-button'); edit.setAttribute('aria-label', this.t('avatar.edit')); edit.onclick = () => this.showAvatar();
    camera.append(edit);

    this.placement = el('div', 'placement panel');
    this.placement.hidden = true;
    this.ghostStatus = el('div', 'ghost-status'); this.ghostStatus.id = 'ghost-status';
    this.placeButton = button(this.t('app.place'), 'place', 'primary-button');
    this.placeButton.onclick = () => this.commitPlacement();
    const cancel = button('×', 'cancel', 'round-button'); cancel.setAttribute('aria-label', this.t('app.cancel')); cancel.onclick = () => this.cancelPlacement();
    this.placement.append(this.ghostStatus, this.placeButton, cancel);

    this.info = el('aside', 'info-card panel'); this.info.hidden = true;
    const dock = el('section', 'build-dock');
    const dockTop = el('div', 'dock-top');
    dockTop.append(el('strong', '', this.t('app.choose')), el('span', 'camera-hint', this.t('app.cameraHint')));
    this.categories = el('nav', 'categories'); this.categories.setAttribute('aria-label', this.t('app.build'));
    for (const category of list(this.data.categories)) {
      const b = button(`${category.icon} ${this.label(category, 'category')}`, 'category', 'category-button');
      b.dataset.category = category.id;
      b.style.setProperty('--category-color', category.color);
      b.onclick = () => { this.category = category.id; this.drawCatalog(); };
      this.categories.append(b);
    }
    this.catalog = el('div', 'catalog');
    dock.append(dockTop, this.categories, this.catalog);
    this.saveBadge = el('div', 'save-badge', `✓ ${this.t('app.saved')}`);
    this.root.append(header, this.city, this.mission, camera, this.placement, this.info, this.saveBadge, dock);
    this.drawCatalog();
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
    this.metricsNode.replaceChildren();
    const values = this.engine.metrics();
    for (const metric of this.engine.registry.metrics.values()) {
      if (!this.data.featureFlags.metrics || (metric.featureFlag && !this.data.featureFlags[metric.featureFlag])) continue;
      const value = Math.round(values[metric.id]?.value ?? values[metric.id] ?? 0);
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
      this.resourcesNode.append(cell);
    }
    const saveFailed = !this.engine.storageStatus.ok;
    const saveReason = this.engine.storageStatus.reason === 'reason.invalid' ? 'error.saveInvalid' : this.engine.storageStatus.reason ?? 'reason.storage';
    this.saveBadge.textContent = this.t(saveFailed ? saveReason : 'app.saved');
    this.saveBadge.classList.toggle('save-error', saveFailed);
    this.root.dataset.saveStatus = saveFailed ? 'error' : 'saved';
    this.drawMission();
    if (this.currentGhost) this.updateGhost(this.currentGhost);
    if (this.infoId && this.infoSignature !== JSON.stringify(s.buildings.find(b => b.id === this.infoId))) this.drawInfo();
    this.updateCatalogState();
  }
  drawMission() {
    const step = this.tutorialStep();
    const objective = step ?? this.engine.nextObjective?.();
    this.mission.replaceChildren();
    const eyebrow = el('div', 'mission-eyebrow', `↙ ${this.t('app.next')}`);
    const row = el('div', 'mission-main');
    row.append(el('div', 'guide-avatar', '🧑‍✈️'));
    const text = el('div');
    text.append(el('small', '', this.t('tutorial.guide')), el('strong', '', this.t(objective?.title ?? 'app.freePlay')));
    row.append(text);
    this.mission.append(eyebrow, row);
    if (step) {
      const count = el('div', 'tutorial-count');
      count.append(el('span', '', this.t('tutorial.step', { current: this.engine.state.tutorial.step + 1, total: this.steps().length })), el('b', 'reward', `● +${step.reward?.money ?? 0}`));
      const dots = el('div', 'tutorial-dots');
      for (let i = 0; i < this.steps().length; i++) dots.append(el('span', i < this.engine.state.tutorial.step ? 'done' : i === this.engine.state.tutorial.step ? 'current' : ''));
      const skip = button(this.t('tutorial.skip'), 'skip-tutorial', 'text-button');
      skip.onclick = event => { event.stopPropagation(); this.engine.skipTutorial(); };
      this.mission.append(count, dots, el('p', 'mission-hint', this.t(this.selected === step.buildType ? 'tutorial.place' : 'tutorial.select')), skip);
    } else {
      this.mission.append(el('p', 'mission-hint', this.t('app.explore')));
      if (objective?.reward?.money) this.mission.append(el('b', 'reward', `${this.t('app.reward')} ● +${objective.reward.money}`));
    }
  }
  drawCatalog() {
    this.catalog.replaceChildren();
    for (const building of [...this.engine.registry.buildings.values()].filter(b => b.category === this.category)) {
      if ((building.category === 'sports' && !this.data.featureFlags.sportFacilities) || (building.featureFlag && !this.data.featureFlags[building.featureFlag])) continue;
      const b = button('', 'select-building', 'building-card');
      b.dataset.building = building.id;
      b.append(el('span', 'building-icon', building.icon), el('strong', '', this.label(building, 'building')), el('span', 'building-cost', building.locked ? `🔒 ${this.t('app.locked')}` : `● ${building.cost}`));
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
    }
  }
  selectBuilding(id) {
    const building = this.getBuilding(id);
    if (!building) return;
    if (building.locked) { this.toast('reason.locked'); return; }
    this.closeInfo();
    this.movingId = null;
    this.selected = id;
    this.category = building.category;
    this.drawCatalog();
    this.placement.hidden = false;
    let cell = this.currentGhost;
    if (!cell || !this.engine.validatePlacement(id, cell.x, cell.z).ok) cell = this.findCell(id);
    this.updateGhost(cell);
    this.drawMission();
    this.narrate(building.title ?? building.nameId ?? `building.${id}`);
  }
  findCell(id, ignoreId) {
    const size = this.engine.state.world.size;
    const cells = [];
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) cells.push({ x, z });
    cells.sort((a, b) => Math.hypot(a.x - size / 2, a.z - size / 2) - Math.hypot(b.x - size / 2, b.z - size / 2));
    return cells.find(c => this.engine.validatePlacement(id, c.x, c.z, ignoreId).ok) ?? { x: 1, z: 1 };
  }
  onHover(cell) { if (this.selected) this.updateGhost(cell); }
  onCell(cell) { if (this.selected) this.updateGhost(cell); else this.closeInfo(); }
  updateGhost(cell) {
    if (!this.selected) return;
    this.currentGhost = { x: Math.floor(cell.x), z: Math.floor(cell.z) };
    const result = this.engine.validatePlacement(this.selected, this.currentGhost.x, this.currentGhost.z, this.movingId);
    const building = this.getBuilding(this.selected);
    this.view.setGhost(building, this.currentGhost.x, this.currentGhost.z, result.ok);
    this.ghostStatus.dataset.valid = String(result.ok);
    this.ghostStatus.dataset.reason = result.reason ?? 'reason.ok';
    this.ghostStatus.textContent = `${result.ok ? '✓' : result.reason === 'reason.money' ? '●' : result.reason === 'reason.road' ? '🛣️' : '✕'} ${this.t(result.ok ? 'reason.ok' : result.reason)}`;
    this.placeButton.disabled = !result.ok;
    this.placeButton.textContent = this.t(this.movingId ? 'app.moveHere' : 'app.place');
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
    this.placement.hidden = true; this.view.clearGhost(); this.updateCatalogState(); this.drawMission();
  }
  result(result) { if (result && !result.ok) this.toast(result.reason); return result; }
  showInfo(id) {
    if (this.selected) {
      const b = this.engine.state.buildings.find(b => b.id === id);
      if (b) this.updateGhost({ x: b.x, z: b.z });
      return;
    }
    this.infoId = id;
    this.drawInfo();
  }
  closeInfo() { this.infoId = null; this.infoSignature = null; this.info.hidden = true; this.view.showRadius(null); }
  drawInfo() {
    const instance = this.engine.state.buildings.find(b => b.id === this.infoId);
    if (!instance) { this.closeInfo(); return; }
    this.infoSignature = JSON.stringify(instance);
    const record = this.getBuilding(instance.typeId);
    const factor = levelFactor(instance, this.data.config);
    const amount = value => Number((value * factor).toFixed(1)).toLocaleString('he-IL');
    this.info.hidden = false; this.info.replaceChildren();
    const close = button('×', 'close-info', 'round-button'); close.onclick = () => this.closeInfo(); close.setAttribute('aria-label', this.t('app.close'));
    const title = el('div', 'info-title');
    title.append(el('span', 'building-icon', record.icon), el('h2', '', this.label(record, 'building')), close);
    this.info.append(title, el('span', 'level-badge', `${this.t('app.level')} ${instance.level}`), el('h3', '', this.t('app.gives')));
    const effects = el('div', 'info-effects');
    for (const [id, value] of Object.entries(record.effects ?? record.metrics ?? {})) effects.append(el('span', '', `${this.t(`metric.${id}`)} +${amount(value)}`));
    if (record.population) effects.append(el('span', '', `♟ +${amount(record.population)} ${this.t('app.population')}`));
    if (record.income) effects.append(el('span', '', `● +${amount(record.income)} ${this.t('app.income')}`));
    for (const [key, value] of Object.entries(record.resources ?? {})) effects.append(el('span', '', `${this.t(`app.${key}`)} +${amount(value)}`));
    if (record.capacity) effects.append(el('span', '', `${this.t('app.capacity')} ${amount(record.capacity)}`));
    if (!effects.children.length) effects.append(el('span', '', this.t('app.explore')));
    this.info.append(effects, el('p', 'radius-label', `◯ ${amount(record.radius ?? 0)} ${this.t('app.radius')}`));
    const actions = el('div', 'info-actions');
    const nextLevel = record.levels?.[instance.level];
    const upgrade = button(nextLevel ? `✦ ${this.t('app.upgrade')} · ● ${nextLevel.cost}` : this.t('app.maxLevel'), 'upgrade', 'primary-button');
    upgrade.disabled = !nextLevel;
    upgrade.onclick = () => this.result(this.engine.upgrade(instance.id));
    const move = button(`↔ ${this.t('app.move')}`, 'move', 'secondary-button');
    move.onclick = () => {
      this.closeInfo(); this.selected = record.id; this.movingId = instance.id; this.placement.hidden = false;
      this.updateGhost({ x: instance.x, z: instance.z }); this.updateCatalogState();
    };
    const remove = button(`↩ ${this.t('app.remove')}`, 'remove', 'secondary-button');
    remove.onclick = () => {
      remove.textContent = this.t('app.removeYes');
      remove.dataset.action = 'remove-yes';
      this.info.append(el('p', '', this.t('app.removeConfirm')));
      remove.onclick = () => { this.closeInfo(); this.result(this.engine.remove(instance.id)); };
    };
    actions.append(upgrade, move, remove); this.info.append(actions);
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
  openModal(titleId, subtitleId) {
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
      if (event.key === 'Escape' && this.engine.state.avatar.created) this.closeModal();
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button,input')].filter(n => !n.disabled && !n.hidden);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { focusable.at(-1).focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { focusable[0].focus(); event.preventDefault(); }
    };
    modal.addEventListener('keydown', this.modalKeyHandler);
    queueMicrotask(() => modal.querySelector('button')?.focus());
    return modal;
  }
  closeModal() {
    this.view.detachAvatarPreview?.();
    this.modalRoot.replaceChildren(); this.root.inert = false;
    this.previousFocus?.focus();
    this.view.setAvatar(this.engine.state.avatar);
  }
  showAvatar() {
    const modal = this.openModal('avatar.title', 'avatar.subtitle');
    modal.classList.add('avatar-modal');
    if (!this.engine.state.avatar.created) modal.querySelector('[data-action=close-modal]').hidden = true;
    const draft = { ...this.engine.state.avatar };
    const preview = el('div', 'avatar-preview');
    modal.append(preview);
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
      field.append(choices); modal.append(field);
    }
    const start = button(this.t('avatar.start'), 'avatar-start', 'primary-button avatar-start');
    start.onclick = () => { this.engine.setAvatar({ ...draft, created: true }); this.closeModal(); this.toast('tutorial.welcome'); };
    modal.append(start);
  }
  showParent() {
    const modal = this.openModal('parent.title', 'parent.subtitle');
    const exportButton = button(`↓ ${this.t('parent.export')}`, 'export', 'primary-button');
    exportButton.onclick = () => {
      const blob = new Blob([this.engine.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = el('a'); anchor.href = url; anchor.download = this.t('parent.exportName'); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), this.data.config.ui.toastMs);
    };
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
    const controls = el('div', 'parent-controls'); controls.append(exportButton, importButton, copy, restart, edit, file);
    modal.append(controls, el('p', '', this.t('parent.importHint')), el('small', '', `${this.t('parent.version')} ${this.engine.state.version}`));
    if (this.dev && this.data.featureFlags.devParts) {
      const dev = button(this.t('dev.parts'), 'dev-parts', 'secondary-button');
      dev.onclick = () => { window.islandApi.grantParts(this.data.world.partGroup, this.data.config.devGrantParts); this.toast('dev.granted'); };
      modal.append(dev);
    }
  }
}
