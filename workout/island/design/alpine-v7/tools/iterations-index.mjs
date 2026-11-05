import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../iterations",
);
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const directories = (await fs.readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d\d$/.test(d.name))
  .map((d) => d.name)
  .sort();
let sections = "";
for (const id of directories) {
  const dir = path.join(root, id);
  let data;
  try {
    data = JSON.parse(
      await fs.readFile(path.join(dir, "capture.json"), "utf8"),
    );
  } catch {
    continue;
  }
  let critique = "";
  try {
    critique = await fs.readFile(path.join(dir, "critique.md"), "utf8");
  } catch {}
  const images = data.captures
    .map(
      (c) =>
        `<figure data-kind="${c.view === "detail" ? "detail" : c.view}" data-orientation="${c.width < c.height ? "portrait" : "landscape"}"><a href="${id}/${escape(c.file)}"><img loading="lazy" src="${id}/${escape(c.file)}" alt="סבב ${id}, ${escape(c.focus || c.view)}, ${c.width}×${c.height}"></a><figcaption>${escape(c.file)} · ${Math.round(c.snapshot.render.triangles).toLocaleString()} משולשים · ${c.snapshot.render.calls} קריאות ציור</figcaption></figure>`,
    )
    .join("");
  sections += `<section id="round-${id}"><header><h2>סבב ${id}</h2><span>${escape(data.startedAt)} · ${escape(data.configuration.environment)} · ${escape(data.configuration.clip)}</span></header><div class="grid">${images}</div><details><summary>ביקורת עצמית ותיקונים</summary><div class="critique">${escape(critique)}</div><a href="${id}/capture.json">נתוני הלכידה וחותמות המקור</a></details></section>`;
}
const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אלפיין 07 · יומן ביקורת</title><style>*{box-sizing:border-box}body{margin:0;background:#122b34;color:#eeeedd;font:14px/1.7 Arial,sans-serif}main{max-width:1280px;margin:auto;padding:30px 22px}h1,h2{font-weight:400}h1{font-size:32px;margin-bottom:6px}a{color:#c4e9c4}nav{position:sticky;top:0;z-index:2;padding:15px 0;background:#122b34eb;display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;color:inherit;background:#ffffff0b;border:1px solid #ffffff30;padding:7px 16px;border-radius:20px;cursor:pointer}button.active{background:#eeeedd;color:#122b34}section{border-top:1px solid #ffffff25;margin:25px 0 45px;padding-top:15px}section header{display:flex;align-items:center;gap:25px;flex-wrap:wrap;margin-bottom:15px}section header span{font-size:11px;opacity:.6;direction:ltr}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}figure{margin:0;background:#0a2029;padding:8px;border-radius:5px}figure img{width:100%;height:340px;object-fit:contain;display:block}figcaption{font-size:10px;opacity:.65;direction:ltr;text-align:center;margin-top:9px}.critique{white-space:pre-wrap;padding:15px;background:#ffffff08;line-height:1.9}details{margin-top:18px}summary{cursor:pointer;color:#c4e9c4}details a{display:block;margin-top:12px}small{opacity:.6}@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}figure img{height:300px}}@media(max-width:450px){.grid{grid-template-columns:1fr}figure img{height:auto;max-height:620px}section header{gap:0}}</style><main><a href="../preview-standalone.html">פתיחת התצוגה האינטראקטיבית ↗</a><h1>בעקבות השלג.</h1><p>יומן בנייה, רינדור, ביקורת ותיקון. כל סבב שומר את הכשלים שנראו באותו זמן; הערכת המסירה נמצאת ב־<a href="../REPORT.md">REPORT.md</a>.</p><nav aria-label="סינון מבטים"><button class="active" data-filter="all">הכול</button><button data-filter="close">קרוב</button><button data-filter="wide">רחוק</button><button data-filter="detail">בדיקות חומרים ותנועה</button><button data-filter="portrait">לאורך</button><button data-filter="landscape">לרוחב</button></nav>${sections}<small>התמונות הן צילומי Three.js בפועל. מספרי הרינדור כוללים את הסצנה ואת הדמות במצב המצולם; אינם מדידת טלפון פיזי.</small></main><script>for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{for(const b of document.querySelectorAll('[data-filter]'))b.classList.toggle('active',b===button);const filter=button.dataset.filter;for(const figure of document.querySelectorAll('figure'))figure.hidden=filter!=='all'&&figure.dataset.kind!==filter&&figure.dataset.orientation!==filter;};</script></html>`;
await fs.writeFile(path.join(root, "index.html"), html);
console.log(
  JSON.stringify({
    iterations: directories.length,
    path: "iterations/index.html",
  }),
);
