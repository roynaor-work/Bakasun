"""Build the six static, offline document templates; contains placeholders only."""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
fields = {}

def field(key, label, numeric=False):
    spec = {"label": label, "direction": "ltr" if numeric else "auto"}
    if key in fields and fields[key] != spec:
        raise ValueError(f'Inconsistent field definition: {key}')
    fields[key] = spec
    return f'<bdi class="placeholder{" numeric" if numeric else ""}" data-field="{key}" dir="{"ltr" if numeric else "auto"}">[{escape(label)}]</bdi>'

def section(n, title, body, cls=""):
    return f'<section class="section {cls}"><h2><span class="section-number">{n}</span>{title}</h2>{body}</section>'

def meta(items):
    return '<dl class="meta">' + ''.join(f'<div><dt>{label}</dt><dd>{field(key, hint)}</dd></div>' for label, key, hint in items) + '</dl>'

def box(label, key, hint, cls=""):
    return f'<div class="note-box {cls}"><h3>{label}</h3><p>{field(key, hint)}</p></div>'

def table(caption, headers, rows, widths=None, cls=""):
    cols = '<colgroup>' + ''.join(f'<col style="width:{w}%">' for w in widths) + '</colgroup>' if widths else ''
    return f'<table class="{cls}"><caption>{caption}</caption>{cols}<thead><tr>' + ''.join(f'<th scope="col">{h}</th>' for h in headers) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{v}</td>' for v in row) + '</tr>' for row in rows) + '</tbody></table>'

def signatures(a="אישור המזמין", b="אישור ההפקה"):
    return '<div class="signatures">' + ''.join(f'<section><h3>{label}</h3><p>{field(key+"_name", "שם ותפקיד")}</p><div class="signature-line">חתימה: __________________</div><p class="small">תאריך: {field(key+"_date", "תאריך חתימה")}</p></section>' for label,key in [(a,"sign_client"),(b,"sign_production")]) + '</div>'

def totals():
    return '<dl class="totals">' + ''.join(f'<div class="{c}"><dt>{l}</dt><dd>{field(k,h,True)}</dd></div>' for l,k,h,c in [("סכום לפני מע״מ","subtotal","סכום ביניים",""),("מע״מ · שיעור לפי דין","tax","סכום מע״מ",""),("סה״כ כולל מע״מ","total","סכום כולל","total")]) + '</dl>'

def money_rows(count):
    return [[field(f"line_{i}_description","תיאור השירות"),field(f"line_{i}_quantity","כמות",True),field(f"line_{i}_unit_price","מחיר יחידה",True),field(f"line_{i}_amount","סכום",True)] for i in range(1,count+1)]

def money_table(count=3):
    return table("פירוט שירותים ועלויות",["שירות / תכולה","כמות","מחיר יחידה","סכום"],money_rows(count),[46,12,21,21],"money-table")

documents = [
    {"id":"quote","title":"הצעת מחיר","subtitle":"תכולה ברורה. מסגרת מוסכמת.","category":"הצעה והתקשרות","pages":1},
    {"id":"contract","title":"חוזה הפקת אירוע","subtitle":"תיאום ציפיות, אחריות והסכמות.","category":"הצעה והתקשרות","pages":2},
    {"id":"event-brief","title":"תדריך אירוע","subtitle":"כל הצוות, באותה תמונה.","category":"תכנון והפקה","pages":1},
    {"id":"runsheet","title":"לו״ז יום האירוע","subtitle":"מה קורה, מתי ומי מוביל.","category":"יום האירוע","pages":1},
    {"id":"participants","title":"רשימת משתתפים","subtitle":"רישום וקבלת פנים, בסדר ברור.","category":"יום האירוע","pages":1},
    {"id":"invoice-draft","title":"חשבונית · טיוטה בלבד","subtitle":"ריכוז פרטים לקראת הפקה במערכת חשבוניות.","category":"כספים","pages":1},
]

