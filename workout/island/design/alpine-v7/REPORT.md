# אלפיין v7 — דוח מסירה

שלוש דמויות בדויות לסקי ולסנובורד, ציוד מלא, 14 אנימציות לכל דמות ועולם שלג תואם לשפה החזותית של alpine-v5. החבילה נמצאת ב־`workout/island/design/alpine-v7/`; תצוגת הרינדור פועלת מקומית באמצעות Three.js r160 ו־Draco, ללא בנייה וללא תלות רשת בזמן שימוש.

## זמן והיקף

תחילת העבודה (UTC): **2026-11-04T20:09:27.000Z**. סיום העבודה (UTC): **2026-11-05T02:15:15.854Z**. משך מתועד: **365.8 דקות** ([verification/work-log.json](verification/work-log.json)). כל חותמות הזמן בדוח הן ב־UTC.

נבדקו שינויי Git מול `5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275`: תוספות בלבד בתוך התיקייה המורשית, בענף `codex/alpine-v7-20261105`. קוד קיים, release.json, release.mjs, CLAUDE.md ובדיקות קיימות אינם נכללים בשינויים. לא נוספו מותגים, סמלי מועדונים, דמויות של אנשים אמיתיים או נתוני לקוחות.

## ציון עצמי עם ראיות

הציונים מבוססים על הצילומים, תקריבי החומרים וראיות התנועה ב־[verification/scores.json](verification/scores.json). ההערכה מתייחסת ליעד של משחק מובייל בגבולות התקציב; אין טענה לפוטוריאליזם.

| סעיף | ציון / 10 | ביקורת ומגבלה שנותרה | ראיות |
|---|---:|---|---|
| דמות | 8 | פרופורציות וציוד מובחנים, מעילים רציפים ומשקף מחזיר אור; הפנים והכפפות עדיין מפושטים למובייל. | [iterations/08/athlete-0-carve_left-390x844.webp](iterations/08/athlete-0-carve_left-390x844.webp) · [iterations/08/athlete-1-carve_right-844x390.webp](iterations/08/athlete-1-carve_right-844x390.webp) · [iterations/08/athlete-2-carve_left-390x844.webp](iterations/08/athlete-2-carve_left-390x844.webp) |
| תנועת גוף בפנייה | 8 | קנט, נטיית אגן וברכיים וטעינת רגל חיצונית בסקי; אצבעות/עקבים בסנובורד. מגע הציוד נמדד בכל LOD; אין סימולציית כוחות. | [iterations/08/athlete-0-carve_left-844x390.webp](iterations/08/athlete-0-carve_left-844x390.webp) · [iterations/08/athlete-0-carve_right-844x390.webp](iterations/08/athlete-0-carve_right-844x390.webp) · [iterations/08/athlete-1-carve_left-390x844.webp](iterations/08/athlete-1-carve_left-390x844.webp) · [iterations/08/athlete-1-carve_right-390x844.webp](iterations/08/athlete-1-carve_right-390x844.webp) · [motion/verification/dense-boundaries.json](motion/verification/dense-boundaries.json) |
| שלג | 8 | אבקה, קרח ושלג מרוסק מובחנים בחספוס ובאור. הקרח כולל שברים והחזר פיזי; אין עובי שלג או קרח נפחי. | [iterations/08/detail-powder-390x844.webp](iterations/08/detail-powder-390x844.webp) · [iterations/08/detail-ice-844x390.webp](iterations/08/detail-ice-844x390.webp) · [iterations/08/detail-churned-390x844.webp](iterations/08/detail-churned-390x844.webp) |
| עצים | 8 | אורן קרוב עם ענפים רדיאליים ו־1,920 משולשים. שינוי צללית נראה ומוגבל נשאר במעבר ל־LOD בינוני סביב15מ׳; עלווה משתמשת בכרטיסים קצרים. | [iterations/08/forest-angle--0.7-390x844.webp](iterations/08/forest-angle--0.7-390x844.webp) · [iterations/08/forest-angle-0.9-844x390.webp](iterations/08/forest-angle-0.9-844x390.webp) · [world/verification-pine-lod.json](world/verification-pine-lod.json) |
| רקע | 8.5 | נגזרות alpine-v5 ממוסגרות ללא מתיחה, עם שכבות הרים ושלוש שעות אור. רקעים מצולמים מישוריים ואינם רכסי3D מלאים. | [iterations/08/far-390x844.webp](iterations/08/far-390x844.webp) · [iterations/08/far-844x390.webp](iterations/08/far-844x390.webp) · [iterations/08/athlete-2-carve_right-844x390.webp](iterations/08/athlete-2-carve_right-844x390.webp) |
| עקביות | 8 | מסגור נמוך לפי ראש/אגן בנפילה וקימה ואיפוס זווית ביציאה מטריק משאירים ידיים וציוד גלויים. סולם וצירי תנועה משותפים; בדיקות המסגור והמטריצה הן שערים נפרדים מהציון החזותי. | [iterations/10/near-390x844.webp](iterations/10/near-390x844.webp) · [iterations/10/near-844x390.webp](iterations/10/near-844x390.webp) · [iterations/10/recovery-1-fall_roll-4-390x844.webp](iterations/10/recovery-1-fall_roll-4-390x844.webp) · [iterations/10/recovery-2-get_up-0-844x390.webp](iterations/10/recovery-2-get_up-0-844x390.webp) · [iterations/10/critique.md](iterations/10/critique.md) · [verification/camera-recovery-audit.json](verification/camera-recovery-audit.json) |

