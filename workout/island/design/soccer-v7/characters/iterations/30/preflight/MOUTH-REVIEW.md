# סבב 30 — השוואת דחיסת פה .40 / .25

העדפת הסוקר העצמאי היא **.40, בהפרש קטן**: בעיקר ב־P02, שבו .25 משאיר פס שחור רחב מעט יותר ופינה ימנית בתמונה שנראית פתוחה יותר. ב־P04 ההבדל קטן מכדי לקבוע שיפור ברור. Atlas דיווח גם הוא על העדפה חלשה ל־.40; לפי Atlas, ההורה הראשי מעדיף כעת .25. אין הכרעה מוסכמת, קידום אוטומטי או הרחבה לשמונה זהויות.

| זהות | ממצא בתמונות PBR | מסקנה מסויגת |
|---|---|---|
| P02 | .25 נותן לשפתיים מעט יותר נפח ורפיון, אך פס ההפרדה הכהה במרכז ובפינה הימנית בתמונה רחב מעט יותר. ב־.40 החיבור נראה הדוק יותר; גם בו נשאר פס כהה. | יתרון קל ל־.40 לפה סגור במנוחה. |
| P04 | בשתיהן הפה נראה סגור והשפה התחתונה מלאה יחסית. ב־.25 אין שיפור ברור בעובי או בפינות; ההבדל קטן במסך טלפון. | אין בסיס חזק להחלפה. |

לא נראות שיניים באף אחת מ־24 התמונות. מפס שחור ב־PBR לבדו אי אפשר להכריע אם מדובר בחלל פה גיאומטרי או בהצללה. בקרות החומר בזיכרון הן עבודה נפרדת ואינן חלק מהדוח הזה.

## בקרות שנבדקו

- 24 תמונות PNG מלאות: 2 זהויות × 2 גדלים × 3 מבטים × 2 גרסאות. גודל הקבצים בפיקסלים אומת כ־390×844 או 844×390, לפי CSS; DPR הוא 1.5. כל הצילומים הם PBR ו־LOD0 בלבד, ללא gray pass.
- התמונות הרגילות: face-front עם orbit=.13 ו־face-three-quarter עם orbit=−.7, בשתיהן zoom=1. צילום אבחון הפה נשאר צילום מלא ונפרד, ללא חיתוך קובץ התמונה.
- אבחון הפה משתמש במצלמה בזיכרון: עוגן קבוע ביחס ל־Head הוא [0,.056,.12], FOV=25, מפתח אנכי max(.16,.11/aspect), ו־orbit=.13. בכל ארבעת זוגות האבחון נשמרו אותם camera/target/quaternion בדיוק. היעד העולמי שנרשם הוא [0,1.5109790055079932,0.12292732780728308].
- הפריים הקבוע הוא idle עם seek(.15) ביחידות של חלק יחסי מהקליפ; הזמן שנרשם בפועל הוא .27 שניות. אין לתאר זאת כפריים של .15 שניות.
- אותו סקריפט ואותו frozen86 בשתי הריצות. SHA-256 של ה־runtime הוא `86f55eca7b39311011174c7aefd9ee76bc27d573945ffac3de9c7ad58aa128d0`; של הסקריפט הוא `13fdff4d80f0e58f14cef3093d71295699367f58ba5c0ccfd70434b578f3b7f9`.
- בשני קובצי capture.json נשמרו complete=true, errors=[], remoteRequests=[], packagedFilesMutated=false. הדגלים המקוריים, hashes של המודלים ופרטי המצלמות נשמרים ב־[MOUTH-CONTROLS.json](MOUTH-CONTROLS.json).
- ששת קובצי הטקסטורה של המועמד זהים בבייטים ל־27: basecolor, normal ו־ORM עבור P02 ו־P04. הדבר תואם את `/tmp/soccer-v7-mouth30-codec-control.json` ונבדק גם בהשוואת בייטים ישירה וב־SHA-256.
- כל 41 קובצי live24 תואמים ל־`/tmp/soccer-v7-live24-before-face25.json`: לפני ואחרי שתי ריצות הצילום וגם בבדיקה הנוכחית. עותק מניפסט ה־baseline זהה בדיוק ל־preflight27; כל 12 קובצי המקור שנרשמו ב־snapshot של baseline27 נשמרו.
- במהלך הפקת שני הדוחות לא הופעל Chromium ולא נערכו התמונות, קובצי capture.json, הסקריפט, ה־runtime או נכסי המקור.

## מגבלת מטא־דאטה במצלמה אחת

**11 מתוך 12 רשומות מצלמה זהות בדיוק**, ובהן כל ארבע רשומות האבחון. החריגה היחידה היא `player-02-pbr-face-front-844x390.png`:

| שדה שנרשם ב־capture.json | baseline27 | candidate25 |
|---|---|---|
| aspect | 2.164102564102564 | .46208530805687204 |
| position | [.09090954797958499, 1.588982490314807, .7254980983872932] | [.11320512422803987, 1.588982490314807, .8960352991557401] |

גם quaternion שונה; הערכים המלאים נשמרים בדוח הבקרות. **רשומת המועמד** בפריים landscape הזה נשארה עם aspect של portrait. זו מגבלה של ה־sidecar, שמתאימה לתזמון שבו המצלמה נרשמה לפני עדכון ResizeObserver; אין כאן שחזור או המצאה של המצלמה שהייתה בפועל ברגע רינדור ה־PNG. קובצי המקור נשמרו ללא תיקון או רינדור מחדש. לכן אין טענה של התאמת מצלמה מלאה ב־12/12.

