const icons = { build: '🏠', upgrade: '✦', collect: '📦', connect: '🛣️', play: '🏅', rescue: '🚨' };
const labels = { build: 'לבנייה', upgrade: 'לשדרוג', connect: 'לחיבור כביש', play: 'למשחק', rescue: 'למשימה' };

function node(tag, className, text = '') {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

function button(text, action, onClick, className) {
  const result = node('button', className, text);
  result.type = 'button';
  result.dataset.action = action;
  result.onclick = onClick;
  return result;
}

export function cityMissionEntry(ui) {
  return button('משימות העיר', 'city-missions-open', () => {
    if (ui.modalRoot.children.length) ui.closeModal();
    ui.cancelPlacement();
    if (ui.missionDetails.hidden) ui.toggleDetails('mission');
    ui.missionToggle.focus();
  }, 'secondary-button city-management-entry');
}

function describeReward(reward, t) {
  return Object.entries(reward).map(([resource, amount]) => `+${amount} ${t(`app.${resource}`)}`).join(' · ');
}

function launch(ui, runtime, entry, definition) {
  if (runtime.current()?.active?.token !== entry.token || ui.engine.isMinigameActive()) return;
  ui.closeDetails();
  ui.cancelPlacement();
  switch (definition.kind) {
    case 'build':
      ui.selectBuilding(entry.target);
      break;
    case 'upgrade': {
      const target = runtime.upgradeTarget(entry.target);
      if (target) {
        ui.view.focusCell(target.x, target.z);
        ui.showInfo(target.id, { manage: true });
      }
      break;
    }
    case 'connect': {
      const cell = runtime.nextRoad();
      if (cell) {
        ui.selectBuilding('road', { manual: true });
        ui.updateGhost(cell, false);
        ui.view.focusCell(cell.x, cell.z);
      }
      break;
    }
    case 'play':
    case 'rescue':
      ui.activityInterface.start(entry.gameId, undefined, entry.stage);
      break;
  }
}

export function renderCityMissions(ui) {
  const runtime = ui.engine.cityMissions;
  const { active, next } = runtime.current() ?? {};
  const current = runtime.definition(active);
  const upcoming = runtime.definition(next);
  const locked = Boolean(active?.gameId && ui.engine.learningStatus().locked);
  const signature = JSON.stringify(['city-missions', active?.token, next?.id, next?.gameId, next?.stage, locked]);
  if (ui.missionSignature !== signature) {
    ui.missionSignature = signature;
    ui.missionObjectiveId = undefined;
    ui.missionToggle.replaceChildren(
      node('span', '', current?.event ? '🚨' : icons[current?.kind] ?? '🏙️'),
      node('strong', '', current?.title ?? 'משימות העיר'),
      node('span', '', '⌄')
    );
    ui.missionToggle.setAttribute('aria-label', current ? `משימת העיר עכשיו · ${current.title}` : 'משימות העיר');
    const board = node('section', 'city-missions');
    board.dataset.cityMissions = '';
    board.setAttribute('aria-label', 'משימות העיר');

    if (current) {
      const card = node('article', 'city-mission');
      card.dataset.missionSlot = 'active';
      card.dataset.missionId = active.id;
      card.append(node('small', '', current.event ? 'אירוע בעיר' : 'עכשיו'),
        node('h3', '', current.title), node('p', 'mission-hint', current.description));
      if (active.gameId) {
        const game = ui.engine.registry.minigames.get(active.gameId);
        card.append(node('p', 'mission-hint', `${ui.t(game.title)} · ${ui.t('minigame.stage', { stage: active.stage })}`));
      }
      if (active.amount > 1) {
        const progress = node('span', 'mission-hint');
        progress.dataset.missionProgress = '';
        card.append(progress);
      }
      card.append(node('p', 'reward', describeReward(current.reward, ui.t)));
      const actions = node('div', 'info-actions');
      if (current.kind !== 'collect') {
        actions.append(button(locked ? 'משימת היום' : labels[current.kind], 'city-mission-go',
          () => launch(ui, runtime, active, current), 'primary-button'));
      }
      if (upcoming || current.event) {
        actions.append(button('דלגו', 'city-mission-skip', () => {
          ui.engine.skipCityMission(active.token);
          ui.missionToggle.focus();
        }, 'secondary-button'));
      }
      if (actions.childElementCount) card.append(actions);
      board.append(card);
    } else {
      board.append(node('p', 'mission-hint', 'אפשר להמשיך לבנות ולשחק. כאן תופיע המשימה הבאה.'));
    }

    if (upcoming) {
      const preview = node('p', 'mission-hint', `אחר כך · ${upcoming.title}`);
      preview.dataset.missionSlot = 'next';
      preview.dataset.missionId = next.id;
      board.append(preview);
    }
    ui.missionDetails.replaceChildren(board);
  }

  if (active?.amount > 1) {
    const progress = ui.missionDetails.querySelector('[data-mission-progress]');
    const status = `${Math.floor(active.progress)} מתוך ${active.amount}`;
    if (progress && progress.textContent !== status) progress.textContent = status;
  }
}

export function announceCityMissionRewards(ui) {
  return ui.engine.subscribe((_, event) => {
    if (!event.cityMissionReward) return;
    const reward = describeReward(event.cityMissionReward, ui.t);
    queueMicrotask(() => ui.toast('cityMissions.earned', { reward }));
  });
}