def page(doc, body, number=1, title=None):
    draft = doc['id'] == 'invoice-draft'
    status = "טיוטה בלבד · ללא תוקף חשבונאי" if draft else "תבנית למילוי"
    return f'''<article class="sheet {doc['id']}" aria-label="{doc['title']} — עמוד {number}">
  <header class="masthead"><div class="brand"><span class="brand-mark" aria-hidden="true">ב</span><div><strong>באקה סאן</strong><span>הפקת אירועים</span></div></div><div class="document-meta"><span class="status">{status}</span><p>מסמך: {field('document_reference','מזהה מסמך')}</p></div></header>
  <div class="title-block"><p class="eyebrow">{doc['category']}</p><{'h1' if number==1 else 'h2'} class="document-title">{title or doc['title']}</{'h1' if number==1 else 'h2'}><p class="subtitle">{doc['subtitle']}</p></div>
  <div class="document-body">{body}</div>
  <footer class="page-footer"><span>{'טיוטה בלבד · אינו מסמך מס ואינו אישור תשלום' if draft else 'באקה סאן · '+doc['title']}</span><span>עמוד {number} מתוך {doc['pages']}</span></footer>
</article>'''

event_meta = [("אירוע","event_name","שם האירוע"),("תאריך האירוע","event_date","תאריך האירוע"),("מיקום","event_location","מיקום האירוע"),("גרסה / עדכון","revision","גרסה ותאריך עדכון")]

