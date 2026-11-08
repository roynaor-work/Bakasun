# טניס · ספריית תנועה v1

46 קליפים מקוריים לשחקן טניס בדיוני יחיד, על השלד הקנוני של motion2: ‏18 עצמות, מטרים ו־30Hz. כל GLB כולל דמות עם skin, מחבט, אנימציה ואירועי תצוגה. קובצי הריצה נמצאים ב־runtime/clips/ ונטענים ללא Draco, ללא meshopt וללא WebAssembly.

| משפחה | מספר קליפים |
| --- | ---: |
| מוכנות וספליט סטפ | 2 |
| ריצה, צעדי צד, האטה וחזרה למרכז | 14 |
| פורהנד ובקהנד — flat, topspin, slice | 12 |
| שלבי הגשה והגשות מלאות | 6 |
| וולי, סמאש, drop shot ולוב | 6 |
| תגובות וחגיגות | 6 |

1. הפעילו שרת HTTP משורש המאגר ופתחו את [התצוגה המקדימה](preview.html) בנתיב שלמטה.
2. בחרו קליפ, לחצו על ניגון או על ״לרגע המגע״, ובדקו את מסלול מרכז המיתרים, את נקודת המגע ואת עוגני הרגליים. אפשר לסובב את המצלמה ולשנות את קצב הניגון.
3. בדקו את [דוח המדידות](REPORT.md) ואת התוצאות הממוכנות בתיקיית verification. טעינה מוצלחת, תוצאות pass=true והחלקת נטיעה עד 2 ס״מ הן קריטריוני הבדיקה.

```sh
python3 -m http.server 8765
```

```text
http://localhost:8765/workout/island/design/tennis-motion-v1/preview.html
```

## שימוש בנתונים

[runtime/catalog.json](runtime/catalog.json) הוא הקטלוג ללא פריימי האנימציה; [runtime/motions.json](runtime/motions.json) כולל states עם כל הפריימים. כל פריים מכיל quaternion מקומי מוחלט xyzw לכל עצם, hipsOffsetMeters ומסלול שורש referenceRootTranslationMeters. זמן הפריים ב־JSON מנורמל ל־0..1; ב־GLB הוא בשניות, במרווחי 1/30 שנייה. צירים: ‎+Y למעלה, ‎+Z קדימה, ‎+X שמאל אנטומי.

rootMotion=true: תרגום השורש אפוי ומנוגן ב־GLB. אין להוסיף שוב את המסלול לשחקן. מתאם למשחק יכול להסיר את המסלול האפוי ולמסור את הדלתא לסימולציה במפורש. מעבר מומלץ נמצא ב־[runtime/player.mjs](runtime/player.mjs): פלט sample/fk/transitionFrame, המשך תנועה, היסט שורש, נשיאת עוגני נטיעה ו־IK לאחר ערבוב. המתאם אינו מחובר למשחק החי.

RightHand מחזיק את צומת Racket בטרנספורמציה יחסית קבועה וזהות, עם נקודת אחיזה [0,0,0]. ‏RacketHandle ו־RacketHead הם ילדיו; מרכז הראש הוא [0,0.50,0] מקומי למחבט, והאורך הכולל 0.685 מ׳. נקודת סוליה מקומית היא [0,-0.08,0] ביחס לעצם Foot. תיאור מלא נמצא ב־racket וב־equipmentContacts.

אירוע racket_contact מציין פריים, שניות, צומת RacketHead, נקודה מקומית [0,0,0] ומיקום עולם. ball_release יוצא מ־LeftHand בהטלה. אירועים מופיעים רק כשיש מגע או שחרור בפועל בקליפ; ריצה, עמידה, trophy ותגובות ללא מגע מכילים מערך events ריק עם contactApplicability מפורש. בנעיצת מחבט מופיע racket_ground_contact בפריים 30 עם נקודת קצה [0,0.685,0] מקומית ל־Racket וגובה עולם אפס. אלו סמני תצוגה, ללא הכרעה על ניקוד, בעלות או התנגשות פיזיקלית.

מכות הקרקע כוללות מסלול ארוך לכדור נמוך ומסלול קצר למגע מאוחר מאחורי כתף ההכאה, בפורהנד ובבקהנד ובשלוש צורות ספין. long/short מתארים הכנה ומסלול הנפה; המגע בכדור הוא אירוע רגעי. מסלול הכדור הוא המחשה חזותית לשילוב עתידי, ללא סימולציית כדור או גמישות מיתרים.

## שחזור ובדיקות

מחולל הנכסים משתמש ב־Node בלבד. גרסאות כלי האימות שנבדקו: gltf-validator@2.0.0-dev.3.10 ו־playwright@1.56.1, עם Chromium מקומי. glTF Validator ו־Playwright הם כלי בדיקה חיצוניים, ואינם מועתקים לחבילה. התקינו אותם בתיקיית כלי עבודה נפרדת והצביעו למודולים באמצעות GLTF_VALIDATOR_MODULE ו־PLAYWRIGHT_MODULE; דפדפן Chromium נבחר באמצעות CHROMIUM_EXECUTABLE כשנדרש.

```sh
node workout/island/design/tennis-motion-v1/source/bake.mjs
node workout/island/design/tennis-motion-v1/verification/check.mjs
node workout/island/design/tennis-motion-v1/verification/check.mjs --transitions
node workout/island/design/tennis-motion-v1/verification/browser-check.mjs
node workout/island/design/tennis-motion-v1/source/write-docs.mjs
node workout/island/design/tennis-motion-v1/verification/check.mjs --files-only
```

הריצו את מחולל התיעוד אחרי יצירת כל קובצי ההוכחה, ואז את בדיקת הקבצים אחרונה כדי שסכומי SHA-256 יתייחסו לתוכן הסופי. בדיקת הקבצים קוראת ומפענחת כל קובץ בחבילה; קובץ התוצאה העצמי verification/files.json מוחרג מהגיבוב העצמי.

הדף משתמש בעותקי Three.js ו־GLTFLoader הקיימים במאגר ב־../../vendor/ ברישיון MIT, ללא העתקתם לחבילה. הנכסים, קוד החבילה והתוצרים החדשים מקוריים ומוקדשים ל־CC0-1.0; פירוט מקור ורישיון לכל קובץ ב־[LICENSES.md](LICENSES.md).