## סבבי בנייה, צילום וביקורת

נשמרו **10 סבבים**. בכל סבב ארבעה צילומי חובה: קרוב ורחוק ב־390×844 וב־844×390, וביקורת כתובה. ציוני ביניים שנכשלו נשמרו בתיעוד; הם אינם ציוני המסירה. [iterations/index.html](iterations/index.html) מציג את היומן המקומי.

| סבב | צילומים שנשמרו | ביקורת |
|---|---:|---|
| 01 | 4 | [iterations/01/critique.md](iterations/01/critique.md) |
| 02 | 4 | [iterations/02/critique.md](iterations/02/critique.md) |
| 03 | 4 | [iterations/03/critique.md](iterations/03/critique.md) |
| 04 | 5 | [iterations/04/critique.md](iterations/04/critique.md) |
| 05 | 4 | [iterations/05/critique.md](iterations/05/critique.md) |
| 06 | 4 | [iterations/06/critique.md](iterations/06/critique.md) |
| 07 | 28 | [iterations/07/critique.md](iterations/07/critique.md) |
| 08 | 28 | [iterations/08/critique.md](iterations/08/critique.md) |
| 09 | 28 | [iterations/09/critique.md](iterations/09/critique.md) |
| 10 | 34 | [iterations/10/critique.md](iterations/10/critique.md) |

## בדיקות שהושלמו

| בדיקה | תוצאה | כיסוי בפועל | דוח |
|---|---|---|---|
| מבנה GLB, Draco, שלד, UV וטקסטורות | עבר | 21 GLB; 20 תמונות חיצוניות | [verification/asset-audit.json](verification/asset-audit.json) |
| תנועות בכל LOD | עבר | 9 קבצים × 14 קליפים × 121 דגימות | [verification/motion-audit.json](verification/motion-audit.json) |
| מגע ורציפות צפופים | עבר | 103,437 דגימות | [motion/verification/dense-boundaries.json](motion/verification/dense-boundaries.json) |
| JSON מול קליפי GLB | עבר | 16,178 דגימות | [motion/verification/json-playback.json](motion/verification/json-playback.json) |
| זהות חבילה ומקורות | עבר | 43 נכסים; 7 מודולים | [verification/package-audit.json](verification/package-audit.json) |
| ממשק, מסגור, חלקיקים ו־LOD | עבר | 1,740 בדיקות הקרנת גאומטריה; 34 שערים | [verification/browser-audit.json](verification/browser-audit.json) |
| רגרסיית המאגר | עבר | 3,227 עברו; 51 דולגו; 0 נכשלו | [verification/repository-tests.json](verification/repository-tests.json) |
| מטריצת רינדור | עבר | 504/504; 126.1 דקות; DPR1.5 | [verification/matrix-soak.json](verification/matrix-soak.json) |

בדיקות המסגור מקרינות את כל קודקודי הגוף והציוד לאחר skinning דרך מצלמת התצוגה בפועל, בשלוש דמויות, 14 קליפים, שני מרחקים ושתי אוריינטציות. זמני הדגימה כוללים שלבי ביניים צפופים נוספים בנפילה. במהלך סריקת גאומטריה זו בלבד מדלגים על רסטריזציה, תוך שמירת עדכון התנוחה, השלד והמצלמה. אלה 1,740 בדיקות הקרנה, ולא אותו מספר של רינדורי GPU. בנוסף עברו 150 תנוחות בדיקה מול מלבן בקרות הדמות בפועל, ו־300 מעברי בחירת קליפ מאוויר לנפילה/קימה בדקו את זמן התנוחה ואת איפוס כיוון המצלמה. בדיקת החפיפה כוללת קודקודי ראש, אמות וידיים בעלי משקל שלד מעל 0.2, ודורשת אפס חפיפות. בדיקות הממשק והחלקיקים, צילומי הסבבים ומטריצת הרינדור מפעילים רינדור ממשי בנפרד.

