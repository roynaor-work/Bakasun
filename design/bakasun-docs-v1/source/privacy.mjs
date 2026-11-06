// The checked-in copy allowlist is a reviewed baseline, never refreshed by render.
export function inspectCopy() {
  const fields = [...document.querySelectorAll('[data-field]')].map(el => ({ key: el.dataset.field, text: el.textContent, dir: el.dir }));
  const fixed = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('[data-field]')) continue;
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text) fixed.push(text);
  }
  return { fields, fixed, text: document.body.innerText };
}

export function copyErrors(copy, dictionary, expectedCopy) {
  const errors = [];
  for (const f of copy.fields) {
    const spec = dictionary[f.key];
    if (!spec || f.text !== `[${spec.label}]` || f.dir !== spec.direction) errors.push(`Filled or unknown field: ${f.key}`);
  }
  if (!copy.fields.length) errors.push('Missing placeholders');
  if (JSON.stringify(copy.fixed) !== JSON.stringify(expectedCopy)) errors.push('Unreviewed fixed copy');
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(copy.text)) errors.push('Email address');
  if (/(?:\d[\s()+.\/-]*){7,}/u.test(copy.text)) errors.push('Long identifier or phone');
  if (/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/.test(copy.text)) errors.push('Bank identifier');
  if (/[\u0600-\u06ff]/u.test(copy.text)) errors.push('Unexpected script');
  return errors;
}
