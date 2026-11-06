// Runs in Chromium under print media. No text is sent outside the local server.
export function inspectLayout() {
  const sheets = [...document.querySelectorAll('.sheet')];
  const result = sheets.map(sheet => {
    const b = sheet.getBoundingClientRect();
    const footer = sheet.querySelector('.page-footer').getBoundingClientRect();
    const escapes = [];
    for (const el of sheet.querySelectorAll('*')) {
      if (el.matches('caption,.sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < b.left - 1 || r.right > b.right + 1 || r.bottom > footer.bottom + 1)) escapes.push(el.tagName + '.' + el.className);
      // Detect text which paints outside a cell even when its box fits.
      if (el.matches('td,th,.note-box,.meta dd')) {
        const range = document.createRange(); range.selectNodeContents(el);
        for (const t of range.getClientRects()) if (t.width && (t.left < r.left - 1 || t.right > r.right + 1)) escapes.push('text:' + el.tagName);
      }
    }
    const body = sheet.querySelector('.document-body').getBoundingClientRect();
    const contentBottom = Math.max(...[...sheet.querySelector('.document-body').children].map(e=>e.getBoundingClientRect().bottom));
    return { width: b.width, height: b.height, direction: getComputedStyle(sheet).direction, footerGap: footer.top - body.bottom, contentGap:footer.top-contentBottom, escapes: [...new Set(escapes)] };
  });
  return { sheets: result, fontLoaded: document.fonts.check('12px "Event Hebrew"'), title: document.title };
}