מטריצת הרינדור מכסה בדיוק 3 דמויות × 14 קליפים × 3 סביבות × 2 מרחקים × 2 אוריינטציות = 504 שילובים ייחודיים. כל שילוב נוגן בפועל לפחות 10 שניות, עם לפחות שני רינדורים ושני שינויי זמן שנצפו בנפרד. ב־324 קליפים חד־פעמיים שלא הגיעו לסופם בזמן התצפית, בוצעה אחריה בדיקת סיום נפרדת באמצעות seek ל־50 מילישניות לפני סוף הקליפ והמתנה לעצירה אמיתית. מצב התצפית המקורי, עקבת ההתקדמות ותוצאת בדיקת הסיום נשמרים בנפרד; אין טענה שכל הקליפים הושלמו באופן טבעי בתוך עשר שניות תחת רינדור התוכנה. נבדקו גבולות משאבים גם לאחר בדיקת הסיום, ללא שגיאות JavaScript בקונסולה או בקשות HTTP חיצוניות. קמפיין המטריצה התחיל ב־2026-11-05T00:06:32.807Z והסתיימה ב־2026-11-05T02:12:39.303Z. הגלריה המקומית [verification/matrix/index.html](verification/matrix/index.html) מסננת את הצילומים ומציינת אם התנוחה המצולמת שייכת לתצפית או לבדיקת סיום מסייעת. בדיקות התנועה הצפופות בודקות מגע מול משטח אופקי וקודקודי גוף בנפילה/קימה; הן אינן סימולציית התנגשויות מלאה.

מגבלות ההמתנה שהוגדרו במטריצה הן 45 שניות להשלמת תנאי ההתקדמות לאחר התצפית הראשונית, ו־45 שניות לבדיקת סיום מסייעת. הזמנים שנמדדו בפועל נשמרים בכל מקרה. נרשמו גם נראות ומיקוד הדף ופערי rAF, כולל הפער לפני התצפית הראשונה ואחרי האחרונה. סביבת ההרצה השתמשה ב־CPU affinity **0-2** ובמכסת cgroup **400000 100000**; חותמת כלי ההרצה שמורה בדוח המטריצה. ניסיונות שנעצרו נשמרו בנפרד ואינם נספרים בין 504 המקרים האלה.

הקמפיין נקטע אחרי 285 מקרים שנשמרו, עקב timeout של 30 שניות בצילום המקרה הבא. הרשומה החלקית של 286 לא נספרה כהצלחה. יומן ההפסקה, 285 הרשומות ובקר ההרצה המקורי נשמרו ב־[verification/matrix/continuation-01/interruption.json](verification/matrix/continuation-01/interruption.json); בדיקת ההמשך מאמתת את חותמות המקורות, זהות הבתים של הקידומת ושל 61 הצילומים המקוריים ושני ה־baselines המקוריים. ההמשך הפעיל הקשר דפדפן חדש למסך הרוחב ושחזר בו במלואם 33 מקרים, 253–285, לפני 286–504. השחזורים נשמרים בנפרד ב־[verification/matrix/replay-01/cases.jsonl](verification/matrix/replay-01/cases.jsonl) ואינם נספרים בין 504 השילובים הייחודיים. כך רצף 252 מקרי הרוחב נבדק בהקשר החדש. נשמרו 2 מקטעי בקר עם מקור ו־SHA לכל מקטע. משך הקמפיין כולל את ההפסקה; אין טענה לריצה רצופה של תהליך יחיד. זמן התצפיות המצטבר שנרשם במקרים ובשחזורים הוא 92.8 דקות. לצילומי ההמשך הוגדר timeout של 90 שניות וניסיון חוזר אחד לכל היותר על אותה תנוחה מושהית; נרשמו 0 ניסיונות צילום כושלים נוספים, וכל צילום שנדרש למסירה הסתיים בהצלחה.

## הפעלה מקומית וביצועים

פתחו את [preview-standalone.html](preview-standalone.html) בדפדפן רגיל, או את [preview.html](preview.html) לצד תיקיית `offline/`. דף התצוגה העצמאי הוא **7.551067 MB** ומרכז מנוע, מפענח, כל הדמויות ורמות הפירוט, סביבות וממשק בדיקה. זהו משקל חבילת הביקורת הכוללת; מגבלת 1.5MB חלה על כל GLB בנפרד. [README.md](README.md) מתאר את דרך השילוב של הנכסים המקוריים במשחק.

