/* Local showcase only: no imports, fetch, storage, analytics, or game logic. */
(() => {
  'use strict';
  const dialog = document.getElementById('game-dialog');
  const intro = document.getElementById('dialog-intro');
  const result = document.getElementById('dialog-result');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let opener;

  function replay(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function showIntro() {
    intro.hidden = false;
    result.hidden = true;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.scrollTop = 0;
    replay(intro, 'ik-enter');
  }

  document.querySelectorAll('[data-game]').forEach(button => {
    button.addEventListener('click', () => {
      opener = button;
      document.getElementById('dialog-title').textContent = button.dataset.name;
      document.getElementById('dialog-category').textContent = button.dataset.category;
      document.getElementById('dialog-instruction').textContent = button.dataset.instruction;
      document.getElementById('dialog-art').src = `intro/${button.dataset.game}.svg`;
      showIntro();
      dialog.showModal();
      document.getElementById('dialog-close').focus();
    });
  });
  ['dialog-close', 'dialog-back', 'dialog-menu'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('close', () => opener?.focus());
  document.getElementById('dialog-start').addEventListener('click', () => {
    intro.hidden = true;
    result.hidden = false;
    dialog.setAttribute('aria-labelledby', 'dialog-result-title');
    dialog.scrollTop = 0;
    replay(result, 'ik-enter');
    replay(document.getElementById('dialog-stars'), 'ik-stars-enter');
    document.getElementById('dialog-result-title').focus();
  });
  document.getElementById('dialog-again').addEventListener('click', () => {
    showIntro();
    document.getElementById('dialog-start').focus();
  });

  document.querySelectorAll('.button-board button:not(:disabled)').forEach(button => {
    button.addEventListener('click', () => {
      const label = button.textContent.trim() || 'הגדרות';
      document.getElementById('button-status').textContent = `לחיצה לדוגמה: ${label}.`;
    });
  });

  document.getElementById('rating-count').addEventListener('change', event => {
    const stars = Number(event.target.value);
    const rating = document.querySelector('[data-rating]');
    rating.setAttribute('aria-label', `${stars} מתוך 3 כוכבים`);
    rating.querySelectorAll('img').forEach((image, index) => {
      image.src = `rewards/star-${index < stars ? 'filled' : 'empty'}.svg`;
    });
    document.querySelector('[data-result-title]').textContent = stars ? 'כל הכבוד!' : 'עוד ניסיון, עוד צעד.';
    document.querySelector('[data-result-description]').textContent = stars ? 'עוד צעד בדרך לאליפות.' : 'מוכנים לנסות שוב?';
    document.getElementById('rating-status').textContent = `מוצגים ${stars} מתוך 3 כוכבים.`;
    replay(rating, 'ik-stars-enter');
  });
  document.getElementById('result-replay').addEventListener('click', () => {
    replay(document.getElementById('result-example'), 'ik-enter');
    replay(document.querySelector('[data-rating]'), 'ik-stars-enter');
  });
  document.getElementById('motion-replay').addEventListener('click', () => {
    replay(document.getElementById('motion-sample'), 'ik-enter');
    replay(document.getElementById('motion-stars'), 'ik-stars-enter');
  });
  function updateMotionPreference() {
    document.getElementById('motion-preference').textContent = reducedMotion.matches
      ? 'תנועה מופחתת פעילה — הכול מופיע מיד.'
      : 'כניסה: 240ms · כוכבים: 280ms';
  }
  reducedMotion.addEventListener('change', updateMotionPreference);
  updateMotionPreference();
})();
