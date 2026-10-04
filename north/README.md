# הרוח הצפונית · חנות מארזים

חנות סטטית (HTML/CSS/JS, בלי בילד) שעולה עם GitHub Pages:
https://roynaor-work.github.io/Bakasun/north/

| קובץ | מה זה |
|---|---|
| `index.html` | השלד: כותרת, סל צד, שער גיל, תחתית |
| `css/style.css` | העיצוב (כהה, זהב; Frank Ruhl Libre + Assistant) |
| `js/config.js` | **מה שרועי ממלא**: טלפון, וואטסאפ, קישורי תשלום (אשראי/ביט), משלוחים, ענן |
| `js/products.js` | 12 המארזים, מארז בהרכבה (בסיסים/תוספות/אריזות), שאלות ותשובות |
| `js/cart.js` | היגיון הסל, משלוח, בדיקת טופס, מספר הזמנה, טקסט ההזמנה (נבדק ב-`tests/north.test.mjs`) |
| `js/app.js` | המסכים: בית, מוצר `#/p/<id>`, קופה `#/checkout`, תודה `#/thanks/<no>` |
| `../supabase/north.sql` | טבלת ההזמנות `north_orders` (anon מוסיף בלבד) |

## חיבור תשלומים: Grow (משולם)
לרועי ולמתן כבר יש חשבון Grow. החיבור המלא (סכום ומספר הזמנה מדויקים, סימון "שולם" אוטומטי) עובד דרך שתי פונקציות ענן ב-Supabase, כי Grow חוסם קריאות מהדפדפן:

| פונקציה | מה עושה |
|---|---|
| `supabase/functions/grow-pay` | מקבלת הזמנה מהאתר, קוראת ל-`createPaymentProcess` ומחזירה קישור לעמוד תשלום (תקף 10 דקות). הלקוח מופנה אליו |
| `supabase/functions/grow-notify` | ה-`notifyUrl`: Grow מודיע אחרי תשלום, הפונקציה מסמנת `status='paid'` על ההזמנה ומאשרת ל-Grow (`approveTransaction`) |
| `supabase/functions/_shared/grow.mjs` | ההיגיון הטהור (בניית שדות, קריאת הקריאה החוזרת), נבדק ב-`tests/north.test.mjs` |

### הפעלה (פעם אחת)
1. ב-Grow: לוחצים על שם העסק ← "הגדרות" ← "API / מפתחות" ומעתיקים את `userId`. יוצרים "דף תשלום" חדש (סכום פתוח, שם "מארזים · הרוח הצפונית") ומעתיקים את `pageCode` שלו. אם לא רואים API בממשק, מבקשים מהתמיכה של Grow לפתוח "API light" לחשבון.
2. במחשב עם Supabase CLI מחוברת לפרויקט `ckfezrtrmfyqepozdzzp`:
   ```
   supabase secrets set GROW_USER_ID=<userId> GROW_PAGE_CODE=<pageCode> GROW_SANDBOX=0
   supabase functions deploy grow-pay
   supabase functions deploy grow-notify --no-verify-jwt
   ```
3. מריצים את `supabase/north.sql` (מוסיף גם את עמודות Grow לטבלה).
4. בודקים: הזמנה באתר עם "כרטיס אשראי" צריכה להפנות לעמוד Grow עם הסכום הנכון. אחרי תשלום חוזרים לדף התודה עם "התשלום התקבל", ובטבלה `north_orders` ההזמנה ב-`status='paid'` עם `pay_details`.

### בלי הפונקציות
`PAY.card.grow` נשאר `true`, אבל אם הפונקציה לא פרוסה הלקוח מגיע לדף התודה עם כפתור "לעמוד התשלום" שמנסה שוב, ואם גם זה נכשל: "נתקשר אליכם לגבייה". אפשר גם להדביק קישור קבוע ב-`PAY.card.url` (דף Grow עם סכום פתוח) כגיבוי, עם `{sum}` ו-`{ref}`.

משלוחים (01/10): רק באזור, עד כ-40 דקות מצומת הגומא (`SHIPPING.north`, `AREA`, `OUT_OF_AREA` ב-config). כשרות: `kosher:false` + `kosherNote` על מוצר/תוספת → תג "לא כשר", קופסה בעמוד המוצר, ואישור חובה בקופה (`hasNonKosher`).

ביט: `PAY.bit.url` (בקשת תשלום של ביט לעסקים) או `PAY.bit.phone` (המספר שמעבירים אליו; מוצג עם מספר ההזמנה).

## מצב הרצה
`STORE.preview = true` ב-config מציג פס "האתר בהרצה" ו-`index.html` מסומן noindex. כשמתן מאשר מחירים והרכבים: להעביר ל-false ולהסיר את תגית ה-robots.

## הזמנות
- `supabase/north.sql` רץ פעם אחת ב-SQL Editor. אחרי זה כל הזמנה נכנסת לטבלה `north_orders`.
- דף התודה מציע ללקוח גם לשלוח את הסיכום בוואטסאפ/מייל, למקרה שהענן לא זמין.

## תמונות
כרגע תמונות אווירה מ-Unsplash (רישיון חופשי). להחלפה בצילומי המארזים האמיתיים: שדות `img`/`img2` ב-`products.js`.
