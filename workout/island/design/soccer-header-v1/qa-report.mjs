// SPDX-License-Identifier: CC0-1.0
// Original self-contained presentation of the unchanged QA output values.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style = 'body{font:16px system-ui;line-height:1.65;max-width:1200px;margin:32px auto;padding:0 20px;color:#192c35;background:#f2f6f8}a{color:#075b98}table{border-collapse:collapse;width:100%;background:white}td,th{padding:10px;border:1px solid #c8d5dc;text-align:start}pre{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px}img{max-width:100%;height:auto}h1{font-size:30px}.green{color:#175c38}.yellow{color:#875700}.red{color:#a21e1e}.not-applicable{color:#64747b}.panel{overflow:auto}.number{font-variant-numeric:tabular-nums}';
const status = value => ({green:'ירוק', yellow:'צהוב', red:'אדום', 'not-applicable':'לא חל', 'insufficient-data':'חסרים נתונים'}[value] ?? value);
function page(title, body) {
  return `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style><main><h1>${escape(title)}</h1>${body}</main></html>`;
}
export async function renderHeaderReport(report, output) {
  const clips = report.libraries.flatMap(l => l.clips);
  const metricName = name => report.metricDefinitions[name]?.label ?? name;
  for (const clip of clips) {
    const metrics = Object.entries(clip.metrics).map(([name, m]) => `<tr><th>${escape(metricName(name))}</th><td class="${escape(m.status)}">${escape(status(m.status))}</td><td dir="ltr">${escape(m.value ?? '—')}</td><td>${m.score ?? '—'}</td><td><details><summary>ראיות</summary><pre>${escape(JSON.stringify(m.evidence ?? m.reason, null, 2))}</pre></details></td></tr>`).join('');
    const body = `<p><a href="../report.html">כל המדידות</a> · <a href="../../../preview.html">הקליפים בתלת־ממד</a> · <a href="${escape(path.basename(clip.jsonPath))}">JSON מקורי</a></p><p class="number">ציון ${clip.score} / 100 · כיסוי מדדים חלים ${clip.coverage * 100}% · משך ${clip.duration} שנ׳</p>${clip.id === 'idle_relaxed' ? '<p>שורת ייחוס בלבד; אינה קליפ נגיחה חדש.</p>' : ''}<a href="../${escape(clip.sheetPath)}"><img src="../${escape(clip.sheetPath)}" alt="שמונה פריימים מדודים של ${escape(clip.id)}"></a><div class="panel"><table><thead><tr><th>מדד</th><th>סטטוס</th><th>ערך</th><th>ציון</th><th>פירוט</th></tr></thead><tbody>${metrics}</tbody></table></div>`;
    await writeFile(path.join(output, clip.htmlPath), page(clip.id, body));
  }
  const rows = clips.map(c => `<tr><th dir="ltr"><a href="${escape(c.htmlPath)}">${escape(c.id)}</a>${c.id === 'idle_relaxed' ? ' (ייחוס)' : ''}</th><td>${c.score}</td><td>${c.coverage * 100}%</td><td>${Object.entries(c.metrics).map(([name,m]) => `<span class="${escape(m.status)}">${escape(metricName(name))}: ${escape(status(m.status))}</span>`).join('<br>')}</td><td><a href="${escape(c.jsonPath)}">JSON</a> · <a href="${escape(c.sheetPath)}">פריימים</a></td></tr>`).join('');
  const body = `<p><a href="../../preview.html">הקליפים בתלת־ממד</a> · <a href="report.json">פלט QA מקורי</a> · <a href="../requirements.json">אימות הדרישות</a> · <a href="../../REPORT.md">דוח המסירה</a></p><p>שישה קליפי נגיחה ושורת idle_relaxed אחת המשמשת ייחוס. נוסחאות ומדדי motion-qa-v1 נשארו ללא שינוי; עמוד זה מציג את פלט JSON המקורי.</p><div class="panel"><table><thead><tr><th>קליפ</th><th>ציון</th><th>כיסוי</th><th>מדדים</th><th>ראיות</th></tr></thead><tbody>${rows}</tbody></table></div><p>הציון הוא מדד אבחוני הנדסי. נבדקו השלד ונקודות הסוליה המוצהרות; אין זו בדיקת התנגשות של כל קודקודי הנעליים.</p>`;
  await writeFile(path.join(output, 'report.html'), page('מדידות קליפי הנגיחה', body));
}
