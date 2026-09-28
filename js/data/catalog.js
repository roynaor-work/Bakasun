/* The catalog: things that go into quotes, with names in three languages and NO prices (the price comes from the supplier each time).
   And the recommended list per kind of event: which supplier types and which catalog items usually belong. Virginie edits both in the app. */

export const SUPPLIER_TYPES = ['קייטרינג ושפים', 'בר ומשקאות', 'תקליטנים ולהקות', 'צילום ווידאו', 'הגברה ותאורה', 'עיצוב ופרחים', 'הסעות', 'מלונות', 'מדריכי טיולים', 'השכרת ציוד', 'מקום לאירוע', 'דפוס ומיתוג', 'פעילות וסיורים', 'מסעדות', 'אחר'];
export const SUPPLIER_TYPE_L = {
  'קייטרינג ושפים': { en: 'Catering and chefs', fr: 'Traiteur et chefs' }, 'בר ומשקאות': { en: 'Bar and drinks', fr: 'Bar et boissons' },
  'תקליטנים ולהקות': { en: 'DJs and bands', fr: 'DJ et groupes' }, 'צילום ווידאו': { en: 'Photo and video', fr: 'Photo et vidéo' },
  'הגברה ותאורה': { en: 'Sound and lighting', fr: 'Son et lumière' }, 'עיצוב ופרחים': { en: 'Decoration and flowers', fr: 'Décoration et fleurs' },
  'הסעות': { en: 'Transport', fr: 'Transport' }, 'מלונות': { en: 'Hotels', fr: 'Hôtels' }, 'מדריכי טיולים': { en: 'Tour guides', fr: 'Guides' },
  'השכרת ציוד': { en: 'Equipment rental', fr: 'Location de matériel' }, 'מקום לאירוע': { en: 'Venue', fr: 'Lieu' }, 'דפוס ומיתוג': { en: 'Print and branding', fr: 'Impression et marquage' }, 'פעילות וסיורים': { en: 'Activities and tours', fr: 'Activités et visites' }, 'מסעדות': { en: 'Restaurants', fr: 'Restaurants' }, 'אחר': { en: 'Other', fr: 'Autre' }
};

/* [category, item, unit, en, fr, supplier type] */
export const CATALOG = [
  ['הפקה', 'ניהול והפקת האירוע', 'אירוע', 'Event management and production', 'Gestion et production de l’événement', ''],
  ['הפקה', 'עוזר/ת הפקה', 'איש צוות', 'Production assistant', 'Assistant(e) de production', ''],
  ['אוכל', 'ארוחה', 'משתתף', 'Meal', 'Repas', 'קייטרינג ושפים'],
  ['אוכל', 'כיבוד קל', 'משתתף', 'Light refreshments', 'Collation', 'קייטרינג ושפים'],
  ['אוכל', 'שף פרטי', 'אירוע', 'Private chef', 'Chef privé', 'קייטרינג ושפים'],
  ['משקאות', 'בר פתוח', 'משתתף', 'Open bar', 'Open bar', 'בר ומשקאות'],
  ['משקאות', 'בר קפה', 'אירוע', 'Coffee bar', 'Bar à café', 'בר ומשקאות'],
  ['משקאות', 'יין ואלכוהול', 'אירוע', 'Wine and spirits', 'Vins et spiritueux', 'בר ומשקאות'],
  ['מוזיקה', 'תקליטן', 'אירוע', 'DJ', 'DJ', 'תקליטנים ולהקות'],
  ['מוזיקה', 'להקה', 'אירוע', 'Live band', 'Groupe live', 'תקליטנים ולהקות'],
  ['טכני', 'הגברה ותאורה', 'אירוע', 'Sound and lighting', 'Son et lumière', 'הגברה ותאורה'],
  ['טכני', 'מסך ומקרן', 'אירוע', 'Screen and projector', 'Écran et projecteur', 'הגברה ותאורה'],
  ['צילום', 'צילום סטילס', 'אירוע', 'Photography', 'Photographie', 'צילום ווידאו'],
  ['צילום', 'צילום וידאו', 'אירוע', 'Video', 'Vidéo', 'צילום ווידאו'],
  ['עיצוב', 'עיצוב ופרחים', 'אירוע', 'Decoration and flowers', 'Décoration et fleurs', 'עיצוב ופרחים'],
  ['עיצוב', 'שילוט ותגי שם', 'אירוע', 'Signage and name tags', 'Signalétique et badges', ''],
  ['הסעות', 'אוטובוס', 'אוטובוס', 'Coach', 'Autocar', 'הסעות'],
  ['הסעות', 'מיניבוס', 'רכב', 'Minibus', 'Minibus', 'הסעות'],
  ['סיורים', 'מדריך טיולים', 'יום', 'Tour guide', 'Guide', 'מדריכי טיולים'],
  ['סיורים', 'כניסה לאתר', 'משתתף', 'Site admission', 'Entrée sur site', ''],
  ['לינה', 'חדר במלון', 'חדר ללילה', 'Hotel room', 'Chambre d’hôtel', 'מלונות'],
  ['מקום', 'מקום לאירוע', 'אירוע', 'Venue', 'Lieu', 'מקום לאירוע'],
  ['ציוד', 'השכרת ציוד', 'אירוע', 'Equipment rental', 'Location de matériel', 'השכרת ציוד'],
  ['ציוד', 'שולחנות וכיסאות', 'אירוע', 'Tables and chairs', 'Tables et chaises', 'השכרת ציוד'],
  ['ציוד', 'אוהל או סככה', 'אירוע', 'Tent or canopy', 'Tente ou chapiteau', 'השכרת ציוד'],
  ['פעילות', 'סדנה או פעילות', 'אירוע', 'Workshop or activity', 'Atelier ou activité', 'אחר'],
  ['פעילות', 'אמן או מרצה', 'אירוע', 'Performer or speaker', 'Artiste ou intervenant', 'אחר']
];
export const UNIT_L = {
  'אירוע': { en: 'event', fr: 'événement' }, 'איש צוות': { en: 'staff member', fr: 'membre d’équipe' }, 'משתתף': { en: 'guest', fr: 'personne' },
  'אוטובוס': { en: 'coach', fr: 'autocar' }, 'רכב': { en: 'vehicle', fr: 'véhicule' }, 'יום': { en: 'day', fr: 'jour' }, 'חדר ללילה': { en: 'room / night', fr: 'chambre / nuit' }
};
export const CATEGORY_L = {
  'הפקה': { en: 'Production', fr: 'Production' }, 'אוכל': { en: 'Food', fr: 'Repas' }, 'משקאות': { en: 'Drinks', fr: 'Boissons' }, 'מוזיקה': { en: 'Music', fr: 'Musique' },
  'טכני': { en: 'Technical', fr: 'Technique' }, 'צילום': { en: 'Photo and video', fr: 'Photo et vidéo' }, 'עיצוב': { en: 'Design', fr: 'Décoration' }, 'הסעות': { en: 'Transport', fr: 'Transport' },
  'סיורים': { en: 'Tours', fr: 'Visites' }, 'לינה': { en: 'Accommodation', fr: 'Hébergement' }, 'מקום': { en: 'Venue', fr: 'Lieu' }, 'ציוד': { en: 'Equipment', fr: 'Matériel' }, 'פעילות': { en: 'Activities', fr: 'Activités' }
};