for doc in documents:
    id = doc['id']
    if id == 'quote':
        body = meta([("לכבוד","recipient","שם המזמין"),("תאריך ההצעה","proposal_date","תאריך ההצעה"),("אירוע","event_name","שם האירוע"),("תוקף ההצעה","valid_until","מועד אחרון לאישור")])
        body += '<div class="event-strip">'+field('event_date','תאריך האירוע')+'<span aria-hidden="true"> / </span>'+field('event_location','מיקום האירוע')+'</div>'
        body += section('01','מה כלול בהצעה',money_table()+totals())
        body += section('02','תנאים ותיאום', '<div class="two-columns">'+box('תנאי תשלום','payment_terms','אבני דרך ומועדי תשלום')+box('כלול / לא כלול','scope_notes','תכולה, החרגות ועלויות נוספות')+'</div><p class="small">מטבע: '+field('currency','מטבע')+' · שינוי בתכולה או בכמות יתומחר ויאושר בכתב.</p>')
        body += signatures()
        pages = page(doc,body)
    elif id == 'contract':
        body = meta([("המזמין","recipient","שם המזמין"),("הגורם המפיק","production_party","שם הגורם המפיק"),("אירוע","event_name","שם האירוע"),("מועד ומקום","event_when_where","תאריך ומיקום האירוע")])
        body += '<p class="notice">נוסח למילוי ולאישור הצדדים לפני חתימה. הנספחים והסעיפים יותאמו להתקשרות.</p>'
        body += section('01','תכולת ההתקשרות',box('שירותי ההפקה והמסירה','contract_scope','תכולת השירותים, היקף העבודה והתוצרים')+'<p>נספחים מחייבים: '+field('annexes','מזהי ההצעה, התדריך והנספחים המאושרים')+'.</p>')
        body += section('02','תמורה ותנאי תשלום', '<p>תמורה מוסכמת: '+field('contract_amount','סכום ומטבע')+'; מע״מ: '+field('tax_terms','אופן החלת מע״מ')+'.</p>'+box('אבני דרך','contract_payment','תשלום, מועד, תנאי זכאות ודרך אישור')+'<p class="small">הוצאות ותוספות יבוצעו רק לאחר אישור בכתב של מורשה מטעם המזמין.</p>')
        body += section('03','אחריות ותיאום', '<div class="two-columns">'+box('המזמין','client_duties','אישורים, גישה למקום, מידע ולוחות זמנים')+box('ההפקה','production_duties','תיאום, ביצוע, בקרה ודיווח על חריגות')+'</div>')
        body += '<p class="continuation">המשך ההסכם וחתימות בעמוד הבא ←</p>'
        pages = page(doc,body)
        body = '<div class="event-strip">'+field('event_name','שם האירוע')+' · המשך תנאי ההתקשרות</div>'
        body += section('04','שינויים, ביטול ודחייה',box('מנגנון אישור שינויים','change_policy','מי מאשר, כיצד מתעדים ומה ההשפעה על מחיר ומועד')+box('ביטול / דחייה / נסיבות חריגות','cancellation_policy','מדרגות ביטול, מועדי הודעה, הוצאות שכבר הוצאו והסדר חלופי'))
        body += section('05','אישורים, בטיחות ואחריות',box('חלוקת אחריות','safety_policy','אחריות לרישיונות, בטיחות, נגישות, ביטוח וקבלני משנה'))
        body += section('06','מידע, פרטיות ויישוב מחלוקות',box('הוראות מוסכמות','legal_terms','שימוש במידע ובתיעוד, שמירה ומחיקה, פתרון מחלוקות ודין חל'))
        body += section('07','אישור וחתימות','<p>הצדדים מאשרים את תנאי ההסכם ואת הנספחים שצוינו בעמוד הראשון.</p>'+signatures())
        pages += page(doc,body,2,'חוזה · תנאים וחתימות')
    elif id == 'event-brief':
        body = meta(event_meta)
        body += section('01','מטרת האירוע',box('מטרה ותוצאה רצויה','event_objective','מטרת האירוע והמדד להצלחה','hero-note'))
        body += '<div class="two-columns">'+box('קהל והיקף','audience','אופי הקהל ומספר משתתפים מתוכנן')+box('אופי ושפה','event_tone','סגנון, מסרים ודגשים לתוכן')+'</div>'
        body += section('02','מרכיבי ההפקה',table('תכולה ואחריות',["תחום","הנחיה / תוצר","אחריות"],[[l,field('brief_'+k,'הנחיות '+l),field('owner_'+k,'תפקיד אחראי')] for l,k in [('מקום ולוגיסטיקה','logistics'),('תוכן ובמה','content'),('אירוח וקבלת פנים','hospitality'),('ציוד ותשתיות','equipment')]],[25,52,23]))
        body += section('03','דגשים לצוות','<div class="two-columns">'+box('נגישות ובטיחות','access_safety','סידורי נגישות, דרכי פינוי ונקודת כינוס')+box('תלויות ונקודות פתוחות','open_issues','נושא לאישור, תפקיד מאשר ומועד סגירה')+'</div>')
        body += section('04','אישור התדריך','<div class="approval-strip">תפקיד מאשר: '+field('brief_approver','תפקיד מאשר')+'<span>מועד: '+field('brief_approval_date','מועד אישור')+'</span></div><p class="small">לוחות הזמנים המפורטים מופיעים במסמך לו״ז יום האירוע, בגרסה תואמת.</p>')
        pages = page(doc,body)
    elif id == 'runsheet':
        body = meta(event_meta)
        body += '<div class="note-box hero-note"><h3>תדריך פתיחה</h3><p>נקודת מפגש: '+field('meeting_point','נקודת מפגש לצוות')+' · הובלת היום: '+field('day_lead','תפקיד מוביל')+'</p></div>'
        phases=['הקמה','בדיקות','תדריך צוות','פתיחת דלתות','תחילת התוכן','מעבר / הפסקה','תוכן מרכזי','סיום ופיזור','פירוק ומסירה']
        body += section('01','רצף הביצוע',table('מהלך יום האירוע',["מועד","שלב / פעולה","אחריות","מיקום / דגש"],[[field(f'run_{i}_time','שעה',True),'<strong>'+v+'</strong><br>'+field(f'run_{i}_action','פעולה לביצוע'),field(f'run_{i}_owner','תפקיד אחראי'),field(f'run_{i}_note','מיקום ודגש')] for i,v in enumerate(phases,1)],[14,36,22,28],'schedule-table'))
        body += section('02','שינויים ותוכנית חלופית',box('במקרה של שינוי','contingency','טריגר לשינוי, החלטה חלופית ותפקיד מאשר'))
        body += '<p class="small">כל שעה מחייבת אימות לפני הפצה. שינויים ביום האירוע מתועדים בגרסה מעודכנת.</p>'
        pages = page(doc,body)
    elif id == 'participants':
        body = meta(event_meta)
        body += '<div class="approval-strip">רשימה לקבוצה: '+field('participant_group','שם קבוצה')+'<span>סה״כ מתוכנן: '+field('participant_total','כמות',True)+'</span></div>'
        body += section('01','רישום והגעה',table('רשימת רישום וקבלת פנים',["מס׳","משתתף/ת","קבוצה","אישור הגעה","נוכחות"],[[f'<span class="row-number">{i:02}</span>',field(f'participant_{i}_name','שם משתתף/ת'),field(f'participant_{i}_group','קבוצה'),field(f'participant_{i}_rsvp','מצב אישור'),'<span class="checkbox" aria-hidden="true"></span><span class="sr-only">סימון נוכחות ידני</span>'] for i in range(1,13)],[8,34,23,23,12],'participants-table'))
        body += '<div class="two-columns">'+box('סיכום קבלה','attendance_summary','סך נוכחים וסך חסרים')+box('אחריות לרשימה','list_owner','תפקיד מקבל הרשימה ומועד עדכון')+'</div>'
        body += '<p class="notice">לשימוש מורשים לצורכי האירוע בלבד. יש לאסוף את הדפים בסיום ולהימנע מהשארתם בעמדת הקבלה.</p>'
        pages = page(doc,body)
    else:
        body = '<aside class="draft-banner"><strong>טיוטה בלבד — לא לתשלום</strong><span>אינו מסמך מס · אינו חשבונית מס · אינו קבלה</span></aside>'
        body += meta([("מאת","issuer","שם הגורם המנפיק"),("לכבוד","recipient","שם המזמין"),("אירוע / שירות","event_name","שם האירוע"),("תאריך הטיוטה","draft_date","תאריך הטיוטה")])
        body += section('01','פירוט לחיוב',money_table()+totals())
        body += '<p class="small">מטבע: '+field('currency','מטבע')+' · תקופת השירות: '+field('service_period','תקופת השירות')+'</p>'
        body += section('02','פרטים להשלמה', '<div class="two-columns">'+box('תנאי תשלום מתוכננים','draft_payment_terms','תנאי תשלום לבדיקה')+box('הערות לחיוב','billing_notes','אסמכתה להזמנה והערות')+'</div>')
        body += '<div class="draft-closing"><strong>הפקה סופית במערכת חשבוניות בלבד</strong><p>מספר חשבונית, פרטי מס ופרטי תשלום ייקבעו במערכת המורשית בעת ההפקה. הטיוטה אינה אישור גבייה או תשלום.</p></div>'
        pages = page(doc,body)
    html = f'''<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>{doc['title']} | באקה סאן</title><link rel="icon" href="data:,"><link rel="stylesheet" href="assets/documents.css"></head>
<body><main class="document" data-template="{id}">{pages}</main></body>
</html>
'''
    (ROOT / f'{id}.html').write_text(html)

