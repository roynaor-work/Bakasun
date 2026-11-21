import { LearningInterface } from '../../../learning/interface.mjs?v=island-v2-20261107-21';
import { questionsForAge } from '../../../learning/state.mjs?v=island-v2-20261107-21';
import { CITY_BUILD_REWARD, V2_STATIONS } from './integration-runtime.mjs?v=island-v2-20261107-21';

export { installLearningV2 } from './integration-runtime.mjs?v=island-v2-20261107-21';

// The screen styles load with this module, so `?learningV2=0` leaves the page untouched.
if (globalThis.document?.head && !document.head.querySelector('link[data-learning-v2]')) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.dataset.learningV2 = '';
  css.href = new URL('./integration.css?v=island-v2-20261107-21', import.meta.url).href;
  document.head.append(css);
}

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const button = (text, action, onClick, className = 'learning-answer') => {
  const node = el('button', className, text);
  node.type = 'button';
  node.dataset.action = action;
  node.onclick = onClick;
  return node;
};
// Keep negative signs, fractions and lists in reading order inside Hebrew text.
const numberList = /([−-]?\d+(?:[./]\d+)?%?(?:,\s+[−-]?\d+(?:[./]\d+)?%?)*)/u;

function displayText(node, text, domain) {
  if (domain !== 'math') {
    node.textContent = text;
    return;
  }
  node.replaceChildren(...text.split(numberList).map((part, index) => {
    if (index % 2 === 0) return part;
    const numbers = el('bdi', '', part);
    numbers.dir = 'ltr';
    return numbers;
  }));
}

const CORRECT = 'תְּשׁוּבָה נְכוֹנָה.';
const TRY_AGAIN = 'נַסּוּ שׁוּב.';
const ANSWER = 'הַתְּשׁוּבָה הִיא';
const CHOICES = 'הַתְּשׁוּבוֹת לִבְחִירָה הֵן';

export class LearningV2Interface extends LearningInterface {
  decorateParent(dialog) {
    super.decorateParent(dialog);
    const v2 = this.engine.learningV2;
    const field = el('fieldset', 'learning-age');
    field.append(el('legend', '', 'גיל הילד או הילדה'), el('p', '', 'הגיל קובע את השאלות. רמת הקושי משתנה לפי התשובות.'));
    for (let age = 4; age <= 12; age++) {
      const control = button(String(age), 'learning-age', () => {
        v2.setAge(age);
        for (const choice of field.querySelectorAll('button')) {
          choice.setAttribute('aria-pressed', String(Number(choice.dataset.age) === v2.age()));
        }
      }, 'learning-small');
      control.dataset.age = age;
      control.setAttribute('aria-label', `גיל ${age}`);
      control.setAttribute('aria-pressed', String(v2.age() === age));
      field.append(control);
    }
    dialog.querySelector('.learning-age').replaceWith(field);
  }

  daily() {
    const age = this.engine.learningV2.age();
    if (age < 6) return super.daily();
    const status = this.engine.learningStatus();
    const dialog = this.ui.openModal('learning.daily', 'learning.dailyHint');
    dialog.dataset.dailyMission = 'true';
    dialog.classList.add('learning-daily');
    this.pauseMap();
    const completed = Math.min(status.rounds, status.target);
    const label = status.complete ? 'המשימה הושלמה. אפשר להמשיך ללמוד.'
      : status.locked ? 'משלימים שני סבבים של שמונה שאלות כדי לפתוח את המשחקים.'
        : 'בוחרים תחנה ועונים על שאלות.';
    dialog.querySelector('.modal-subtitle').textContent = label;
    const progress = el('progress');
    progress.max = status.target;
    progress.value = completed;
    progress.setAttribute('aria-label', 'סבבי לימוד היום');
    dialog.append(el('div', 'learning-daily-progress', `📚 ${completed} / ${status.target}`), progress);
    const stations = el('div', 'learning-stations');
    for (const [id, { building, title, icon }] of Object.entries(V2_STATIONS)) {
      const built = this.engine.state.buildings.some(item => item.typeId === building);
      const detail = built ? `${questionsForAge(age)} שאלות` : 'בונים בעיר';
      const control = button(`${icon} ${title}\n${detail}`, 'daily-station', () => {
        if (built) this.start(id);
        else {
          this.ui.closeModal();
          this.ui.openBuildingCatalog(building);
        }
      }, 'learning-station');
      control.dataset.station = id;
      stations.append(control);
    }
    dialog.append(stations);
  }

