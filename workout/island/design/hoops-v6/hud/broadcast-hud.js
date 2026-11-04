/** Self-contained, fictional basketball broadcast overlay. No network or Three dependency. */
export function createBroadcastHUD(container, callbacks = {}) {
  const icons = {
    camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    heat: '<path d="M12 2c1 5-3 6-3 9 0 1 1 2 2 2 2 0 2-3 2-4 3 2 5 4 5 7a6 6 0 0 1-12 0c0-5 4-7 6-14Z"/>',
    player: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M8 21v-4m8 4v-4"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    quality: '<path d="m3 12 9-9 9 9-9 9Z"/><path d="m7 12 5-5 5 5-5 5Z"/>',
  };
  const svg = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
  const element = document.createElement('div');
  element.className = 'hv6-hud is-hot';
  element.setAttribute('dir', 'ltr');
  element.innerHTML = `
    <header class="hv6-masthead"><span class="hv6-wordmark">ISLAND <span>COURTSIDE</span></span><span class="hv6-live"><i></i> LIVE</span></header>
    <section class="hv6-scorebug" aria-label="Exhibition game scoreboard">
      <div class="hv6-game-label">EXHIBITION <span>•</span> FINAL QUARTER</div>
      <div class="hv6-score-row">
        <div class="hv6-team hv6-team-home"><span class="hv6-team-name">EMBER</span><span class="hv6-possession" aria-label="Ember possession"></span><strong data-value="home">64</strong></div>
        <div class="hv6-game-time"><span data-value="quarter">Q4</span><strong data-value="clock">02:36</strong></div>
        <div class="hv6-team hv6-team-away"><strong data-value="away">61</strong><span class="hv6-team-name">TIDE</span></div>
        <div class="hv6-shotclock" aria-label="Shot clock"><strong data-value="shotClock">18</strong><span>SHOT</span></div>
      </div>
      <div class="hv6-score-foot"><span><b>● ●</b> 2 TIMEOUTS</span><span>6 ON 6 <i>•</i> ARENA 01</span><span>2 TIMEOUTS <b>● ●</b></span></div>
    </section>
    <div class="hv6-camera-note"><span class="hv6-view-marker"></span><span data-value="cameraLabel">BROADCAST CAMERA</span></div>
    <button class="hv6-quality" type="button" data-action="quality" aria-label="Switch rendering quality" title="Switch rendering quality">${svg('quality')}<span data-value="quality">AUTO</span></button>
    <div class="hv6-heat-wash" aria-hidden="true"></div>
    <section class="hv6-feature" aria-label="Featured fictional player card">
      <div class="hv6-card-topline"><span>PLAYER SPOTLIGHT</span><span>EMBER <i> / </i> GUARD</span></div>
      <div class="hv6-card-main">
        <div class="hv6-jersey" aria-hidden="true"><svg viewBox="0 0 90 100"><path d="M26 8 14 17 5 43l17 7v46h46V50l17-7-9-26-12-9c-1 11-8 16-19 16S27 19 26 8Z" fill="#e8e8e1"/><path d="m26 8-7 6c1 14 12 23 26 23s25-9 26-23l-7-6c-1 11-8 16-19 16S27 19 26 8Z" fill="#23282b"/><path d="M22 49v47h5V48L14 20l-4 12Z M68 49v47h-5V48l13-28 4 12Z" fill="#ee6a32"/><path d="M29 40h32M29 42h32" stroke="#b2b5af" stroke-width="1"/><text x="45" y="73" text-anchor="middle" fill="#242b2e" font-family="Arial,sans-serif" font-weight="900" font-size="30">07</text><path d="M26 92h38" stroke="#a6aaa6" stroke-width="1"/></svg><span>07</span></div>
        <div class="hv6-player-data"><div class="hv6-player-name">PLAYER <b>07</b><span class="hv6-card-rating">92</span></div><div class="hv6-stats"><div><strong>24</strong><span>PTS</span></div><div><strong>6</strong><span>AST</span></div><div><strong>4</strong><span>REB</span></div><div class="hv6-field-goals"><strong>8/12</strong><span>FG</span></div></div></div>
      </div>
      <div class="hv6-heat-strip">${svg('heat')}<strong>ON FIRE</strong><span>3 CONSECUTIVE MAKES</span><div class="hv6-heat-meter"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="hv6-neutral-strip"><span>TONIGHT</span><strong>66.7% <span>FIELD GOALS</span></strong></div>
    </section>
    <div class="hv6-paused" hidden><span>PLAYBACK PAUSED</span></div>
    <nav class="hv6-controls" aria-label="Arena preview controls">
      <button type="button" data-action="camera" aria-label="Switch camera">${svg('camera')}<span>CAMERA</span></button>
      <button type="button" data-action="heat" aria-label="Toggle on fire effect" aria-pressed="true">${svg('heat')}<span>ON FIRE</span></button>
      <button type="button" data-action="stats" aria-label="Show or hide player card" aria-pressed="true">${svg('player')}<span>PLAYER</span></button>
      <button type="button" data-action="pause" aria-label="Pause animation" aria-pressed="false">${svg('pause')}<span>PAUSE</span></button>
    </nav>
    <div class="hv6-hud-caption"><span>FICTIONAL EXHIBITION</span><span>ARENA / V6</span></div>`;
  container.appendChild(element);
  const fields = Object.fromEntries([...element.querySelectorAll('[data-value]')].map(node => [node.dataset.value, node]));
  const buttons = Object.fromEntries([...element.querySelectorAll('[data-action]')].map(node => [node.dataset.action, node]));
  const feature = element.querySelector('.hv6-feature');
  const pauseNotice = element.querySelector('.hv6-paused');
  let hot = true, paused = false, statsVisible = true, camera = 0, quality = 0;
  const abort = new AbortController();
  function write(key, value) {
    if (fields[key] && value !== undefined && fields[key].textContent !== String(value)) fields[key].textContent = String(value);
  }
  function setHeat(value) {
    hot = Boolean(value);
    element.classList.toggle('is-hot', hot);
    buttons.heat.setAttribute('aria-pressed', String(hot));
  }
  function setPaused(value) {
    paused = Boolean(value);
    element.classList.toggle('is-paused', paused);
    pauseNotice.hidden = !paused;
    buttons.pause.setAttribute('aria-pressed', String(paused));
    buttons.pause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
    buttons.pause.innerHTML = `${svg(paused ? 'play' : 'pause')}<span>${paused ? 'RESUME' : 'PAUSE'}</span>`;
  }
  function setStats(value) {
    statsVisible = Boolean(value);
    feature.hidden = !statsVisible;
    buttons.stats.setAttribute('aria-pressed', String(statsVisible));
  }
  element.addEventListener('click', event => {
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (action === 'camera') { camera = (camera + 1) % 3; callbacks.onCamera?.(camera); }
    if (action === 'heat') { setHeat(!hot); callbacks.onHeat?.(hot); }
    if (action === 'pause') { setPaused(!paused); callbacks.onPause?.(paused); }
    if (action === 'stats') { setStats(!statsVisible); callbacks.onStats?.(statsVisible); }
    if (action === 'quality') { quality = (quality + 1) % 3; callbacks.onQuality?.(['auto', 'low', 'high'][quality]); write('quality', ['AUTO', 'ECO', 'HIGH'][quality]); }
  }, {signal: abort.signal});
  return {
    element,
    update(state = {}) {
      for (const key of ['home', 'away', 'clock', 'shotClock', 'quarter', 'cameraLabel']) write(key, state[key]);
      if (state.quality !== undefined) write('quality', String(state.quality).toUpperCase());
      if (state.hot !== undefined && Boolean(state.hot) !== hot) setHeat(state.hot);
      if (state.paused !== undefined && Boolean(state.paused) !== paused) setPaused(state.paused);
      if (state.statsVisible !== undefined && Boolean(state.statsVisible) !== statsVisible) setStats(state.statsVisible);
    },
    setHeat, setPaused, setStats,
    destroy() { abort.abort(); element.remove(); },
  };
}