(ROOT/'fields.json').write_text(json.dumps(fields,ensure_ascii=False,indent=2)+'\n')
(ROOT/'templates.json').write_text(json.dumps(documents,ensure_ascii=False,indent=2)+'\n')

cards = ''.join(f'''<a class="preview-card" href="{d['id']}.html"><img src="previews/{d['id']}.webp" alt="תצוגה מקדימה של {d['title']}" width="420" height="594"><div><span class="eyebrow">{d['category']}</span><h2>{d['title']}</h2><p>{d['pages']} {'עמודים' if d['pages']>1 else 'עמוד'} · A4 <span aria-hidden="true">←</span></p></div></a>''' for d in documents)
(ROOT/'index.html').write_text(f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>מסמכי אירוע | באקה סאן</title><link rel="stylesheet" href="assets/documents.css"></head><body class="gallery"><main><header class="gallery-head"><p class="eyebrow">באקה סאן / מסמכי אירוע</p><h1>מהתכנון, עד הפרט האחרון.</h1><p>שישה מסמכים. שפה אחת. מקום לכל מה שחשוב.</p><span class="status">תבניות למילוי · עברית · A4</span></header><div class="preview-grid">{cards}</div><footer class="gallery-footer">לפתיחת מסמך, בחרו תבנית. להדפסה, השתמשו בפקודת ההדפסה של הדפדפן.<br>דף החשבונית הוא טיוטה בלבד ואינו מסמך מס.</footer></main></body></html>''')
print('Built six templates, field dictionary and gallery.')
