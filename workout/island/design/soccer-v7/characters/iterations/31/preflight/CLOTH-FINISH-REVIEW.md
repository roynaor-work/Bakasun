# ביגוד31 — תיקון קולר תחום

תיקון הקולר מתקבל מבחינת תקינות תחומה ב־P01/P04: קו הצוואר חלק ורציף יותר ונשאר צמוד בתמונות סטטיות וב־kick/get_up. לא ראיתי קולר מנותק או חדירת עור חדשה בפריימים שנבדקו. זו אינה קביעה שאיכות הבד הכוללת הגיעה8: הביקורת העצמאית נשארת בסביבות7.5, בשל טורסו חלק, פסים רחבים באריגה וקפלי כתף/גב מצולעים בזמן קימה. [סקירה עצמאית](../INDEPENDENT-CLOTH-REVIEW.md).

ה־helper החדש משחזר שתי פעולות החלקת לולאת קולר שדולגו יחד עם הביינדינג הישן, עם cap0.8מ״מ ושני קפלי מתח עליונים מעלy1.31. הוא משנה קואורדינטות בלבד: אותםUV, משקלים, עצמות, חומרים, מפות וטופולוגיה מקורית. לא נוספו משולשים ל־helper או תקציב QEM; אחריQEM/prune מספר near משתנה במשולש אחד בכל זהות. אין textile rebake או variant tree נוסף.

מרווח העור נמדד בשני מובנים שונים: full reference הוא אבחון בלבד כי חלקו מוסתר/חתוך; ה־guard משתמש במעטפת Skin שנמסרת בפועל, באמצעות outermost hit כדי לא להתבלבל עם underlay פנימי. הקולר המקורי נמצא עד4.3מ״מ בתוך מעטפת זו. יעדrest2.25מ״מ תיקן זאת מקומית ב־6.86/6.93מ״מ, תחת חסם7.5מ״מ. מינימוםfixture לאחר neck-forward הוא0.227/0.133מ״מ. כל40 קודקודי קולר נבדקים, וה־helper נכשל מפורשות אם אין Skin, אם נדרש תיקון גדול מהחסם, אם יעדהמרווח לאמושג או אם UV/משקל/טופולוגיה/כיווןמשולש משתנים.

| דמות | מינימום קולר מפוענח בבסיס | מינימום לאחר התיקון בכל6 התנוחות | דגימות שליליות אחרי |
|---|---|---|---|
| player-01 | -4.256מ״מ | 1.110מ״מ | 0 |
| player-04 | -4.389מ״מ | 1.233מ״מ | 0 |

המדידה האחרונה היא על POSITION/JOINTS/WEIGHTS ומשולשי Skin שפוענחו בפועל מארבעת קובצי Draco אחריQEM. נבדקו320 דגימותrib-kולר לכל דגם (כולל כפילויותUV), ב־rest, neck-forward, neck-back, arm-neck-flex ובמסגרותkick/get_up. מקור האנטומיה משמש רק לכיוון הקרן; המרחק עצמו הוא אל Skin מפוענח. בדיקתLBS הסופית אינה מחליפה את מתאמיIK בזמןריצה, ולכן צילומי הפעולה הם חלק מההכרעה.

