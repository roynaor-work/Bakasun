# שוער וקהל v1

שלוש תגובות שוער, אטלס קהל חדש ותצוגה מקומית. קבצים חדשים בלבד; החבילה אינה מחוברת למשחק. [המדידות וגיליונות הפריימים](REPORT.md), [תצוגה](preview.html), [רישיונות ומקור לכל קובץ](LICENSES.md).

## צפייה

1. משורש המאגר הפעילו:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

2. פתחו [את התצוגה המקומית](http://127.0.0.1:8765/workout/island/design/soccer-keeper-crowd-v1/preview.html).
3. בחרו קליפ וזווית, גררו את ציר הזמן והשוו את 16 זוגות תאי הקהל. התוצאה: תנועה על מודל השוער המלא, וכל וריאציית קהל מקורית לצד גרסת שתי הידיים למעלה.

## חיבור עתידי

- `runtime/catalog.json` משתמש במבנה motion-fix-v12: לכל קליפ `animation`, `characters`, `duration` ו־`metadata` עם `events`, `supports`, `coreRange`, `originalLoop` ו־`timeScale`. המידות במטרים, הזמנים בשניות והקווטרניונים בסדר xyzw. `manifest.json` מרכז את תוצאות האימות.
- 18 עצמות קנוניות, ללא שינוי בשמות, בהורות, במידות הבסיס או ב־inverse bind matrices. קובצי `runtime/keyframes/` שומרים כל דגימה ב־30 הרץ; גם כל ערוץ GLB משתנה שומר את כל הדגימות. ערוצים קבועים מצומצמים ללא אובדן. קליפי ה־GLB כוללים שלד ואנימציה בלבד.
- ניגון: טעינת `runtime/keeper.glb`, טעינת האנימציה מתוך קובץ הקליפ ו־AnimationMixer על סצנת המודל. המודל הכלול הוא וריאציה חדשה של שוער CC0 עם כפפה ימנית סגורה קבועה. יש להשתמש בו כדי לקבל אגרוף סגור; ניגון על מודל אחר משמר את צורת הכפפה של אותו מודל.
- `disappointed`: חזרה על כל טווח 0–2 שניות. בשני הקליפים האחרים לנגן פעם אחת. `keeper_ready_reference` הוא קובץ עמידת ייחוס למדידה בלבד, ומופיע בנפרד מהשלישייה בקטלוג.
- `Root` מכיל את קפיצת החגיגה בגובה 0.10 מ׳; אין להוסיף את ההרמה פעם נוספת. אין תזוזת שורש אופקית. כל הקליפים מתחילים ומסתיימים בעמידה שקטה משותפת; מעבר לעמידת השמירה במשחק דורש blend אצל המחבר.
- השדות `supports` ו־`events` תואמים לצורת הנתונים הקיימת. `plant`, `takeoff`, `land` מתארים את הרגליים; `ground_contact` ו־`ground_release` מתארים תמיכת כפפה בקרקע ואינם מגע בכדור. שמות אירועי התגובה סמנטיים; החבילה אינה רושמת מאזינים במשחק.
- `runtime/crowd-atlas.png`: רשת 4×8, 32 תאים של 256×256. שורות 0–3 שומרות את תאי v8 המקוריים; שורות 4–7 מוסיפות `hands_up` באותו סדר. בכל תא שלושה אוהדים. במניפסט לכל וריאציה מלבן פיקסלים, UV משמאל־למעלה, UV משמאל־למטה ו־UV בטוח עם שוליים של 4 פיקסלים.
- גובה האטלס הוכפל: אי אפשר להחליף רק את כתובת המרקם בשיידר שמכפיל שני צירים ב־0.25. הרוחב נשאר 0.25, גובה תא הוא 0.125. דוגמת ה־preview משתמשת בחיתוך CSS ומציגה את המיפוי. יש לקרוא את רשומת התא מהמניפסט לפי וריאציה ופוזה.

## שחזור ומדידה

נדרשים Node.js מודרני ו־Git. ליצירת האטלס דרוש `sharp`, ולצילום דרושים `playwright` ו־Chromium. אלה כלי יצירה בלבד; התצוגה משתמשת בעותקי three.js ו־GLTFLoader שכבר במאגר. אין בחבילה קוד צד שלישי חדש.

```sh
node workout/island/design/soccer-keeper-crowd-v1/source/build-keeper.mjs
node workout/island/design/soccer-keeper-crowd-v1/source/build-motion.mjs
node workout/island/design/soccer-keeper-crowd-v1/source/build-crowd.mjs
node workout/island/design/soccer-keeper-crowd-v1/source/run-qa.mjs
node workout/island/design/soccer-keeper-crowd-v1/source/measure.mjs
```

כלי QA המקורי ו־motion-fix-v12 אינם ב־main בעת יצירת הענף. `run-qa.mjs` שולף את קומיט הכלי המוצמד ל־`/tmp/bakasun-keeper-qa-v1/`, ואז מפעיל את `node workout/island/design/motion-qa-v1/run.mjs` משם. מודול טעינה מחליף רק את רשימת מקורות הקלט באמצעות `qa-sources.mjs`; `run.mjs`, הקורא, המדדים, הספים והשקלול נשארים זהים בבייטים. SHA-256 של קובצי הכלי ושל הקליפים מופיע ב־`qa/summary.json` וב־`qa/report.json`. דוח הכלי כולל גם את עמידת הייחוס: ארבע רשומות, שלוש תגובות.

אחרי הפעלת שרת ה־HTTP:

```sh
XDG_CACHE_HOME=/tmp/keeper-cache node workout/island/design/soccer-keeper-crowd-v1/source/capture.mjs
node workout/island/design/soccer-keeper-crowd-v1/source/finalize.mjs
```

אפשר להגדיר `KEEPER_CHROMIUM` לנתיב Chromium, `KEEPER_PREVIEW_URL` לכתובת התצוגה ו־`KEEPER_QA_DIR` לתיקיית מטמון חיצונית. קובצי המשחק, הבדיקות, ops, מסמכי ההוראות ותגי הגרסה אינם משתנים.
