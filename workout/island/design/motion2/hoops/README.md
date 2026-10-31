# האי שלי · קליפי כדורסל נוספים

25 קליפים מקוריים ברישיון CC0-1.0, כולל תזוזת הגנה לשני הצדדים. בסיס העבודה הוא `main` ב־`3853d282b6dd7719db49a864fec4286dc7b63cb0`. כל קובצי החבילה חדשים; אין חיבור למשחק, שינוי לוגיקה, שינוי בנכסים קיימים או תגי גרסה.

| פעולה | קובץ |
|---|---|
| ספרינט בלי כדור / עם כדור | [sprint.json](sprint.json), [sprint_ball.json](sprint_ball.json) |
| ריצת הגנה לאחור | [defensive_run.json](defensive_run.json) |
| תזוזת הגנה לצד שמאל / ימין | [defensive_slide.json](defensive_slide.json), [defensive_slide_right.json](defensive_slide_right.json) |
| החלפה בהגנה עם הצבעה | [defensive_switch.json](defensive_switch.json) |
| חטיפה מצליחה / נכשלת | [steal_success.json](steal_success.json), [steal_fail.json](steal_fail.json) |
| חסימה בקפיצה / מסך | [jump_block.json](jump_block.json), [screen.json](screen.json) |
| crossover / ספין / step-back | [crossover.json](crossover.json), [spin.json](spin.json), [step_back.json](step_back.json) |
| פייק זריקה | [shot_fake.json](shot_fake.json) |
| כדרור מהיר / איטי | [dribble_fast.json](dribble_fast.json), [dribble_slow.json](dribble_slow.json) |
| חדירה משמאל / מימין | [layup_left.json](layup_left.json), [layup_right.json](layup_right.json) |
| דאנק / ריבאונד | [dunk.json](dunk.json), [rebound.json](rebound.json) |
| מסירת חזה / מעל הראש | [pass_chest.json](pass_chest.json), [pass_overhead.json](pass_overhead.json) |
| קליטה / זריקה חופשית / חגיגה | [receive.json](receive.json), [free_throw.json](free_throw.json), [celebration.json](celebration.json) |

## פורמט ושלד

כל JSON הוא חבילה עצמאית בפורמט `schemaVersion: 1`, עם `states` המכיל קליפ אחד, `initialState`, שלד מלא ומדיניות ערבוב. אפשר לצרף את רשומת המצב לחבילת כדורסל שכבר משתמשת בפורמט [motion/hoops.json](../../motion/hoops.json). אין שינוי ברשימת המצבים של המשחק. `manifest.json` מרכז שמות, משכים, סמני מגע וחתימות קבצים.

18 העצמות, ההורים, היסטי המנוחה, `designBoneMap`, הצירים והיחידות זהים למקור. כל מפתח כולל quaternion מקומי מוחלט `[x,y,z,w]` לכל עצם. Root נשאר בזהות; `hipsOffsetMeters` הוא היסט חזותי. זמן המפתח מנורמל, ושניות מחושבות לפי `time * durationSeconds`. הניגון הוא smoothstep עם slerp בקשת הקצרה, כפי שמוגדר ב־[חוזה המקור](../../motion/README.md).

הנתונים נכתבו כפוזות מקוריות ונאפו ב־IK של שתי עצמות. אלה אינם נתוני motion capture. `sourceContract.gitBlobSha` מצביע לבתים המדויקים של חבילת התנועה המקורית; `rigReference.sha256` מצביע ל־[rig.json](../../characters/rig.json). ההתאמה לשלד הדמות עם 20 עצמות משתמשת במיפוי ובכיול הקיימים של ה־viewer.

## כדור, ידיים וקרקע

