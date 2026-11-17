// SPDX-License-Identifier: CC0-1.0
// Static presentation only. The immutable runner's numeric JSON and sheets remain unchanged.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const escape=value=>String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const labels={green:'ירוק',yellow:'צהוב',red:'אדום','not-applicable':'לא חל','insufficient-data':'חסר מידע'};
const css='body{font:16px system-ui;background:#101d28;color:#e7edf2;margin:0 auto;padding:24px;max-width:1400px}a{color:#8de3cb}table{border-collapse:collapse;width:100%;background:#162838}th,td{border:1px solid #456;padding:10px;text-align:right}img{width:100%;height:auto}pre{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.green{color:#8decbe}.yellow{color:#ffe18e}.red{color:#ff9696}.score{font-size:1.4em}@media(max-width:600px){body{padding:12px}th,td{padding:5px;font-size:13px}}';
const page=(title,body)=>`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${css}</style><h1>${escape(title)}</h1>${body}</html>`;
export async function writeQAPages({output,report,evidence}){
  const clips=report.libraries[0].clips.filter(c=>!c.metadata?.sourceReference);
  for(const clip of clips){
    const metrics=Object.entries(clip.metrics).map(([key,m])=>`<tr><th>${escape(report.metricDefinitions[key].label)}</th><td class="${escape(m.status)}">${escape(labels[m.status])}</td><td>${escape(m.value??'—')}</td><td>${escape(m.score??'—')}</td><td><details><summary>ראיות המדידה</summary><pre>${escape(JSON.stringify(m.evidence??m.reason,null,2))}</pre></details></td></tr>`).join('');
    await writeFile(path.join(output,'qa',clip.htmlPath),page(clip.id,
      `<p><a href="../report.html">כל הקליפים</a> · <a href="../../../preview.html">תצוגת התנועה</a> · <a href="${escape(path.basename(clip.jsonPath))}">JSON מקורי</a></p><p class="score">ציון ${clip.score} · כיסוי ${clip.coverage*100}%</p><p>נתוני motion-qa-v1 המקוריים; עיצוב הדוח בלבד הותאם לחבילה. נקודות הסוליה נמדדות בתרחיש שחקן חיצוני מוצהר; Root בנכס נשאר קבוע.</p><img src="../${escape(clip.sheetPath)}" alt="שמונה פריימים מדודים: ${escape(clip.id)}"><table><thead><tr><th>מדד</th><th>מצב</th><th>ערך</th><th>ציון</th><th>ראיות</th></tr></thead><tbody>${metrics}</tbody></table>`));
  }
  const rows=clips.map(clip=>`<tr><th dir="ltr"><a href="${escape(clip.htmlPath)}">${escape(clip.id)}</a></th><td>${clip.score}</td><td>${clip.coverage*100}%</td><td>${Object.entries(clip.metrics).map(([key,m])=>`<span class="${escape(m.status)}">${escape(report.metricDefinitions[key].label)}: ${escape(labels[m.status])}</span>`).join('<br>')}</td><td><a href="${escape(clip.jsonPath)}">JSON</a> · <a href="${escape(clip.sheetPath)}">8 פריימים</a></td></tr>`).join('');
  await writeFile(path.join(output,'qa/report.html'),page('מדידת תנועה · כדורסל v14',
    `<p><a href="../../preview.html">תצוגת תלת־ממד</a> · <a href="report.json">JSON מקורי</a> · <a href="../requirements.json">אימות דרישות</a> · <a href="../../REPORT.md">דוח מסירה</a></p><p>${evidence.clips} קליפים; ציון מינימום ${evidence.minimumScore}; ${evidence.redMetrics} מדדים אדומים. נוסחאות וספי motion-qa-v1 ללא שינוי. הציון הוא מדד אבחוני הנדסי; גיליון השלד אינו תמונת השחקן המרונדר.</p><table><thead><tr><th>קליפ</th><th>ציון</th><th>כיסוי</th><th>מדדים</th><th>ראיות</th></tr></thead><tbody>${rows}</tbody></table>`));
}
