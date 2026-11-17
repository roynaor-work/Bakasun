/* Standalone presentation controller. Does not import, score or modify the game. */
(() => {
  'use strict';
  function create(root, options = {}) {
    const config = options.config || window.TENNIS_UI_V2_CONFIG;
    if (!root || !config) throw new Error('TennisUIV2 needs a HUD root and config');
    const base = (options.assetBase || '.').replace(/\/$/, '');
    const find = selector => root.querySelector(selector);
    const meter = find('[data-meter]');
    const needle = find('[data-meter-needle]');
    const halo = find('[data-lock-halo]');
    const choices = find('[data-placement-choices]');
    const marker = find('[data-placement-marker]');
    const copy = find('[data-event-copy]');
    const phaseLabel = find('[data-phase-label]');
    const buttons = Object.fromEntries(config.controls.map(c => [c.id, find(`[data-action="${c.id}"]`)]));
    const disposers = [];
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let motionOverride = null;
    let format = 'svg';
    let state = 'hidden', phase = 'rally', position = .5, manual = false;
    let clock = 0, previous = null, raf = 0, lockedAt = 0, removed = true;
    let paused = false, destroyed = false, braking = false, placement = 1, placementOpen = false;
    let serveHadFocus = false;
    let effects = [], sequence = 0;
    const taps = new Map();
    const pointerPresses = new Map(), keyPresses = new Set();
    const reduced = () => motionOverride === null ? media.matches : motionOverride;
    const url = id => `${base}/${config.assets[id][format]}`;
    const listen = (target, event, fn, opts) => {
      target.addEventListener(event, fn, opts);
      disposers.push(() => target.removeEventListener(event, fn, opts));
    };
    const notify = () => root.dispatchEvent(new CustomEvent('tennis-ui-state', {detail:snapshot()}));
    function snapshot() {
      return {state, phase, position, placement, placementOpen, paused, reducedMotion:reduced(),
              braking, clockMs:clock, effectCount:effects.length, running:!!raf};
    }
    function drawPosition() {
      const y = 14 + 148 * position;
      needle.style.transform = `translateY(${y - 6}px)`;
      halo.style.top = `${y - 12}px`;
      meter.setAttribute('aria-valuenow', String(Math.round(position * 100)));
      meter.setAttribute('aria-valuetext', `${Math.round(position * 100)}%`);
    }
    function drawControls() {
      for (const control of config.controls) {
        const button = buttons[control.id];
        const selected = control.id === 'placement' && placementOpen || control.id === 'brake' && braking;
        const pressed = selected || pointerPresses.has(control.id) || keyPresses.has(control.id)
          || (taps.get(control.id) || 0) > clock || control.id === 'serve' && state === 'locked';
        const visual = button.disabled ? 'disabled' : pressed ? 'pressed' : 'idle';
        // Lock retains the pressed visual while disabling repeat activation.
        const shown = control.id === 'serve' && state === 'locked' ? 'pressed' : visual;
        button.dataset.state = shown;
        const image = button.querySelector('img');
        const next = url(control.states[shown]);
        if (image.getAttribute('src') !== next) image.setAttribute('src', next);
      }
    }
    function setState(next) {
      state = next;
      root.dataset.serveState = next;
      meter.dataset.state = next;
      meter.setAttribute('aria-hidden', String(next === 'hidden'));
      notify();
    }
    function setPlacementOpen(value, restoreFocus = false) {
      placementOpen = value;
      choices.hidden = !value;
      buttons.placement.setAttribute('aria-pressed', String(value));
      buttons.placement.setAttribute('aria-expanded', String(value));
      drawControls();
      if (restoreFocus) buttons.placement.focus({preventScroll:true});
    }
    function choosePlacement(index) {
      placement = Math.max(0, Math.min(2, index));
      marker.style.left = `${[42,50,58][placement]}%`;
      choices.querySelectorAll('[data-placement]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.placement) === placement)));
      options.onAction?.({id:'placement', index:placement});
    }
    function setBraking(value) {
      if (braking === value) return;
      braking = value;
      buttons.brake.setAttribute('aria-pressed', String(value));
      drawControls();
      options.onAction?.({id:'brake', held:value});
    }
    function enterRally() {
      phase = 'rally';
      root.dataset.phase = phase;
      setPlacementOpen(false);
      marker.hidden = true;
      const active = document.activeElement;
      const transferFocus = active === buttons.serve || serveHadFocus && active === document.body;
      serveHadFocus = false;
      buttons.serve.closest('.control').hidden = true;
      for (const id of ['slice','drop','smash']) buttons[id].disabled = false;
      phaseLabel.textContent = 'הראלי ממשיך';
      drawControls();
      if (transferFocus) buttons.smash.focus({preventScroll:true});
    }
    function clearEffects() {
      for (const fx of effects) fx.node.remove();
      effects = [];
      copy.textContent = '';
    }
    function startServe() {
      if (destroyed) return;
      clearEffects();
      taps.clear();
      pointerPresses.clear(); keyPresses.clear();
      setBraking(false);
      serveHadFocus = false;
      phase = 'serve';
      root.dataset.phase = phase;
      manual = false;
      removed = false;
      position = reduced() ? .5 : .28;
      meter.hidden = false;
      marker.hidden = false;
      buttons.serve.closest('.control').hidden = false;
      buttons.serve.disabled = false;
      for (const id of ['slice','drop','smash']) buttons[id].disabled = true;
      setPlacementOpen(false);
      phaseLabel.textContent = 'ההגשה שלך';
      drawPosition();
      setState('moving');
      drawControls();
      wake();
    }
    function setPosition(value) {
      if (!Number.isFinite(value)) throw new TypeError('Position must be finite');
      if (state !== 'moving') return;
      manual = true;
      position = Math.max(0, Math.min(1, value));
      drawPosition();
      notify();
    }
    function lockServe(value) {
      if (destroyed || paused || document.hidden || state !== 'moving') return;
      if (value !== undefined) setPosition(value);
      lockedAt = clock;
      // Disabling a focused native button can blur it before the hide transition.
      serveHadFocus = document.activeElement === buttons.serve;
      buttons.serve.disabled = true;
      phaseLabel.textContent = 'ההגשה ננעלה';
      setPlacementOpen(false);
      setState('locked');
      drawControls();
      // Capture exactly the displayed value. Never resample after the click.
      options.onServe?.({position, placement});
      wake();
    }
    function endServe() {
      if (destroyed) return;
      clearEffects();
      taps.clear();
      pointerPresses.clear(); keyPresses.clear();
      removed = true;
      meter.hidden = true;
      setState('hidden');
      enterRally();
      wake();
    }
    function playEffect(id, point = {x:.5,y:.59}) {
      if (destroyed) return;
      const spec = config.effects.find(fx => fx.id === id);
      if (!spec) throw new Error(`Unknown effect: ${id}`);
      // Bounded pool: rapid demo taps cannot grow the overlay without limit.
      if (effects.length >= 6) effects.shift().node.remove();
      const node = document.createElement('img');
      node.className = 'contact-fx';
      node.alt = '';
      node.src = url(spec.asset);
      node.style.width = node.style.height = `${spec.sizePx}px`;
      node.style.left = `${point.x * 100}%`;
      node.style.top = `${point.y * 100}%`;
      node.dataset.effect = id;
      node.dataset.sequence = String(++sequence);
      find('[data-effects]').append(node);
      const fx = {node,spec,startedAt:clock};
      effects.push(fx);
      copy.textContent = spec.labelHe;
      renderEffect(fx);
      wake();
    }
    function renderEffect(fx) {
      const age = clock - fx.startedAt, t = Math.min(1,age / fx.spec.durationMs);
      const scale = reduced() ? 1 : fx.spec.scale[0] + (fx.spec.scale[1] - fx.spec.scale[0]) * (1 - (1-t)**3);
      const angle = reduced() ? 0 : fx.spec.rotateDeg * t;
      fx.node.style.transform = `translate(-50%,-50%) scale(${scale}) rotate(${angle}deg)`;
      fx.node.style.opacity = String(reduced() || !fx.spec.fadeOutMs ? 1 : Math.min(1,(fx.spec.durationMs-age)/fx.spec.fadeOutMs));
    }
    function tick(timestamp) {
      raf = 0;
      if (destroyed || paused || document.hidden) { previous = null; return; }
      if (previous !== null) clock += Math.max(0,timestamp - previous);
      previous = timestamp;
      if (state === 'moving' && !manual && !reduced()) {
        position = .5 + .44 * Math.sin(clock * Math.PI * 2 / config.meter.cycleMs - Math.PI/6);
        drawPosition();
      }
      if (state === 'locked' && clock - lockedAt >= config.meter.lockHoldMs) {
        setState('hidden');
        enterRally();
      }
      if (state === 'hidden' && !removed && clock - lockedAt >= config.meter.hiddenAtMsAfterLock) {
        meter.hidden = true;
        removed = true;
      }
      for (const fx of effects) {
        if (clock - fx.startedAt >= fx.spec.durationMs) fx.node.remove();
        else renderEffect(fx);
      }
      effects = effects.filter(fx => fx.node.isConnected);
      const label = effects.length ? effects[effects.length-1].spec.labelHe : '';
      // Preserve the live region node until the actual event changes.
      if (copy.textContent !== label) copy.textContent = label;
      for (const [id,until] of taps) if (until <= clock) taps.delete(id);
      drawControls();
      if (state === 'moving' && !manual && !reduced() || state === 'locked' || state === 'hidden' && !removed || effects.length || taps.size) wake();
      else previous = null;
    }
    function wake() {
      if (!raf && !paused && !document.hidden && !destroyed) raf = requestAnimationFrame(tick);
    }
    function setPaused(value) {
      paused = !!value;
      root.dataset.paused = String(paused);
      previous = null;
      if (paused && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (paused) { pointerPresses.clear(); keyPresses.clear(); setBraking(false); drawControls(); }
      else wake();
      notify();
    }
    function updateMotion() {
      root.dataset.reducedMotion = String(reduced());
      if (reduced() && state === 'moving' && !manual) { position = .5; drawPosition(); }
      for (const fx of effects) renderEffect(fx);
      notify(); wake();
    }
    function setReducedMotion(value) {
      motionOverride = value === null ? null : !!value;
      updateMotion();
    }
    function setFormat(value) {
      if (!['svg','png'].includes(value)) throw new Error('Use svg or png');
      format = value;
      find('[data-meter-track]').src = url('meter-track');
      needle.src = url('meter-needle');
      for (const fx of effects) fx.node.src = url(fx.spec.asset);
      drawControls();
    }
    function action(id) {
      if (paused || document.hidden || buttons[id].disabled || buttons[id].closest('.control').hidden) return;
      if (id === 'serve') return lockServe();
      if (id === 'placement') { setPlacementOpen(!placementOpen); return; }
      if (id === 'brake') return;
      taps.set(id,clock+140); drawControls(); wake();
      options.onAction?.({id});
    }
    for (const [id,button] of Object.entries(buttons)) {
      listen(button,'click',() => action(id));
      listen(button,'pointerdown',event => {
        if (paused || button.disabled || event.button !== 0) return;
        if (id === 'brake') {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          setBraking(true);
        } else { pointerPresses.set(id,event.pointerId); drawControls(); }
      });
    }
    for (const event of ['pointerup','pointercancel']) listen(document,event,ev => {
      for (const [id,pointerId] of pointerPresses) if (pointerId === ev.pointerId) pointerPresses.delete(id);
      drawControls();
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) listen(buttons.brake,event,() => setBraking(false));
    listen(window,'blur',() => { pointerPresses.clear(); keyPresses.clear(); setBraking(false); drawControls(); });
    listen(choices,'click',event => {
      const button = event.target.closest('[data-placement]');
      if (!button || paused) return;
      choosePlacement(Number(button.dataset.placement));
      setPlacementOpen(false,true);
    });
    const editable = element => element?.closest('input,textarea,select,[contenteditable="true"]');
    listen(document,'keydown',event => {
      if (event.defaultPrevented || editable(event.target) || event.ctrlKey || event.altKey || event.metaKey || paused) return;
      if (event.target.closest('button,a') && !root.contains(event.target)) return;
      if (event.repeat) return;
      if (event.key === 'Escape' && placementOpen) { setPlacementOpen(false,true); event.preventDefault(); return; }
      if (placementOpen && ['ArrowLeft','ArrowRight'].includes(event.key)) {
        choosePlacement(placement + (event.key === 'ArrowLeft' ? -1 : 1));
        event.preventDefault(); return;
      }
      const onButton = event.target.closest('[data-action]');
      const brakeSpace = onButton === buttons.brake && [' ','Enter'].includes(event.key);
      if (brakeSpace || event.key.toLowerCase() === 'b') {
        event.preventDefault(); if (!buttons.brake.disabled) setBraking(true); return;
      }
      // Native button Space/Enter activation is allowed, avoiding duplicate clicks.
      if (event.target.closest('button') && [' ','Enter'].includes(event.key)) {
        if (onButton && !onButton.disabled) { keyPresses.add(onButton.dataset.action); drawControls(); }
        return;
      }
      const id = {' ':'serve',s:'slice',d:'drop',x:'smash',a:'placement'}[event.key.toLowerCase()];
      if (id) { event.preventDefault(); action(id); }
    });
    listen(document,'keyup',event => {
      if (event.key.toLowerCase() === 'b' || event.target === buttons.brake && [' ','Enter'].includes(event.key)) setBraking(false);
      if ([' ','Enter'].includes(event.key)) { keyPresses.clear(); drawControls(); }
    });
    listen(document,'visibilitychange',() => {
      previous = null;
      if (document.hidden) { pointerPresses.clear(); keyPresses.clear(); setBraking(false); drawControls(); if (raf) cancelAnimationFrame(raf); raf = 0; }
      else wake();
    });
    listen(media,'change',updateMotion);
    function destroy() {
      if (destroyed) return;
      setBraking(false);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearEffects();
      meter.hidden = true;
      buttons.serve.closest('.control').hidden = true;
      marker.hidden = true;
      choices.hidden = true;
      for (const button of Object.values(buttons)) button.disabled = true;
      for (const dispose of disposers) dispose();
      destroyed = true;
    }
    updateMotion();
    startServe();
    return Object.freeze({startServe,setPosition,lockServe,endServe,playEffect,setPaused,setReducedMotion,setFormat,
                          choosePlacement,snapshot,destroy});
  }
  window.TennisUIV2 = Object.freeze({create});
})();
