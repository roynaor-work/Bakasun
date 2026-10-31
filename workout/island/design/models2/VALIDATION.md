# אימות · מודלי סביבה 02

כל 18 קובצי ה־GLB עברו glTF Validator 2.0.0-dev.3.10 ללא שגיאות או אזהרות, גם כקובץ Draco וגם אחרי פענוח עצמאי. [דוח נכסים](validation.json) · [פלט דחוס](validation/compressed/) · [פלט מפוענח](validation/decoded/) · [דוח דפדפן](browser-validation.json).

## משקל וגאומטריה

KB/MB עשרוניים. התקרות הן 400,000 bytes לכל מודל גדול ו־2,500,000 bytes לכל התיקייה, לרבות מודלים, חוזים, תצוגות, כלים ודוחות. בפועל כל 18 המודלים קטנים גם מתקרת המודל הגדול. משקל כל ה־GLB: **395,808 bytes**. סיכום כל הקבצים, גיבובים ותקציב כולל: [package-budget.json](package-budget.json).

| מודל | bytes | משולשים | draw calls משוערים | שגיאות דחוס / מפוענח |
| --- | ---: | ---: | ---: | ---: |
| [basketball-arena.glb](basketball-arena.glb) | 109,832 | 24,840 | 21 | 0 / 0 |
| [fence.glb](fence.glb) | 5,544 | 488 | 3 | 0 / 0 |
| [finish-gate.glb](finish-gate.glb) | 2,648 | 256 | 1 | 0 / 0 |
| [fir-a.glb](fir-a.glb) | 3,232 | 87 | 2 | 0 / 0 |
| [fir-b.glb](fir-b.glb) | 3,336 | 96 | 2 | 0 / 0 |
| [fir-c.glb](fir-c.glb) | 3,308 | 96 | 2 | 0 / 0 |
| [fir-dense.glb](fir-dense.glb) | 15,008 | 1,560 | 1 | 0 / 0 |
| [fir-medium.glb](fir-medium.glb) | 9,052 | 840 | 1 | 0 / 0 |
| [fir-sparse.glb](fir-sparse.glb) | 4,824 | 360 | 1 | 0 / 0 |
| [lift-tower.glb](lift-tower.glb) | 6,212 | 948 | 1 | 0 / 0 |
| [rock.glb](rock.glb) | 1,976 | 54 | 1 | 0 / 0 |
| [rock-large.glb](rock-large.glb) | 1,980 | 54 | 1 | 0 / 0 |
| [rock-small.glb](rock-small.glb) | 1,988 | 54 | 1 | 0 / 0 |
| [ski-slope.glb](ski-slope.glb) | 64,120 | 8,526 | 16 | 0 / 0 |
| [slalom-gate.glb](slalom-gate.glb) | 5,132 | 220 | 4 | 0 / 0 |
| [snow-sign.glb](snow-sign.glb) | 1,828 | 69 | 1 | 0 / 0 |
| [soccer-stadium.glb](soccer-stadium.glb) | 153,156 | 38,264 | 17 | 0 / 0 |
| [start-gate.glb](start-gate.glb) | 2,632 | 256 | 1 | 0 / 0 |

draw calls הם מספר ה־primitives המופיעים בסצנה, מעבר צבע יחיד, כל הרשתות גלויות, ללא צללים בזמן ריצה. דוח הדפדפן משווה אותם ואת מספר המשולשים ל־renderer.info של Three.js. culling עשוי להפחית קריאות; מעברי צל או חומרים נוספים בזמן שילוב עשויים להוסיף. אין מכך הבטחה לקצב פריימים בטלפון.

אין images/textures או משאבי URI חיצוניים ב־GLB. כל primitive דורש KHR_draco_mesh_compression. צבעים ו־AO אפוי ב־COLOR_0, כך שתקציב מרקמים עד 512px מתקיים ללא תמונות משטח. צילומי התצוגה אינם טקסטורות משחק.

## חוזים ובדיקות טלפון

- לכל נכס בעל מקבילה ב־models/ נבדקו כל שמות הרכיבים וכל מיקומי העוגנים בעולם מול authoring.json המקורי, בסבילות 0.00002 מ׳. השורש בראשית, ללא סיבוב ובקנה מידה 1.
- 21 בדיקות רינדור: שלוש הסביבות ב־390×844 וב־844×390, וכל 15 האביזרים בנפרד. ללא שגיאות דף/טעינה, גלישה אופקית או בקשות חיצוניות.
- ששת מבטי הטלפון בודקים גם סיבוב בגרירה שמשנה את תמונת הקנבס, ואיפוס שמחזיר את התמונה המקורית. צילום של כל כיוון נשמר ב־previews/; גיליון האביזרים ב־previews/props.webp.
- התצוגות משתמשות ב־GLB הסופי ובמפענח Draco המקומי של המאגר, עם תאורה זהה בשני כיווני הטלפון. נבדקו חזותית הפרקט והסימונים, לוח התוצאה התלוי, שתי קומות היציע, שערים, שולי השלג והאביזרים.
- בדיקת הדפדפן נעשתה ב־Chromium/SwiftShader עם deviceScaleFactor=1. זו אמולציית מידות מסך, ללא בדיקת מכשיר פיזי או FPS.

ה־Validator מציג הודעות מידע צפויות: unsupported extension עבור Draco בגרסת Validator זו, ו־empty node לעוגנים. לכן נוסף פענוח Draco עצמאי עם glTF Transform + Draco 1.5.7 ואימות מלא של ה־GLB המפוענח. לא הוסתרו אזהרות או שגיאות; הדוחות הגולמיים נשמרו.

## בדיקות המאגר

תוצאות npm test: עברו 2862, נכשלו 1, דולגו 38. הכשל שנותר שוחזר גם ב־checkout נקי ונפרד של main באותו קומיט; אין שינויים בקבצים שהבדיקות קוראות. [פירוט ההשוואה](validation/repository-checks.json):

- tests/cam-lab-keyframes.test.mjs: קוד יציאה 0 בענף ו־0 ב־main; עבר גם בענף וגם ב־main.
- tests/island-g7.test.mjs: קוד יציאה 1 בענף ו־1 ב־main; אותה בדיקה נכשלת בשני העצים: config.orientation הוא any והבדיקה מצפה ל־landscape (שורה 44).
- tests/workout-dad-test.test.mjs: קוד יציאה 0 בענף ו־0 ב־main; עבר גם בענף וגם ב־main.

הבדיקה מול Git מאשרת שכל קובצי ה־PR חדשים ותחת workout/island/design/models2/. אין שינוי בקבצים קיימים או בקוד המשחק. קובצי HTML/JS בתיקייה זו הם כלי תצוגת נכסים בלבד.
