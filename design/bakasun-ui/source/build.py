"""Build four independent offline HTML proposals. Python standard library only."""
from pathlib import Path
import base64

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
ICONS = {
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    'moon': '<path d="M20.4 14.2A9 9 0 0 1 9.8 3.6a9 9 0 1 0 10.6 10.6Z"/>',
    'home': '<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-7h6v7"/>',
    'board': '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m6-16v16M5 8h1m5 0h2m4 0h2M5 12h1m5 0h2"/>',
    'folder': '<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    'invoice': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6m-6 4h6m-6 4h3"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'arrow': '<path d="M19 12H5m6-6-6 6 6 6"/>',
    'back': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    'users': '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-16a3 3 0 0 1 0 6m4 10v-3a6 6 0 0 0-2-4"/>',
    'check': '<path d="m5 12 4 4L19 6"/>',
    'alert': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3h.01"/>',
    'search': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    'pin': '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    'more': '<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
    'file': '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',
    'money': '<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M5 12h.01M19 12h.01"/>',
    'food': '<path d="M5 3v7a2 2 0 0 0 4 0V3M7 3v18m12 0V3c-4 2-4 10 0 10"/>',
    'sound': '<path d="m12 4-7 5H2v6h3l7 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    'spark': '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
}

def icon(name, cls=''):
    return f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'

def badge(text, tone=''):
    return f'<span class="badge {tone}"><span class="dot" aria-hidden="true"></span>{text}</span>'

def preview(text, name='plus', description='', cls='primary'):
    return f'<button class="btn {cls}" data-preview="{text}" data-description="{description}">{icon(name)}{text}</button>'

def section(title, link='', href='event.html'):
    return f'<div class="section-head"><h2>{title}</h2>{f"<a class=text-link href={href}>{link}{icon('arrow')}</a>" if link else ""}</div>'

def metric(label, value, note, glyph, emphasis=False):
    return f'<div class="metric {"emphasis" if emphasis else ""}"><div class="metric-top"><span>{label}</span>{icon(glyph)}</div><strong>{value}</strong><small>{note}</small></div>'

def task(title, context, state, tone='warn'):
    return f'<div class="task"><button class="check" data-check aria-pressed="false" aria-label="סימון השלמה: {title}"><span>{icon("check")}</span></button><div class="grow"><h3>{title}</h3><p>{context}</p></div>{badge(state,tone)}</div>'

PAGES = [('index.html','היום','home'),('events.html','לוח אירועים','board'),('event.html','תיק אירוע','folder'),('invoices.html','חשבוניות','invoice')]

def shell(filename, body):
    title = next(label for path,label,_ in PAGES if path == filename)
    def nav(bottom=False):
        return ''.join(f'<a class="{"" if bottom else "nav-link"}" href="{path}" {"aria-current=page" if path == filename else ""}>{icon(glyph)}<span>{label}</span></a>' for path,label,glyph in PAGES)
    brand = f'<div class="brand">{icon("sun","brand-mark")}<div><div class="brand-name">באקה סאן</div><small>ניהול הפקות ואירועים</small></div></div>'
    font = ''.join('@font-face{font-family:"Baka Noto";font-style:normal;font-weight:'+weight+';font-display:swap;src:url(data:font/ttf;base64,'+base64.b64encode((HERE/f'NotoSansHebrew-{name}.ttf').read_bytes()).decode()+') format("truetype")}\n' for name,weight in [('Regular','400'),('Bold','700')])
    return f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="description" content="הצעת עיצוב בלבד לבאקה סאן. כל הנתונים בדויים. תצוגה עצמאית ללא רשת.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='%23ba4833'/%3E%3C/svg%3E">