  addCityHallActivity(actions) {
    if (this.engine.learningV2.age() >= 6) {
      actions.append(button('🌍 ידע כללי וגיאוגרפיה', 'city-learn-general', () => this.start('general'), 'secondary-button'));
    }
  }

  start(station) {
    if (this.engine.learningV2.age() < 6) return super.start(station);
    if (!Object.hasOwn(V2_STATIONS, station) || this.engine.isMinigameActive()) return;
    this.ui.closeInfo();
    this.ui.cancelPlacement();
    this.ui.closeDetails();
    this.ui.setDockOpen(false);
    this.openV2('round', V2_STATIONS[station].title, () => this.engine.learningV2.startRound(station));
  }

  beforeBuild(target, onComplete) {
    const { engine, ui } = this;
    const v2 = engine.learningV2;
    if (!v2.needsBuildingQuestion(target.typeId)
      || !engine.validatePlacement(target.typeId, target.x, target.z).ok) return false;
    const type = ui.getBuilding(target.typeId);
    this.openV2('city', `לפני הבנייה · ${ui.label(type, 'building')}`, () => v2.startBuild(target), onComplete);
    return true;
  }

  openV2(mode, title, begin, onComplete) {
    const { engine, ui, voice } = this;
    const v2 = engine.learningV2;
    const dialog = ui.openModal('learning.title', 'learning.subtitle');
    dialog.classList.add('learning-screen');
    dialog.dataset.learningV2 = mode;
    const close = dialog.querySelector('[data-action=close-modal]');
    close.classList.replace('modal-close', 'learning-close');
    const titleNode = dialog.querySelector('h2');
    titleNode.textContent = title;
    const counter = el('span', 'learning-counter');
    const replay = button('🔊', 'learning-replay', () => this.replayV2(), 'learning-speaker');
    replay.setAttribute('aria-label', 'השמעת השאלה והתשובות');
    replay.disabled = true;
    const header = el('header', 'learning-header');
    header.append(titleNode, counter, replay, close);
    const body = el('div', 'learning-body');
    const feedback = el('div', 'learning-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const footer = el('div', 'learning-footer');
    dialog.replaceChildren(header, body, feedback, footer);
    const viewWasPaused = ui.view.paused;
    ui.view.paused = true;
    ui.modalCleanup = () => {
      voice.stop();
      v2.cancel();
      ui.view.paused = viewWasPaused;
    };
    const active = () => dialog.isConnected;
    const run = async () => {
      feedback.dataset.state = 'loading';
      feedback.textContent = 'טוענים שאלות…';
      footer.replaceChildren();
      try {
        await v2.prepare();
      } catch {
        if (active()) {
          feedback.textContent = 'טעינת השאלות נכשלה. אפשר לנסות שוב.';
          footer.append(button('טעינה מחדש', 'learning-retry', run));
          footer.firstChild.focus();
        }
        return;
      }
      if (!active()) return;
      const started = begin();
      if (!started.ok) {
        feedback.textContent = ui.t(started.reason);
        return;
      }
      replay.disabled = false;
      draw();
    };

    const draw = () => {
      const current = v2.current();
      if (!current || !active()) return;
      const { question } = current;
      dialog.dataset.kind = 'choice';
      dialog.dataset.level = String(question.difficulty);
      dialog.dataset.questionId = question.id;
      counter.textContent = current.mode === 'round' ? `${current.index + 1}/${current.total}` : '';
      const prompt = el('h3', 'learning-prompt');
      displayText(prompt, question.prompt, question.domain);
      prompt.tabIndex = -1;
      prompt.dir = 'auto';
      const answers = el('div', 'learning-answers');
      const controls = question.options.map((value, index) => {
        const control = button('', 'learning-answer', () => answer(index));
        displayText(control, value, question.domain);
        control.dataset.index = index;
        control.dir = 'auto';
        answers.append(control);
        return control;
      });
      body.replaceChildren(prompt, answers);
      feedback.textContent = '';
      feedback.dataset.state = '';
      footer.replaceChildren(button('💡 רמז', 'learning-hint', () => {
        if (!v2.useHint()) return;
        feedback.dataset.state = 'hint';
        displayText(feedback, question.hint, question.domain);
        voice.speak(question.speech.hint);
      }, 'learning-small'));
      if (current.mode === 'round') {
        const building = engine.state.buildings.find(item => item.typeId === V2_STATIONS[current.station].building);
        if (building) {
          const manage = button('ניהול הבניין', 'learning-building', () => {
            ui.closeModal();
            ui.showInfo(building.id, { manage: true });
          }, 'learning-small');
          footer.append(manage);
        }
      } else {
        feedback.textContent = `עונים נכון ומקבלים ${CITY_BUILD_REWARD} מטבעות עם הבנייה.`;
      }
      this.replayV2();
      prompt.focus();

      function answer(index) {
        const result = v2.answer(index);
        if (!result.ok) return;
        if (!result.resolved) {
          controls[index].disabled = true;
          controls.find(control => !control.disabled)?.focus();
          feedback.dataset.state = 'hint';
          displayText(feedback, `אפשר לנסות שוב. ${question.hint}`, question.domain);
          voice.speak(`${TRY_AGAIN} ${question.speech.hint}`);
          return;
        }
        for (const control of controls) control.disabled = true;
        controls[question.answer].dataset.correct = 'true';
        feedback.dataset.state = result.correct ? 'correct' : 'revealed';
        const response = result.correct ? `תשובה נכונה. ${question.explanation}`
          : `התשובה היא ${question.options[question.answer]}. ${question.explanation}`;
        displayText(feedback, response, question.domain);
        const speechResult = result.correct ? CORRECT : `${ANSWER} ${question.speech.options[question.answer]}.`;
        voice.speak(`${speechResult} ${question.speech.explanation}`);
        if (current.mode === 'city' && result.correct) {
          footer.replaceChildren(button('בונים ומקבלים מטבעות', 'learning-build-confirm', () => {
            footer.firstChild.disabled = true;
            const outcome = v2.commitBuild();
            ui.closeModal();
            onComplete(outcome);
            if (outcome.learningReward) ui.toast('learning.v2.cityPaid');
          }));
        } else {
          const next = current.mode === 'city' ? 'לשאלה נוספת' : 'ממשיכים';
          footer.replaceChildren(button(next, 'learning-next', () => {
            const advanced = v2.advance();
            if (!advanced.ok) {
              feedback.textContent = ui.t(advanced.reason);
              return;
            }
            if (advanced.done) showResult(advanced.result);
            else draw();
          }));
        }
        footer.firstChild.focus();
      }
    };

    const showResult = result => {
      const summary = ui.openModal('learning.done', 'learning.doneHint');
      summary.classList.add('learning-result');
      summary.dataset.learningResult = result.station;
      summary.querySelector('.modal-subtitle').textContent = `${result.firstTry} מתוך ${result.total} שאלות בניסיון הראשון, בלי רמז`;
      summary.append(
        el('div', 'learning-result-stars', '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars)),
        el('div', 'learning-result-money', `🪙 +${result.money}`),
        button('📚 משימת היום', 'learning-result-daily', () => this.daily()),
        button('חזרה לעיר', 'learning-result-map', () => ui.closeModal(), 'learning-small'),
      );
      ui.modalCleanup = () => voice.stop();
      voice.speak('כָּל הַכָּבוֹד. סִיַּמְתֶּם אֶת הַסֶּבֶב.');
    };

    void run();
  }

  dispose() {
    this.engine.learningV2.cancel();
    super.dispose();
  }

  replayV2() {
    const question = this.engine.learningV2.current()?.question;
    if (question) this.voice.speak(`${question.speech.prompt} ${CHOICES}. ${question.speech.options.join('. ')}.`);
  }
}