| דמות/מבט/גודל | בסיס | תיקון |
|---|---|---|
| player-01/cloth-front/390x844 | [בסיס](cloth-static-baseline/player-01-cloth-front-390x844.png) | [תיקון](cloth-static-finish/player-01-cloth-front-390x844.png) |
| player-01/cloth-front/844x390 | [בסיס](cloth-static-baseline/player-01-cloth-front-844x390.png) | [תיקון](cloth-static-finish/player-01-cloth-front-844x390.png) |
| player-01/cloth-three-quarter/390x844 | [בסיס](cloth-static-baseline/player-01-cloth-three-quarter-390x844.png) | [תיקון](cloth-static-finish/player-01-cloth-three-quarter-390x844.png) |
| player-01/cloth-three-quarter/844x390 | [בסיס](cloth-static-baseline/player-01-cloth-three-quarter-844x390.png) | [תיקון](cloth-static-finish/player-01-cloth-three-quarter-844x390.png) |
| player-01/kick-strike/390x844 | [בסיס](cloth-action-baseline/player-01-kick-strike-390x844.png) | [תיקון](cloth-action-finish/player-01-kick-strike-390x844.png) |
| player-01/kick-strike/844x390 | [בסיס](cloth-action-baseline/player-01-kick-strike-844x390.png) | [תיקון](cloth-action-finish/player-01-kick-strike-844x390.png) |
| player-01/get-up-supported/390x844 | [בסיס](cloth-action-baseline/player-01-get-up-supported-390x844.png) | [תיקון](cloth-action-finish/player-01-get-up-supported-390x844.png) |
| player-01/get-up-supported/844x390 | [בסיס](cloth-action-baseline/player-01-get-up-supported-844x390.png) | [תיקון](cloth-action-finish/player-01-get-up-supported-844x390.png) |
| player-04/cloth-front/390x844 | [בסיס](cloth-static-baseline/player-04-cloth-front-390x844.png) | [תיקון](cloth-static-finish/player-04-cloth-front-390x844.png) |
| player-04/cloth-front/844x390 | [בסיס](cloth-static-baseline/player-04-cloth-front-844x390.png) | [תיקון](cloth-static-finish/player-04-cloth-front-844x390.png) |
| player-04/cloth-three-quarter/390x844 | [בסיס](cloth-static-baseline/player-04-cloth-three-quarter-390x844.png) | [תיקון](cloth-static-finish/player-04-cloth-three-quarter-390x844.png) |
| player-04/cloth-three-quarter/844x390 | [בסיס](cloth-static-baseline/player-04-cloth-three-quarter-844x390.png) | [תיקון](cloth-static-finish/player-04-cloth-three-quarter-844x390.png) |
| player-04/kick-strike/390x844 | [בסיס](cloth-action-baseline/player-04-kick-strike-390x844.png) | [תיקון](cloth-action-finish/player-04-kick-strike-390x844.png) |
| player-04/kick-strike/844x390 | [בסיס](cloth-action-baseline/player-04-kick-strike-844x390.png) | [תיקון](cloth-action-finish/player-04-kick-strike-844x390.png) |
| player-04/get-up-supported/390x844 | [בסיס](cloth-action-baseline/player-04-get-up-supported-390x844.png) | [תיקון](cloth-action-finish/player-04-get-up-supported-390x844.png) |
| player-04/get-up-supported/844x390 | [בסיס](cloth-action-baseline/player-04-get-up-supported-844x390.png) | [תיקון](cloth-action-finish/player-04-get-up-supported-844x390.png) |

32 רינדוריPBR אמיתיים בשני גדלי טלפון, frozen86, ‏DPR1.5 וצילוםCSS. הצילומים הסטטיים הופקו בידיcharacter_assets; צילומיkick/get_up הופקו בנפרד עם המתנה ל־RAF/resize לפני רישום מצלמה. ה־sidecars הסטטיים הגנריים שומרים פקודות מצלמה ולא טרנספורמציה מלאה; אין טענה לאימות מספרי מלא של מצלמת הסטילס. כלPNG נבדק במידותיו וב־SHA. אין בקשות חיצוניות או שגיאותJavaScript, וכל Chromium נסגר.

ששת קובצי הטקסטורה זהים בייט־לבייט, הגדרות החומרים ב־GLB זהות, וכל41 קובציlive24 נשארו קפואים. ההיקף הוא תיקון מקומי בשתי זהויות ובתנוחות מייצגות; מקור32 עדיין חייב לעבור guards לכלזהות, קבלה חזותית בכלהסגל ובדיקות הסיום. אין יותר שינויhelper אוguard אחרי הארכוב הזה.

נתונים: [CLOTH-FINISH-CONTROLS.json](CLOTH-FINISH-CONTROLS.json), [fixture מקור](../../../source/character-cloth-finish31-proof.json), [מדידה מפוענחת](../../../source/character-cloth-finish31-decoded-proof.json).
