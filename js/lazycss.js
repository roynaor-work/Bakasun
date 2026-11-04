/* Screen stylesheets that are not needed on the first paint load when their screen is opened (css/<name>.css).
   ensureCss resolves when every sheet has loaded, or after 3 seconds, so a slow or missing sheet never blocks the screen. */
const done = new Map();
export function ensureCss(names) {
  if (!names || !names.length) return Promise.resolve();
  return Promise.all(names.map(n => {
    if (done.has(n)) return done.get(n);
    const existing = document.querySelector('link[data-lazycss="' + n + '"], link[rel="stylesheet"][href$="css/' + n + '.css"]');
    const p = new Promise(res => {
      if (existing && existing.sheet) return res();
      const l = existing || document.createElement('link');
      const fin = () => res();
      l.addEventListener('load', fin, { once: true }); l.addEventListener('error', fin, { once: true });
      setTimeout(fin, 3000);
      if (!existing) { l.rel = 'stylesheet'; l.href = 'css/' + n + '.css'; l.dataset.lazycss = n; document.head.appendChild(l); }
    });
    done.set(n, p);
    return p;
  })).then(() => {});
}
