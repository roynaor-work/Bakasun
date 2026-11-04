/* Her theme (settings → "אישי") before the stylesheet paints, so a dark screen does not flash light. app.js sets it again on every route. */
try {
  var st = JSON.parse(localStorage.getItem('bakasun.v1') || '{}');
  var th = st && st.settings && st.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
} catch (e) { /* no storage, no theme: the device decides */ }