<title>{title} · באקה סאן · הצעת עיצוב</title>
<script>
(() => {{
  let saved; try {{ saved = localStorage.getItem('bakasun-design-theme'); }} catch (_) {{}}
  const query = new URLSearchParams(location.search).get('theme');
  const theme = ['light','dark'].includes(query) ? query : ['light','dark'].includes(saved) ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
}})();
</script>
<style>{font}{(HERE/'ui.css').read_text()}</style>
</head><body>
<a href="#main" class="skip">דילוג לתוכן</a>
<aside class="rail">{brand}<nav aria-label="ניווט ראשי">{nav()}</nav><div class="rail-foot"><div class="row"><span class="avatar">ב</span><div><strong>סביבת עיצוב</strong>נתונים בדויים בלבד</div></div></div></aside>
<div class="workspace">
<header class="topbar"><div class="breadcrumb">סביבת העבודה <span aria-hidden="true"> / </span><span>{title}</span></div><div class="mobile-brand">{brand}</div><div class="tools"><span class="demo">הצעת עיצוב</span><button class="icon-btn" data-theme-toggle aria-label="מעבר למצב כהה" aria-pressed="false">{icon('moon','moon')}{icon('sun','sun-icon')}</button><span class="avatar" aria-hidden="true">ב</span></div></header>
<main id="main">{body}<footer class="design-foot"><span>הצעת עיצוב · כל הנתונים בדויים</span><span>באקה סאן / נובמבר 2026</span></footer></main>
</div>
<nav class="bottom-nav" aria-label="ניווט בטלפון">{nav(True)}</nav>
<dialog aria-labelledby="dialog-title" aria-describedby="dialog-body"><span class="dialog-label">{icon('spark')} תצוגת עיצוב</span><h2 id="dialog-title"></h2><p id="dialog-body" data-dialog-body></p><button class="btn primary" data-close>חזרה לתצוגה</button></dialog>
<div class="toast" role="status" hidden></div>
<script>{(HERE/'ui.js').read_text()}</script>
</body></html>'''

def today():
    return f'''
<div class="page-head"><div><p class="eyebrow">יום רביעי, 4 בנובמבר 2026</p><h1>בוקר טוב, יום חדש.</h1><p class="subtitle">הכול במקום. אפשר להתחיל בעיקר.</p></div>{preview('פנייה חדשה')}</div>
<div class="metrics">{metric('אירועים קרובים','3','בשבועיים הקרובים','calendar')}{metric('משימות להיום','4','אחת בעדיפות גבוהה','check',True)}{metric('ממתינים לתשובה','2','הצעות מספקים','clock')}</div>
<div class="two-col"><div>
<section aria-labelledby="focus-title"><div class="card focus-card"><div class="row">{icon('spark')}<span>הצעד הבא שלך</span><span class="badge neutral" style="margin-inline-start:auto">עד 12:00</span></div><h2 id="focus-title">לסגור את התפריט.<br>ולהתקדם בראש שקט.</h2><p class="subtitle">מפגש צוות 01 · מחר · 80 משתתפים</p><a class="btn primary" href="event.html">פתיחת תיק האירוע {icon('arrow')}</a><span class="orbit" aria-hidden="true"></span></div></section>
<section>{section('על הפרק היום','לתיק האירוע')}<div class="card" style="padding-block:2px">{task('אישור תפריט סופי','מפגש צוות 01 · ממתין לאישור לקוח','דחוף','hot')}{task('בדיקת הצעת הגברה','מפגש צוות 01 · הצעה אחת לבדיקה','עד 14:00')}{task('איסוף חשבונית ספק','אירוע דוגמה 02 · שירותי עיצוב','היום','neutral')}{task('אישור מספר משתתפים','אירוע דוגמה 03 · לקוח דוגמה ג׳','היום','neutral')}</div></section>
</div><div>
<section>{section('האירוע הקרוב','ללוח האירועים','events.html')}<a class="card event-compact" href="event.html"><div class="date-tile"><strong>05</strong><small>נובמבר</small></div><div class="grow"><h3>מפגש צוות 01</h3><p>לקוח דוגמה א׳ · 80 משתתפים</p>{badge('בהפקה')} {badge('2 קצוות פתוחים','warn')}</div>{icon('arrow','arrow')}</a></section>
<section>{section('היום בקצרה')}<div class="card day-agenda"><div class="agenda-line"><time>09:30</time><p>תיאום אחרון עם האולם<small>מפגש צוות 01 · מקום דוגמה א׳</small></p></div><div class="agenda-line"><time>12:00</time><p>סגירת תפריט<small>מפגש צוות 01 · החלטה נדרשת</small></p></div><div class="agenda-line"><time>14:00</time><p>בדיקת הצעת הגברה<small>מפגש צוות 01 · ספק דוגמה ב׳</small></p></div></div></section>
<section>{section('גם הכסף מסודר')}<a class="card row between" href="invoices.html"><div><p class="small muted">ממתין לגבייה החודש</p><h2 style="margin-top:6px"><bdi>₪20,200</bdi></h2><p class="small muted">2 חשבוניות · אחת באיחור</p></div><span class="icon-btn" aria-hidden="true">{icon('arrow')}</span></a></section>
</div></div>'''

EVENTS = [
    ('lead','פנייה חדשה','אירוע דוגמה 04','לקוח דוגמה ד׳','25.11.26','60','יום צוות','₪12,000','לברר זמינות','blue'),
    ('quoted','הצעה נשלחה','אירוע דוגמה 03','לקוח דוגמה ג׳','12.11.26','120','כנס','₪24,000','ממתין לתשובה','warn'),
    ('quoted','הצעה נשלחה','אירוע דוגמה 05','לקוח דוגמה ה׳','19.11.26','45','יום צוות','₪9,800','למעקב היום','hot'),
    ('won','אושר','מפגש צוות 01','לקוח דוגמה א׳','05.11.26','80','יום צוות','₪16,000','2 קצוות פתוחים','warn'),
    ('won','אושר','אירוע דוגמה 06','לקוח דוגמה ו׳','16.11.26','150','כנס','₪32,000','הכול מתקדם',''),
    ('done','הסתיים','אירוע דוגמה 02','לקוח דוגמה ב׳','28.10.26','40','יום צוות','₪8,400','ממתין לגבייה','warn'),
]

def board_card(e):
    state,status,title,client,date,people,kind,money,note,tone=e
    detail = 'href="event.html"' if title=='מפגש צוות 01' else f'data-preview="{title}" data-description="תצוגת כרטיס בדוי: {client}, {date}, {people} משתתפים. תיק האירוע המפורט בהצעה הוא מפגש צוות 01."'
    tag = 'a' if title=='מפגש צוות 01' else 'button'
    return f'<{tag} class="board-card" style="width:100%;text-align:start" {detail} data-item data-state="{state}" data-kind="{kind}">{badge(note,tone)}<h3>{title}</h3><p>{client} · {kind}</p><strong class="money"><bdi>{money}</bdi></strong><div class="meta">{icon("calendar")}<bdi>{date}</bdi><span style="margin-inline-start:auto">{people} משתתפים</span></div></{tag}>'

def events():
    states=[('lead','פנייה חדשה','blue'),('quoted','הצעה נשלחה','warn'),('won','אושר',''),('done','הסתיים','neutral'),('lost','לא יצא לפועל','neutral')]
    filters=''.join(f'<button class="filter" aria-pressed="{str(state=="won").lower()}" data-filter="{state}">{title}<span class="count">{sum(e[0]==state for e in EVENTS)}</span></button>' for state,title,_ in states)
    cols=''.join(f'<section class="board-col" data-column="{state}" data-mobile-active="{str(state=="won").lower()}"><header class="column-head"><span class="dot {"accent" if state=="quoted" else "green"}" aria-hidden="true"></span><h2>{title}</h2><span class="count" data-column-count>{sum(e[0]==state for e in EVENTS)}</span></header>{"".join(board_card(e) for e in EVENTS if e[0]==state)}<p class="empty" data-column-empty {"hidden" if any(e[0]==state for e in EVENTS) else ""}>אין אירועים בשלב הזה.</p></section>' for state,title,_ in states)
    return f'''<div class="page-head"><div><p class="eyebrow">מהפנייה הראשונה ועד הסגירה</p><h1>לוח אירועים</h1><p class="subtitle">6 אירועים. לכל אחד הצעד הבא שלו.</p></div>{preview('פנייה חדשה')}</div>
