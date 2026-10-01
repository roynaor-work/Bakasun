/* הגדרות החנות. רועי ממלא כאן פעם אחת: טלפון, וואטסאפ, קישורי תשלום. */
export const STORE = {
  name: 'הרוח הצפונית',
  tagline: 'מארזי אלכוהול ופינוק מהצפון',
  legalName: 'ראמן מזואי בע"מ',
  companyId: '517204327',
  address: 'צומת הגומא, מתחם דור אלון, הגליל העליון',
  hours: 'א׳-ה׳ 10:00-22:00 · ו׳ 9:00-15:00',
  phone: '[phone-removed]',          // מדף "צור קשר" ב-drink2.co.il
  whatsapp: '972503340875',        // אותו מספר, בלי פלוס. ריק = הכפתור מוסתר
  email: 'roynaor@gmail.com',      // לאן מגיעה הודעת ההזמנה
  instagram: 'https://www.instagram.com/haruah_hatzfonit_wine/',
  facebook: '',
  siteUrl: 'https://roynaor-work.github.io/Bakasun/north/',
};

/* משלוחים. מחירים כולל מע"מ. משלוחים רק באזור החנות: עד כ-40 דקות נסיעה מצומת הגומא. */
export const AREA = ['קריית שמונה', 'מטולה', 'יסוד המעלה', 'ראש פינה', 'חצור הגלילית', 'צפת', 'קצרין וצפון הגולן', 'יישובי אצבע הגליל ועמק החולה', 'מבואות חרמון', 'מרום הגליל', 'הגליל העליון המזרחי'];
export const SHIPPING = {
  pickup: { id: 'pickup', label: 'איסוף מהחנות בצומת הגומא', price: 0,  note: 'מוכן תוך יום עסקים. נודיע בהודעה כשהמארז מחכה.' },
  north:  { id: 'north',  label: 'משלוח באזור החנות', price: 35, freeFrom: 400, note: 'עד כ-40 דקות נסיעה מצומת הגומא: ' + ['קריית שמונה', 'מטולה', 'ראש פינה', 'חצור', 'צפת', 'קצרין וצפון הגולן', 'יישובי הגליל העליון ועמק החולה'].join(', ') + '. 1-2 ימי עסקים, מסירה ידנית לבני 18 ומעלה.' },
};
/* מחוץ לאזור: אין משלוח. איסוף מהחנות, או פנייה לבדיקת משלוח מיוחד. */
export const OUT_OF_AREA = 'מחוץ לאזור אנחנו לא שולחים כרגע. אפשר לאסוף מהחנות, או לכתוב לנו ונבדוק משלוח מיוחד.';

/* תשלום. כשהקישור ריק, השיטה מוצגת אבל ההזמנה נסגרת בטלפון/הודעה.
   card.url: עמוד תשלום של ספק הסליקה. לרועי כבר יש חשבון Grow (pay.grow.link, שימש לכרטיסי "מסע וויסקי"):
   ב-Grow יוצרים "דף תשלום" עם סכום פתוח ומדביקים את הקישור כאן. אפשר להשתמש ב-{sum} ו-{ref}
   בתוך הקישור, והם יוחלפו בסכום ובמספר ההזמנה.
   bit.url: קישור "בקשת תשלום" של ביט לעסקים. bit.phone: המספר שמשלמים אליו בביט. */
export const PAY = {
  card: {
    enabled: true, label: 'כרטיס אשראי', note: 'תשלום מאובטח בעמוד הסליקה של Grow. אפשר עד 3 תשלומים.',
    grow: true,                    // true = יוצרים עמוד תשלום ב-Grow דרך פונקציית הענן grow-pay (סכום ומספר הזמנה מדויקים)
    url: '',                       // גיבוי: קישור קבוע לדף תשלום (Grow או אחר), אם הפונקציה לא פרוסה
  },
  bit:  { enabled: true, url: '', phone: '', label: 'ביט', note: 'העברה בביט לחנות. ההזמנה מאושרת אחרי שהתשלום נכנס.' },
  cash: { enabled: true, label: 'תשלום באיסוף', note: 'מזומן או כרטיס בחנות, כשבאים לאסוף.' },
};

/* ענן: ההזמנות נשמרות בטבלה north_orders (supabase/north.sql). ריק = לא שומרים. */
export const CLOUD = {
  url: 'https://ckfezrtrmfyqepozdzzp.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrZmV6cnRybWZ5cWVwb3pkenpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTI5MzYsImV4cCI6MjEwNjAyODkzNn0.6fXz9_jyN-8-CbmSOEnytAQb4iBrvPYWb45JanW0SHc',
  table: 'north_orders',
};

export const IMG = (id, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=78&auto=format&fit=crop`;
