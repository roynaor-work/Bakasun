# מקור ורישיון · דמויות v2

ארבע הדמויות בדויות ונוצרו לחבילה זו ב־31.10.2026. הפנים, הגוף, הידיים, השיער, הביגוד, הנעליים וציוד הסקי נבנו כגאומטריה מקורית בקובצי המקור המצורפים. לא נעשה שימוש בסריקה, בדיוקן, במודל של אדם אמיתי או בנכסים ממשחק מסחרי. אין מותגים, סמלים או תלבושות של קבוצות אמיתיות.

| קבצים | מקור | רישיון |
| --- | --- | --- |
| `soccer-player.glb`, `goalkeeper.glb`, `basketball-player.glb`, `skier.glb` | גאומטריה, פרטים, צבעים ומשקלי עור מקוריים; מיוצרים באמצעות `source/build.py`, `mesh.py`, `body.py`, `head_hands.py`, `gear.py`, `export.mjs` | CC0-1.0 ליצירה המקורית |
| `*-front.png`, `*-three-quarter.png`, `*-back.png`, `*-detail.png`, `overview.webp` | רינדורים מקוריים של קובצי ה־GLB הסופיים | CC0-1.0 |
| קובצי המקור, המיפוי, התיעוד והתצוגה בתיקייה זו | יצירה מקורית לחבילה | CC0-1.0 |
| חוזה 20 העצמות הכלול ב־GLB | ערכים ושמות מדויקים מתוך [characters/rig.json](../characters/rig.json), ב־main המקורי `3853d282b6dd7719db49a864fec4286dc7b63cb0` | CC0-1.0, כפי שמתועד ב־[רישיונות הדמויות המקוריות](../characters/LICENSES.md) |
| תלבושות, מפות ופלטות קיימות | הפניה בלבד ל־[variants/](../variants/README.md), ללא העתקה לחבילה או שינוי במקורות | [רישיון חבילת הווריאנטים](../variants/LICENSES.md), CC0-1.0 |

הגאומטריה המקורית אינה מבוססת על רשת Kenney הישנה. חוזה השלד המשותף נשמר לצורך תאימות; מקורו בתהליך התאמת השלד שתועד בחבילת `characters`, המבוססת על [Kenney Animated Characters Protagonists 1.1](https://kenney.nl/assets/animated-characters-protagonists), CC0. [הודעת הרישיון הקיימת](../../../3d/model/License.txt) נשארה במקומה.

היצירה המקורית המפורטת לעיל מוקדשת לנחלת הכלל לפי [Creative Commons CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), ומותרת לשימוש, שינוי והפצה, לרבות שימוש מסחרי, בכפוף לתנאי ההקדשה. אין התחייבות לזכויות בשם של אדם, בסימן מסחרי או בדמותו של אדם; החבילה לא משתמשת בהם.

## כלים וספריות משותפות

אלה כלי יצירה או ספריות שכבר נמצאות במאגר; הן אינן יצירה מקורית של החבילה:

- [glTF Transform](https://github.com/donmccurdy/glTF-Transform), גרסה 4.5.1 — MIT, ייצוא ופענוח.
- [Draco](https://github.com/google/draco), גרסה 1.5.9 — Apache-2.0, דחיסה ופענוח; הודעות המפענח המקומי נשמרות ב־[viewer/draco/](../viewer/draco/).
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator), גרסה 2.0.0-dev.3.10 — Apache-2.0, אימות.
- [three.js](https://github.com/mrdoob/three.js) — MIT, רינדור באמצעות העותק המשותף במאגר.
- NumPy, Pillow ו־Playwright — כלי הבנייה והצילום בלבד; אינם נכללים בנכסי זמן המשחק.

קובצי GLB כוללים צבעי קודקודים ואינם כוללים תמונות. בבחירת תלבושת נעשה שימוש במפה אחת קיימת בגודל 256×256. קובצי התצוגה המקדימה אינם טקסטורות של הדמויות.
