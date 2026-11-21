import { kidUxStyle, localHebrewVoices } from '../kid-ux.mjs?v=island-v2-20261107-22';

// Each scene connects a visible control and its gesture with a visible game outcome.
const steps = {
  soccer: [
    ['drag', '🕹️', '🏃', '⚽', 'גִּרְרוּ אֶת הָעִגּוּל וְרוּצוּ אֶל הַכַּדּוּר.'],
    ['tap', '⚽', '⚽', '🥅', 'גַּעֲוּ בִּבְעִיטָה כְּדֵי לִבְעֹט לַשַּׁעַר.'],
    ['tap', '↗', '⚽', '👟', 'גַּעֲוּ בִּמְסִירָה כְּדֵי לִמְסֹר לְחָבֵר.'],
  ],
  tennis: [
    ['drag', '🕹️', '🏃', '🎾', 'גִּרְרוּ אֶת הָעִגּוּל כְּדֵי לְהִתְקָרֵב לַכַּדּוּר.'],
    ['hold', '🎾', '🎾', '🏟️', 'הַחֲזִיקוּ אֶת הַמַּחְבֵּט וְשַׁחְרְרוּ כְּשֶׁמַּגִּיעַ הַכַּדּוּר.'],
    ['double', '⇧', '🎾', '🟢', 'בַּהַגָּשָׁה, גַּעֲוּ פַּעַם לִזְרֹק וּפַעַם לַחֲבֹט כְּשֶׁהַמַּד יָרֹק.'],
  ],
  streetSlam: [
    ['drag', '🕹️', '🏃', '🏀', 'גִּרְרוּ בְּצַד שְׂמֹאל כְּדֵי לָרוּץ.'],
    ['tap', '↗', '🏀', '🙌', 'גַּעֲוּ בִּמְסִירָה כְּדֵי לִמְסֹר לְחָבֵר קָרוֹב.'],
    ['hold', '🏀', '🏀', '🏀', 'הַחֲזִיקוּ אֶת כַּפְתּוֹר הַזְּרִיקָה וְשַׁחְרְרוּ כְּשֶׁהַמַּד יָרֹק.', '⛹️‍♂️'],
  ],
  islandRacing: [
    ['drag', '🕹️', '🏎️', '🏁', 'הַמְּכוֹנִית מַאֲצָה לְבַד. גִּרְרוּ אֶת הַהֶגֶה לְכִוּוּן הַמַּסְלוּל.'],
    ['hold', '■', '🏎️', '🛑', 'הַחֲזִיקוּ אֶת הַבֶּלֶם כְּדֵי לְהָאֵט בַּפְּנִיָּה.'],
    ['tap', '⚡', '🏎️', '💨', 'גַּעֲוּ בַּבָּרָק כְּדֵי לְהָאִיץ בַּיְּשֹׁרֶת.'],
  ],
  boarDefense: [
    ['drag', '🕹️', '🎯', '🐗', 'גִּרְרוּ מִצַּד שְׂמֹאל כְּדֵי לְכַוֵּן.'],
    ['hold', '⊕', '✨', '🎯', 'הַחֲזִיקוּ אֶת כַּפְתּוֹר הַיֶּרִי בְּצַד יָמִין.'],
    ['tap', '🛠️', '🔧', '🛡️', 'בַּמּוּסָךְ בּוֹחֲרִים צִיּוּד לַגַּל הַבָּא.'],
  ],
  alienDefense: [
    ['drag', '🕹️', '🚀', '⭐', 'גִּרְרוּ כְּדֵי לְהָזִיז אֶת הַחֲלָלִית.'],
    ['hold', '⊕', '✨', '🛸', 'הַחֲזִיקוּ אֶת הַיֶּרִי כְּדֵי לִפְגֹּעַ בַּחֲלָלִיּוֹת.'],
    ['tap', '✦', '💫', '🛸', 'גַּעֲוּ בַּכּוֹכָב כְּדֵי לְהַפְעִיל יֶרִי מְיֻחָד.'],
  ],
  fireRescue: [
    ['tap', '🔥', '🚒', '🔥', 'גַּעֲוּ בָּאֵשׁ וְהַכַּבָּאִית תִּסַּע אֵלֶיהָ.'],
    ['hold', '💧', '💦', '🔥', 'הַחֲזִיקוּ רִסּוּס כְּשֶׁאַתֶּם לְיַד הָאֵשׁ.', '✔'],
    ['tap', '🚰', '🚒', '🚰', 'גַּעֲוּ בַּבֶּרֶז כְּדֵי לְמַלֵּא מַיִם.'],
  ],
  navalDuel: [
    ['drag', '🕹️', '⛵', '🌊', 'גִּרְרוּ אֶת הָעִגּוּל כְּדֵי לְהַשִּׁיט אֶת הַסְּפִינָה.'],
    ['tap', '🎯', '⊕', '⛴️', 'גַּעֲוּ בַּסְּפִינָה הַשְּׁנִיָּה כְּדֵי לִבְחֹר אוֹתָהּ.'],
    ['hold', '⊕', '●', '⛴️', 'הַחֲזִיקוּ, גִּרְרוּ כְּדֵי לְכַוֵּן וְשַׁחְרְרוּ כְּדֵי לִירוֹת.'],
  ],
  alpineRush: [
    ['drag', '🕹️', '🏂', '⛷️', 'גִּרְרוּ לַצַּד כְּדֵי לִפְנוֹת עִם הַגַּלְשָׁן.'],
    ['tap', '⚡', '🏂', '💨', 'גַּעֲוּ בַּבָּרָק כְּדֵי לְהָאִיץ.'],
    ['tap', '⟳', '🏂', '✨', 'כְּשֶׁאַתֶּם בָּאֲוִיר, גַּעֲוּ בְּכַפְתּוֹר הַתַּרְגִּיל.'],
  ],
  catchCriminal: [
    ['drag', '🕹️', '🚓', '🏎️', 'גִּרְרוּ יָמִינָה וּשְׂמֹאלָה כְּדֵי לִנְהֹג.'],
    ['tap', '⊕', '◉', '🚙', 'כְּשֶׁהָעִגּוּל יָרֹק, גַּעֲוּ בְּכַפְתּוֹר הַיֶּרִי.'],
    ['hold', '🕸️', '🕸️', '🏃', 'הַחֲזִיקוּ, כַּוְּנוּ אֶת הָרֶשֶׁת וְשַׁחְרְרוּ.'],
  ],
};

