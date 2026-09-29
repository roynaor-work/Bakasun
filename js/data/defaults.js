/* Fixed texts taken from Virginie's own quotes (June 2026) and the company details from the purchase orders. She can change all of them in settings. */
export const DEFAULTS = {
  bizName: 'באקה סאן', bizLegal: 'באקה סאן בע״מ', bizId: '515000032', bizAddress: 'לבונה 8, אור עקיבא', bizPhone: '054-4974644', bizEmail: 'info.virpro@gmail.com',
  signer: 'וירג׳יני מנדל נאור\nבאקה סאן בע״מ',
  includes: 'ליווי צמוד מרגע הבריף · בחירת ספקים לאירוע עם נציגי הארגון וסגירת חוזים לפי דרישות הלקוח · הקמה ביום האירוע וליווי מלא במהלך כל האירוע עד פירוקו · עזרה בסגירת תשלומים לספקים',
  terms: 'חשבונית מס תסופק כנגד תשלום.\nמקדמה במעמד חתימת ההסכם או תחילת הבריף הראשון.\nיתרת התשלום עד שבוע אחרי תאריך האירוע.',
  cancelTerms: 'ביטול ההתקשרות יתאפשר אך ורק בהודעה בכתב.\nביטול שלא בשל כוח עליון, עד 60 יום לפני האירוע: 50% ממחיר ההזמנה + מע״מ.\nביטול בשל כוח עליון או מצב ביטחוני בלבד: עד 60 יום לפני האירוע, שעות הפקה 4,000 ₪ + מע״מ. פחות מ-60 יום לפני האירוע, 6,000 ₪ + מע״מ.',
  invoiceTo: '', invoiceEmail: 'roynaor@gmail.com', invoiceName: 'רועי',
  bankDetails: 'בנק לאומי (10), סניף 954, חשבון 255500/34\nעל שם: באקה סאן בע״מ\nIBAN IL760109540000025550034 · SWIFT LUMIILITXXX',
  /* What she always needs from a client before Roy can issue an invoice */
  invoiceFields: ['legalName', 'taxId', 'address']
};
/* Where the company papers live today (Roy's mailbox and Drive). Links open outside the app. */
export const COMPANY_DOCS = [
  { title: 'ערכת הלוגו המלאה (SVG, PNG, דף מותג)', url: 'https://mail.google.com/mail/?authuser=roynaor@gmail.com#all/thread-f:1874406082415199700' },
  { title: 'פרוטוקול החברה ומורשי חתימה, ינואר 2026 (מאומת)', url: 'https://mail.google.com/mail/?authuser=roynaor@gmail.com#all/thread-f:1854761243985624315' },
  { title: 'אישור העברת מניות לוירג׳יני', url: 'https://mail.google.com/mail/?authuser=roynaor@gmail.com#all/thread-f:1854761243985624315' },
  { title: 'הצעת המחיר של וירג׳יני, כנס יעדים לצפון (תבנית)', url: 'https://mail.google.com/mail/?authuser=roynaor@gmail.com#all/thread-f:1867525411289396059' },
  { title: 'הזמנת רכש לספק, דוגמה (סאגיס, עיריית חריש)', url: 'https://docs.google.com/document/d/1_mHohAa4jM4LD7DTutXWZJDsQuTu1lf-Rn6OJqrYakE/edit' },
  { title: 'לוח תשלומים לפי אבני דרך, דוגמה (עיריית חריש)', url: 'https://drive.google.com/file/d/1ZL-TmejK6dW0TAsuinWSSd06Vjtzy86G/view' },
  { title: 'דוחות תשלומי אשראי חודשיים (Grow)', url: 'https://mail.google.com/mail/?authuser=roynaor@gmail.com#search/from%3Ainfo%40mail.grow.business+%D7%91%D7%90%D7%A7%D7%94' }
];
