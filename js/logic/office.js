/* Ported from Office.gs (the tested, Google-free logic). Only change so far: the bar/bat mitzvah words also match the French spelling "mitsva". */
/**
 * באקה סאן · כלי המשרד
 * Office.gs — the pure logic of the office tools (no Google calls, so it is tested here):
 * reading a client's WhatsApp message into a case, quotes and their totals, a printable quote in
 * Hebrew / English / French, follow-ups, supplier requests and "one change to all",
 * the production schedule and its clashes, money (collection, supplier payments, invoice request),
 * checklists, and one search over everything.
 * Nothing here sends anything. It prepares texts; she presses send.
 */
var Office = (function () {
  'use strict';

  var str = function (v) { return v == null ? '' : String(v); };
  var trim = function (v) { return str(v).replace(/\s+/g, ' ').trim(); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var DAY = 86400000;

  /* ---------------- constants ---------------- */

  var STATUS = { lead: 'פנייה', quoted: 'הצעה נשלחה', won: 'נסגר', done: 'בוצע', lost: 'ירד' };
  var OPEN = [STATUS.lead, STATUS.quoted];
  var ACTIVE = [STATUS.lead, STATUS.quoted, STATUS.won];

  var KINDS = ['אירוע חברה', 'יום גיבוש', 'כנס', 'חתונה', 'אירוע לעמותה', 'משלחת או סיור', 'אירוע לרשות או משרד ממשלתי',
    'יום הולדת', 'בר או בת מצווה', 'מסיבה בבית פרטי', 'ערב טעימות', 'אחר'];
  var KIND_WORDS = [
    ['בר או בת מצווה', /בר[ -]?מצו|בת[ -]?מצו|ba[rt][ -]?mit[sz]va/i],
    ['חתונה', /חתונ|wedding|mariage|חופה/i],
    ['יום גיבוש', /גיבוש|סמינר|יום עיון|team ?building|seminar|séminaire|seminaire|retreat|off-?site/i],
    ['כנס', /כנס|כינוס|conference|congrès|congres/i],
    ['משלחת או סיור', /משלחת|סיור|טיול|delegation|tour\b|voyage|groupe de/i],
    ['אירוע לעמותה', /עמות|nonprofit|association/i],
    ['אירוע לרשות או משרד ממשלתי', /עיריי|מועצ|משרד ה|ממשל|municipal/i],
    ['יום הולדת', /יום הולדת|יומולדת|birthday|anniversaire/i],
    ['ערב טעימות', /טעימ|tasting|dégustation|degustation/i],
    ['מסיבה בבית פרטי', /בבית|בחצר|at home|à la maison/i],
    ['אירוע חברה', /חבר[הת] |לחברה|לעובדים|עובדי|אירוע חברה|ערב חברה|כנס עובדים|company|corporate|entreprise|société|societe|הרמת כוסית/i]
  ];

  var MONTHS = {
    'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
  };

  /* ---------------- dates and numbers ---------------- */

  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
  function day(v) {
    if (isDate(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    var s = trim(v), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
    return null;
  }
  function fmt(d) { d = day(d); return d ? pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function iso(d) { d = day(d); return d ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) : ''; }
  function daysBetween(a, b) { a = day(a); b = day(b); return a && b ? Math.round((b.getTime() - a.getTime()) / DAY) : null; }
  function addDays(d, n) { d = day(d); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMonths(d, n) {
    d = day(d);
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  }
  /** '09:30' / '9.30' / Date → minutes after midnight, or null. */
  function minutes(v) {
    if (isDate(v)) return v.getHours() * 60 + v.getMinutes();
    var m = /^(\d{1,2})[:.](\d{2})$/.exec(trim(v));
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  }
  function hhmm(v) { var m = minutes(v); return m == null ? trim(v) : pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
  /** '12,500' / '12.5K' / '₪ 3,000' / 12500 → number (NaN when empty). */
  function num(v) {
    if (typeof v === 'number') return v;
    var s = str(v).replace(/[₪\s,]/g, '').replace(/ש"?ח|שקל(ים)?|nis|ils/gi, '');
    var k = /^(-?\d+(?:\.\d+)?)\s*(k|אלף)$/i.exec(s);
    if (k) return +k[1] * 1000;
    return s === '' ? NaN : +s;
  }
  function money(n) {
    n = Math.round((+n || 0) * 100) / 100;
    var neg = n < 0; n = Math.abs(n);
    var whole = Math.floor(n), cents = Math.round((n - whole) * 100);
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s + (cents ? '.' + pad2(cents) : '') + ' ₪';
  }
  function yes(v) { return v === true || /^(כן|v|✓|yes|true|1|שולם|אישר)$/i.test(trim(v)); }
  function firstName(n) { return trim(n).split(' ')[0] || ''; }

  /* ---------------- 1. a client's message → a case ---------------- */

  /**
   * Reads a pasted WhatsApp / e-mail message from a client and pulls out the six things she always asks
   * (date, participants, budget, place, kind, purpose) plus name, phone, e-mail and language.
   * places: [[he, en], ...] (the official list). today: Date, for the year of "15/10" and month names.
   */
  function parseLead(text, places, today) {
    var raw = str(text), t = raw.replace(/[‎‏‪-‮⁦-⁩]/g, '');
    today = day(today) || day(new Date());
    var out = { date: '', dateText: '', participants: '', budget: '', place: '', kind: '', purpose: '', name: '', phone: '', email: '', lang: 'he' };

    // language
    var he = (t.match(/[֐-׿]/g) || []).length, lat = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (lat > he * 2) out.lang = /\b(bonjour|nous|pour|merci|mariage|personnes|avec|le|la|les|une)\b/i.test(t) ? 'fr' : 'en';

    // e-mail and phone
    var em = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(t);
    if (em) out.email = em[0];
    var ph = /(?:\+972[\s\-]?|0)(5\d)[\s\-]?(\d{3})[\s\-]?(\d{4})\b/.exec(t) || /(?:\+|00)\d[\d\s\-]{7,16}\d/.exec(t);
    if (ph) out.phone = ph[1] ? '0' + ph[1] + '-' + ph[2] + ph[3] : ph[0].replace(/[\s\-]/g, '');

    // date: 15/10/2026, 15.10.26, 15/10, "15 באוקטובר", "October 15", "le 15 octobre"
    var withoutPhones = t.replace(/(?:\+972|0)5\d[\s\-]?\d{3}[\s\-]?\d{4}/g, ' ');
    var d = null, m;
    if ((m = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/.exec(withoutPhones))) { var y = +m[3]; if (y < 100) y += 2000; d = new Date(y, +m[2] - 1, +m[1]); out.dateText = m[0]; }
    else if ((m = /(?:^|[^\d\/.])(\d{1,2})[\/.](\d{1,2})(?![\/.\d])/.exec(withoutPhones)) && +m[2] <= 12 && +m[1] <= 31) {
      d = new Date(today.getFullYear(), +m[2] - 1, +m[1]); if (d < today) d = new Date(today.getFullYear() + 1, +m[2] - 1, +m[1]); out.dateText = m[1] + '/' + m[2];
    } else {
      var names = Object.keys(MONTHS).sort(function (a, b) { return b.length - a.length; }).join('|');
      var re1 = new RegExp('(\\d{1,2})\\s*(?:ב|ל|de |of )?\\s*(' + names + ')(?:\\s+(\\d{4}))?', 'i');
      var re2 = new RegExp('(' + names + ')\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?', 'i');
      var re3 = new RegExp('(?:^|\\s|ב|ל)(' + names + ')(?:\\s+(\\d{4}))?', 'i');
      if ((m = re1.exec(t))) { d = monthDate(+m[1], MONTHS[m[2].toLowerCase()], m[3], today); out.dateText = m[0].trim(); }
      else if ((m = re2.exec(t))) { d = monthDate(+m[2], MONTHS[m[1].toLowerCase()], m[3], today); out.dateText = m[0].trim(); }
      else if ((m = re3.exec(t))) { out.dateText = m[0].trim(); out.month = MONTHS[m[1].toLowerCase()]; }
    }
    if (d && !isNaN(d)) out.date = iso(d);

    // participants
    m = /(\d{1,3}(?:,\d{3})?)\s*(?:-|עד|to|à)?\s*(\d{1,4})?\s*(משתתפים|משתתפות|אנשים|איש|אורחים|מוזמנים|עובדים|עובדות|נפשות|ילדים|people|guests|participants|pax|persons|personnes|invités|invites)/i.exec(t)
      || /(?:כ|בערך |about |around |environ )?(\d{2,4})\s*(?:-\s*\d+)?\s*(?:ppl|pers\b)/i.exec(t)
      || /(?:משתתפים|אורחים|people|guests|personnes)\s*[:\-]?\s*(?:כ-?|כ )?(\d{1,4})/i.exec(t);
    if (m) out.participants = m[2] ? m[1].replace(',', '') + '-' + m[2] : m[1].replace(',', '');

    // budget
    m = /(?:תקציב|budget|בסביבות|עד|up to|jusqu'à)[^\d₪]{0,20}(₪\s*)?(\d[\d,.]*)\s*(k|K|אלף|ש"ח|שח|₪|שקל(?:ים)?|nis|ils|euros?|€|\$|dollars?)?/i.exec(t)
      || /(₪)\s*(\d[\d,.]*)\s*(k|K|אלף)?/.exec(t)
      || /()(\d[\d,.]*)\s*(₪|ש"ח|שקלים|אלף ש"ח|אלף שקל)/.exec(t);
    if (m && !/^\d{1,3}$/.test(m[2]) || (m && m[3])) {
      var val = num(m[2] + (m[3] && /k|אלף/i.test(m[3]) ? 'k' : ''));
      var cur = m[3] && /€|euro/i.test(m[3]) ? ' €' : m[3] && /\$|dollar/i.test(m[3]) ? ' $' : ' ₪';
      if (!isNaN(val) && val >= 500) out.budget = String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + cur;
    }

    // place: the longest locality name that appears as a word
    if (places && places.length) {
      // "in Herzliya" beats "a bus from Tel Aviv": a place after "from" only counts when nothing else matches
      var best = '', bestScore = -1;
      var esc = function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var score = function (hn, found, fromRe, inRe) {
        if (!found) return -1;
        var sc = hn.length; if (inRe.test(t)) sc += 100; else if (fromRe.test(t)) sc -= 100; return sc;
      };
      places.concat(REGIONS).forEach(function (p) {
        var hn = str(p[0]).replace(/\s*\(.*\)$/, '').split(' - ')[0], en = str(p[1]).split(' - ')[0];
        var sc = -1;
        if (hn.length >= 3) sc = score(hn, wordIn(t, hn), new RegExp('(^|\\s)מ' + esc(hn) + '(?=\\s|$|[,.!?])'), new RegExp('(^|\\s)ב' + esc(hn) + '(?=\\s|$|[,.!?])'));
        if (en.length >= 4) sc = Math.max(sc, score(hn, new RegExp('\\b' + esc(en) + '\\b', 'i').test(t), new RegExp('\\bfrom\\s+' + esc(en) + '\\b', 'i'), new RegExp('\\b(?:in|at|à|au)\\s+' + esc(en) + '\\b', 'i')));
        if (sc > bestScore) { bestScore = sc; best = hn; }
      });
      out.place = best;
    }
    if (!out.place && (m = /(?:באזור|באיזור|ליד|במקום|in the|near|près de|à)\s+([֐-׿A-Za-z"'׳ ]{2,20})/.exec(t))) out.place = trim(m[1]).split(/\s+/).slice(0, 2).join(' ');

    // kind
    for (var i = 0; i < KIND_WORDS.length; i++) if (KIND_WORDS[i][1].test(t)) { out.kind = KIND_WORDS[i][0]; break; }

    // purpose: a line that says what it is for
    m = /(?:מטרה|המטרה|לכבוד|לציון|לרגל|in honor of|to celebrate|pour fêter|pour celebrer|pour célébrer)[:\s]+([^\n.!?]{3,80})/i.exec(t);
    if (m) out.purpose = trim(m[1]);

    // name: "שמי X" / "מדברת X" / "I'm X" / "je m'appelle X", or a sign-off line
    m = /(?:שמי|קוראים לי|מדבר[ת]?|כאן|my name is|i'?m|this is|je m'appelle|je suis)\s+([֐-׿A-Z][֐-׿a-zA-Z'׳\-]+(?:\s+[֐-׿A-Z][֐-׿a-zA-Z'׳\-]+)?)/i.exec(t);
    if (m && !/^(מ|ה|ב|ל|אני|מחפש|מחפשת|רוצה|interested|looking)/.test(m[1])) out.name = trim(m[1]).replace(/[,.]$/, '');
    if (!out.name) {
      var lines = t.split('\n').map(trim).filter(Boolean);
      var last = lines[lines.length - 1] || '';
      if (lines.length > 1 && /^[֐-׿A-Za-z'׳\- ]{2,25}$/.test(last) && last.split(' ').length <= 3 && !/תודה|thanks|merci|בברכה|regards/i.test(last)) out.name = last;
    }

    out.missing = missingOf(out);
    return out;
  }
  function monthDate(dd, mm, yy, today) {
    var y = yy ? +yy : today.getFullYear();
    var d = new Date(y, mm - 1, dd);
    if (!yy && d < today) d = new Date(y + 1, mm - 1, dd);
    return d;
  }
  function wordIn(text, w) {
    var i = text.indexOf(w);
    while (i >= 0) {
      var before = text.charAt(i - 1), after = text.charAt(i + w.length);
      var okB = i === 0 || /[\s,.;:!?()"'\-]/.test(before) || (/[בלמה]/.test(before) && (i === 1 || /[\s,.;:!?()"'\-]/.test(text.charAt(i - 2))));
      var okA = !after || /[\s,.;:!?()"'\-]/.test(after);
      if (okB && okA) return true;
      i = text.indexOf(w, i + 1);
    }
    return false;
  }
  var ASK = {
    date: { he: 'באיזה תאריך מדובר?', en: 'What date do you have in mind?', fr: 'Quelle date avez-vous en tête ?' },
    participants: { he: 'כמה משתתפים בערך?', en: 'About how many guests?', fr: 'Combien de personnes environ ?' },
    budget: { he: 'יש מסגרת תקציב?', en: 'Do you have a budget in mind?', fr: 'Avez-vous un budget en tête ?' },
    place: { he: 'באיזה אזור או מקום?', en: 'Which area or venue?', fr: 'Dans quelle région ou quel lieu ?' },
    kind: { he: 'איזה סוג אירוע?', en: 'What kind of event is it?', fr: 'De quel type d’événement s’agit-il ?' },
    purpose: { he: 'מה המטרה של האירוע ומי הקהל?', en: 'What is the occasion, and who are the guests?', fr: 'Quelle est l’occasion, et qui sont les invités ?' }
  };
  var REGIONS = [['גליל עליון', 'Upper Galilee'], ['גליל מערבי', 'Western Galilee'], ['גליל תחתון', 'Lower Galilee'], ['גליל', 'Galilee'], ['גולן', 'Golan'],
    ['עמק יזרעאל', 'Jezreel Valley'], ['כרמל', 'Carmel'], ['שרון', 'Sharon'], ['שפלה', 'Shfela'], ['נגב', 'Negev'], ['ערבה', 'Arava'], ['ים המלח', 'Dead Sea'],
    ['מרכז', ''], ['צפון', ''], ['דרום', ''], ['השרון', ''], ['הגליל', ''], ['הגולן', ''], ['הנגב', ''], ['קיסריה', 'Césarée'], ['גליל', 'Galilée']];
  var FIELD_HE = { date: 'תאריך', participants: 'משתתפים', budget: 'תקציב', place: 'מקום', kind: 'סוג אירוע', purpose: 'מטרה' };
  function missingOf(o) { return ['date', 'participants', 'budget', 'place', 'kind', 'purpose'].filter(function (k) { return !trim(o[k]); }); }

  /** A reply that asks only what is still missing. A draft for her to send herself. */
  function followupQuestions(lead, lang, signer) {
    lang = lang || lead.lang || 'he';
    var miss = lead.missing || missingOf(lead);
    var name = firstName(lead.name);
    var open = { he: (name ? 'היי היי ' + name + ', מה שלומך? ' : 'היי היי, ') + 'תודה רבה על הפנייה :)', en: (name ? 'Hi ' + name + ', ' : 'Hi, ') + 'thank you for reaching out.', fr: (name ? 'Bonjour ' + name + ', ' : 'Bonjour, ') + 'merci pour votre message.' }[lang];
    if (!miss.length) {
      var done = { he: 'יש לי את כל מה שצריך כדי להכין הצעה, אחזור אליך בהקדם. תודה רבה!', en: 'I have everything I need to prepare a proposal and will get back to you shortly.', fr: 'J’ai tout ce qu’il me faut pour préparer une proposition. Je reviens vers vous très vite.' }[lang];
      return open + '\n' + done + (signer ? '\n' + signer : '');
    }
    var lead_in = { he: 'כדי שאוכל להכין הצעה מדויקת, אשמח לכמה פרטים בבקשה:', en: 'To prepare an accurate proposal, a few details:', fr: 'Pour préparer une proposition précise, quelques précisions :' }[lang];
    var MON = { he: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'] };
    var ask = function (k) {
      if (k === 'date' && lead.month && lang === 'he') return 'באיזה תאריך ב' + MON.he[lead.month - 1] + '?';
      return ASK[k][lang];
    };
    return open + '\n' + lead_in + '\n' + miss.map(function (k) { return '• ' + ask(k); }).join('\n') + (signer ? '\n\n' + signer : '');
  }

  /* ---------------- 2. clients: history ---------------- */

  function clientHistory(clientId, cases, quotes) {
    var mine = cases.filter(function (c) { return c.clientId === clientId; })
      .sort(function (a, b) { return (day(b.date) || 0) - (day(a.date) || 0); });
    var won = mine.filter(function (c) { return c.status === STATUS.won || c.status === STATUS.done; });
    var total = 0;
    won.forEach(function (c) {
      var q = latestQuote(c.id, quotes, true);
      if (q) total += +q.net || 0;
    });
    return { cases: mine, count: mine.length, won: won.length, lost: mine.filter(function (c) { return c.status === STATUS.lost; }).length, totalNet: total,
      last: mine[0] || null, lastQuote: mine.length ? latestQuote(mine[0].id, quotes) : null };
  }
  function latestQuote(caseId, quotes, acceptedFirst) {
    var list = quotes.filter(function (q) { return q.caseId === caseId; });
    if (acceptedFirst) { var acc = list.filter(function (q) { return q.status === 'אושרה'; }); if (acc.length) list = acc; }
    list.sort(function (a, b) { return (+b.version || 0) - (+a.version || 0); });
    return list[0] || null;
  }

  /* ---------------- 3. quotes ---------------- */

  /**
   * lines: [{item, qty, unit, price, days, cost}]. VAT is added on top of the prices (prices are before VAT).
   * Returns the lines with their totals, net, VAT, gross, cost and margin.
   */
  function quoteTotals(lines, vatRate) {
    var rate = isNaN(num(vatRate)) ? 18 : num(vatRate);
    var net = 0, cost = 0;
    var out = (lines || []).filter(function (l) { return trim(l.item) || num(l.price); }).map(function (l) {
      var qty = isNaN(num(l.qty)) ? 1 : num(l.qty), days = isNaN(num(l.days)) || !num(l.days) ? 1 : num(l.days);
      var price = isNaN(num(l.price)) ? 0 : num(l.price), c = isNaN(num(l.cost)) ? 0 : num(l.cost);
      var total = Math.round(qty * days * price * 100) / 100;
      net += total; cost += qty * days * c;
      return { item: trim(l.item), en: trim(l.en), fr: trim(l.fr), unit: trim(l.unit), qty: qty, days: days, price: price, cost: c, total: total, section: trim(l.section) };
    });
    net = Math.round(net * 100) / 100;
    var vat = Math.round(net * rate) / 100;
    return { lines: out, net: net, vat: vat, gross: Math.round((net + vat) * 100) / 100, vatRate: rate, cost: Math.round(cost * 100) / 100,
      margin: net ? Math.round((net - cost) / net * 1000) / 10 : 0 };
  }

  /** "BS-2026-007": the next number for this year, from the numbers already used. */
  function nextQuoteNo(existing, today) {
    var y = (day(today) || new Date()).getFullYear(), max = 0;
    (existing || []).forEach(function (n) { var m = new RegExp('^BS-' + y + '-(\\d+)').exec(str(n)); if (m) max = Math.max(max, +m[1]); });
    return 'BS-' + y + '-' + ('00' + (max + 1)).slice(-3);
  }

  /** A price-list row → a quote line. */
  function lineFromPrice(p, qty) {
    return { item: p.item, en: p.en, fr: p.fr, unit: p.unit, qty: qty || 1, days: 1, price: p.price, cost: p.cost, section: p.category };
  }

  /** Copying an older quote: same lines and notes, new number and date, back to draft. Optionally scaled to a new head count. */
  function cloneQuote(q, opts) {
    opts = opts || {};
    var lines = JSON.parse(JSON.stringify(q.lines || []));
    if (opts.fromPeople && opts.toPeople) {
      var f = num(opts.toPeople) / num(opts.fromPeople);
      lines.forEach(function (l) { if (/אדם|משתתף|person|pax|personne|מנה/i.test(l.unit)) l.qty = Math.ceil(num(l.qty) * f); });
    }
    return { caseId: opts.caseId || q.caseId, lang: opts.lang || q.lang, lines: lines, notes: q.notes, terms: q.terms, status: 'טיוטה' };
  }

  var QL = {
    he: { title: 'הצעת מחיר', to: 'לכבוד', date: 'תאריך', no: 'מספר הצעה', event: 'האירוע', eventDate: 'מועד', place: 'מקום', people: 'משתתפים',
      item: 'פריט', qty: 'כמות', unit: 'יחידה', days: 'ימים', price: 'מחיר ליחידה', total: 'סה״כ', net: 'סה״כ לפני מע״מ', vat: 'מע״מ', gross: 'סה״כ לתשלום',
      valid: 'ההצעה בתוקף עד', terms: 'תנאי תשלום', notes: 'הערות', regards: 'בברכה', pricesNote: 'המחירים בשקלים. מע״מ כחוק מתווסף לסכום.' },
    en: { title: 'Quotation', to: 'To', date: 'Date', no: 'Quote no.', event: 'Event', eventDate: 'Date of event', place: 'Venue', people: 'Guests',
      item: 'Item', qty: 'Qty', unit: 'Unit', days: 'Days', price: 'Unit price', total: 'Total', net: 'Subtotal before VAT', vat: 'VAT', gross: 'Total due',
      valid: 'Valid until', terms: 'Payment terms', notes: 'Notes', regards: 'Best regards', pricesNote: 'Prices in Israeli shekels (ILS). VAT is added as required by law.' },
    fr: { title: 'Devis', to: 'À l’attention de', date: 'Date', no: 'Devis n°', event: 'Événement', eventDate: 'Date de l’événement', place: 'Lieu', people: 'Participants',
      item: 'Prestation', qty: 'Qté', unit: 'Unité', days: 'Jours', price: 'Prix unitaire', total: 'Total', net: 'Total HT', vat: 'TVA', gross: 'Total TTC',
      valid: 'Valable jusqu’au', terms: 'Conditions de paiement', notes: 'Remarques', regards: 'Cordialement', pricesNote: 'Prix en shekels (ILS). La TVA israélienne s’ajoute au montant.' }
  };

  /**
   * The printable quote as one HTML page (Drive turns it into a PDF).
   * biz: {name, legal, id, phone, email, signer}. tr(text, lang) translates line names that have no fixed translation.
   */
  function quoteHtml(q, cs, biz, tr) {
    var L = QL[q.lang] ? q.lang : 'he', T = QL[L], rtl = L === 'he';
    var tot = quoteTotals(q.lines, q.vatRate);
    var e = function (s) { return str(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var name = function (l) { return L === 'he' ? l.item : (l[L] || (tr ? tr(l.item, L) : l.item)); };
    var unitName = function (u) { return L === 'he' || !u ? u : (tr ? tr(u, L) : u); };
    var showDays = tot.lines.some(function (l) { return l.days > 1; });
    var sections = [], bySec = {};
    tot.lines.forEach(function (l) { var s = l.section || ''; if (!bySec[s]) { bySec[s] = []; sections.push(s); } bySec[s].push(l); });
    var rows = sections.map(function (s) {
      var head = sections.length > 1 && s ? '<tr class="sec"><td colspan="' + (showDays ? 6 : 5) + '">' + e(L === 'he' ? s : (tr ? tr(s, L) : s)) + '</td></tr>' : '';
      return head + bySec[s].map(function (l) {
        return '<tr><td>' + e(name(l)) + '</td><td class="n">' + e(l.qty) + '</td><td>' + e(unitName(l.unit)) + '</td>' + (showDays ? '<td class="n">' + e(l.days) + '</td>' : '') +
          '<td class="n">' + e(money(l.price)) + '</td><td class="n">' + e(money(l.total)) + '</td></tr>';
      }).join('');
    }).join('');
    var dir = rtl ? 'rtl' : 'ltr', align = rtl ? 'right' : 'left', other = rtl ? 'left' : 'right';
    var info = [[T.to, cs.client + (cs.contact && cs.contact !== cs.client ? ' · ' + cs.contact : '')], [T.event, L === 'he' ? cs.kind : (tr ? tr(cs.kind, L) : cs.kind)],
      [T.eventDate, fmt(cs.date)], [T.place, cs.place], [T.people, cs.participants]].filter(function (x) { return trim(x[1]); });
    var notes = trim(q.notes) ? '<h3>' + T.notes + '</h3><p>' + e(L === 'he' || !tr ? q.notes : tr(q.notes, L)).replace(/\n/g, '<br>') + '</p>' : '';
    var terms = trim(q.terms) ? '<h3>' + T.terms + '</h3><p>' + e(L === 'he' || !tr ? q.terms : tr(q.terms, L)).replace(/\n/g, '<br>') + '</p>' : '';
    return '<!DOCTYPE html><html dir="' + dir + '" lang="' + (L === 'he' ? 'he' : L) + '"><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,"Noto Sans Hebrew",sans-serif;color:#17120F;font-size:12.5px;line-height:1.5;margin:28px;direction:' + dir + ';text-align:' + align + ';unicode-bidi:embed}' +
      '.top{border-bottom:3px solid #C4352A;padding-bottom:10px;margin-bottom:16px}.biz{font-size:20px;font-weight:bold}.small{color:#6E6359;font-size:11px}' +
      'h1{font-size:22px;margin:0 0 4px}h3{font-size:13px;margin:16px 0 4px}table{width:100%;border-collapse:collapse;margin-top:10px}' +
      'th,td{border-bottom:1px solid #E2D8C8;padding:6px 8px;text-align:' + align + ';vertical-align:top}th{background:#17120F;color:#fff;font-size:11.5px}' +
      'td.n,th.n{text-align:' + other + ';white-space:nowrap;direction:ltr;unicode-bidi:isolate}tr.sec td{background:#F3EEE5;font-weight:bold}' +
      '.info td{border:0;padding:2px 8px 2px 0}.sum{width:auto;margin-' + other + ':0;margin-' + align + ':auto;min-width:260px}.sum td{border:0;padding:3px 8px}.grand td{font-weight:bold;font-size:14px;border-top:2px solid #17120F}' +
      '.ltr{direction:ltr;display:inline-block;unicode-bidi:isolate}</style></head><body>' +
      '<div class="top"><div class="biz">' + e(biz.name) + '</div><div class="small">' + e([biz.legal, biz.id ? (L === 'he' ? 'ח.פ. ' : 'Reg. ') + biz.id : ''].filter(Boolean).join(' · ')) +
      (biz.phone || biz.email ? ' · <span class="ltr">' + e([biz.phone, biz.email].filter(Boolean).join(' · ')) + '</span>' : '') + '</div></div>' +
      '<h1>' + T.title + '</h1><div class="small">' + T.no + ' <span class="ltr">' + e(q.no) + (q.version > 1 ? '/' + e(q.version) : '') + '</span> · ' + T.date + ' <span class="ltr">' + e(fmt(q.date)) + '</span></div>' +
      '<table class="info">' + info.map(function (x) { return '<tr><td><b>' + e(x[0]) + '</b></td><td>' + e(x[1]) + '</td></tr>'; }).join('') + '</table>' +
      '<table><thead><tr><th>' + T.item + '</th><th class="n">' + T.qty + '</th><th>' + T.unit + '</th>' + (showDays ? '<th class="n">' + T.days + '</th>' : '') + '<th class="n">' + T.price + '</th><th class="n">' + T.total + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table class="sum"><tr><td>' + T.net + '</td><td class="n">' + money(tot.net) + '</td></tr><tr><td>' + T.vat + ' ' + tot.vatRate + '%</td><td class="n">' + money(tot.vat) + '</td></tr>' +
      '<tr class="grand"><td>' + T.gross + '</td><td class="n">' + money(tot.gross) + '</td></tr></table>' +
      '<p class="small">' + T.pricesNote + (q.validUntil ? ' ' + T.valid + ' <span class="ltr">' + e(fmt(q.validUntil)) + '</span>.' : '') + '</p>' +
      terms + notes + '<p style="margin-top:22px">' + T.regards + ',<br>' + e(biz.signer || biz.name).replace(/\n/g, '<br>') + '</p></body></html>';
  }

  /** The message that goes with the quote (WhatsApp or e-mail body), in the quote's language. */
  function quoteMessage(q, cs, signer) {
    var n = firstName(cs.contact || cs.client);
    var tot = quoteTotals(q.lines, q.vatRate);
    if (q.lang === 'en') return 'Hi' + (n ? ' ' + n : '') + ',\nAttached is our quotation for ' + (cs.kind || 'the event') + (cs.date ? ' on ' + fmt(cs.date) : '') + '. Total before VAT: ' + money(tot.net) + '.\nHappy to go over it together or adjust anything.\n' + (signer || '');
    if (q.lang === 'fr') return 'Bonjour' + (n ? ' ' + n : '') + ',\nVous trouverez ci-joint notre devis pour ' + (cs.kind || 'l’événement') + (cs.date ? ' du ' + fmt(cs.date) : '') + '. Total HT : ' + money(tot.net) + '.\nJe reste disponible pour en parler ou l’ajuster.\n' + (signer || '');
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך?\nמצורפת הצעת המחיר ל' + (cs.kind || 'אירוע') + (cs.date ? ' ב-' + fmt(cs.date) : '') + '. סה״כ לפני מע״מ: ' + money(tot.net) + '.\nאשמח לעבור עליה יחד או להתאים מה שצריך. תודה רבה!\n' + (signer || '');
  }

  /* ---------------- 4. follow-ups: clients who did not answer ---------------- */

  /** Cases in "lead" or "quote sent" where the client has not answered for `days` days. */
  function followups(cases, today, days) {
    today = day(today);
    var n = isNaN(num(days)) ? 1 : num(days);
    return cases.filter(function (c) {
      if (OPEN.indexOf(c.status) < 0) return false;
      var w = day(c.waitingSince);
      return w && daysBetween(w, today) >= n;
    }).map(function (c) {
      var waited = daysBetween(c.waitingSince, today);
      return { caseId: c.id, client: c.client, contact: c.contact, phone: c.phone, status: c.status, waited: waited,
        text: c.status === STATUS.quoted
          ? 'היי היי' + (firstName(c.contact || c.client) ? ' ' + firstName(c.contact || c.client) : '') + ', מה שלומך? רציתי לבדוק אם יצא לך לעבור על ההצעה' + (c.date ? ' ל-' + fmt(c.date) : '') + '. אשמח לענות על שאלות או להתאים מה שצריך. תודה רבה!'
          : 'היי היי' + (firstName(c.contact || c.client) ? ' ' + firstName(c.contact || c.client) : '') + ', מה שלומך? חוזרת אליך לגבי האירוע' + (c.date ? ' ב-' + fmt(c.date) : '') + '. יש עדכון? אשמח לדעת איך להתקדם :)' };
    }).sort(function (a, b) { return b.waited - a.waited; });
  }

  /* ---------------- 5. suppliers ---------------- */

  function eventLine(cs) {
    return [cs.kind, cs.date ? fmt(cs.date) : '', cs.hours, cs.place, cs.participants ? cs.participants + ' משתתפים' : ''].filter(function (x) { return trim(x); }).join(' · ');
  }

  /** Asking a supplier for a price and availability. what = what we need from this supplier. */
  function supplierRequest(cs, sup, what, signer, replyBy) {
    var n = firstName(sup.contact || sup.name);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך?\n' +
      'אני בונה הצעה לאירוע: ' + eventLine(cs) + '.\n' +
      (trim(what) ? 'מה צריך: ' + trim(what) + '.\n' : '') +
      'אשמח לדעת בבקשה אם התאריך פנוי אצלך ומה המחיר' + (replyBy ? ', עד ' + fmt(replyBy) : '') + '. זה די דחוף :)\nתודה רבה!' + (signer ? '\n' + signer : '');
  }

  /** One change, one message per supplier: only the suppliers of this event, each with their own name. */
  function changeMessage(cs, sup, change, signer) {
    var n = firstName(sup.contact || sup.name);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך? עדכון לגבי ' + (cs.kind || 'האירוע') + (cs.date ? ' ב-' + fmt(cs.date) : '') + (cs.client ? ' (' + cs.client + ')' : '') + ':\n' +
      trim(change) + '\nאשמח בבקשה לאישור שקיבלת. תודה רבה!' + (signer ? '\n' + signer : '');
  }

  /** Suppliers of one type, best first (rating, then how many events they did with us). */
  function rankSuppliers(sups, type, links) {
    var count = {};
    (links || []).forEach(function (l) { count[l.supplierId] = (count[l.supplierId] || 0) + 1; });
    return sups.filter(function (s) { return !type || s.type === type; }).filter(function (s) { return !/^(לא|no)$/i.test(trim(s.active)); })
      .map(function (s) { return Object.assign({}, s, { events: count[s.id] || 0 }); })
      .sort(function (a, b) { return (num(b.rating) || 0) - (num(a.rating) || 0) || b.events - a.events || str(a.name).localeCompare(str(b.name), 'he'); });
  }

  /* ---------------- 6. production schedule ---------------- */

  /**
   * rows: [{date, start, end, what, where, who}] of one event. Finds: end before start, the same person or supplier
   * in two places at once, a supplier who arrives after their first slot, rows with no one responsible.
   */
  function scheduleCheck(rows, arrivals) {
    var issues = [];
    var norm = rows.map(function (r, i) {
      return { i: i, date: iso(r.date) || '', s: minutes(r.start), e: minutes(r.end), what: trim(r.what), where: trim(r.where),
        who: str(r.who).split(/[,;]+/).map(trim).filter(Boolean) };
    });
    norm.forEach(function (r) {
      if (r.s == null && trim(rows[r.i].start)) issues.push({ row: r.i, kind: 'שעה', text: '"' + r.what + '": שעת ההתחלה לא ברורה (' + rows[r.i].start + ')' });
      if (r.s != null && r.e != null && r.e < r.s && r.e > 0) issues.push({ row: r.i, kind: 'שעה', text: '"' + r.what + '": מסתיים לפני שהוא מתחיל' });
      if (!r.who.length) issues.push({ row: r.i, kind: 'אחראי', text: '"' + r.what + '" בלי אחראי' });
    });
    for (var a = 0; a < norm.length; a++) for (var b = a + 1; b < norm.length; b++) {
      var x = norm[a], y = norm[b];
      if (x.date !== y.date || x.s == null || y.s == null) continue;
      var xe = x.e == null ? x.s + 1 : x.e, ye = y.e == null ? y.s + 1 : y.e;
      if (x.s < ye && y.s < xe) {
        x.who.forEach(function (w) {
          if (y.who.indexOf(w) >= 0 && !/^(כולם|הצוות|all)$/i.test(w) && x.where !== y.where)
            issues.push({ row: b, kind: 'התנגשות', text: w + ' משובץ בשני מקומות בו-זמנית: "' + x.what + '" (' + hhmm(rows[a].start) + ') ו"' + y.what + '" (' + hhmm(rows[b].start) + ')' });
        });
      }
    }
    Object.keys(arrivals || {}).forEach(function (who) {
      var arr = minutes(arrivals[who]);
      if (arr == null) return;
      var first = norm.filter(function (r) { return r.who.indexOf(who) >= 0 && r.s != null; }).sort(function (p, q) { return p.s - q.s; })[0];
      if (first && first.s < arr) issues.push({ row: first.i, kind: 'הגעה', text: who + ' מגיע ב-' + hhmm(arrivals[who]) + ', אבל משובץ כבר ב-' + hhmm(rows[first.i].start) + ' ל"' + first.what + '"' });
    });
    return issues;
  }

  /** The part of the schedule that concerns one person or supplier (plus rows for everyone). */
  function scheduleFor(rows, who) {
    return rows.filter(function (r) { return str(r.who).split(/[,;]+/).map(trim).some(function (w) { return w === who || /^(כולם|all)$/i.test(w); }); })
      .sort(function (a, b) { return (iso(a.date) || '').localeCompare(iso(b.date) || '') || (minutes(a.start) || 0) - (minutes(b.start) || 0); });
  }
  function scheduleText(cs, rows, who, signer) {
    var mine = scheduleFor(rows, who);
    var multiDay = mine.some(function (r) { return iso(r.date) && iso(r.date) !== iso(mine[0].date); });
    var lines = mine.map(function (r) {
      return '• ' + (multiDay && r.date ? fmt(r.date) + ' ' : '') + hhmm(r.start) + (trim(r.end) ? '-' + hhmm(r.end) : '') + ' ' + trim(r.what) + (trim(r.where) ? ' · ' + trim(r.where) : '');
    });
    var n = firstName(who);
    return 'היי' + (n ? ' ' + n : '') + ', הלו״ז שלך ל' + (cs.kind || 'אירוע') + (cs.date ? ' ב-' + fmt(cs.date) : '') + (cs.place ? ', ' + cs.place : '') + ':\n' + lines.join('\n') +
      '\nאם משהו לא מסתדר, תעדכן אותי.' + (signer ? '\n' + signer : '');
  }
  /** Standard run-of-show by kind of event: a starting point, times relative to the start of the event. */
  var SCHEDULE_TPL = {
    'default': [['-180', 'הגעת צוות ההפקה והקמה', 'צוות'], ['-150', 'הגעת ספקים והקמה', 'ספקים'], ['-60', 'בדיקת סאונד ותאורה', 'הגברה ותאורה'], ['-30', 'סבב בדיקה אחרון', 'צוות'],
      ['0', 'קבלת פנים', 'כולם'], ['60', 'תוכן מרכזי', 'צוות'], ['120', 'ארוחה', 'קייטרינג ושפים'], ['210', 'סיום', 'כולם'], ['225', 'פירוק', 'ספקים']],
    'חתונה': [['-240', 'הגעת צוות ההפקה', 'צוות'], ['-210', 'עיצוב ופרחים', 'עיצוב ופרחים'], ['-120', 'צילומי זוג', 'צילום ווידאו'], ['-60', 'בדיקת סאונד', 'הגברה ותאורה'],
      ['0', 'קבלת פנים', 'כולם'], ['75', 'חופה', 'כולם'], ['105', 'כניסה לאולם וריקוד ראשון', 'תקליטנים ולהקות'], ['120', 'ארוחה', 'קייטרינג ושפים'], ['300', 'סיום', 'כולם']],
    'כנס': [['-150', 'הקמה ורישום', 'צוות'], ['-60', 'בדיקת מצגות וסאונד', 'הגברה ותאורה'], ['0', 'רישום וכיבוד', 'צוות'], ['30', 'פתיחה', 'כולם'],
      ['120', 'הפסקה', 'קייטרינג ושפים'], ['150', 'מושב שני', 'כולם'], ['240', 'ארוחת צהריים', 'קייטרינג ושפים'], ['300', 'סיום', 'כולם']],
    'יום גיבוש': [['-90', 'הגעת צוות והקמה', 'צוות'], ['-30', 'הגעת הסעות לנקודות האיסוף', 'הסעות'], ['0', 'איסוף משתתפים', 'הסעות'], ['60', 'פתיחה וארוחת בוקר', 'קייטרינג ושפים'],
      ['120', 'פעילות', 'מדריכי טיולים'], ['270', 'ארוחת צהריים', 'קייטרינג ושפים'], ['360', 'סיום ויציאת הסעות', 'הסעות']]
  };
  function scheduleFromTemplate(kind, startHHMM, date) {
    var tpl = SCHEDULE_TPL[kind] || SCHEDULE_TPL['default'];
    var s0 = minutes(startHHMM);
    if (s0 == null) s0 = 19 * 60;
    return tpl.map(function (r) {
      var m = s0 + +r[0]; if (m < 0) m += 1440; m = m % 1440;
      return { date: date || '', start: pad2(Math.floor(m / 60)) + ':' + pad2(m % 60), end: '', what: r[1], where: '', who: r[2] };
    });
  }

  /* ---------------- 7. money ---------------- */

  var PAY = { due: 'לגבות', invoiceAsked: 'ביקשנו חשבונית', invoiced: 'חשבונית יצאה', paid: 'שולם' };

  /** What to collect from clients: overdue, due this week, and missing invoice requests. */
  function collections(payments, cases, today) {
    today = day(today);
    var byId = {}; cases.forEach(function (c) { byId[c.id] = c; });
    var list = payments.filter(function (p) { return p.status !== PAY.paid && num(p.amount); }).map(function (p) {
      var due = day(p.due), c = byId[p.caseId] || {};
      return { row: p.row, caseId: p.caseId, client: c.client || '', amount: num(p.amount), due: fmt(due), status: p.status || PAY.due,
        late: due ? daysBetween(due, today) : null, note: p.note };
    });
    var sum = function (arr) { return arr.reduce(function (a, p) { return a + p.amount; }, 0); };
    var overdue = list.filter(function (p) { return p.late != null && p.late > 0; });
    var soon = list.filter(function (p) { return p.late != null && p.late <= 0 && p.late >= -7; });
    var noInvoice = list.filter(function (p) { return p.status === PAY.due && p.late != null && p.late >= -3; });
    return { open: list, overdue: overdue, soon: soon, noInvoice: noInvoice, openTotal: sum(list), overdueTotal: sum(overdue) };
  }

  /** Supplier payments still open after the event. */
  function supplierDue(links, cases, sups, today) {
    today = day(today);
    var byId = {}; cases.forEach(function (c) { byId[c.id] = c; });
    var supById = {}; sups.forEach(function (s) { supById[s.id] = s; });
    return links.filter(function (l) { return !yes(l.paid) && num(l.cost) && /אושר|הוזמן/.test(str(l.status)); }).map(function (l) {
      var c = byId[l.caseId] || {}, s = supById[l.supplierId] || {};
      return { row: l.row, caseId: l.caseId, client: c.client, date: fmt(c.date), supplier: s.name || l.supplierId, amount: num(l.cost), after: c.date ? daysBetween(c.date, today) : null };
    }).filter(function (x) { return x.after != null && x.after >= 0; }).sort(function (a, b) { return b.after - a.after; });
  }

  /** The e-mail to Roy asking to issue an invoice: everything he needs in one place. */
  function invoiceRequest(pay, cs, client, signer) {
    var lines = [
      'שלום רועי,', '',
      'צריך להוציא חשבונית:',
      '• לקוח: ' + (client.legalName || client.name || cs.client || ''),
      client.taxId ? '• ח.פ. / ע.מ.: ' + client.taxId : '',
      client.address ? '• כתובת: ' + client.address : '',
      '• אירוע: ' + eventLine(cs),
      '• סכום לפני מע״מ: ' + money(num(pay.amount)),
      pay.note ? '• פירוט: ' + pay.note : '',
      pay.due ? '• מועד תשלום: ' + fmt(pay.due) : '',
      client.email ? '• לשלוח ל: ' + client.email : '',
      cs.quoteNo ? '• לפי הצעה ' + cs.quoteNo : '', '',
      'תודה,', signer || 'וירג׳יני'
    ].filter(function (x, i, a) { return x !== '' || (a[i - 1] !== '' && i > 0); });
    return { subject: 'בקשה לחשבונית · ' + (client.name || cs.client) + (cs.date ? ' · ' + fmt(cs.date) : ''), text: lines.join('\n') };
  }

  function paymentReminder(pay, cs, contact) {
    var n = firstName(contact || cs.contact || cs.client);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך? תזכורת קטנה לגבי התשלום על ' + (cs.kind || 'האירוע') + (cs.date ? ' מ-' + fmt(cs.date) : '') + ': ' + money(num(pay.amount)) +
      (pay.invoiceNo ? ' (חשבונית ' + pay.invoiceNo + ')' : '') + '. אם כבר הועבר, אשמח לאסמכתא בבקשה. תודה רבה!';
  }

  /* ---------------- 8. checklists, team, after the event ---------------- */

  var CHECK_SEED = [
    ['ציוד', 'הכל', 'ערכת עזרה ראשונה'], ['ציוד', 'הכל', 'מאריכים ומפצלים'], ['ציוד', 'הכל', 'דבק, מספריים, אזיקונים, סלוטייפ'], ['ציוד', 'הכל', 'שלטי הכוונה'],
    ['ציוד', 'הכל', 'לו״ז מודפס ורשימת טלפונים של ספקים'], ['ציוד', 'הכל', 'שקיות זבל'], ['ציוד', 'הכל', 'מטענים וסוללה ניידת'], ['ציוד', 'הכל', 'עטים ודפים'],
    ['ציוד', 'חתונה', 'כתובה ומסמכי הרב'], ['ציוד', 'חתונה', 'ערכת חירום לכלה: סיכות, חוט ומחט, מגבונים'], ['ציוד', 'חתונה', 'כוס לשבירה'],
    ['ציוד', 'כנס', 'תגי שם'], ['ציוד', 'כנס', 'מחשב גיבוי ומצגות על דיסק און קי'], ['ציוד', 'כנס', 'שלט רחוק למצגת'], ['ציוד', 'כנס', 'רשימת נרשמים מודפסת'],
    ['ציוד', 'משלחת או סיור', 'רשימת משתתפים עם צילומי דרכונים'], ['ציוד', 'משלחת או סיור', 'שיבוץ חדרים'], ['ציוד', 'משלחת או סיור', 'מים לאוטובוסים'],
    ['ציוד', 'יום גיבוש', 'מים וכובעים'], ['ציוד', 'יום גיבוש', 'רשימת נוסעים לכל אוטובוס'],
    ['לפני האירוע', 'הכל', 'אישור סופי מכל ספק: שעה, מקום, איש קשר'], ['לפני האירוע', 'הכל', 'מספר משתתפים סופי לקייטרינג'], ['לפני האירוע', 'הכל', 'אלרגיות ומגבלות לקייטרינג'],
    ['לפני האירוע', 'הכל', 'לו״ז נשלח לכל ספק ולצוות'], ['לפני האירוע', 'הכל', 'אישור הגעה מכל איש צוות'], ['לפני האירוע', 'הכל', 'שמות לתגים ולשילוט'],
    ['לפני האירוע', 'הכל', 'ביטוח ואישורים למקום'], ['לפני האירוע', 'הכל', 'תחזית מזג אוויר ותוכנית גשם'],
    ['אחרי האירוע', 'הכל', 'תודה אישית ללקוח'], ['אחרי האירוע', 'הכל', 'בקשת חשבונית לגבייה'], ['אחרי האירוע', 'הכל', 'תשלום לכל הספקים'], ['אחרי האירוע', 'הכל', 'דירוג ספקים'],
    ['אחרי האירוע', 'הכל', 'תמונות לתיקיית האירוע'], ['אחרי האירוע', 'הכל', 'תחקיר קצר: מה עבד ומה לא'], ['אחרי האירוע', 'הכל', 'סקר שביעות רצון ללקוח'],
    ['אחרי האירוע', 'הכל', 'בקשת המלצה מהלקוח']
  ];
  function checklistFor(templates, kind) {
    return templates.filter(function (t) { return t.kind === 'הכל' || t.kind === kind; }).map(function (t) { return { list: t.list, item: t.item }; });
  }

  function staffMessage(cs, st, signer) {
    var n = firstName(st.name);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך? לגבי ' + (cs.kind || 'האירוע') + (cs.date ? ' ב-' + fmt(cs.date) : '') + (cs.place ? ' ב' + cs.place : '') + ':\n' +
      (st.role ? 'תפקיד: ' + st.role + '\n' : '') + (st.arrive ? 'הגעה: ' + hhmm(st.arrive) + '\n' : '') + 'אשמח לאישור שאת/ה מגיע/ה בבקשה. תודה רבה!' + (signer ? '\n' + signer : '');
  }

  function thanksMessage(cs, contact) {
    var n = firstName(contact || cs.contact || cs.client);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך? תודה רבה על ' + (cs.kind || 'האירוע') + '! היה לנו כיף גדול לעבוד איתכם, ומחכה כבר לפעם הבאה :)';
  }
  function reviewMessage(cs, contact, link) {
    var n = firstName(contact || cs.contact || cs.client);
    return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך? אם נהניתם, אשמח מאוד להמלצה קצרה בבקשה' + (link ? ': ' + link : '') + '. זה עוזר לנו מאוד. תודה רבה!';
  }

  /* ---------------- 9. search ---------------- */

  function normHe(s) {
    return str(s).toLowerCase().replace(/[ךםןףץ]/g, function (c) { return { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]; })
      .replace(/[֑-ׇ״׳"'`]/g, '').replace(/\s+/g, ' ').trim();
  }
  /** docs: [{type, id, title, sub, text}] → the ones matching every word of q (phones matched by digits). */
  function search(docs, q) {
    var words = normHe(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return docs.map(function (d) {
      var hay = normHe(d.title + ' ' + d.sub + ' ' + d.text), digits = str(d.title + ' ' + d.sub + ' ' + d.text).replace(/\D/g, '');
      var score = 0;
      var all = words.every(function (w) {
        var wd = w.replace(/\D/g, '');
        if (wd.length >= 4 && w.replace(/[\d\-\s+]/g, '') === '') { var x = wd.replace(/^0/, ''); if (digits.indexOf(x) >= 0) { score += 3; return true; } return false; }
        var i = hay.indexOf(w);
        if (i < 0) return false;
        score += normHe(d.title).indexOf(w) >= 0 ? 3 : 1;
        return true;
      });
      return all ? Object.assign({ score: score }, d) : null;
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 40);
  }

  /* ---------------- 10. today: everything that needs her ---------------- */

  function today_(data, today, settings) {
    today = day(today);
    settings = settings || {};
    var out = [];
    var up = data.cases.filter(function (c) { var d = day(c.date); return d && d >= today && daysBetween(today, d) <= 14 && ACTIVE.indexOf(c.status) >= 0; })
      .sort(function (a, b) { return day(a.date) - day(b.date); });
    up.forEach(function (c) {
      var open = (data.checks || []).filter(function (k) { return k.caseId === c.id && !yes(k.done) && k.list !== 'אחרי האירוע'; }).length;
      var unconfirmed = (data.staff || []).filter(function (s) { return s.caseId === c.id && !yes(s.confirmed); }).length;
      var supPending = (data.links || []).filter(function (l) { return l.caseId === c.id && !/אושר|הוזמן|בוטל/.test(str(l.status)); }).length;
      out.push({ type: 'upcoming', caseId: c.id, title: (c.client || '') + ' · ' + (c.kind || ''), when: fmt(c.date), inDays: daysBetween(today, c.date),
        details: [open ? open + ' משימות פתוחות' : '', unconfirmed ? unconfirmed + ' מהצוות לא אישרו' : '', supPending ? supPending + ' ספקים לא אושרו' : '', c.status !== STATUS.won ? 'עוד לא נסגר' : ''].filter(Boolean) });
    });
    followups(data.cases, today, settings.followupDays).forEach(function (f) { out.push(Object.assign({ type: 'followup' }, f)); });
    var col = collections(data.payments || [], data.cases, today);
    col.overdue.forEach(function (p) { out.push(Object.assign({ type: 'overdue' }, p)); });
    col.noInvoice.forEach(function (p) { if (!(p.late > 0)) out.push(Object.assign({ type: 'invoice' }, p)); });
    supplierDue(data.links || [], data.cases, data.suppliers || [], today).forEach(function (s) { out.push(Object.assign({ type: 'supplierPay' }, s)); });
    var afterList = data.cases.filter(function (c) { var d = day(c.date); return d && d < today && daysBetween(d, today) <= 30 && (c.status === STATUS.won || c.status === STATUS.done); });
    afterList.forEach(function (c) {
      var open = (data.checks || []).filter(function (k) { return k.caseId === c.id && !yes(k.done) && k.list === 'אחרי האירוע'; }).length;
      if (open) out.push({ type: 'after', caseId: c.id, title: (c.client || '') + ' · ' + (c.kind || ''), when: fmt(c.date), open: open });
    });
    return out;
  }

  function morningText(items, asOf) {
    if (!items.length) return '';
    var g = function (t) { return items.filter(function (x) { return x.type === t; }); };
    var parts = [];
    var up = g('upcoming');
    if (up.length) parts.push('אירועים בשבועיים הקרובים:\n' + up.map(function (x) { return '• ' + x.when + ' ' + x.title + (x.details.length ? ' · ' + x.details.join(', ') : ''); }).join('\n'));
    var fu = g('followup');
    if (fu.length) parts.push('לקוחות שמחכים לחזרה:\n' + fu.map(function (x) { return '• ' + x.client + ' · ' + x.status + ' · ' + x.waited + ' ימים'; }).join('\n'));
    var od = g('overdue');
    if (od.length) parts.push('תשלומים באיחור:\n' + od.map(function (x) { return '• ' + x.client + ' · ' + money(x.amount) + ' · ' + x.late + ' ימים'; }).join('\n'));
    var inv = g('invoice');
    if (inv.length) parts.push('צריך לבקש חשבונית:\n' + inv.map(function (x) { return '• ' + x.client + ' · ' + money(x.amount) + (x.due ? ' · עד ' + x.due : ''); }).join('\n'));
    var sp = g('supplierPay');
    if (sp.length) parts.push('ספקים שעוד לא שולמו:\n' + sp.map(function (x) { return '• ' + x.supplier + ' · ' + money(x.amount) + ' · ' + x.client + ' ' + x.date; }).join('\n'));
    var af = g('after');
    if (af.length) parts.push('סגירת אירועים:\n' + af.map(function (x) { return '• ' + x.title + ' · ' + x.open + ' משימות סגירה'; }).join('\n'));
    return 'בוקר טוב,\n\nמה מחכה היום' + (asOf ? ' (' + asOf + ')' : '') + ':\n\n' + parts.join('\n\n');
  }

  return {
    STATUS: STATUS, OPEN: OPEN, ACTIVE: ACTIVE, KINDS: KINDS, PAY: PAY, FIELD_HE: FIELD_HE, CHECK_SEED: CHECK_SEED, SCHEDULE_TPL: SCHEDULE_TPL, QL: QL,
    day: day, fmt: fmt, iso: iso, daysBetween: daysBetween, addDays: addDays, addMonths: addMonths, minutes: minutes, hhmm: hhmm, num: num, money: money, yes: yes,
    parseLead: parseLead, followupQuestions: followupQuestions, missingOf: missingOf,
    clientHistory: clientHistory, latestQuote: latestQuote,
    quoteTotals: quoteTotals, nextQuoteNo: nextQuoteNo, lineFromPrice: lineFromPrice, cloneQuote: cloneQuote, quoteHtml: quoteHtml, quoteMessage: quoteMessage,
    followups: followups, eventLine: eventLine, supplierRequest: supplierRequest, changeMessage: changeMessage, rankSuppliers: rankSuppliers,
    scheduleCheck: scheduleCheck, scheduleFor: scheduleFor, scheduleText: scheduleText, scheduleFromTemplate: scheduleFromTemplate,
    collections: collections, supplierDue: supplierDue, invoiceRequest: invoiceRequest, paymentReminder: paymentReminder,
    checklistFor: checklistFor, staffMessage: staffMessage, thanksMessage: thanksMessage, reviewMessage: reviewMessage,
    normHe: normHe, search: search, today: today_, morningText: morningText
  };
})();

export default Office;
