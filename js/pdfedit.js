/* "Same document, new price": the supplier's PDF stays as it is, only the numbers she chose are covered and rewritten.
   pdf.js finds where each number sits; pdf-lib paints a small box over it and writes the new number. Digits only,
   so no Hebrew font is needed. Loaded from cdnjs only when used. */
import { pdfText } from './files.js';

async function lib(url, globalName) {
  if (window[globalName]) return window[globalName];
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window[globalName];
}

/** Positions of every text item whose digits equal one of the wanted numbers: [{page, x, y, w, h, text}] */
async function findNumbers(buf, wanted) {
  const pdfjs = await lib('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const want = new Set(wanted.map(n => String(n).replace(/[^\d]/g, '')));
  const hits = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const c = await page.getTextContent();
    c.items.forEach(it => {
      const digits = it.str.replace(/[^\d]/g, '');
      if (digits && want.has(digits) && /^[\s\d,.₪]+$/.test(it.str)) hits.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 10, text: it.str, digits });
    });
  }
  return hits;
}

/** Returns a Blob of the edited PDF. replacements: [{from: 3200, to: 3680}] (numbers). Unmatched numbers are reported. */
export async function replaceNumbersInPdf(file, replacements) {
  const buf = await file.arrayBuffer();
  const map = {}; replacements.forEach(r => { map[String(r.from).replace(/[^\d]/g, '')] = r.to; });
  const hits = await findNumbers(buf, Object.keys(map));
  const PDFLib = await lib('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib');
  const doc = await PDFLib.PDFDocument.load(buf);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const done = new Set();
  hits.forEach(h => {
    const page = doc.getPage(h.page - 1);
    const to = map[h.digits]; if (to == null) return;
    const txt = Number(to).toLocaleString('en-US');
    const size = Math.max(7, Math.min(h.h * 0.9, 14));
    const pad = 1.5;
    page.drawRectangle({ x: h.x - pad, y: h.y - pad - size * 0.25, width: Math.max(h.w, font.widthOfTextAtSize(txt, size)) + pad * 2, height: size + pad * 2, color: PDFLib.rgb(1, 1, 1) });
    // keep the number where the old one ended (right edge), as prices usually align right
    const tw = font.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: h.x + h.w - tw, y: h.y, size, font, color: PDFLib.rgb(0.07, 0.06, 0.06) });
    done.add(h.digits);
  });
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), replaced: [...done], missed: Object.keys(map).filter(k => !done.has(k)) };
}
export { pdfText };
