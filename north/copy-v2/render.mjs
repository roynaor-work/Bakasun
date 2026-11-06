import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = new URL('./', import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(name, here), 'utf8'));
export const escapeHtml = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const p = text => `  <p>${escapeHtml(text)}</p>`;
const storePath = 'https://roynaor-work.github.io/Bakasun/north/';

export function renderArtifacts() {
  const business = load('business.json');
  const faq = load('faq.json');
  const emails = load('emails.json');
  const claims = load('claims.json');
  const sources = load('sources.json');
  const result = {};
  result['business.html'] = [
    '<section dir="rtl" lang="he" aria-labelledby="business-copy-title">',
    `  <h1 id="business-copy-title">${escapeHtml(business.title)}</h1>`,
    ...Object.entries(business).filter(([key]) => !['title', 'cta'].includes(key)).map(([, text]) => p(text)),
    `  <a href="${storePath}index.html#/#biz">${escapeHtml(business.cta)}</a>`,
    '</section>', '',
  ].join('\n');
  result['faq.html'] = ['<section dir="rtl" lang="he" aria-label="שאלות ותשובות">',
    ...faq.map(({ q, a }) => `  <details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`),
    '</section>', '',
  ].join('\n');
  for (const [key, email] of Object.entries(emails)) {
    result[`email-${key}.html`] = [
      '<div dir="rtl" lang="he" style="direction:rtl;text-align:right;font-family:Arial,sans-serif;line-height:1.6">',
      `  <h1>${escapeHtml(email.subject)}</h1>`,
      ...email.body.map(p),
      `  <a href="${storePath}legal.html">תקנון החנות</a>`,
      '</div>', '',
    ].join('\n');
  }
  const cell = text => text.replace(/\|/g, '&#124;').replace(/\n/g, ' ');
  result['CLAIMS.md'] = [
    '# טענה ← מקור', '',
    `בסיס הבדיקה: \`${sources.commit}\`. שני קובצי המקור נבדקו לכל יחידת טקסט.`, '',
    sources.policy, '',
    'הציטוטים המדויקים והשורות שמורים ב־sources.json. כל שורה כאן מציגה יחידת טקסט ומקורותיה. שאלות, כותרות וחתימות מסומנות כעריכה; תבניות אירוע מחייבות אימות של מצב ההזמנה לפני שליחה. בדיקת התאמה אוטומטית אינה הוכחה סמנטית, ולכן בוצעו גם ארבעה סבבי ביקורת ידנית.', '',
    '| מזהה | קובץ ושדה | טקסט | סוג | מקור | תנאי שימוש |',
    '|---|---|---|---|---|---|',
    ...claims.map(c => `| ${c.id} | ${c.file}${c.pointer} | ${cell(c.text)} | ${c.kind} | ${c.sources.map(id => {
      const s = sources.excerpts[id];
      return `[${id}](https://github.com/roynaor-work/Bakasun/blob/${sources.commit}/${s.file}#L${s.line})`;
    }).join(', ')} | ${cell(c.condition || '—')} |`), '',
  ].join('\n');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  for (const [name, expected] of Object.entries(renderArtifacts())) {
    const url = new URL(name, here);
    if (check) {
      if (readFileSync(url, 'utf8') !== expected) throw new Error(`Regenerate ${name}`);
    } else writeFileSync(url, expected);
  }
  console.log(check ? 'Generated files match JSON' : 'Generated HTML and claim table');
}
