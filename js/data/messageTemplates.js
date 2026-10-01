/* Built-in message templates for Virginie's daily work: he / fr / en. No Arabic letters anywhere.
   {placeholders} are filled by js/logic/msgTemplates.js from the case, the client card, the supplier card, the links,
   the payments and the settings. Whatever stays unknown is shown as 【label】 so she sees what to fill by hand.
   Nothing is sent by the app: the screen only copies, or opens WhatsApp / mail with the text; she presses send. */
import { COMPANY_PAPERS } from './docsList.js';

/* The liability policy of Baka San itself (docsList key 'insurance'): the numbers are read from that entry so there is one source. */
const insPaper = COMPANY_PAPERS.find(p => p.key === 'insurance') || {};
const insNote = String(insPaper.note || '');
const policyNo = (insNote.match(/\d{13}/) || ['1820200089326'])[0];
const period = insNote.match(/(\d{2}\/\d{2}\/\d{4})\s+עד\s+(\d{2}\/\d{2}\/\d{4})/) || [null, '01/05/2026', '30/04/2027'];
export const INSURANCE = {
  agency: { he: 'קופר נינוה סוכנות לביטוח', fr: 'Cooper Ninve (agence d’assurance)', en: 'Cooper Ninve insurance agency' },
  email: 'info@cooper-ninve.com',
  insurer: { he: 'חתמי לוידס', fr: 'Lloyd’s', en: 'Lloyd’s' },
  policyNo: policyNo,
  from: period[1], to: period[2],
  period: { he: period[1] + ' עד ' + period[2], fr: 'du ' + period[1] + ' au ' + period[2], en: period[1] + ' to ' + period[2] },
  limits: { he: 'צד ג׳ 1,000,000$ · אחריות מקצועית 1,000,000$ · חבות מעבידים 5,000,000$', fr: 'RC tiers 1 000 000 $ · RC professionnelle 1 000 000 $ · RC employeur 5 000 000 $', en: 'Third party 1,000,000$ · Professional liability 1,000,000$ · Employers liability 5,000,000$' },
  file: insPaper.file || 'docs/policy-bakasun-liability-2026-27.pdf'
};

/* The labels shown inside 【】 when a placeholder could not be filled, in the language of the message. */
export const PLACEHOLDERS = {
  client: { he: 'לקוח', fr: 'client', en: 'client' },
  clientLegal: { he: 'שם משפטי של הלקוח', fr: 'raison sociale du client', en: 'client legal name' },
  clientTaxId: { he: 'ח.פ. של הלקוח', fr: 'n° de société du client', en: 'client company number' },
  contact: { he: 'שם', fr: 'prénom', en: 'name' },
  event: { he: 'אירוע', fr: 'événement', en: 'event' },
  date: { he: 'תאריך', fr: 'date', en: 'date' },
  place: { he: 'מקום', fr: 'lieu', en: 'place' },
  address: { he: 'כתובת', fr: 'adresse', en: 'address' },
  participants: { he: 'מספר משתתפים', fr: 'nombre de participants', en: 'number of people' },
  nights: { he: 'מספר לילות', fr: 'nombre de nuits', en: 'number of nights' },
  rooms: { he: 'מספר חדרים', fr: 'nombre de chambres', en: 'number of rooms' },
  meetingRoom: { he: 'חדר ישיבות: כן/לא', fr: 'salle de réunion : oui/non', en: 'meeting room: yes/no' },
  kosher: { he: 'כשרות: כן/לא', fr: 'casher : oui/non', en: 'kosher: yes/no' },
  board: { he: 'בסיס אירוח', fr: 'formule (demi-pension…)', en: 'board (half board…)' },
  requirements: { he: 'מה הלקוח דורש באישור', fr: 'exigences du client', en: 'what the client requires' },
  amount: { he: 'סכום', fr: 'montant', en: 'amount' },
  invoiceNo: { he: 'מספר חשבונית', fr: 'n° de facture', en: 'invoice number' },
  dueDate: { he: 'תאריך לתשלום', fr: 'date d’échéance', en: 'due date' },
  bank: { he: 'פרטי בנק', fr: 'coordonnées bancaires', en: 'bank details' },
  price: { he: 'מחיר לפני מע״מ', fr: 'prix HT', en: 'price before VAT' },
  terms: { he: 'תנאי תשלום', fr: 'conditions de paiement', en: 'payment terms' },
  supplier: { he: 'ספק', fr: 'fournisseur', en: 'supplier' },
  what: { he: 'מה ביקשנו', fr: 'ce que nous avons demandé', en: 'what we asked for' },
  arrival: { he: 'שעת הגעה', fr: 'heure d’arrivée', en: 'arrival time' },
  onsite: { he: 'איש קשר בשטח', fr: 'contact sur place', en: 'contact on site' },
  parking: { he: 'חניה', fr: 'parking', en: 'parking' },
  rsvpBy: { he: 'לענות עד', fr: 'répondre avant le', en: 'reply by' },
  signer: { he: 'חתימה', fr: 'signature', en: 'signature' },
  me: { he: 'השם שלי', fr: 'mon prénom', en: 'my name' },
  policyNo: { he: 'מספר פוליסה', fr: 'n° de police', en: 'policy number' },
  policyPeriod: { he: 'תקופת הפוליסה', fr: 'période de la police', en: 'policy period' },
  limits: { he: 'גבולות אחריות', fr: 'plafonds', en: 'limits' },
  agency: { he: 'סוכנות הביטוח', fr: 'agence d’assurance', en: 'insurance agency' },
  insurer: { he: 'מבטח', fr: 'assureur', en: 'insurer' }
};

