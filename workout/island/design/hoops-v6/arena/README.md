# HOOPS / 06 — אולם ושידור

תצוגה עצמאית של אולם כדורסל וממשק שידור, עם 12 שחקני עומס בדיוניים. פועלת עם three.js r160 ומפענח Draco המקומיים, ללא build וללא בקשות חיצוניות בזמן ריצה.

1. משורש המאגר מפעילים שרת HTTP מקומי, למשל `python3 -m http.server 8765 --bind 127.0.0.1`.
2. פותחים [את דף התצוגה](http://127.0.0.1:8765/workout/island/design/hoops-v6/arena/preview.html).
3. בודקים את המצלמות, מצב בוער, כרטיס השחקן והשהיה; כפתור האיכות מחליף בין הגדרת הטלפון לבין LOD0. הגדרת ברירת המחדל משתמשת ב־LOD1 וב־DPR עד 1.

התוצרים והבדיקות מתועדים ב־[REPORT.md](REPORT.md). צילומים מלאים: [390×844](verification/arena-390x844.png), [844×390](verification/arena-844x390.png).

## חיבור לנכסים

`createArena(THREE)` מתוך [arena-scene.js](arena-scene.js) מחזיר `group`, `ready`, `update(timeSeconds)`, `stats`, `anchors`, `environment`, `staticGroup`, `roofGroup`, `dispose`. מוסיפים את `group` לסצנה, מקצים `scene.environment = arena.environment`, ממתינים ל־`ready` וקוראים ל־`update` בלולאת הציור. המודול כולל תאורה; אין צורך להכפיל את מערך האורות.

[arena-shell.glb](arena-shell.glb) הוא ייצוא סטטי של הפרקט, מבנה היציעים, הסלים, הספסלים, המצלמות והגג. קהל ומושבים ב־instancing, קוביית הווידאו והתאורה נוצרים במודול כדי לשמור על התקציב והאנימציה. ה־GLB אינו מחליף את המודול השלם. בתצוגת השידור מוסתרות רשתות הגג הקרובות למצלמה, ומיתרי התלייה נשארים גלויים.

`createBroadcastHUD(container, callbacks)` מתוך [broadcast-hud.js](../hud/broadcast-hud.js), עם [קובץ העיצוב](../hud/broadcast-hud.css), יוצר את הממשק. callbacks: `onCamera(index)`, `onHeat(boolean)`, `onPause(boolean)`, `onStats(boolean)`, `onQuality('auto'|'low'|'high')`. האובייקט המוחזר מספק `update`, `setHeat`, `setPaused`, `setStats`, `destroy`. לוח התוצאות והסטטיסטיקות הם נתוני תצוגה בדיוניים קבועים.

מקורות ותנאים: [arena-provenance.json](arena-provenance.json), [תיעוד השחקנים](actors/README.md). קוד הייצור תחת `source/` ו־`actors/source/` מיועד להכנת נכסים בלבד; הדף אינו מריץ אותו.