<div class="toolbar"><label class="search">{icon('search')}<input type="search" data-search placeholder="חיפוש אירוע או לקוח…" aria-label="חיפוש אירוע או לקוח בדוי"></label><select data-kind aria-label="סוג אירוע"><option value="all">כל סוגי האירועים</option><option>יום צוות</option><option>כנס</option></select></div>
<div class="filters" data-filters data-mode="board" data-initial="all" aria-label="סינון לפי שלב"><button class="filter" aria-pressed="true" data-filter="all">כל השלבים</button>{filters.replace('aria-pressed="true"','aria-pressed="false"')}</div>
<div class="board">{cols}</div><p class="board-note">בחרי שלב כדי להתמקד באירועים שבו. ״כל השלבים״ מציג את התמונה המלאה.</p>'''

def supplier(glyph,title,description,state,tone=''):
    return f'<div class="supplier"><span class="supplier-icon">{icon(glyph)}</span><div class="grow"><h3>{title}</h3><p>{description}</p></div>{badge(state,tone)}</div>'

def event():
    tabs=''.join(f'<button class="tab" id="tab-{key}" role="tab" aria-selected="{str(i==0).lower()}" aria-controls="panel-{key}" tabindex="{0 if i==0 else -1}">{label}</button>' for i,(key,label) in enumerate([('overview','במבט אחד'),('suppliers','ספקים'),('schedule','לו״ז'),('files','קבצים')]))
    return f'''<a class="back-link" href="events.html">{icon('back')}חזרה ללוח האירועים</a>