const guideCSS = `
  .modal.modal[data-kid-ux-help] { padding: 14px; width: min(660px, 100%); }
  .modal[data-kid-ux-help] > h2 {
    display: flex; align-items: center; min-height: 46px;
    margin-inline: 76px 120px; font-size: 20px;
  }
  .modal[data-kid-ux-help] > .modal-subtitle { display: none; }
  .modal[data-kid-ux-help] > [data-action="shell-install"] {
    position: absolute; inset: auto; inset-block-start: 7px; inset-inline-end: 70px;
    min-width: 44px; min-height: 44px;
  }
  .kid-ux-guide { padding: 8px; border: 1px solid #95b8b5; border-radius: 14px; background: #132e36; color: #fff8e8; }
  .kid-ux-demo { display: grid; grid-template-columns: minmax(64px, 120px) minmax(156px, 226px); justify-content: center; align-items: center; gap: 18px; min-height: 90px; direction: ltr; }
  .kid-ux-demo-input, .kid-ux-demo-field { position: relative; display: grid; align-items: center; justify-items: center; width: 100%; height: 86px; border-radius: 14px; background: #214751; overflow: hidden; }
  .kid-ux-demo-control { display: grid; place-items: center; background: #fff2cb; color: #173139; width: 52px; height: 52px; border-radius: 50%; font-size: 26px; }
  .kid-ux-demo-finger { position: absolute; inset: 48% auto auto 46%; font-size: 26px; transform: translate(6px, 8px); filter: drop-shadow(1px 1px 2px #0b262b); }
  .kid-ux-demo-trail { position: absolute; inset: auto 24% 5px; height: 5px; border-radius: 8px; background: #d6ff91; transform-origin: left; opacity: .85; }
  .kid-ux-demo-field { grid-template-columns: 1fr 1fr 1fr; background: #214751; font-size: 29px; }
  .kid-ux-demo-flight { position: relative; color: #ffed9f; }
  .kid-ux-demo-target { position: relative; }
  .kid-ux-demo-success { position: absolute; inset: 0 8px auto auto; color: #c7ff88; font-size: 22px; }
  .kid-ux-demo-caption { min-height: 22px; margin-block: 5px 1px; font-size: 15px; line-height: 1.35; text-align: center; }
  .kid-ux-guide-steps, .kid-ux-intro-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: center; }
  .kid-ux-guide-steps > span { font-size: 15px; }
  .kid-ux-guide button, .kid-ux-intro-actions button { min-width: 44px; min-height: 44px; padding-inline: 12px; font-size: 15px; }
  .kid-ux-guide button { background: #fff2cb; color: #173139; }
  .kid-ux-guide button:disabled { opacity: .62; }
  .kid-ux-intro-actions { position: sticky; bottom: -14px; z-index: 2; padding-block: 6px; background: #16313b; border-radius: 10px; }
  .kid-ux-intro-actions .secondary-button { background: #fff2cb; color: #173139; }
  .kid-ux-intro-actions .primary-button { background: #126b60; color: #fff8e8; }
  .kid-ux-intro-details { padding: 4px 2px; font-size: 14px; }
  .kid-ux-intro-details summary { display: flex; align-items: center; min-width: 44px; min-height: 44px; cursor: pointer; }
  .kid-ux-intro-details .game-help-lines { margin: 8px 0; }
  .kid-ux-intro-details .game-help-lines p { font-size: 14px; }
  @media(max-width: 500px) {
    .modal[data-kid-ux-help] > h2 { margin-block-start: 54px; margin-inline: 0; }
  }
`;
kidUxStyle('005', guideCSS);