ניווט ישיר ב־file:// נחסם ב־ERR_BLOCKED_BY_ADMINISTRATOR על ידי מדיניות הדפדפן המנוהל. לא בוצע עקף למדיניות. התנהגות הקובץ הוכחה באמצעות טעינת תוכן ה־HTML העצמאי ל־about:blank עם רשת כבויה; אין כאן אישור של ניווט file:// בסביבה זו.

יעד הפלטפורמה הוא **30fps בטלפון בינוני**. המדידה נעשתה ב־Chromium/ANGLE SwiftShader בתוכנה ב־DPR **1.5**, בשני גדלי המסך המבוקשים. ערכי זמן הרינדור במטריצה הם זמני הגשת עבודה במעבד ואינם מדידת השלמת GPU. **30fps בטלפון פיזי לא אומתו**; נדרשת בדיקת מכשיר לפני אישור ביצועים למוצר. מספר המשולשים בסצנה כולל חזרות Instancing ומעברי צל; הוא שונה ממספר המשולשים המאוחסנים בקובץ בודד.

קצב הרינדור הנצפה בסביבת התוכנה במקרי המטריצה היה 0.04–1.76fps. זו תוצאת סביבת הבדיקה המתועדת, והיא אינה מדידת ביצועים של טלפון.

נעשה שימוש ב־LOD לדמויות ולעצים, קהל ב־InstancedMesh ומאגר חלקיקים מוגבל. האורן הקרוב כולל גזע מלא, ענפים רדיאליים תלת־ממדיים וכרטיסי מחטים קצרים, ב־1,920 משולשים. הרמה הבינונית משתמשת בשני כרטיסי עץ מצטלבים עם משטחי גב מפורשים, ב־8 משולשים; הרמה הרחוקה היא billboard עם משטח גב, ב־4 משולשים. שלוש הרמות חולקות אטלס 1024² אחד. סביב מעבר המרחק ב־15 מ׳ עדיין נראה שינוי בצללית הענפים, אף שהגובה והפרישה מותאמים; אין הבטחה למעבר בלתי נראה. [world/verification-pine-lod.json](world/verification-pine-lod.json) מתעדת את גבול ה־LOD בפועל. מפות השלג יוצרות הבחנה חומרית, ללא סימולציה נפחית של שלג או קרח.

## משקלי נכסים

הטבלה מבוססת על [verification/asset-weights.md](verification/asset-weights.md) ועל דוח הנכסים הדחוסים. MB עשרוני = 1,000,000 בתים; שש ספרות עשרוניות מציינות את מספר הבתים המדויק. בכל דמות אטלס יחיד, וכל תמונת טקסטורה מוגבלת ל־1024 בצלע.

מקור: audit-assets.mjs, בדיקה של קובצי המסירה הדחוסים. MB עשרוני = 1,000,000 בתים.

| קובץ | משולשים | MB | טקסטורות | עצמות | קליפים |
|---|---:|---:|---|---:|---:|
| characters/ski-female-lod1.glb | 9,922 | 0.753560 | 1024×1024 | 18 | 14 |
| characters/ski-female-lod2.glb | 4,134 | 0.722388 | 1024×1024 | 18 | 14 |
| characters/ski-female.glb | 19,964 | 0.795192 | 1024×1024 | 18 | 14 |
| characters/ski-male-lod1.glb | 9,890 | 0.753016 | 1024×1024 | 18 | 14 |
| characters/ski-male-lod2.glb | 4,129 | 0.722028 | 1024×1024 | 18 | 14 |
| characters/ski-male.glb | 19,916 | 0.794424 | 1024×1024 | 18 | 14 |
| characters/snowboard-female-lod1.glb | 10,709 | 0.756232 | 1024×1024 | 18 | 14 |
| characters/snowboard-female-lod2.glb | 4,221 | 0.720180 | 1024×1024 | 18 | 14 |
| characters/snowboard-female.glb | 21,508 | 0.798344 | 1024×1024 | 18 | 14 |
| world/models/crowd-person.glb | 118 | 0.002428 | — | — | 0 |
| world/models/direction-sign.glb | 61 | 0.001784 | — | — | 0 |
| world/models/floodlight.glb | 124 | 0.002124 | — | — | 0 |
| world/models/pine-lod0.glb | 1,920 | 0.353068 | 1024×1024 | — | 0 |
| world/models/pine-lod1.glb | 8 | 0.338220 | 1024×1024 | — | 0 |
| world/models/pine-lod2.glb | 4 | 0.338124 | 1024×1024 | — | 0 |
| world/models/rock-large.glb | 144 | 0.002568 | — | — | 0 |
| world/models/rock-small.glb | 144 | 0.002576 | — | — | 0 |
| world/models/route-marker.glb | 50 | 0.001732 | — | — | 0 |
| world/models/safety-fence.glb | 282 | 0.003036 | — | — | 0 |
| world/models/slalom-gate.glb | 116 | 0.002248 | — | — | 0 |
| world/models/snow-ramp.glb | 248 | 0.002468 | — | — | 0 |

