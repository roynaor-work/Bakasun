# רישיונות ומקור

הדמויות, הבניינים, הרכבים, הרחוב, החלקיקים והטקסטורות נוצרו במיוחד לחבילה זו. לא נכללו צילומי אנשים, דגמי מותגים, סמלי רשויות, סמלי מועדונים או נתוני לקוחות.

הגאומטריה, הטקסטורות, האטלסים, אנימציות הדמויות ונתוני הסימולציה המקוריים בחבילה זו מוצעים תחת CC0-1.0: מותר להשתמש, לשנות ולהפיץ, לרבות שימוש מסחרי. מידע על CC0: [Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| רכיב | מקור | רישיון | שימוש |
|---|---|---|---|
| גאומטריה וחומרים | source/mesh.py, vehicles.py, crew.py, buildings.py, street.py | CC0-1.0 | מקוריים ובדיוניים |
| טקסטורות וחלקיקים | source/textures.py | CC0-1.0 | רעש פרוצדורלי עם seed קבוע, ללא תמונות חיצוניות |
| שלד | חוזה motion2 הקיים בריפו, מועתק ל־skeleton.json | רישיון נכסי motion2 במאגר | 18 שמות, הורים ותרגומי מנוחה זהים |
| קליפים | source/export.mjs | CC0-1.0 | פוזות מקוריות והליכה עם IK; ללא motion capture |
| three.js r160 וה־loaders | חבילת npm three@0.160.0 | MIT | vendor/LICENSE.three |
| Draco decoder | מפענח glTF הנכלל ב־three@0.160.0 | Apache-2.0 | vendor/LICENSE.draco |
| מחוללי GLB ובדיקות | glTF Transform, Draco encoder, glTF Validator | רישיונות החבילות המקוריים | כלי יצירה בלבד; אינם נדרשים לפתיחת התצוגה |

source/package.json מקבע גרסאות לשחזור. הקבצים ב־vendor מקומיים; הם אינם טוענים ספריות מ־CDN. assets-data.js מכיל נתוני GLB דחוסים, טקסטורות משותפות ונתוני מפענח מקומיים בלבד.