`ballContacts` שומר את פורמט המקור: עצם, זמן, נקודה מקומית, נקודה ב־Root, מרכז כדור ורדיוס 0.12 מ׳. הבודק מחשב FK ומשווה את נקודת כף היד ואת המרחק מפני הכדור. קליטות ואחיזות בשתי ידיים מתייחסות לאותו מרכז כדור. בחטיפה שנכשלת אין מגע כדור. בפייק הכדור נשאר באחיזה ללא אירוע שחרור.

`contactTimeline` מפרט זמני יד, כדור וקרקע בשניות ובזמן מנורמל; חלונות אחיזה יכולים לכלול `endTime`. `ballGroundContacts` מכיל את נגיעות הכדור ברצפה כאשר יש הקפצה. מסלולי הכדור הנוספים הם הנחיות presentation; הם אינם משנים פיזיקה או בעלות על הכדור. בניתור אין תמיכת קרקע, בחדירה הרגל המנתרת נגדית ליד המסיימת, ובדאנק המעקב והנחיית הכדור פונים מטה.

`supportContacts` מגדיר חלונות סוליה נטועה ועוגנים קבועים, עם אותו `effectorOffsetMeters: [0,-0.08,0]` וסף 0.02 מ׳. `referenceRootTranslationMeters` הוא מסלול בדיקה בלבד. במחזורי תנועה יש להזיז את העוגנים במחזור הבא לפי `referenceLocomotion.cycleAnchorTranslationMeters`; העולם והמהירות במשחק נשארים באחריות הסימולציה. שמאל אנטומי הוא ‎+X, ללא היפוך ב־RTL.

## מעברים ללא חיתוך חד

`transitionRecommendations` מגדיר מקורות ויעדים מומלצים, משך ערבוב חיובי, smoothstep ושמירת עוגני תמיכה עד שחרור. יש לצלם את הפוזה המוצגת ואת מהירותה, להמשיך את צד המקור לאורך הערבוב ולהתקדם בקליפ היעד. לאחר ערבוב יש לפתור את תמיכות הרגליים ולהרפות מהנעילה בהדרגה. ההמלצות הן נתונים למתאם; קליפ בודד אינו מתקין מכונת מצבים חדשה במשחק.

גרף הבדיקה כולל כניסה מ־idle ומ־run, את המקורות והיציאות המומלצים, סיום קליפ ומעברי הבסיס, לרבות reset שקוטע ערבוב פעיל. הגרף המדויק שנבדק שמור ב־`verification/viewer/provenance.json`. כל האירועים הם סמני presentation בלבד: אין להפיק מהם ניקוד, הצלחת חטיפה או חסימה, תגמולים או בעלות על כדור.

## שחזור הבדיקות

משורש המאגר, עם Node, Playwright ו־Chromium מותקנים:

```sh
node workout/island/design/motion2/hoops/verification/tools/validate-data.mjs
```

```sh
node workout/island/design/motion2/hoops/verification/tools/test-package.mjs --previews
```

`HOOPS_PLAYWRIGHT_PATH` יכול להצביע ל־`playwright/index.mjs`; אפשר להעביר `--executable` לנתיב Chromium. הרצה ממוקדת משתמשת ב־`--character basketball-player --out /tmp/hoops-smoke`.

העטיפה מריצה את [test-viewer.mjs המקורי](../../viewer/test-viewer.mjs) ללא עריכה. היא מגישה ל־viewer את מצבי הבסיס והקליפים החדשים בתשובת JSON מקומית אחת. הבדיקות, ה־renderer, ההתאמה, הספים והאבחון נשארים המקוריים. חתימות לפני ואחרי וכיסוי כל קליפ נשמרים בדוח provenance. הרצה נכשלת אם חסר קליפ או אם קובץ משתנה במהלכה.

תוצאות, מגבלות ומדידות: [VALIDATION.md](VALIDATION.md). הדוח הקנוני בודק FK לפני תיקוני הניגון; דוח ה־viewer בודק גם את כל קודקודי הרשת לאחר ההתאמה והערבוב. אין כאן טענה לביצועים בטלפון פיזי או לשילוב במנוע המשחק.