| תמונה חיצונית | MB | מידות |
|---|---:|---|
| characters/ski-female-atlas.png | 0.299445 | 1024×1024 |
| characters/ski-male-atlas.png | 0.299226 | 1024×1024 |
| characters/snowboard-female-atlas.png | 0.313875 | 1024×1024 |
| world/backgrounds/fog-landscape.webp | 0.076616 | 1024×576 |
| world/backgrounds/fog-portrait.webp | 0.057660 | 486×864 |
| world/backgrounds/night-floodlit-landscape.webp | 0.081716 | 1024×576 |
| world/backgrounds/night-floodlit-portrait.webp | 0.064580 | 486×864 |
| world/backgrounds/sunset-landscape.webp | 0.088494 | 1024×576 |
| world/backgrounds/sunset-portrait.webp | 0.061244 | 486×864 |
| world/textures/churned-albedo.webp | 0.121218 | 512×512 |
| world/textures/churned-normal.webp | 0.576598 | 512×512 |
| world/textures/churned-roughness.webp | 0.121406 | 512×512 |
| world/textures/ice-albedo.webp | 0.067164 | 512×512 |
| world/textures/ice-normal.webp | 0.404478 | 512×512 |
| world/textures/ice-roughness.webp | 0.050558 | 512×512 |
| world/textures/materials-contact-sheet.webp | 0.145674 | 768×768 |
| world/textures/pine-atlas.png | 0.336368 | 1024×1024 |
| world/textures/powder-albedo.webp | 0.080330 | 512×512 |
| world/textures/powder-normal.webp | 0.560540 | 512×512 |
| world/textures/powder-roughness.webp | 0.104600 | 512×512 |

כל בדיקות מבנה הנכסים עברו.

## הקבצים הגדולים

| קובץ | בתים | MB |
|---|---:|---:|
| [preview-standalone.html](preview-standalone.html) | 7,551,067 | 7.551067 |
| [verification/matrix-soak.json](verification/matrix-soak.json) | 2,159,547 | 2.159547 |
| [verification/matrix/cases.jsonl](verification/matrix/cases.jsonl) | 1,251,678 | 1.251678 |
| [offline/assets-01.js](offline/assets-01.js) | 1,098,816 | 1.098816 |
| [offline/assets-02.js](offline/assets-02.js) | 1,098,268 | 1.098268 |
| [offline/assets-06.js](offline/assets-06.js) | 1,097,708 | 1.097708 |
| [offline/assets-04.js](offline/assets-04.js) | 1,094,740 | 1.094740 |
| [offline/assets-03.js](offline/assets-03.js) | 1,093,268 | 1.093268 |
| [offline/assets-05.js](offline/assets-05.js) | 1,090,560 | 1.090560 |
| [offline/assets-00.js](offline/assets-00.js) | 1,090,106 | 1.090106 |

מקטעי התוכן משחזרים 12,028,406 בתים של נכסים מתוך 6,449,704 בתים ייחודיים: חיסכון של 5,578,702 בתים (46.38%). קובצי GLB מקוריים נשארו עצמאיים.

## מקורות ושחזור

חותמות SHA-256 של מקור קנוני, נכסים, מקורות יצירה ומודולים נמצאות בדוחות הנכסים והחבילה. רישיונות המנוע והמפענח נמצאים ב־[licenses/three-MIT.txt](licenses/three-MIT.txt) וב־[licenses/draco-Apache-2.0.txt](licenses/draco-Apache-2.0.txt); הודעות הרישיון מוטמעות גם ב־HTML העצמאי. מקור האורנים והרקעים מתועד ב־[world/README.md](world/README.md), ותהליך התנועה ב־[motion/README.md](motion/README.md).

פקודות הבדיקות מפורטות ב־[tools/audit-README.md](tools/audit-README.md). הכלי `tools/report-final.mjs --check` מאמת את תנאי יצירת הדוח ללא כתיבה. לאחר יצירתו מפעילים `node workout/island/design/alpine-v7/tools/audit-delivery.mjs --modules /tmp/alpine-v7-tools` כדי לעדכן את בדיקת המסירה ומלאי הקבצים.