<header class="event-header"><div class="row between"><p class="small muted">תיק דוגמה <bdi>EV-001</bdi> · לקוח דוגמה א׳</p>{badge('אושר')}</div><h1>מפגש צוות 01</h1><div class="details"><span>{icon('calendar')}מחר, 5 בנובמבר</span><span>{icon('clock')}<bdi>09:00–17:00</bdi></span><span>{icon('users')}80 משתתפים</span><span>{icon('pin')}מקום דוגמה א׳</span></div><div class="progress"><div class="row between"><span>מוכנות לאירוע</span><strong><bdi>6 / 8</bdi> סגור</strong></div><div class="progress-track" role="progressbar" aria-label="מוכנות לאירוע" aria-valuemin="0" aria-valuemax="8" aria-valuenow="6"><span></span></div></div></header>
<div class="tabs" role="tablist" aria-label="מידע בתיק האירוע">{tabs}</div>
<div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview"><div class="notice">{icon('alert')}<div><h3>שני דברים קטנים לפני מחר</h3><p>אישור תפריט סופי ובדיקת הצעת הגברה.</p></div></div><div class="two-col"><div>
{section('מה עוד פתוח')}<div class="card" style="padding-block:2px">{task('אישור תפריט סופי','לקוח דוגמה א׳ · עד 12:00','דחוף','hot')}{task('בדיקת הצעת הגברה','ספק דוגמה ב׳ · עד 14:00','היום')}</div>
{section('תמונת התקציב','לחשבוניות','invoices.html')}<div class="card"><p class="small muted">מחיר האירוע · לפני מע״מ</p><h2 style="font-size:30px;margin-top:4px"><bdi>₪16,000</bdi></h2><dl class="mini-facts"><div><dt>עלויות מתוכננות</dt><dd><bdi>₪11,200</bdi></dd></div><div><dt>רווח מתוכנן</dt><dd class="green"><bdi>₪4,800</bdi></dd></div><div><dt>מקדמה ששולמה</dt><dd><bdi>₪6,000</bdi></dd></div><div><dt>יתרה לפני מע״מ</dt><dd><bdi>₪10,000</bdi></dd></div></dl></div>
</div><div>{section('הספקים בתמונה')}<div class="card" style="padding-block:3px">{supplier('pin','מקום דוגמה א׳','אולם ואירוח','סגור')}{supplier('food','ספק דוגמה א׳','קייטרינג · תפריט בבדיקה','ממתין','warn')}{supplier('sound','ספק דוגמה ב׳','הגברה · הצעה התקבלה','לבדיקה','blue')}</div>
{section('העדכון האחרון')}<div class="card"><div class="row"><span class="avatar">ב</span><div><h3 style="font-size:14px">מספר המשתתפים אושר</h3><p class="small muted">היום, 08:45 · 80 משתתפים</p></div></div><p class="small muted" style="margin-top:14px">אפשר להתקדם לסגירת התפריט והסידור באולם.</p></div></div></div></div>
<div id="panel-suppliers" role="tabpanel" aria-labelledby="tab-suppliers" hidden>{section('ספקים ושירותים')}<div class="card">{supplier('pin','מקום דוגמה א׳','אולם ואירוח · ₪5,000 לפני מע״מ','סגור')}{supplier('food','ספק דוגמה א׳','קייטרינג · ₪4,800 לפני מע״מ','ממתין לאישור','warn')}{supplier('sound','ספק דוגמה ב׳','הגברה · ₪1,400 לפני מע״מ','הצעה לבדיקה','blue')}</div></div>
<div id="panel-schedule" role="tabpanel" aria-labelledby="tab-schedule" hidden>{section('לו״ז יום האירוע')}<div class="card day-agenda">{''.join(f'<div class="agenda-line"><time>{time}</time><p>{label}<small>{note}</small></p></div>' for time,label,note in [('08:00','הקמה ובדיקת סאונד','ספק דוגמה ב׳'),('09:00','קבלת פנים וארוחת בוקר','מקום דוגמה א׳'),('10:00','פתיחת מפגש הצוות','אולם מרכזי'),('12:30','ארוחת צהריים','ספק דוגמה א׳'),('16:30','סיכום ומשוב','אולם מרכזי'),('17:00','סיום ופירוק','צוות ההפקה')])}</div></div>
<div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden>{section('מסמכי האירוע')}<div class="card">{supplier('file','הצעת מקום · דוגמה','מסמך בדוי · תצוגה בלבד','אושר')}{supplier('file','תפריט האירוע · דוגמה','מסמך בדוי · תצוגה בלבד','לאישור','warn')}{supplier('file','הצעת הגברה · דוגמה','מסמך בדוי · תצוגה בלבד','לבדיקה','blue')}</div></div>'''

INVOICES = [
    ('late','לקוח דוגמה ב׳','אירוע דוגמה 02','D-2601','₪8,400','28.10.26','באיחור של 7 ימים','באיחור','hot'),
    ('open','לקוח דוגמה א׳','מפגש צוות 01','D-2602','₪11,800','12.11.26','עוד 8 ימים','ממתין לתשלום','warn'),
    ('draft','לקוח דוגמה ג׳','אירוע דוגמה 03','טיוטה 03','₪12,000','טרם נקבע','ממתינה להפקה','טיוטה','blue'),
    ('paid','לקוח דוגמה ד׳','אירוע דוגמה 07','D-2599','₪6,000','02.11.26','התקבל ב־2 בנובמבר','שולם',''),
]

def invoices():
    filters=''.join(f'<button class="filter" aria-pressed="{str(i==0).lower()}" data-filter="{state}">{label}<span class="count">{count}</span></button>' for i,(state,label,count) in enumerate([('all','הכול',4),('late','באיחור',1),('open','ממתין',1),('draft','טיוטה',1),('paid','שולם',1)]))
    rows=''
    for state,client,event_name,number,money,date,note,status,tone in INVOICES:
        description=f'תצוגה בלבד של {number} עבור {client}. הסכום הבדוי הוא {money}. כל הסכומים במסך כוללים מע״מ; אין כאן מסמך מס אמיתי או פעולת הפקה.'
        rows+=f'<article class="invoice-row" data-item data-state="{state}"><div class="invoice-title"><span class="doc-icon">{icon("invoice")}</span><div><h3>{client}</h3><p>{number} · {event_name}</p></div></div><strong><bdi>{money}</bdi></strong><div class="invoice-date">{date}<small class="{"accent" if state=="late" else ""}">{note}</small></div><div class="invoice-action">{badge(status,tone)}<button aria-label="פרטי {number}" data-preview="פרטי {number}" data-description="{description}">{icon("more")}</button></div></article>'
    return f'''<div class="page-head"><div><p class="eyebrow">תמונה ברורה של הכסף</p><h1>חשבוניות</h1><p class="subtitle">נובמבר 2026 · הסכומים כוללים מע״מ</p></div>{preview('בקשת חשבונית','plus','כך תיראה כניסה להכנת בקשת חשבונית. ההפקה והשליחה יישארו באחריות הגורם המוסמך במערכת הקיימת.')}</div>
