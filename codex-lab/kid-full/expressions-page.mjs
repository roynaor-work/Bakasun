import './scene.mjs';
import { EXPRESSION_LIST } from './parts/expressions.mjs';

for (const { id, description, parameters } of EXPRESSION_LIST) {
  const row = document.querySelector(`[data-expression-row="${id}"]`);
  row.querySelector('td p').textContent = description;
  const { eyeOpen, browRaise, mouthOpen } = parameters;
  row.querySelector('[data-parameters]').textContent = `פתיחת עיניים ${eyeOpen.toFixed(2)} · הרמת גבות ${browRaise.toFixed(2)} · פתיחת פה ${mouthOpen.toFixed(3)}`;
}

// The table uses still images; its live preview shares the character lab's
// single renderer, skeleton and expression controls.
function markSelected(id) {
  for (const button of document.querySelectorAll('[data-expression]')) {
    button.setAttribute('aria-pressed', String(button.dataset.expression === id));
  }
  for (const row of document.querySelectorAll('[data-expression-row]')) {
    row.classList.toggle('selected', row.dataset.expressionRow === id);
  }
}

document.addEventListener('expressionchange', event => markSelected(event.detail.expression));
await window.labReady;
markSelected(window.lab.metrics().expression || document.querySelector('#expression').value);

for (const button of document.querySelectorAll('[data-expression]')) {
  button.addEventListener('click', () => {
    const id = button.dataset.expression;
    document.querySelector('#pose-expression').checked = false;
    window.lab.setExpression(id, matchMedia('(prefers-reduced-motion:reduce)').matches);
    markSelected(id);
  });
}

document.querySelector('#expression-blend').addEventListener('input', event => {
  const t = Number(event.target.value);
  markSelected(t === 0 ? document.querySelector('#expression-from').value :
    t === 100 ? document.querySelector('#expression-to').value : null);
});
