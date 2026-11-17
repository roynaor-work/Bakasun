# מקורות ורישיונות

הדגמים, העיבודים, מצבי הנזק, הפלטות, האפקטים, קוד הבקר, התצוגה, המחולל והתיעוד החדשים מוקדשים לציבור לפי **CC0 1.0 Universal**. מותר להעתיק, לשנות, לשלב ולהפיץ, גם מסחרית. אין צורך בייחוס. הוויתור כפוף לנוסח CC0 ולרישיון הגיבוי שבו, ללא אחריות.

[נוסח CC0 המחייב](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

| רכיב | מקור | רישיון ושינויים |
|---|---|---|
| גופי עשרת הרכבים בעלי ארבעה גלגלים | [Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit), מאת Kenney | CC0-1.0. שונו קנה מידה ופרופורציות; הופרדו חלקים, נוספו נזק, גלגלים חדשים, פנסים ופלטות. כל הטקסטורות המקוריות הוסרו מהתוצרים. |
| קובצי המקור של Kenney | [מראת ההורדה](https://github.com/Arslan12216775/kenney_car-kit/tree/153591d606970058a4d0e44aeadf435c2d3f89ed/Models/GLB%20format) | עותקים ללא שינוי נשמרים בארכיון המקור עם רישיון Kenney המקורי. הרישיון נבדק לפני השימוש. |
| בסיס בניית האופנועים ועזרי הגאומטריה | [מקור האופנוע הקיים](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/catch-props-v1/source/build.py), ברישיון [החבילה המקורית](https://github.com/roynaor-work/Bakasun/blob/43b27dc235387e3cb737aee9558cdf9d5fd5a262/workout/island/design/catch-props-v1/LICENSES.md) | CC0-1.0. הותאמו ארבע צלליות נפרדות: שטח, סיור, ספורט וקטנוע. נבנו חלקים, גלגלים, נזק ותאורה חדשים. אין תלות בקובץ המקורי בזמן ריצה או שחזור. |
| מנוע התצוגה והטוען | [Three.js r160](https://github.com/mrdoob/three.js/tree/r160), כולל GLTFLoader, OrbitControls ו-RoomEnvironment | MIT, זכויות יוצרים Three.js Authors. החבילה המקומית נמצאת ב־`vendor/engine.mjs`; נוסח הרישיון המלא ב־`vendor/LICENSE.three`. |
| שאר הקבצים החדשים | יצירה מקורית למשימה זו | CC0-1.0. כולל הבקר, ממשק התצוגה, צילומי הדפדפן, הבדיקות והתיעוד. |

שבעת דגמי המקור המשמשים לבניית המכוניות הם:

`police`, `suv`, `van`, `sedan-sports`, `truck`, `taxi`, `sedan`.

ארכיון `source/kenney-car-kit-inputs.zip` כולל עותקים מקוריים של שבעת הדגמים ואת רישיון Kenney. הכתובת והקומיט של המראה, יחד עם SHA-256 של כל קובץ מקור, רשומים ב־`source/provenance.json`. המחולל בודק אותם לפני בנייה. הרישוי מתבסס על רישיון הנכסים של Kenney עצמם, הכלול בארכיון.

אין על רכבי התוצר סמלי יצרן, שמות מסחריים, אותיות, מספרי יחידה, לוחיות כתובות או טקסטורות כיתוב. המונית כוללת שלט גג חלק. שמות הרכבים בתצוגה ובמניפסט הם ממשק ומטא־נתונים בלבד. אין תמונות, גופנים, צילומים או נתוני אדם אמיתי במודלים.

כלי העבודה הבאים שימשו לבנייה ולבדיקה ואינם מופצים כחלק מקוד הריצה: Python, NumPy, Pillow, esbuild, Playwright, Chromium ו־[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator). הרישיון של Three.js נשאר MIT ואינו מוחלף ב־CC0 של יתר החבילה.