/* Recommended per kind of event: catalog items (by Hebrew name) that usually belong. Supplier types follow from the items. */
export const RECS = {
  'אירוע חברה': ['ניהול והפקת האירוע', 'מקום לאירוע', 'ארוחה', 'בר פתוח', 'תקליטן', 'הגברה ותאורה', 'צילום סטילס', 'עיצוב ופרחים'],
  'יום גיבוש': ['ניהול והפקת האירוע', 'עוזר/ת הפקה', 'אוטובוס', 'מדריך טיולים', 'סדנה או פעילות', 'ארוחה', 'כיבוד קל', 'כניסה לאתר'],
  'כנס': ['ניהול והפקת האירוע', 'עוזר/ת הפקה', 'מקום לאירוע', 'הגברה ותאורה', 'מסך ומקרן', 'שילוט ותגי שם', 'בר קפה', 'ארוחה', 'צילום סטילס'],
  'חתונה': ['ניהול והפקת האירוע', 'מקום לאירוע', 'ארוחה', 'בר פתוח', 'תקליטן', 'הגברה ותאורה', 'צילום סטילס', 'צילום וידאו', 'עיצוב ופרחים'],
  'אירוע לעמותה': ['ניהול והפקת האירוע', 'מקום לאירוע', 'כיבוד קל', 'הגברה ותאורה', 'צילום סטילס', 'שילוט ותגי שם'],
  'משלחת או סיור': ['ניהול והפקת האירוע', 'עוזר/ת הפקה', 'אוטובוס', 'מדריך טיולים', 'חדר במלון', 'ארוחה', 'כניסה לאתר'],
  'אירוע לרשות או משרד ממשלתי': ['ניהול והפקת האירוע', 'מקום לאירוע', 'כיבוד קל', 'הגברה ותאורה', 'שילוט ותגי שם', 'צילום סטילס'],
  'יום הולדת': ['ניהול והפקת האירוע', 'ארוחה', 'בר פתוח', 'תקליטן', 'עיצוב ופרחים', 'צילום סטילס'],
  'בר או בת מצווה': ['ניהול והפקת האירוע', 'מקום לאירוע', 'ארוחה', 'תקליטן', 'הגברה ותאורה', 'צילום סטילס', 'צילום וידאו', 'עיצוב ופרחים'],
  'מסיבה בבית פרטי': ['ניהול והפקת האירוע', 'שף פרטי', 'בר פתוח', 'תקליטן', 'שולחנות וכיסאות', 'אוהל או סככה'],
  'ערב טעימות': ['ניהול והפקת האירוע', 'יין ואלכוהול', 'כיבוד קל', 'אמן או מרצה', 'שולחנות וכיסאות'],
  'אחר': ['ניהול והפקת האירוע']
};