<div class="metrics invoice-metrics">{metric('ממתין לגבייה','<bdi>₪20,200</bdi>','2 חשבוניות','money')}{metric('מתוכו באיחור','<bdi>₪8,400</bdi>','חשבונית אחת','alert',True)}{metric('שולם החודש','<bdi>₪6,000</bdi>','חשבונית אחת','check')}</div>
<div class="toolbar"><label class="search">{icon('search')}<input type="search" data-search placeholder="חיפוש לקוח או מספר חשבונית…" aria-label="חיפוש לקוח או מספר חשבונית בדויים"></label></div><div class="filters" data-filters data-mode="invoices" aria-label="סינון לפי מצב חשבונית">{filters}</div>
<div class="invoice-list"><div class="invoice-labels" aria-hidden="true"><span>לקוח / אירוע</span><span>סכום כולל</span><span>מועד תשלום</span><span>מצב</span></div>{rows}</div><p class="empty" data-empty hidden>לא נמצאו חשבוניות התואמות לחיפוש.</p>
<p class="invoice-footnote">{icon('alert')}<span>מספרי המסמכים והסכומים בדויים. טיוטות אינן נכללות בסכום לגבייה. סכומי תיק האירוע מוצגים לפני מע״מ, יתרת החשבונית לאירוע 01 היא ₪11,800 כולל מע״מ של 18%.</span></p>'''

if __name__ == '__main__':
    for filename, content in [('index.html',today()),('events.html',events()),('event.html',event()),('invoices.html',invoices())]:
        path=OUT/filename
        path.write_text(shell(filename,content),encoding='utf-8')
        print(f'{path.name}: {path.stat().st_size:,} bytes')
