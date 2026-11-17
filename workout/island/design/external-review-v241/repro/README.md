# שחזורי הביקורת

הקוד הנבדק הוא קומיט המיזוג `43b27dc235387e3cb737aee9558cdf9d5fd5a262` של PR 461. כל הקבצים כאן נוספו לצורך הביקורת; הם אינם תיקון לקוד המוצר. להריץ משורש המאגר בענף `codex/external-review-v241`.

הסקריפטים משתמשים במודלים, בבקרים ובנכסים האמיתיים. שחזורי כשל מבודדים רק את התנאים הנדרשים: כשל HTTP, אובדן WebGL, מצב התחלתי דטרמיניסטי או האצת שעון המודל. אין שימוש בשמירה אמיתית או בפרופיל הדפדפן האישי.

## הכנה

נדרשים Node.js, Python 3 עם חבילת Playwright ו־Chromium ב־`/usr/bin/chromium`. הסביבה שבה נבדקו: Node 24.19.0, Python 3.12, Chromium 151.0.7922.173, Linux / SwiftShader. סקריפטי Node של המודלים משתמשים בספריות שכבר כלולות במאגר.

במסוף אחד:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

במסוף שני להריץ את הפקודות שב־[REPORT.md](../REPORT.md). אם השקת השרת היא דרך כלי הלוכד stdout, להפנות את הלוג לקובץ כדי למנוע חסימת שרת עקב צינור פלט מלא:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 > /tmp/v241-http.log 2>&1
```

רוב הפלט מודפס ל־stdout; צילומים וקבצי פלט נוספים נכתבים ל־`/tmp/external-review-v241/` או לשמות `/tmp/v241-*.json` המפורטים בסקריפט. אפשר לשנות את תיקיית הפלט של עזר Python דרך `V241_REPRO_OUTPUT`. קובצי הראיות המצורפים כאן הם צילום מצב מהרצת הביקורת, ולא מתעדכנים אוטומטית בהרצה רגילה.

## מפת השחזורים

| ממצא | פקודת מדידה עיקרית | סוג הוכחה |
|---|---|---|
| V241-001 | `python3 workout/island/design/external-review-v241/repro/fire-first-room-shell.py` | מעטפת האי, לחיצה על כניסה וכשל GLB. ה־truck ממוקם ליד הדלת דרך dev; Service Workers חסומים רק כדי שהזרקת כשל ה־HTTP תהיה ודאית. |
| V241-001/004 | `python3 workout/island/design/external-review-v241/repro/fire-interior-failures.py` | scene/session אמיתיים, כשל בחדר ראשון ובחדר המשך; השלמת החדר הראשון מואצת דרך API המודל. |
| V241-002 | `python3 workout/island/design/external-review-v241/repro/fire-context-loss.py` | הרחבת `WEBGL_lose_context` על renderer אמיתי; שעון Playwright מואץ. |
| V241-003 | `python3 workout/island/design/external-review-v241/repro/fire-keyboard.py` | כרטיס ההדרכה האמיתי ו־Tab/Enter/Space. |
| V241-005 | `node workout/island/design/external-review-v241/repro/soccer-air-choice-override.mjs` | הגבהה פיזית וקליטת קלט אמיתי במודל; השוואה עם/בלי `passTarget`. |
| V241-006 | `node workout/island/design/external-review-v241/repro/soccer-view-slide-timeline.mjs` | הפעלת בקר התנועה לאורך כמה עדכונים. |
| V241-007 | `node workout/island/design/external-review-v241/repro/soccer-view-keeper-dive.mjs` | זינוק שוער והעדכון שלאחר בחירת הקליפ. |
| V241-006/007 | `python3 workout/island/design/external-review-v241/repro/soccer-view-browser.py` | צינור הגוף, GLB, retarget ו־floor-bake האמיתיים, בסצנה מבודדת ללא render. |
| V241-008 | `node workout/island/design/external-review-v241/repro/combat-naval-finale-supply.mjs` | שלב 3, seed 5, קלט עד finale, הפלגה למצוף ותיקון. |
| V241-009 | `python3 workout/island/design/external-review-v241/repro/combat-switch.py` | הכפתור המקורי: Enter/Space/C, לחיצת מצביע ו־click סמנטי. `combat-browser.py` חוזר גם דרך מעטפת האי. |
| V241-010 | `python3 workout/island/design/external-review-v241/repro/offline-roundtrip.py --games ''` | הקשר חדש, הורדת manifest מלאה, Service Worker, רשת כבויה ו־body loader עם/בלי rollback. מוריד כ־97 MiB מהשרת המקומי למטמון הבדיקה. |
| V241-011 | `node workout/island/design/external-review-v241/repro/alpine-yaw-sign.mjs` | סיבוב Three.js בבסיס העולם האמיתי; המספרים הם heading של root. |
| V241-012 | `node workout/island/design/external-review-v241/repro/alpine-records-ruleset.mjs` | שתי ריצות אמיתיות עם seeds שונים ואחסון בזיכרון בלבד; ghost ישן מול מכשולים חדשים. |
| V241-013 | `node workout/island/design/external-review-v241/repro/alpine-powder-visibility.mjs` | קורס שנוצר בפועל והצלבת snapshot מול פיזיקה. |
| V241-014 | `python3 workout/island/design/external-review-v241/repro/hoops-fake-comparison.py` | אותו גוף v2, שינוי דגל התנועה בלבד, מדידת ידיים ו־render. |
| V241-015 | `python3 workout/island/design/external-review-v241/repro/tennis-crowd-failure.py` | תזמון כשל Promise אופציונלי ב-loader האמיתי. |
| V241-016 | `python3 workout/island/design/external-review-v241/repro/racing-help-rollback.py` | `helpLines` ו-translator אמיתיים מול מצב מודלי מרוצים וספינות תחת דגלי חזרה. |

שלושת שחזורי Node של הכדורגל בודקים את ההתנהגות הרצויה ולכן **exit 1 הוא התוצאה הצפויה בקומיט הנבדק**. שאר השחזורים מודדים או מאמתים את נוכחות התקלה, ולכן exit 0 שלהם אינו אומר שהמוצר תקין. `--simulate-fix` בשחזור בחירת האוויר מחליף מקור בזיכרון בלבד כדי לבדוק הצעת תיקון; הוא אינו כותב קובץ מקור.

## בדיקות חיוביות וכיסוי

```bash
node workout/island/design/external-review-v241/repro/soccer-rollback-parity.mjs
```

משווה לקוד ההורה מתוך Git, בלי checkout ובלי שינוי קובץ קיים. שלושה חלונות, יחד 5,400 ticks.

```bash
node workout/island/design/external-review-v241/repro/racing-rollback-parity.mjs
```

משווה 12 מרוצים מלאים לכל tick. קוד ההורה נפרס אוטומטית לתיקייה זמנית ומוסר בסיום; נדרשים Git ו־tar.

```bash
python3 workout/island/design/external-review-v241/repro/hoops-dispose-probe.py
```

שלושה מחזורי create → render → dispose באותו WebGLRenderer, לרבות dispose כפול. זו בדיקת משאבים ממוקדת לקהל ולשופט, ולא soak של כל המעטפת.

בדיקת CSP ממוקדת משתמשת בדפי המדידה המקוריים, ב־CSP שנשלח ובמעקב frame/worker. היא מפעילה שרת משלה ואינה דורשת את 8766. אם Playwright אינו נגיש ל־Node דרך import רגיל, להגדיר `ISLAND_PLAYWRIGHT` ל־`index.mjs` של ההתקנה. בסביבת הביקורת הפקודה הייתה:

```bash
ISLAND_PLAYWRIGHT=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs CHROMIUM_PATH=/usr/bin/chromium node workout/island/design/external-review-v241/repro/csp-v241-smoke.mjs
```

ברירת המחדל לפלט היא `/tmp/v241-csp-evidence.json`; אפשר לשנותה דרך `V241_CSP_OUTPUT`. ה־breakpoint בדף הכדורגל קורא metrics לפני הסגירה ואינו משנה מקור או תגובת HTTP.

נתוני 126 תרחישי חזירי הבר נשמרו ב־`combat-boar-cannons.json.gz`; הם כיסוי חקירתי, לא ממצא רגרסיה. `racing-pit-keyboard.py` מדגים את ליקוי המקלדת הקודם שהורחב לפעולת הביטול החדשה. `alpine-opening-clipping.py` ו־`hoops-gait-blend.mjs` מתעדים תצפיות שלא קודמו לממצא.

אין להסיק FPS בטלפון מהתזמונים של הסביבה הזו. הדוח מפריד בין כשלים מוכחים, תצפיות, בדיקות שעברו ו־timeouts.
