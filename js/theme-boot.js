/* Her theme (settings → "אישי") before the stylesheet paints, so a dark screen does not flash light. app.js sets it again on every route. */
try {
  var st = JSON.parse(localStorage.getItem('bakasun.v1') || '{}');
  var th = st && st.settings && st.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  if (st && st.settings && st.settings.textSize === 'large') document.documentElement.className += ' text-large';
  // the optional new design: its attribute and stylesheet are in place before the first paint (off unless she turned it on)
  if (st && st.settings && st.settings.design === 'new') {
    document.documentElement.dataset.design = 'new';
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/newdesign.css'; l.dataset.lazycss = 'newdesign'; document.head.appendChild(l);
  }
} catch (e) { /* no storage, no theme: the device decides */ }