קריאת פיקסלים עצמאית של זוג ה־PNG מצאה 198 פיקסלים שבהם ההפרש המרבי בערוץ גדול מ־10/255. גבולות ההפרש הם [361,258,440,309] בקצוות כוללים, או [361,258,441,310) בקצוות חצי־פתוחים. מחוץ ל־ROI הנדיב של הפה [345,280,465,348) נמצאו MAE=.0250633437/255 ורק 3 פיקסלים עם הפרש גדול מ־10. הממצא תומך בכך שמסגור ה־PNG עצמו נשמר היטב מחוץ לאזור הפה; הוא אינו מתקן את רשומת המצלמה החסרה. היתרון החלש ל־.40 נשען גם על יתר התמונות ועל ארבעת זוגות האבחון התקינים.

## גבולות ההשוואה והמודלים

המועמד מיועד לבדיקת שינוי דחיסת הפה .40→.25 במסלול near של Face27. המניפסטים **אינם זהים למעט שדה יחיד**: במועמד נוסף `hairGeometryVariant: "24"`, שאינו מפורש במניפסט27. Atlas מדווח שגם baseline27 השתמש ב־fallback24, וש־24 הוצמד במפורש במועמד כדי למנוע שימוש ב־29. נוספו גם שיפורי בדיקות מטא־דאטה; Atlas מדווח על far brow של 98 מול 100 הישן. הדוח אינו מפענח עצמאית את גאומטריית far ואינו טוען להתאמה בייטית או חזותית של LOD1. כל 24 הצילומים הם של LOD0.

| מועמד .25 | LOD | בייטים | משולשים לפי בקרת codec |
|---|---:|---:|---:|
| [P02](../../../source/character-candidates30/models/player-02-lod0.glb) | 0 | 939,048 | 33,862 |
| [P02](../../../source/character-candidates30/models/player-02-lod1.glb) | 1 | 500,844 | 5,778 |
| [P04](../../../source/character-candidates30/models/player-04-lod0.glb) | 0 | 946,692 | 33,445 |
| [P04](../../../source/character-candidates30/models/player-04-lod1.glb) | 1 | 555,096 | 5,780 |

כל ארבעת הקבצים תואמים ל־SHA-256 ולגודל שהוצהרו במניפסט המועמד ועומדים בתקציבים. המניפסטים: [.40](../../../asset-manifest-preflight30-baseline.json), [.25](../../../asset-manifest-preflight30.json). ראיות הצילום המקוריות: [baseline27/capture.json](baseline27/capture.json), [candidate25/capture.json](candidate25/capture.json).

## כל 24 התמונות המלאות

כל קישור מפנה לקובץ PNG מלא, ללא חיתוך או קומפוזיציה.

| זהות | מבט | גודל CSS | baseline .40 | candidate .25 |
|---|---|---|---|---|
| player-02 | פנים מלפנים | 390×844 | [.40](baseline27/player-02-pbr-face-front-390x844.png) | [.25](candidate25/player-02-pbr-face-front-390x844.png) |
| player-02 | פנים בשלושת־רבעי | 390×844 | [.40](baseline27/player-02-pbr-face-three-quarter-390x844.png) | [.25](candidate25/player-02-pbr-face-three-quarter-390x844.png) |
| player-02 | אבחון פה מקרוב | 390×844 | [.40](baseline27/player-02-pbr-diagnostic-close-mouth-front-390x844.png) | [.25](candidate25/player-02-pbr-diagnostic-close-mouth-front-390x844.png) |
| player-02 | פנים מלפנים | 844×390 | [.40](baseline27/player-02-pbr-face-front-844x390.png) | [.25](candidate25/player-02-pbr-face-front-844x390.png) |
| player-02 | פנים בשלושת־רבעי | 844×390 | [.40](baseline27/player-02-pbr-face-three-quarter-844x390.png) | [.25](candidate25/player-02-pbr-face-three-quarter-844x390.png) |
| player-02 | אבחון פה מקרוב | 844×390 | [.40](baseline27/player-02-pbr-diagnostic-close-mouth-front-844x390.png) | [.25](candidate25/player-02-pbr-diagnostic-close-mouth-front-844x390.png) |
| player-04 | פנים מלפנים | 390×844 | [.40](baseline27/player-04-pbr-face-front-390x844.png) | [.25](candidate25/player-04-pbr-face-front-390x844.png) |
| player-04 | פנים בשלושת־רבעי | 390×844 | [.40](baseline27/player-04-pbr-face-three-quarter-390x844.png) | [.25](candidate25/player-04-pbr-face-three-quarter-390x844.png) |
| player-04 | אבחון פה מקרוב | 390×844 | [.40](baseline27/player-04-pbr-diagnostic-close-mouth-front-390x844.png) | [.25](candidate25/player-04-pbr-diagnostic-close-mouth-front-390x844.png) |
| player-04 | פנים מלפנים | 844×390 | [.40](baseline27/player-04-pbr-face-front-844x390.png) | [.25](candidate25/player-04-pbr-face-front-844x390.png) |
| player-04 | פנים בשלושת־רבעי | 844×390 | [.40](baseline27/player-04-pbr-face-three-quarter-844x390.png) | [.25](candidate25/player-04-pbr-face-three-quarter-844x390.png) |
| player-04 | אבחון פה מקרוב | 844×390 | [.40](baseline27/player-04-pbr-diagnostic-close-mouth-front-844x390.png) | [.25](candidate25/player-04-pbr-diagnostic-close-mouth-front-844x390.png) |
