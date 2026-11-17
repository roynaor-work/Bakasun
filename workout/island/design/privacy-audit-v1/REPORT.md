# ביקורת פרטיות ואבטחה — v1

תאריך: 17 בנובמבר 2026, Asia/Jerusalem. ענף: `codex/privacy-audit-v1`.

בסיס הביקורת: `main` בקומיט `43b27dc235387e3cb737aee9558cdf9d5fd5a262`. הבסיס עודכן מהשרת לפני סריקת המסירה. הביקורת בקריאה בלבד: לא תוקנו קוד, SQL, נתונים, הרשאות או פריסה; התוצר כולל רק REPORT.md ו-findings.json חדשים. גם ops/CONTROL.md נשאר ללא שינוי לפי האיסור לערוך קבצים קיימים.

## הכרעה

הדרישה שאין מידע אישי בריפו הציבורי **אינה מתקיימת**. הערכים עצמם אינם מופיעים בדוח או ב-JSON; רק מיקומיהם. נמצאו 18 ממצאים: 3 בחומרה גבוהה, 12 בינונית ו-3 נמוכה. לא נמצאו חתימות מוכרות של מפתחות פרטיים או מפתחות שרת בסריקה שבוצעה; אין בכך הוכחת היעדר סודות מכל סוג.

באי לא נמצא SDK לפרסום, analytics, pixels או מעקב צד שלישי. בקוד ה-runtime שנבדק אין חיבור ל-Supabase או בקשת מיקרופון/מצלמה. בחמש טעינות דפדפן נקיות לא נצפו ניסיונות בקשת HTTP חיצונית. עם זאת, לא ניתן להבטיח שכל פעילות הילד מקומית: קול סינתטי עשוי להיות מרוחק, ובאפליקציית האימון יש זיהוי דיבור ושתי מערכות העלאת מדיה. שירותי הדפדפן הפנימיים אינם נמדדים במלואם ב-Network של הדף. אין כאן הוכחה שכבר אירעה גישה זרה למידע.

## היקף ושיטה

- נסרקו 22,954 קבצים מנוהלים; 6,873 קובצי טקסט, כולל פתיחת 185 קובצי gzip, ו-21,172 blobs טקסטואליים בהיסטוריה הנגישה מקומית. נבדקו חתימות מפתחות, תפקידי JWT, מיקומי פרטי קשר וזרימות מידע. מספרים בתוך hashes ונתונים סינתטיים לא סווגו אוטומטית כמידע אישי.
- נבדקו מטא־דאטה של 14,350 תמונות וחולצו טקסטים מ-18 קובצי PDF. OCR: מדגם רחב של 120 תמונות, מתוכן 120 הושלמו, ומדגם ממוקד של 44 תמונות, מתוכן 44 הושלמו; קיימת חפיפה בין המדגמים. התאמות OCR הן מועמדות בלבד עד סקירה. אין בדיקה חזותית מלאה של כל התמונות.
- נסרקו 44 ארכיוני ZIP/TAR ובהם 1,307 רשומות ללא חילוץ לתיקיית הריפו וללא שגיאות ארכיון; רשומות מעל 16MB הוחרגו. התאמות פרטי הקשר בארכיונים שנבדקו היו בקובצי רישוי, ואינן מסווגות כסוד או כנתוני משתמש; גם נתוני ייחוס המחבר אינם מועתקים לתוצרים. לא נותחו משמעות הקול והווידאו או כל המטא־דאטה הפנימית של מודלים בינריים.
- בדיקות Chromium רצו בהקשרים חדשים ללא הרשאות מדיה, עם חסימת כל יעד חיצוני ובלי נתוני משתמש. בדיקות worker/adapter רצו בזיכרון עם ערכים סינתטיים. 65 בדיקות קיימות של מדיה, העלאות ו-offline עברו; לא הורצה מחדש כל חבילת המשחקים לצורך שינוי דוחות בלבד.
- נבדקו 16 שמות חבילות ו-31 צמדי חבילה/גרסה מול npm Security Advisories. זו אינה סריקת גרף טרנזיטיבי מלא: יש 26 manifests ורק 6 lockfiles. האתר החי ומאגר OSV נחסמו ב-proxy; npm וייעוץ GitHub היו נגישים. לא נקראו נתוני Supabase, לא נוסו קודי משפחה ולא הופעל SQL בענן.
- נצפו 504 ענפים מרוחקים. רק `main` וה-refs הנגישים מקומית נסרקו; לא כל הענפים, PR, artifacts חיצוניים, forks או אובייקטים לא נגישים. לכן אין אישור שהריפו הציבורי כולו נקי. הממצאים נבדקו מול הבסיס המצוין כאן.

## טבלת ממצאים

חומרה גבוהה: חשיפה ציבורית ממשית או סיכון משמעותי לסודיות הילד בתנאים המתוארים; בינונית: הגנה חסרה או סיכון מותנה; נמוכה: הקשחה וצמצום מידע. סדר המספרים קבוע בין הדוח ל-JSON. המיקומים המלאים ותנאי האימות בהמשך.