const replayCSS = `
  .modal[data-intro] [data-action="game-help-again"] { min-width: 44px; min-height: 44px; font-size: 15px; }
  .kid-ux-help-feedback { color: #fff8e8; background: #16313b; text-align: center; padding: 6px; font-size: 14px; }
  .kid-ux-help-feedback:empty { display: none; }
  .modal[data-kid-ux-help] > .ik-opening-small { display: none; }
`;
kidUxStyle('006', guideCSS + replayCSS);

const node = (tag, className, text = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};

export function gameGuide(gameId) {
  const scenes = steps[gameId];
  if (!scenes) return null;
  const guide = node('section', 'kid-ux-guide');
  guide.setAttribute('aria-label', 'הדגמת המשחק');
  const animation = node('div', 'kid-ux-demo');
  animation.setAttribute('aria-hidden', 'true');
  const caption = node('p', 'kid-ux-demo-caption');
  caption.setAttribute('aria-live', 'polite');
  const navigation = node('div', 'kid-ux-guide-steps');
  const previous = node('button', '', '→');
  const next = node('button', '', '←');
  const count = node('span', '');
  count.dir = 'ltr';
  previous.type = next.type = 'button';
  previous.dataset.kidUxPrevious = '';
  next.dataset.kidUxNext = '';
  previous.setAttribute('aria-label', 'הצעד הקודם');
  next.setAttribute('aria-label', 'הצעד הבא');
  navigation.append(previous, count, next);
  guide.append(animation, caption, navigation);
  let step = 0;

  const show = () => {
    const [gesture, controlName, actor, target, sentence, outcome = '✓'] = scenes[step];
    guide.dataset.kidUxStep = String(step + 1);
    const control = node('span', 'kid-ux-demo-control', controlName);
    const finger = node('span', 'kid-ux-demo-finger', '👆');
    const trail = node('span', 'kid-ux-demo-trail');
    const gesturePanel = node('div', 'kid-ux-demo-input');
    gesturePanel.append(control, trail, finger);
    const field = node('div', 'kid-ux-demo-field');
    const flight = node('span', 'kid-ux-demo-flight', gesture === 'drag' ? '⇢' : '⟶');
    const targetNode = node('span', 'kid-ux-demo-target', target);
    const success = node('span', 'kid-ux-demo-success', outcome);
    const actorNode = node('span', '', actor);
    field.append(actorNode, flight, targetNode, success);
    animation.replaceChildren(gesturePanel, field);
    caption.textContent = sentence;
    count.textContent = `${step + 1} / ${scenes.length}`;
    previous.disabled = step === 0;
    next.disabled = step === scenes.length - 1;
    if (!finger.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const move = gesture === 'drag' ? 'translate(33px, -4px)' : 'translate(0, -10px) scale(.83)';
    const tap = { transform: move, offset: .39 };
    const release = { transform: 'translate(6px, 8px)', offset: .60 };
    const gestureFrames = [{ transform: 'translate(6px, 8px)' }, tap, release];
    if (gesture === 'double') {
      gestureFrames.push({ transform: move, offset: .69 });
    }
    if (gesture === 'hold') {
      tap.offset = .22;
      gestureFrames.splice(2, 0, { transform: move, offset: .58 });
    }
    gestureFrames.push({ transform: 'translate(6px, 8px)' });
    const timing = { duration: 2200, iterations: Infinity, easing: 'ease-in-out' };
    finger.animate(gestureFrames, timing);
    trail.animate([{ transform: 'scaleX(.05)' }, { transform: 'scaleX(1)', offset: .58 }, { transform: 'scaleX(1)' }], timing);
    actorNode.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(0)', offset: .58 }, { transform: 'translateX(90%)', offset: .82 }, { transform: 'translateX(90%)' }], timing);
    success.animate([{ opacity: 0 }, { opacity: 0, offset: .78 }, { opacity: 1, offset: .84 }, { opacity: 1 }], timing);
  };
  previous.onclick = () => { if (step > 0) { step--; show(); } };
  next.onclick = () => { if (step < scenes.length - 1) { step++; show(); } };
  show();
  return { node: guide, sentence: () => scenes[step][4] };
}

export function helpReplay({ dialog, gameId, guide, play, again, isMuted, readText }) {
  again.textContent = '🔊 לשמוע הוראות';
  const feedback = node('p', 'kid-ux-help-feedback');
  feedback.setAttribute('role', 'status');
  again.after(feedback);
  let current;

  function showGuide(message) {
    feedback.textContent = message;
    if (guide) return;
    guide = gameGuide(gameId);
    if (!guide) return;
    const lines = dialog.querySelector('.game-help-lines');
    const details = node('details', 'kid-ux-intro-details');
    details.append(node('summary', '', 'הוראות נוספות'), lines);
    const actions = node('div', 'kid-ux-intro-actions');
    actions.append(play, again, feedback);
    dialog.dataset.kidUxHelp = '';
    dialog.append(guide.node, details, actions);
  }

  function stop() {
    if (!current) return;
    current = null;
    try { globalThis.speechSynthesis.cancel(); } catch {}
  }

  again.onclick = () => {
    stop();
    if (isMuted()) {
      showGuide('הצליל כבוי. אפשר לצפות בהדגמה.');
      return;
    }
    try {
      const synthesis = globalThis.speechSynthesis;
      const hebrew = localHebrewVoices(synthesis);
      if (!hebrew.length || !globalThis.SpeechSynthesisUtterance) {
        showGuide('אין קול עברי זמין. אפשר לצפות בהדגמה.');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(guide?.sentence() ?? readText());
      utterance.lang = 'he-IL';
      utterance.voice = hebrew[0];
      utterance.rate = .86;
      utterance.onend = () => { if (current === utterance) current = null; };
      utterance.onerror = () => {
        if (current !== utterance) return;
        current = null;
        showGuide('ההקראה לא זמינה. אפשר לצפות בהדגמה.');
      };
      current = utterance;
      feedback.textContent = '';
      synthesis.speak(utterance);
    } catch {
      current = null;
      showGuide('ההקראה לא זמינה. אפשר לצפות בהדגמה.');
    }
  };
  dialog.querySelector('.sound-toggle')?.addEventListener('click', () => {
    if (isMuted()) stop();
  });
  return stop;
}

kidUxStyle('015', `
  .modal [data-kid-ux-soccer-league-help] p {
    font-size: 14px;
    color: #fff8e8;
  }
`);