/* Audiences, in the order of the screen. */
export const AUDIENCES = ['client', 'supplier', 'agency', 'participants'];

/* key, title, to (audience), fields (what the screen asks for beyond the case), subject, body. */
export const MESSAGE_TEMPLATES = [
  {
    key: 'insuranceCert', to: 'agency', fields: ['requirements'],
    title: { he: 'בקשת אישור ביטוח (לסוכנות)', fr: 'Demande d’attestation d’assurance', en: 'Certificate of insurance request' },
    subject: { he: 'בקשת אישור קיום ביטוחים: {clientLegal}, {event} {date}', fr: 'Attestation d’assurance : {clientLegal}, {event} {date}', en: 'Certificate of insurance: {clientLegal}, {event} {date}' },
    body: {
      he: 'שלום רב,\nאבקש להנפיק אישור קיום ביטוחים על שם באקה סאן בע״מ (פוליסה {policyNo}, {insurer}, תקופה {policyPeriod}) לטובת הלקוח הבא:\nלקוח (שם משפטי): {clientLegal}\nח.פ.: {clientTaxId}\nהאירוע: {event}, {date}, {place}\nמה הלקוח דורש באישור: {requirements}\nגבולות האחריות בפוליסה: {limits}\nאשמח לקבל את האישור במייל חוזר. אם חסר לכם פרט, אנא כתבו לי.\nתודה רבה,\n{signer}',
      fr: 'Bonjour,\nMerci de bien vouloir émettre une attestation d’assurance au nom de Baka San Ltd (police {policyNo}, {insurer}, période {policyPeriod}) en faveur du client suivant :\nClient (raison sociale) : {clientLegal}\nN° de société : {clientTaxId}\nÉvénement : {event}, le {date}, {place}\nExigences du client pour l’attestation : {requirements}\nPlafonds de la police : {limits}\nMerci de me l’envoyer par retour de mail. S’il manque une information, écrivez-moi.\nCordialement,\n{signer}',
      en: 'Hello,\nPlease issue a certificate of insurance in the name of Baka San Ltd (policy {policyNo}, {insurer}, period {policyPeriod}) in favour of the following client:\nClient (legal name): {clientLegal}\nCompany number: {clientTaxId}\nEvent: {event}, {date}, {place}\nWhat the client requires in the certificate: {requirements}\nPolicy limits: {limits}\nPlease send the certificate by return e-mail. If anything is missing, let me know.\nMany thanks,\n{signer}'
    }
  },
  {
    key: 'hotelQuote', to: 'supplier', fields: ['nights', 'rooms', 'participants', 'meetingRoom', 'kosher', 'board'],
    title: { he: 'בקשת הצעת מחיר למלון / מקום', fr: 'Demande de devis hôtel / lieu', en: 'Hotel / venue quote request' },
    subject: { he: 'בקשת הצעת מחיר: {event} {client}, {date}', fr: 'Demande de devis : {event} {client}, {date}', en: 'Quote request: {client} {event}, {date}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nאשמח לקבל הצעת מחיר ל{event} של {client}:\nתאריך: {date}\nלילות: {nights}\nחדרים: {rooms}\nמשתתפים: {participants}\nחדר ישיבות: {meetingRoom}\nכשרות: {kosher}\nבסיס אירוח: {board}\nאשמח לדעת בבקשה אם התאריך פנוי ומה המחיר, כולל תנאי ביטול. זה די דחוף :)\nתודה רבה!\n{signer}',
      fr: 'Bonjour {contact},\nJe souhaite recevoir un devis pour {event} de {client} :\nDate : {date}\nNuits : {nights}\nChambres : {rooms}\nParticipants : {participants}\nSalle de réunion : {meetingRoom}\nCasher : {kosher}\nFormule : {board}\nMerci de me confirmer la disponibilité et le tarif, avec les conditions d’annulation. C’est assez urgent :)\nMerci beaucoup !\n{signer}',
      en: 'Hi {contact},\nI would like a quote for the {event} of {client}:\nDate: {date}\nNights: {nights}\nRooms: {rooms}\nParticipants: {participants}\nMeeting room: {meetingRoom}\nKosher: {kosher}\nBoard: {board}\nPlease let me know if the date is available and the price, including cancellation terms. It is rather urgent :)\nMany thanks!\n{signer}'
    }
  },
  {
    key: 'bookingConfirm', to: 'client', fields: ['price', 'terms'],
    title: { he: 'אישור הזמנה ללקוח', fr: 'Confirmation de réservation au client', en: 'Booking confirmation to the client' },
    subject: { he: 'אישור הזמנה: {event}, {date}', fr: 'Confirmation de réservation : {event}, {date}', en: 'Booking confirmation: {event}, {date}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nשמחה לאשר את ההזמנה:\nהאירוע: {event}\nתאריך: {date}\nמקום: {place}\nמחיר: {price} לפני מע״מ\nתנאי תשלום: {terms}\nאשמח לאישור חוזר שהכול נכון, ואנחנו יוצאים לדרך :)\nתודה רבה,\n{signer}',
      fr: 'Bonjour {contact},\nJ’ai le plaisir de confirmer la réservation :\nÉvénement : {event}\nDate : {date}\nLieu : {place}\nPrix : {price} HT\nConditions de paiement : {terms}\nMerci de me confirmer que tout est exact, et c’est parti :)\nBien à vous,\n{signer}',
      en: 'Hi {contact},\nHappy to confirm the booking:\nEvent: {event}\nDate: {date}\nPlace: {place}\nPrice: {price} before VAT\nPayment terms: {terms}\nPlease confirm that everything is correct, and we are on our way :)\nBest regards,\n{signer}'
    }
  },
  {
    key: 'paymentReminder', to: 'client', fields: ['amount', 'invoiceNo', 'dueDate'],
    title: { he: 'תזכורת תשלום ללקוח', fr: 'Rappel de paiement au client', en: 'Payment reminder to the client' },
    subject: { he: 'תזכורת תשלום: {event} {date}, {amount}', fr: 'Rappel de paiement : {event} {date}, {amount}', en: 'Payment reminder: {event} {date}, {amount}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nתזכורת קטנה לגבי התשלום על {event} ({date}): {amount}, חשבונית {invoiceNo}, לתשלום עד {dueDate}.\nפרטי חשבון להעברה:\n{bank}\nאם כבר הועבר, אשמח לאסמכתא בבקשה. תודה רבה!\n{signer}',
      fr: 'Bonjour {contact},\nPetit rappel concernant le paiement de {event} ({date}) : {amount}, facture {invoiceNo}, à régler avant le {dueDate}.\nCoordonnées bancaires pour le virement :\n{bank}\nSi le virement a déjà été fait, merci de m’envoyer la confirmation. Merci beaucoup !\n{signer}',
      en: 'Hi {contact},\nA small reminder about the payment for {event} ({date}): {amount}, invoice {invoiceNo}, due by {dueDate}.\nBank details for the transfer:\n{bank}\nIf it has already been paid, please send me the confirmation. Many thanks!\n{signer}'
    }
  },
  {
    key: 'supplierBrief', to: 'supplier', fields: ['arrival', 'address', 'parking', 'onsite'],
    title: { he: 'תדריך לספק ליום האירוע', fr: 'Brief du jour J au fournisseur', en: 'Day-of brief to the supplier' },
    subject: { he: 'תדריך ליום האירוע: {event} {client}, {date}', fr: 'Brief du jour J : {event} {client}, {date}', en: 'Day-of brief: {client} {event}, {date}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nתדריך קצר ליום האירוע, {event} של {client} ב-{date}:\nהגעה: {arrival}\nכתובת: {address}\nחניה: {parking}\nאיש קשר בשטח: {onsite}\nאשמח לאישור שקיבלת. נתראה שם!\n{signer}',
      fr: 'Bonjour {contact},\nPetit brief pour le jour J, {event} de {client} le {date} :\nArrivée : {arrival}\nAdresse : {address}\nParking : {parking}\nContact sur place : {onsite}\nMerci de me confirmer la réception. À bientôt !\n{signer}',
      en: 'Hi {contact},\nA short brief for the day, the {event} of {client} on {date}:\nArrival: {arrival}\nAddress: {address}\nParking: {parking}\nContact on site: {onsite}\nPlease confirm you got this. See you there!\n{signer}'
    }
  },
  {
    key: 'thankYou', to: 'client', fields: [],
    title: { he: 'תודה אחרי האירוע', fr: 'Remerciement après l’événement', en: 'Thank-you after the event' },
    subject: { he: 'תודה על {event}', fr: 'Merci pour {event}', en: 'Thank you for the {event}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nתודה רבה על {event} ב-{date}! היה לנו כיף גדול לעבוד איתכם, ומחכה כבר לפעם הבאה :)\nאם נהניתם, אשמח מאוד להמלצה קצרה. זה עוזר לנו מאוד.\nתודה רבה,\n{signer}',
      fr: 'Bonjour {contact},\nUn grand merci pour {event} du {date} ! Ce fut un vrai plaisir de travailler avec vous, et j’attends déjà la prochaine fois :)\nSi vous avez apprécié, un petit mot de recommandation me ferait très plaisir. Cela nous aide beaucoup.\nMerci encore,\n{signer}',
      en: 'Hi {contact},\nThank you so much for the {event} on {date}! It was a real pleasure working with you, and I am already looking forward to the next one :)\nIf you enjoyed it, a short recommendation would mean a lot. It helps us very much.\nMany thanks,\n{signer}'
    }
  },
  {
    key: 'rsvpReminder', to: 'participants', fields: ['rsvpBy'],
    title: { he: 'תזכורת אישור הגעה למשתתפים', fr: 'Rappel de confirmation aux participants', en: 'RSVP reminder to participants' },
    subject: { he: 'תזכורת: {event}, {date}, אישור הגעה', fr: 'Rappel : {event}, {date}, confirmation de présence', en: 'Reminder: {event}, {date}, please confirm' },
    body: {
      he: 'שלום לכולם,\nתזכורת קטנה: {event} של {client} יתקיים ב-{date} ב{place}.\nמי שעוד לא אישר/ה הגעה, אשמח לתשובה עד {rsvpBy} בבקשה, כדי שנוכל לסגור את המספרים.\nתודה רבה ונתראה!\n{signer}',
      fr: 'Bonjour à tous,\nPetit rappel : {event} de {client} aura lieu le {date} à {place}.\nSi vous n’avez pas encore confirmé votre présence, merci de répondre avant le {rsvpBy}, pour que nous puissions arrêter les listes.\nMerci beaucoup et à bientôt !\n{signer}',
      en: 'Hello everyone,\nA small reminder: the {event} of {client} takes place on {date} at {place}.\nIf you have not confirmed yet, please reply by {rsvpBy} so we can close the numbers.\nMany thanks and see you there!\n{signer}'
    }
  },
  {
    key: 'supplierFollowUp', to: 'supplier', fields: ['what'],
    title: { he: 'מעקב אחרי ספק: שלחת את ההצעה?', fr: 'Relance fournisseur : le devis est-il envoyé ?', en: 'Supplier follow-up: quote sent?' },
    subject: { he: 'הצעת מחיר ל{event} {client}, {date}', fr: 'Devis pour {event} {client}, {date}', en: 'Quote for {client} {event}, {date}' },
    body: {
      he: 'היי היי {contact}, מה שלומך?\nרק בודקת: שלחת כבר את הצעת המחיר ל{event} של {client} ({date})?\nמה ביקשנו: {what}\nאם יש שאלה או חסר פרט, אני כאן. אשמח לתשובה היום אם אפשר :)\nתודה רבה!\n{signer}',
      fr: 'Bonjour {contact},\nJe me permets de revenir vers vous : avez-vous envoyé le devis pour {event} de {client} ({date}) ?\nCe que nous avons demandé : {what}\nS’il manque une information, je suis là. Une réponse aujourd’hui serait idéale :)\nMerci beaucoup !\n{signer}',
      en: 'Hi {contact},\nJust checking: have you sent the quote for the {event} of {client} ({date}) yet?\nWhat we asked for: {what}\nIf anything is missing or unclear, I am here. A reply today would be great :)\nMany thanks!\n{signer}'
    }
  }
];