| ממצא | חומרה | מיקום | תיקון מוצע — לא בוצע |
|---|---|---|---|
| PA-001 — מידע אישי ופרטי חשבון פורסמו בקוד, במסמכים ובהיסטוריית Git | גבוהה | [CLAUDE.md:1](../../../../CLAUDE.md#L1)<br>[CLAUDE.md:18](../../../../CLAUDE.md#L18)<br>[CLAUDE.md:60](../../../../CLAUDE.md#L60) | להעביר הגדרות ופרטי זהות למאגר פרטי או לקונפיגורציה מאושרת; לפרסם דוגמאות סינתטיות בלבד. להכין בנפרד תוכנית ניקוי היסטוריה, ענפים וארטיפקטים, ושימוש בכתובות noreply לקומיטים. שכתוב היסטוריה ומחיקה דורשים משימת ביצוע נפרדת; לא בוצעו בביקורת. |
| PA-002 — קובצי verification וצילומי מסך נבחרים לפרסום ללא מסנן פרטיות | בינונית | [.github/workflows/pages.yml:26](../../../../.github/workflows/pages.yml#L26)<br>[.github/workflows/pages.yml:32](../../../../.github/workflows/pages.yml#L32)<br>[workout/island/verification/naval-shots/verification.json:1](../../verification/naval-shots/verification.json#L1) | לפרסם allowlist של קובצי runtime; לשמור ראיות פרטיות מחוץ לריפו הציבורי. לחסום פרסום קבצים עם מידע אישי באמצעות בדיקת טקסט, ארכיונים, OCR ומטא־דאטה, ולדרוש הקשר בדיקה חדש עם נתונים סינתטיים. |
| PA-003 — אפליקציית הילד והאפליקציות האחרות חולקות גבול אבטחה של origin | גבוהה | [js/store.js:4](../../../../js/store.js#L4)<br>[js/files.js:3](../../../../js/files.js#L3)<br>[workout/js/store.js:3](../../../js/store.js#L3) | לארח את סביבת הילד ב-origin נפרד מסביבת העסק והחנות. עד אז לצמצם סקריפטים חיצוניים, שמירת יכולות גישה ונתוני מדיה. שינוי שם מפתח או תת־נתיב אינו בידוד. |
| PA-004 — גרסת PDF.js בעלת חולשת אבטחה מוכרת נטענת ב-origin המשותף | בינונית | [js/files.js:32](../../../../js/files.js#L32)<br>[js/files.js:36](../../../../js/files.js#L36)<br>[js/pdfedit.js:14](../../../../js/pdfedit.js#L14) | לשדרג לגרסה נתמכת ומתוקנת, לארח מקומית ולהצמיד קובץ/גיבוב; להגדיר isEvalSupported:false כהגנה נוספת ולשמר CSP ללא unsafe-eval. לבדוק מחדש את מסלולי פתיחת ה-PDF לפני שחרור. |
| PA-005 — קוד המשפחה הוא יכולת גישה משותפת ללא הפרדת הורה/ילד או ביטול שרת | בינונית | [workout/js/cloud.js:11](../../../js/cloud.js#L11)<br>[supabase/family.sql:42](../../../../supabase/family.sql#L42)<br>[supabase/family.sql:78](../../../../supabase/family.sql#L78) | להוסיף זהות הורה מאומתת, שיוך מכשירים והרשאות נפרדות; לאפשר ביטול והחלפה בשרת. אם משמרים קוד, להגדיל אנטרופיה, להגביל ניסיונות ולהימנע משימוש בו כשם ערוץ; להשתמש ב-Realtime פרטי עם הרשאת שרת. |
| PA-006 — קוד המשפחה נשמר גם כטקסט גלוי בצד השרת | בינונית | [supabase/family.sql:11](../../../../supabase/family.sql#L11)<br>[supabase/family.sql:59](../../../../supabase/family.sql#L59)<br>[workout/js/vids-cloud.js:66](../../../js/vids-cloud.js#L66) | להשתמש במזהה משפחה פנימי אטום לנתוני אירועים ונתיבי Storage, ולהחזיק בנפרד גיבוב של יכולת הגישה. להסיר קודים ו-signed URLs מלוגים ומקובצי בדיקה. |
| PA-007 — מחיקה מקומית אינה מוחקת עותקי ענן, מדיה ותורים | בינונית | [workout/js/store.js:61](../../../js/store.js#L61)<br>[workout/js/app.js:1207](../../../js/app.js#L1207)<br>[workout/js/vids.js:69](../../../js/vids.js#L69) | למפות עותקים ומשך שמירה לכל סוג מידע, להציע להורה מחיקה מאומתת לפי פריט, ולבטל גם העלאה ממתינה של אותו פריט. לדייק את נוסח המסך והגיבוי; לקבוע retention ולטפל בגרסאות ישנות בענן. כל מחיקה אמיתית תתבצע רק במשימת ביצוע מורשית. |
| PA-008 — RPC אנונימיים מקבלים רישום ו-payload ללא מכסות יישומיות | בינונית | [supabase/family.sql:46](../../../../supabase/family.sql#L46)<br>[supabase/family.sql:57](../../../../supabase/family.sql#L57)<br>[workout/js/cloud.js:32](../../../js/cloud.js#L32) | להגדיר מגבלת בקשה, מספר אירועים, סכמת payload, מכסה למשפחה וקצב לרישום/אימות בשרת. להחיל מינימום הרשאות ולבטל PUBLIC EXECUTE במפורש בפונקציות שנחשפות רק לתפקידים מסוימים. |
| PA-009 — ה-service worker הראשי שומר כל GET מאותו origin גם עם no-store | בינונית | [sw.js:2](../../../../sw.js#L2)<br>[sw.js:31](../../../../sw.js#L31)<br>[sw.js:32](../../../../sw.js#L32) | לשמור רק קובצי shell סטטיים מרשימה מפורשת ובתוך scope האתר; לבדוק origin באמצעות URL.origin, status ו-Cache-Control. להחריג שיתוף, מידע אישי וכתובות עם יכולות גישה. לשמר תור שיתוף בנפרד. |
| PA-010 — מטמון האי רחב מהמניפסט ואינו מגביל managed assets לנתיב האי | נמוכה | [workout/island/offline-sw.js:16](../../offline-sw.js#L16)<br>[workout/island/offline-sw.js:23](../../offline-sw.js#L23)<br>[workout/island/offline-sw.js:22](../../offline-sw.js#L22) | להגביל גם managed לנתיב האי ולרשימת runtime מפורשת, להחריג verification וכל מידע פרטי, ולהסיר query רק במשאבים סטטיים שידוע שאינו משנה את תוכנם. |
| PA-011 — קישור הגדרת מצלמה מספיק להפעלת העלאת מדיה ליעד HTTPS לא מאושר | גבוהה | [workout/cam-lab/upload.mjs:36](../../../cam-lab/upload.mjs#L36)<br>[workout/cam-lab/upload.mjs:54](../../../cam-lab/upload.mjs#L54)<br>[workout/cam-lab/upload.mjs:357](../../../cam-lab/upload.mjs#L357) | להוסיף אישור הורה מאומת שמציג יעד והיקף מידע, allowlist של origins/paths, תפוגת הסכמה ואפשרות ביטול. לא לעקוב אחר redirects שמשנים יעד עבור גוף רגיש; להשתמש ב-endpoint קבוע שמאמת את ההפניה לפני העברת נתונים. |
| PA-012 — זיהוי הספירה אינו מחייב עיבוד דיבור מקומי | בינונית | [workout/js/count.js:47](../../../js/count.js#L47)<br>[workout/js/count.js:52](../../../js/count.js#L52)<br>[workout/js/app.js:1166](../../../js/app.js#L1166) | להשאיר האזנה כבויה עד בחירה מודעת של הורה; להפעיל רק מנוע מקומי מאומת או להציע ספירה בלחיצה. אם אין עיבוד מקומי, לא ליפול בשקט לזיהוי רשת. |
| PA-013 — הקראת טקסט עלולה לבחור קול מרוחק | בינונית | [workout/island/learning/voice.mjs:16](../../learning/voice.mjs#L16)<br>[workout/js/speech.js:18](../../../js/speech.js#L18)<br>[workout/js/speech.js:45](../../../js/speech.js#L45) | להשתמש בהקלטות מקומיות ובקולות localService בלבד בכל מסלולי הילד. בהיעדר קול מקומי להשאיר טקסט או צליל מקומי, ללא fallback רשת; לא למסור שם פרופיל לספק חיצוני. |
| PA-014 — מדיניות CSP אינה מכסה את כל דפי הילד | בינונית | [workout/index.html:1](../../../index.html#L1)<br>[workout/voice-rec/index.html:1](../../../voice-rec/index.html#L1)<br>[workout/island/minigames/boar-island/index.html:1](../../minigames/boar-island/index.html#L1) | להחיל CSP מצומצם בכל דפי הילד וב-workers, ו-connect-src עם יעדים מדויקים. לקבוע ברמת HTTP גם frame-ancestors, Permissions-Policy ו-Referrer-Policy; במידת הצורך לבחור אירוח שתומך בכותרות. לא להתיר מיקרופון/מצלמה בדפי המשחק שאינם משתמשים בהם. |
| PA-015 — מצב הרשאות Storage תלוי במיגרציה חיצונית ואינו ניתן לשחזור מלא מהריפו | בינונית | [supabase/vids.sql:1](../../../../supabase/vids.sql#L1)<br>[supabase/vids-signed.sql:1](../../../../supabase/vids-signed.sql#L1)<br>[NOTES.md:3](../../../../NOTES.md#L3) | להוסיף בהמשך מיגרציה ניתנת לשחזור והצהרת GRANT/REVOKE מדויקת לכל משאב. לוודא בקטלוג מסד מורשה שה-bucket פרטי, שהגדר קיימת, שאין מדיניות permissive עוקפת ושפונקציות חתימה בלבד חשופות. אין להוסיף GRANT לטבלאות המשפחה שנחסמו בכוונה. |
| PA-016 — תלויות עיבוד נכסים כוללות גרסאות sharp עם advisories | בינונית | [workout/island/design/hoops-v7/characters/source/package.json:15](../hoops-v7/characters/source/package.json#L15)<br>[workout/island/design/models2/source/package.json:12](../models2/source/package.json#L12)<br>[workout/island/design/skier3/tools/package.json:11](../skier3/tools/package.json#L11) | לשדרג לגרסה נתמכת מתוקנת לפי advisories, לשמור lockfiles לכלי build ולהפעיל audit על הגרף הנעול. לעבד מדיה לא מוכרת בסביבת build מבודדת. להוסיף מלאי גרסאות וגיבובים גם ל-JS/WASM שהועתקו לריפו. |
| PA-017 — PIN ההורה הוא שער ממשק מקומי בלבד | נמוכה | [workout/js/parent.js:15](../../../js/parent.js#L15)<br>[workout/js/parent.js:20](../../../js/parent.js#L20)<br>[workout/js/parent.js:25](../../../js/parent.js#L25) | להציג במפורש שזהו שער נוחות ולא הרשאת ענן; לפעולות רגישות להשתמש באימות הורה עם הרשאת שרת. להוסיף הגבלת ניסיונות בממשק ולצמצם חשיפת הקוד המשותף. |
| PA-018 — טלמטריה ודוחות מקומיים נשמרים וניתנים להעתקה ללא צמצום פרטיות | נמוכה | [workout/island/minigames/soccer-telemetry.mjs:5](../../minigames/soccer-telemetry.mjs#L5)<br>[workout/island/ui/load-report.mjs:28](../../ui/load-report.mjs#L28)<br>[workout/island/engine/persistence.mjs:210](../../engine/persistence.mjs#L210) | לקבוע TTL לדיאגנוסטיקה, להסיר UA מלא ונתוני זיהוי מדוחות לשיתוף, ולאפשר תצוגה ובחירה מודעת של הורה לפני ייצוא. להשתמש בנתונים סינתטיים בראיות הציבוריות. |

## מה נשמר במכשיר

השמירה אינה הצפנה יישומית. הדפדפן עשוי להצפין אחסון באמצעות מערכת ההפעלה, אך כל JavaScript מורשה באותו origin ניגש למידע. מצב פרטי, מחיקת נתוני אתר או quota עשויים להסיר אותו. CacheStorage נפרד מ-IndexedDB.

| אחסון / מפתח | תוכן | משך / שליחה | מקור |
|---|---|---|---|
| localStorage: `island.v1` | שם avatar אם הוזן, מראה, גיל ורמות לימוד, הישגים, עולם/עיר, קבוצות, שלבי משחק, זמן משחק וחותמות זמן | ללא TTL; נשמר עד שינוי/איפוס. לא מסונכרן לענן בקוד האי; גיבוי JSON כולל מצב זה | `engine/persistence.mjs`, `learning/state.mjs` |
| `island.v1.corrupt.<timestamp>` | העתק מלא של שמירה שלא עברה אימות | ללא TTL; קיים בנוסף לשמירה, לא רק בזיכרון | `engine/persistence.mjs` |
| `island.alpine.v1`, `.corrupt`; `island.alpine.league.v1`, `.corrupt` | זמני שיא, מזהי ריצות, התקדמות ליגת סקי | מקומי, ללא תוקף אוטומטי | `minigames/alpine-records.mjs`, `alpine-league-store.mjs` |
| `island.soccer.telemetry`, `island.racing.best.<track>` | עד 20 סיכומי כדורגל: זמן, תוצאות וביצועים; שיא הקפה לפי מסלול | מקומי; אינו tracker חיצוני | `minigames/soccer-telemetry.mjs`, `racing-session.mjs` |
| `island.<game>.lastLoadReport`, `island.offline.status`, `island.quality.auto` | דיווח טעינה, UA, מסך ורשת; מצב הורדות; tier/FPS וזמן | מקומי. הערכת איכות מתעלמת ממדידה לאחר 7 ימים; אין בכך מחיקה של כל הדוחות | `ui/load-report.mjs`, `offline.mjs`, `device-tier.mjs` |
| `island.sound`, `island.placementHints`, `island.aliens.hand`, `island.fire.hand`, `island.naval.hand`, `island.naval.vibration`, `island.soccer.handed`, `island.soccer.kit`, `island.tennis.hand`, `island.alpine.theme`, `island.racing.auto`, `island.catch.help2`, `island.catch.help6`, `island.catch.lockHint`, `island.catch.lockHint7` | העדפות קול/שליטה/מראה ומצב רמזים | מקומי; חלק מהמפתחות נשארים גם באיפוס העולם | `data/config.json`, `ui/activity.mjs`, מודולי המשחקים |
| `boar-island-v1`, `boar-island-quality`, `boar-island-aim`, `boar-island-bench` | שמירה במשחק העצמאי, איכות, רגישות ומדדי benchmark | מקומי; אין הרשאת מצלמה או מיקרופון בקוד המשחק | `minigames/boar-island/game.js`, `kit.js` |
| localStorage: `kidfit.v1` | שם וגיל פרופיל אם הוזנו, רמה/תוכנית, אימונים, הישגים, קוד משפחה, PIN מגובב, feed הורה, גיל לפעילות ותאריכים, יומן כדורסל | ללא TTL כללי; שם ופעילות מסוימים נשלחים כשיש קוד משפחה | `workout/js/store.js`, `app.js`, `parent.js` |
| `kidfit.activeWorkout`, `kidfit.minuteRecords.v1` | מצב אימון פעיל ורשומות מבחן קצר | אימון פעיל מתעלם משמירה מעל 6 שעות בעת טעינה; שיאים ללא TTL | `workout/js/app.js`, `minute-test.js` |
| `kidfit.cloud.queue`, `kidfit.cloudVids` | תור אירועים עם קוד ו-payload; קטלוג סרטונים עם משפחה/נתיב/גרסה | retry בטעינה/חיבור/מיקוד; תור אינו נמחק ב-store.wipe. קטלוג מופרד לפי קוד | `workout/js/cloud.js`, `vids.js` |
| `kidfit.facePic`, `kidfit.tetrisPic`, `kidfit.tetrisPics`, `kidfit.goalShout`, `kidfit.laugh` | תמונת פנים, תמונות משחק והקלטות קצרות כ-data URLs | אין העלאה אוטומטית מהמסלולים האלה; מחיקה נפרדת. אין TTL | `workout/js/app.js` |
| sessionStorage: `kidfit.parent.ok` | דגל פתיחת ממשק הורה | למשך session הדפדפן, ללא בדיקת שרת | `workout/js/parent.js` |
| IndexedDB: `kidfit-vids`, store `v` | קובצי וידאו/תמונה מקומיים; עותקי הורדה עם `c:<id>`, משפחה, נתיב ועדכון | מדיה מקומית ו-cache פרטי במכשיר; מעבר משפחה מנקה cache ענן ישן, לא בהכרח כל מדיה מקומית | `workout/js/vids.js` |
| IndexedDB: `kidfit-voice-recordings`, store `clips` | קטעי אודיו שהוקלטו, מזהי שורות ומטא־דאטה | מקומי; הורדת ZIP ביוזמת משתמש, ללא מנגנון העלאה בקוד העמוד | `workout/voice-rec/storage.js`, `app.js` |
| localStorage: `camlab.upload`; IndexedDB: `camlab.upload.queue`, stores `sessions`/`state` | יעד, סוד העלאה ו-consentId; וידאו, תמונות מפתח, שלד, אבחון, chunks ומצב retry | לאחר הגדרת קישור, גם באפליקציה הראשית וברקע. רשומות מוצלחות מוסרות מהתור; כיבוי כולל revocation. הסוד עצמו נשמר במכשיר בשני האחסונים | `cam-lab/upload.mjs`, `js/camera-session.mjs`, `upload-sw.js` |
| אחסון העסק באותו origin | `bakasun.v1`, `bakasun.cloud`, `bakasun.cloud.queue`; IndexedDB `bakasun-files` | מסמכים/קבצים, מצב ענן ופרטי כניסה יכולים להיות נגישים לקוד באותו origin. שמות שונים אינם הפרדה | `js/store.js`, `js/cloud.js`, `js/files.js` |

לא נמצא שימוש ישיר ב-IndexedDB מתוך runtime האי. שימוש האי ב-Cache API אינו מעיד על גישה ל-IndexedDB. יצוא גיבוי אימון כולל גם את פרטי הפרופיל, קוד המשפחה וגיבוב ה-PIN הכלולים ב-store; אין להעלות אותו כראיה ציבורית.

## מה יוצא מהמכשיר ואיך Supabase מוגן

| מסלול | מידע ומתי | תעבורה והגנות בקוד | גבול ההבטחה |
|---|---|---|---|
| האי | קוד ונכסים סטטיים בלבד ב-runtime שנבדק; ספק האירוח מקבל ממילא IP ובקשות משאבים | same-origin fetch, נכסים מקומיים, CSP של self | קולות מערכת עלולים להיות מרוחקים; אין כאן התחייבות לגבי לוגי ספק האירוח |
| סנכרון אימון | בסיום אימון: session, שם פרופיל, רמה וסיכומי משחק; רשומות/הערות כדורסל בהורה | HTTPS POST ל-`/rest/v1/rpc/family_push`; קריאה/הסרה/רישום ב-RPC נפרדים. `apikey` ו-Bearer הם מפתח anon ציבורי, לא זהות הורה | הקוד נשלח בגוף הבקשה; queue חוזר לשלוח. תוכן ה-payload אינו מוגבל לסכמה בשרת |
| הרשאות אירועים | `families` ו-`family_events` | RLS מופעל; ארבע מדיניויות anon ישנות מוסרות; REVOKE ALL לתפקידי anon/authenticated. אין צורך להוסיף להם GRANT לטבלה. פונקציות SECURITY DEFINER עם search_path קבוע ובדיקת קוד; family_push/list/remove מסננות משפחה; GRANT EXECUTE מפורש ל-RPC | בדיקת הקוד בפונקציה היא גבול ההרשאה המרכזי כי הבעלים עוקף RLS. PUBLIC EXECUTE אינו מבוטל במפורש בכל פונקציות המשפחה; מדיניות/בעלות בפועל לא אומתו |
| מדיה משפחתית | בחירת וידאו/תמונה לתרגיל עם קוד משפחה מפעילה העלאה; גם קטלוג והורדה | RPC `kidfit_vids_catalog/access`; בקשת PUT/GET ל-Storage עם URL חתום ל-120 שניות. bucket מוגדר פרטי; בידוד נתיב ואי-דריסה; סוד החתימה נקרא מ-Vault, לא מהלקוח | URL חתום הוא יכולת גישה עד תפוגה; הקוד מופיע בנתיב; גרסאות ישנות נשמרות. מצב הגדר restrictive בענן לא אומת |
| משחק בין מכשירים | נושא הכולל קוד משפחה וחדר, הודעות lobby, מצב משחק ומיקום קלט | WSS Realtime עם apikey ציבורי בפרמטר החיבור; אין postgres_changes ואין כתיבה לטבלת אירועים דרך המודול | אין בקוד private channel או אימות מכשיר; קוד בנושאי הודעות אינו סוד נפרד |
| מעבדת מצלמה ומצב מצלמה באימון | לאחר הגדרת קישור: וידאו ללא אודיו, JPEG של תמונות מפתח, שלד וזמני תנועה, פרטי תרגיל/מכשיר ואבחון | POST של JSON כ-text/plain עם סוד וגוף base64 ליעד מהקישור; credentials:omit, no-referrer; תור IndexedDB ו-background sync | זהו יעד נוסף שאינו בהכרח Supabase; endpoint אינו מוגבל לשרת מוכר. ביטול מקומי אינו מוחק עותק שכבר נשלח |
| זיהוי והקראת דיבור | אודיו של ספירה, או טקסט שיש להקריא | ממשקי Web Speech של הדפדפן | ספק ומקומיות תלויים בדפדפן/קול; CSP של הדף אינו הוכחת offline |

מיקומי מפתחות ה-anon: `js/data/cloudcfg.js:2`, `north/js/config.js:47`. לא מצורפים ערכים. שני המופעים הנוכחיים ו-12 מופעי JWT בהיסטוריה סווגו `anon`; לא נמצאה חתימת service_role. מפתח ציבורי אינו סוד שרת ואינו תחליף ל-RLS או לבדיקת הרשאה ב-RPC. לא נבדק אם המפתח בתוקף ולא נעשה בו שימוש לבקשת נתוני ענן.

## service workers ומטמונים

| רכיב | scope / שם מטמון | מה נשמר | מה אינו נשמר במסלול הזה |
|---|---|---|---|
| `sw.js` | scope אתר הפרויקט, `bakasun-v60` | רשימת shell ראשונית, ואחריה כל GET שהגיע מהדף לאותו origin, כולל query; POST שמסתיים ב-`/share` שומר קבצים וטקסט במטמון נפרד `bakasun-share`, במפתחות `share-item/*` ו-`share-index` | אין מסלול cache ל-Supabase בעל origin אחר. תור השיתוף עצמו כן עשוי להכיל מסמכים אישיים |
| `island/offline-sw.js` | `/workout/island/`, `island-assets-<version>`; מוחק רק גרסאות `island-assets-*`/`island-soccer-*` | cache-first לנתיבי `design`/`assets`: glb, webp, jpg, png, svg, ogg, mp3, json, wasm, mp4 ול-decoders תחת vendor/draco. network-first ל-index, mjs/js/css/html/webmanifest, data/episodes JSON ו-offline-manifest; query מוסר. תומך Range למדיה | מתעלם מ-POST ו-origin חיצוני; release.json וה-worker מוחרגים מה-shell. managed רחב מהמניפסט, כמפורט ב-PA-010 |
| `ui/offline.mjs` | אותו namespace של האי | הורדת `offline-manifest.json`: core/shell ומשחקים; זו רשימת ההורדה היזומה, לא רשימת גישה סגורה של ה-worker | אינו מעלה שמירות או מוחק IndexedDB |
| `workout/upload-sw.js` | scope workout כפי שנרשם ב-`cam-lab/upload-background.mjs` | אין fetch handler ואין CacheStorage; פותח תור IndexedDB וממשיך POST לאחר הסכמה | אינו מטמון offline; עצם סגירת הדף אינה בהכרח מפסיקה העלאה שכבר הותרה |
| `workout/js/royiki.js` | Cache API בדף, `workout-royiki-v1` | קובצי אנימציה סטטיים | אינו service worker ואינו מסלול העלאת מדיה |

הניקוי הגורף של כל המטמונים ב-worker הראשי, שתועד בביקורת הישנה, כבר צומצם ב-main ל-`bakasun-v<מספר>`; הוא אינו מדווח כאן כממצא פתוח. בעיית ה-cache של כל GET עדיין קיימת ונבדקה מחדש.

## הרשאות, CSP ותלויות

האי אינו מבקש גישה למצלמה או למיקרופון. באימון ההגדרה camera כבויה כברירת מחדל, ו-listen מופעל רק לאחר בחירה; הגדרות קול קצר מבקשות audio:true ונפסקות לאחר כשלוש שניות. voice-rec מבקש מיקרופון בזמן לחיצה ושומר במכשיר. מצב המצלמה מבקש video עם audio:false, עיבוד pose מקומי דרך MediaPipe/Worker, ובמכשירים תומכים גם pan/tilt/zoom. קיימת עצירת tracks במעברי מסך, הסתרה/יציאה ותקלות; בחלק ממסלולי מעבדת המצלמה היציאה גם שומרת ניסיון שכבר הוסכם להעלותו. אלה ממצאי קוד, לא מבחן חומרה עם ילד או הרשאות אמיתיות.

באי CSP עם script-src self, connect-src self/blob, font-src self, object-src none ו-form-action none; אין unsafe-eval או סקריפט CDN בעמוד הראשי. style-src מאפשר unsafe-inline. במעבדה script-src self/wasm-unsafe-eval מוצדק לעיבוד המקומי, אך connect-src מאפשר HTTPS כללי. ה-CSP של מסמך אינו מוכיח את מדיניות תגובת worker או את כותרות האתר החי; frame-ancestors אינו נאכף דרך meta. אין בקוד התצורה שנבדק הוכחה ל-Permissions-Policy של השרת.

תלויות האי העיקריות מקומיות: Three.js r160 וגרסה r180 במשחק העצמאי, GLTF/SkeletonUtils, Draco מהפצת r160 ו-meshoptimizer 0.25. במצלמה MediaPipe Tasks Vision 0.10.32 עם WASM ומודלים מקומיים. אין חבילות production ב-package.json הראשי. במאגר advisories שנבדק הוחזרו ממצאים ל-PDF.js ול-sharp; העדר תוצאה לחבילה אחרת אינו אישור שהיא חסינה. יש לבדוק גם קבצים שהועתקו, קוד native וגרף נעול.

ייעוצים מאומתים: [PDF.js / CVE-2024-4367](https://github.com/advisories/GHSA-wgrm-67xf-hhpq), [sharp / libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [sharp / libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [sharp / librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). עבור PDF.js הייעוץ מציין תיקון ראשון ב-4.2.67; יש לבחור גרסה נתמכת עדכנית ולא להסתפק בסף ההיסטורי. גרסאות sharp 0.35.5 המופיעות בחלק מהכלים לא סומנו בשאילתה הזאת.

## פירוט ראיות ותנאי סגירה

### PA-001

נמצא מידע אישי ממשי במיקומים המפורטים. בהתאם לבקשה לא נשמרים כאן ערכים, קטעי מקור, צילומים או גיבובים של המידע. גם מטא־דאטה של קומיטים כוללים כתובות שאינן כתובות noreply. מחיקה מהענף הנוכחי לבדה אינה מסירה היסטוריה או עותקים ציבוריים.

מיקומים: [CLAUDE.md:1](../../../../CLAUDE.md#L1), [CLAUDE.md:18](../../../../CLAUDE.md#L18), [CLAUDE.md:60](../../../../CLAUDE.md#L60), [CLAUDE.md:65](../../../../CLAUDE.md#L65), [CLAUDE.md:70](../../../../CLAUDE.md#L70), [js/data/defaults.js:3](../../../../js/data/defaults.js#L3), [js/data/defaults.js:4](../../../../js/data/defaults.js#L4), [js/data/defaults.js:8](../../../../js/data/defaults.js#L8), [js/data/defaults.js:15](../../../../js/data/defaults.js#L15), [supabase/bootstrap.sql:6](../../../../supabase/bootstrap.sql#L6), [supabase/bootstrap.sql:9](../../../../supabase/bootstrap.sql#L9), [supabase/north.sql:26](../../../../supabase/north.sql#L26), [supabase/north.sql:27](../../../../supabase/north.sql#L27), [north/js/config.js:7](../../../../north/js/config.js#L7), [north/js/config.js:11](../../../../north/js/config.js#L11), [north/legal.html:194](../../../../north/legal.html#L194).

אימות תיקון: סריקה חוזרת של כל המיקומים, ההיסטוריה וענפים ציבוריים; סקירה אנושית של שמות ופרטים שאינם ניתנים לזיהוי בחתימות.

מגבלה: ממצאים עכשוויים אומתו ידנית. נסרקו refs מקומיים והיסטוריית main הזמינה; לא נשלפו כל הענפים המרוחקים, PR, forks או caches של צדדים אחרים.

### PA-002

כללי ההעתקה וההחרגה של Pages משאירים 4,874 קובצי אימות/צילומים, ובהם 3,535 תמונות ו-870 קובצי JSON. source וחבילות סקירה מסוימות מוחרגים, אך verification אינו מוחרג ככלל. הסרת Markdown או noindex אינה הגנת גישה. זהו מסלול פרסום מוכח בקוד, ולא טענה שכל קובץ כולל מידע אישי. במדגמי OCR ובמטא־דאטה לא אומתה התאמה לפרטי המקור שנבדקו; אין בביקורת ממצא מאומת של צילום מסך עם מידע אישי.

מיקומים: [.github/workflows/pages.yml:26](../../../../.github/workflows/pages.yml#L26), [.github/workflows/pages.yml:32](../../../../.github/workflows/pages.yml#L32), [workout/island/verification/naval-shots/verification.json:1](../../verification/naval-shots/verification.json#L1), [workout/voice-rec/index.html:6](../../../voice-rec/index.html#L6).

אימות תיקון: בניית staging בספרייה זמנית צריכה להראות שאין בו verification, snapshots או צילומי בדיקה; סריקת שארית הפרסום והיסטוריית Git.

מגבלה: הספירה היא חישוב סטטי של ה-workflow. האתר החי נחסם ברשת הסביבה. נבדקו כל מטא־דאטת התמונות ומדגם OCR; אין כיסוי חזותי מלא לכל התמונות והמדיה.

### PA-003

נתיבים שונים באותו hostname אינם מבודדים localStorage, IndexedDB או CacheStorage. קוד שרץ באפליקציה אחרת באותו origin יכול לקרוא מידע של הילד, קוד משפחה ותורי מדיה. מבחן דפדפן עם סמן סינתטי בלבד אישר קריאה בין נתיב האי לנתיב החנות. נדרשת מראש הרצת קוד באותו origin; לא הוכחה השתלטות מרחוק.

מיקומים: [js/store.js:4](../../../../js/store.js#L4), [js/files.js:3](../../../../js/files.js#L3), [workout/js/store.js:3](../../../js/store.js#L3), [workout/js/vids.js:5](../../../js/vids.js#L5), [workout/cam-lab/upload.mjs:1](../../../cam-lab/upload.mjs#L1).

אימות תיקון: סמן סינתטי ונתוני IndexedDB של העסק אינם נגישים מ-origin הילד ולהפך; לכל origin מדיניות CSP והרשאות נפרדת.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-004

האפליקציה הראשית טוענת PDF.js 3.11.174 ו-worker מ-CDN. מאגר npm והייעוץ GHSA-wgrm-67xf-hhpq מאשרים שהגרסה מושפעת מ-CVE-2024-4367. אין isEvalSupported:false בקריאות getDocument. ה-CSP הראשי אינו מתיר unsafe-eval ולכן מספק הקלה חשובה; לא נטען שהניצול הצליח או שהוא נגיש במסלול חילוץ הטקסט שנבדק.

מיקומים: [js/files.js:32](../../../../js/files.js#L32), [js/files.js:36](../../../../js/files.js#L36), [js/pdfedit.js:14](../../../../js/pdfedit.js#L14), [js/pdfedit.js:16](../../../../js/pdfedit.js#L16), [index.html:10](../../../../index.html#L10).

אימות תיקון: בדיקת advisory על גרסת הקוד שהורדה בפועל, ורגרסיה עם קבצים סינתטיים בממשק הייבוא והעריכה תחת CSP המקורי.

מגבלה: אישור גרסה פגיעה במאגר advisories, לא הוכחת exploit. לא הועלו או נפתחו מסמכים אמיתיים.

### PA-005

ללא התחברות, מי שמחזיק קוד רשום רשאי לקרוא ולכתוב אירועים ולקבל קישורי מדיה. הקוד שנוצר הוא שמונה תווים אקראיים, בערך 40 ביט; ה-PIN המקומי אינו נבדק ב-RPC. יצירת קוד חדש בטלפון אינה מבטלת את הישן בענן, ואין במיגרציה מנגנון תוקף, ביטול או מכשירים מורשים. גם Realtime משתמש בקוד בשם נושא ציבורי ללא private:true או אימות הורה.

מיקומים: [workout/js/cloud.js:11](../../../js/cloud.js#L11), [supabase/family.sql:42](../../../../supabase/family.sql#L42), [supabase/family.sql:78](../../../../supabase/family.sql#L78), [workout/js/net.js:16](../../../js/net.js#L16), [workout/js/net.js:2](../../../js/net.js#L2), [workout/js/app.js:1198](../../../js/app.js#L1198).

אימות תיקון: קוד או מכשיר שבוטל אינם קוראים, כותבים או מצטרפים לערוץ; לילד אין הרשאות הורה; קישור מדיה שכבר נחתם פג לפי ה-TTL.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-006

למרות טבלת families המגובבת, family_push שומר את הקוד המנורמל ב-family_events.family_code. גם שמות אובייקטי המדיה מכילים את הקוד. חשיפה של שורת DB, נתיב קובץ, לוג או גיבוי עלולה לחשוף יכולת גישה, ולא רק מזהה משפחה.

מיקומים: [supabase/family.sql:11](../../../../supabase/family.sql#L11), [supabase/family.sql:59](../../../../supabase/family.sql#L59), [workout/js/vids-cloud.js:66](../../../js/vids-cloud.js#L66), [supabase/vids-signed.sql:34](../../../../supabase/vids-signed.sql#L34).

אימות תיקון: גיבוי DB ונתיב Storage סינתטיים אינם מספיקים ליצירת בקשה מורשית או לשחזור קוד משפחה.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-007

כפתור מחיקת הנתונים קורא store.wipe בלבד; הוא אינו מנקה את תור הענן, תמונות/הקלטות נפרדות, IndexedDB או הגדרת העלאת המצלמה. מחיקת סרטון היא מהמכשיר בלבד; גרסאות בענן נשמרות. family_remove מאפשר רק basketball ולא workout, ותור כתיבה עשוי להישאר לאחר מחיקה מקומית. אין מדיניות תפוגה לאירועים ולמדיה.

מיקומים: [workout/js/store.js:61](../../../js/store.js#L61), [workout/js/app.js:1207](../../../js/app.js#L1207), [workout/js/vids.js:69](../../../js/vids.js#L69), [workout/js/cloud.js:40](../../../js/cloud.js#L40), [supabase/family.sql:75](../../../../supabase/family.sql#L75).

אימות תיקון: מחיקת פריט סינתטי לא משאירה עותק בלתי צפוי ולא מאפשרת לתור להעלות אותו שוב לאחר חיבור; הממשק מסביר אילו עותקים נשארים.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-008

family_register פתוח ליצירת קודים, ו-family_push עובר על מערך jsonb ללא מגבלת כמות, גודל payload, קצב או תקופת שמירה ב-SQL. מגבלת 20 פריטים בלקוח ומגבלת 500 בקריאה אינן מגבלות כתיבה בשרת. קוד משפחה אינו מתן זכות בלתי מוגבלת לצריכת משאבי הפרויקט.

מיקומים: [supabase/family.sql:46](../../../../supabase/family.sql#L46), [supabase/family.sql:57](../../../../supabase/family.sql#L57), [workout/js/cloud.js:32](../../../js/cloud.js#L32).

אימות תיקון: בקשות סינתטיות שחורגות מהמכסות נדחות באופן אטומי לפני כתיבה; משפחה אחרת אינה מושפעת.

מגבלה: לא בוצעה בדיקת עומס או יצירת משפחות בענן. הגנות ספק ו-API gateway בפריסה לא נבדקו.

### PA-009

מסנן ה-fetch מסתפק ב-GET וב-prefix של origin, ומכניס כל Response ל-CacheStorage. אין allowlist, החרגת מידע אישי, בדיקת Cache-Control או status. שחזור בזיכרון אישר שמירת תשובה סינתטית עם private,no-store. אין טענה שתשובות Supabase עצמן נשמרות: הן מגיעות מ-origin אחר.

מיקומים: [sw.js:2](../../../../sw.js#L2), [sw.js:31](../../../../sw.js#L31), [sw.js:32](../../../../sw.js#L32).

אימות תיקון: GET סינתטי של מידע פרטי או no-store אינו נכנס למטמון; קובצי shell מאושרים ממשיכים לעבוד ללא רשת.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-010

managed() בודק origin וסיומת תחת design/assets אך אינו בודק SCOPE_PATH או חברות במניפסט. לכן גם קובץ אימות בתוך design או נכס מנתיב אחר באותו origin נשמר אם דף בשליטת ה-worker מבקש אותו. הקוד מסיר query ממפתח המטמון. שני המסלולים אומתו עם נתונים סינתטיים בלבד; אין סריקה או שמירה יזומה של כל verification.

מיקומים: [workout/island/offline-sw.js:16](../../offline-sw.js#L16), [workout/island/offline-sw.js:23](../../offline-sw.js#L23), [workout/island/offline-sw.js:22](../../offline-sw.js#L22), [workout/island/ui/offline.mjs:12](../../ui/offline.mjs#L12).

אימות תיקון: בקשות סינתטיות מחוץ לאי או לראיות בדיקה אינן נשמרות; עדכון ושחזור offline ממשיכים לפעול.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-011

initializeUploadConfig מקבל endpoint מכל HTTPS ושומר הסכמה מתמשכת על סמך fragment בלבד, ללא שער הורה, הצגת זהות יעד לאישור או רשימת יעדים מאושרת. האפליקציה הראשית קוראת אותה הגדרה ומפעילה תורי retry. בקשות POST כוללות וידאו ללא קול, תמונות מפתח, שלד ואבחון. redirect:follow נבדק רק לאחר הבקשה, ולכן אינו מונע מסירת גוף בעת redirect ששומר POST. קבלת יעד סינתטי לא מאושר אומתה ללא שליחה.

מיקומים: [workout/cam-lab/upload.mjs:36](../../../cam-lab/upload.mjs#L36), [workout/cam-lab/upload.mjs:54](../../../cam-lab/upload.mjs#L54), [workout/cam-lab/upload.mjs:357](../../../cam-lab/upload.mjs#L357), [workout/js/camera-session.mjs:15](../../../js/camera-session.mjs#L15), [workout/cam-lab/app.mjs:11](../../../cam-lab/app.mjs#L11), [workout/upload-sw.js:29](../../../upload-sw.js#L29).

אימות תיקון: פתיחת קישור בלבד אינה מאפשרת העלאה; יעד לא מאושר והפניית 307/308 זדונית נחסמים לפני מסירת גוף; ביטול חוסם גם דף אחר ו-background sync.

מגבלה: סיכון מותנה בפתיחת קישור ובהפעלת מצלמה/הרשאת דפדפן. לא הופעלה מצלמה ולא נשלחה מדיה אמיתית; לא שוחזר redirect מול שרת חיצוני.

### PA-012

listenCount מפעיל SpeechRecognition/webkitSpeechRecognition באופן רציף עם הפעלה חוזרת, ואינו מחייב processLocally או מנוע offline. בדפדפנים מסוימים אודיו נשלח לשירות של ספק הדפדפן. הרשאת מיקרופון אינה הסבר על יעד עיבוד; connect-src אינו מבטיח חסימת תעבורה פנימית של מנוע הדפדפן.

מיקומים: [workout/js/count.js:47](../../../js/count.js#L47), [workout/js/count.js:52](../../../js/count.js#L52), [workout/js/app.js:1166](../../../js/app.js#L1166).

אימות תיקון: במכשיר ובדפדפן הנתמכים אין שליחת אודיו בעת ספירה, ובאין מנוע מקומי אין הפעלת SpeechRecognition מרוחק.

מגבלה: זוהה מסלול שעשוי להיות מרוחק; ספק הדפדפן והמכשיר בפועל לא נבדקו ולא הוקלט קול.

### PA-013

קול הלמידה באי מעדיף localService אך נופל לכל קול עברי אם אין מקומי. באימון bestVoice מעדיף גם natural/neural/online, וטקסט מותאם עשוי לכלול שם פרופיל. המנוע עשוי להעביר טקסט לספק הקול; בדיקת adapter סינתטית אישרה בחירת קול מרוחק. speakLocal במצב מצלמה כבר מחייב קול מקומי, אך אינו חל על כל האפליקציה.

מיקומים: [workout/island/learning/voice.mjs:16](../../learning/voice.mjs#L16), [workout/js/speech.js:18](../../../js/speech.js#L18), [workout/js/speech.js:45](../../../js/speech.js#L45), [workout/js/app.js:61](../../../js/app.js#L61).

אימות תיקון: כאשר זמינים רק קולות מרוחקים, לא נקרא synthesis.speak; באימון ובאי נשמרת חלופת תצוגה מקומית.

מגבלה: הוכחה לוגית עם קול מדומה, לא מדידת תעבורת ספק TTS אמיתי. טקסטי האי שנבדקו הם תוכן לימודי, לא הקלטת מיקרופון.

### PA-014

ב-workout/index.html, voice-rec/index.html ובמשחק boar העצמאי אין CSP ב-HTML. בדפדפן בדיקה מקומי סקריפט inline סינתטי רץ באימון ובהקלטת הקול ונחסם באי ובמעבדה. זוהי בדיקת מדיניות, לא הוכחת נתיב הזרקה. ה-CSP של האי מגביל script/connect/font ל-self; במעבדה connect-src פתוח לכל HTTPS.

מיקומים: [workout/index.html:1](../../../index.html#L1), [workout/voice-rec/index.html:1](../../../voice-rec/index.html#L1), [workout/island/minigames/boar-island/index.html:1](../../minigames/boar-island/index.html#L1), [workout/island/index.html:11](../../index.html#L11), [workout/cam-lab/index.html:8](../../../cam-lab/index.html#L8).

אימות תיקון: בדיקה מול כותרות האתר החי ולא רק localhost; markers של inline/רשת חיצונית נחסמים בכל דף והמצלמה פועלת רק במסכים המורשים.

מגבלה: כותרות HTTP חיות לא אומתו: proxy הסביבה חסם את GitHub Pages. אין מסקנה שהשרת החי חסר כותרת מסוימת.

### PA-015

vids.sql יוצר bucket פרטי ומסיר מדיניויות ישנות, ו-vids-signed.sql מניח שגדר restrictive כבר קיימת. NOTES מתאר מצב קיים; בדיקת SQL בונה את הגדר בעצמה, אך קובץ המיגרציה אינו מתקין אותה. אין בדיקה חיה של pg_policies/GRANT/Vault. בנוסף schema.sql ו-north.sql יוצרים טבלאות ללא GRANT מפורש, בניגוד לכלל הריפו לפרויקט חדש; זה עשוי לחסום גישה, ולא מעיד כשלעצמו על דליפה.

מיקומים: [supabase/vids.sql:1](../../../../supabase/vids.sql#L1), [supabase/vids-signed.sql:1](../../../../supabase/vids-signed.sql#L1), [NOTES.md:3](../../../../NOTES.md#L3), [tests/sql/vids-rls.mjs:41](../../../../tests/sql/vids-rls.mjs#L41), [supabase/schema.sql:7](../../../../supabase/schema.sql#L7), [supabase/north.sql:2](../../../../supabase/north.sql#L2).

אימות תיקון: פריסה חדשה ומאגר בדיקה עם policy רחבה קיימת דוחים גישה ישירה ל-Storage ולטבלאות משפחה; RPC מורשים בלבד מצליחים. לבחון קטלוג הרשאות הייצור בקריאה בלבד.

מגבלה: אין טענה שהגדר חסרה בפרויקט החי. לא הורץ SQL בייצור ולא נבדקו הרשאות ענן באמצעות קוד משפחה אמיתי.

### PA-016

שאילתת npm החזירה advisories עבור sharp 0.34.5 ו-0.35.4. אלה תלויות של כלי עיצוב ועיבוד נכסים, ולא ספרייה שנטענת באי בדפדפן. 0.35.4 מושפעת מה-advisory האחרון; 0.34.5 גם מהקודמים. רוב חבילות הכלים אינן כוללות lockfile לצד package.json, ולכן כיסוי התלויות הטרנזיטיביות אינו שלם.

מיקומים: [workout/island/design/hoops-v7/characters/source/package.json:15](../hoops-v7/characters/source/package.json#L15), [workout/island/design/models2/source/package.json:12](../models2/source/package.json#L12), [workout/island/design/skier3/tools/package.json:11](../skier3/tools/package.json#L11), [workout/island/design/alien-fx-v1/source/package.json:10](../alien-fx-v1/source/package.json#L10).

אימות תיקון: סריקת lockfiles ללא advisories רלוונטיים; קובצי runtime זהים למלאי הגרסאות; בדיקת עיבוד נכסים סינתטיים לאחר השדרוג.

מגבלה: נבדקו גרסאות מוצהרות ותלויות runtime מזוהות מול npm, לא כל התלויות הטרנזיטיביות ולא קוד native מלא. חומרת הייעוץ high; חומרת הממצא כאן medium בשל היות המסלול כלי build.

### PA-017

PIN של 4–6 ספרות נשמר כ-SHA-256 עם prefix קבוע, ללא מלח אקראי, השהיית ניסיונות או נעילה. דגל הפתיחה נמצא ב-sessionStorage והקוד המשפחתי אינו תלוי ב-PIN. מי שיש לו גישת דפדפן/JavaScript באותו origin יכול לעקוף את השער או לנחש את ה-PIN offline.

מיקומים: [workout/js/parent.js:15](../../../js/parent.js#L15), [workout/js/parent.js:20](../../../js/parent.js#L20), [workout/js/parent.js:25](../../../js/parent.js#L25).

אימות תיקון: שינוי דגל מקומי אינו נותן הרשאה לפעולות ענן רגישות; כשלי אימות מטופלים בשרת.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

### PA-018

island.soccer.telemetry שומר עד 20 משחקים עם זמן, קושי, תוצאות ומדדי ביצועים; lastLoadReport כולל UA מלא, מסך, זמן ומצב רשת. אין בקוד שליחה אוטומטית לצד שלישי, אך העתקה לצ׳אט או לריפו יכולה להפוך נתוני מכשיר ופעילות לפומביים. שמירות .corrupt וגיבויים כוללים עותקים נוספים של מצב המשתמש.

מיקומים: [workout/island/minigames/soccer-telemetry.mjs:5](../../minigames/soccer-telemetry.mjs#L5), [workout/island/ui/load-report.mjs:28](../../ui/load-report.mjs#L28), [workout/island/engine/persistence.mjs:210](../../engine/persistence.mjs#L210).

אימות תיקון: דוח יצוא סינתטי אינו כולל שם, קוד, כתובת אישית, טוקן או טביעת מכשיר מפורטת; אין שליחת מדדים מחוץ למכשיר.

מגבלה: אומת בקוד הנוכחי ובבדיקה מקומית; לא נבדקה פריסת הייצור.

## סדר טיפול מוצע

1. לטפל ב-PA-001 ובבקרת הפרסום PA-002: להכין ניקוי מידע אישי בקוד ובהיסטוריה בלי להעתיק את הערכים ל-issue ציבורי. לנקות במידת הצורך גם ענפים וראיות שכבר פורסמו; אין מחיקה אוטומטית במסגרת הביקורת.
2. לבודד את סביבת הילד ב-origin נפרד ולסגור את הפעלת העלאות המצלמה בקישור בלבד; עד אז אין להשתמש בהבטחה גורפת שהמידע נשאר רק במכשיר.
3. להחיל מקומיות דיבור, זהות/ביטול הרשאות הורה, צמצום נתונים ו-retention, מדיניות CSP לכל דפי הילד ו-migrations ניתנות לשחזור.
4. לבצע בדיקת קטלוג הרשאות Supabase וכותרות אתר חי בקריאה בלבד עם גישה מורשית, ולאחר תיקון להריץ את תנאי הסגירה לכל ממצא. לא בוצעו שינויים במידע או במערכות חיות לצורך דוח זה.
