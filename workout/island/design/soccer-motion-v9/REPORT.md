# כדורגל v9 — דוח מסירה ומדידות

מצב: **עובר את בדיקות הקבלה**. ענף: `codex/soccer-motion-v9`. נקודת הבסיס ב־main: `d1af33d98b73b4763a399c260fcaa3621fc1792f`.

48 קליפים מקוריים משלימים: 15 תנועה חופשית, 17 עם כדור, 2 גלישה וקימה, 8 שוער ו־6 חגיגות/כללי משחק. 25 הקליפים הקיימים של v8 נשארו במקומם; אף אחד מהם אינו ארוז ב־v9. רשתות הדמויות הבדיוניות של v8 משמשות לתצוגה בלבד, עם ערוצי הנפשה חדשים לחלוטין.

[תצוגה בלולאה](preview.html) · [מקור ורישיון לכל קליפ](LICENSES.md) · [הגדרות המדידה](verification/METHOD.md) · [מדידות גולמיות](verification/metrics.json) · [ראיות דפדפן](verification/browser-evidence.json)

## תוצאות מרכזיות

| דרישה | תוצאה בפלט המפוענח |
|---|---|
| פורמט וטעינה | 48/48 קבצים נטענו ב־GLTFLoader r160 עם Draco WASM; תמונות המקור נטענו בדפדפן |
| משקל | המרבי 596,064 בתים; כלל קובצי GLB 27,962,536 בתים |
| שלד וקצב | 18 עצמות, אותו עץ/מנוחה/inverse binds; 30Hz, שגיאת זמן מרבית 0.111 מיקרושניות |
| נטיעה | החלקה אופקית מרבית 0.699 ס״מ; שגיאת עוגן תלת־ממדית מרבית 1.815 ס״מ |
| קצב צעדים | 11 קליפים שנמדדו מול יעד מהירות ואורך צעד; שגיאה מרבית 0.00% |
| לולאות | 12 לולאות; הפרש פוזה מרבי 0.000030° ו־0.000096 מ״מ |
| אנטומיה | 0 חריגות בטווחים המפורטים; 0 דגימות ברכיים הפוכות |
| גלישה מוחטאת | 0 דגימות חציית ידיים או מרפקים, גם בבדיקה צפופה בין פריימים |
| שונות | 0 כפילויות זהות ב־v9 וב־48×25 השוואות מול v8; מרחק RMS זוויתי מזערי בתוך הספרייה 3.815° |
| מגע בכדור | 52 סמני משטח מכוילים; שגיאת רדיוס מרבית 0.0080 מ״מ; כדור משותף בתפיסה בשתי ידיים |
| כדור מול משטח הגוף בין אירועים | 23 פעולות, 4127 דגימות עור ב־120Hz; חדירה מרבית 1.9775 מ״מ ומרחק אחיזה מרבי 0.0100 מ״מ |
| בדיקות וצילומים | 116 בדיקות, 0 כישלונות; 48 גיליונות 844×390; שגיאות דפדפן: 0 |

הנטייה נמדדת מול וקטור התאוצה בפועל בחיתוכים, בכדרור בחיתוך ובבלימה. סיבוב כתפיים ואגן נמדד ביחס לעולם לאחר דגימת ההנפשה. טבלאות כל קליפ, הטווחים האנטומיים, הכנת הבעיטה והמעקב מופיעות בהמשך. אין ציוני טבעיות מומצאים: אלה בדיקות קינמטיות מוגדרות, לצד סקירה של תמונות המודל האמיתי.

## רציפות ומעברים

מפת המעברים המלאה כוללת 580 קשתות ו־48 מצבים, ונגישה דרך `LEGAL_TRANSITIONS` ו־`TRANSITION_GRAPH` ב־[state-machine.mjs](runtime/state-machine.mjs). אירועים אינם משנים בעלות בכדור או חוקי משחק.

| מקור | יעד | תנאי/התנהגות |
|---|---|---|
| עמידה רגועה | פעולות שדה/תנועה | בחירה או טריגר פעולה; משכי ערבוב מפורשים |
| הליכה/ג׳וג/ריצה/ספרינט/אחור/צד | מצבי תנועה ופעולות | תור יציאה במגע רגל בהתאם לקשת |
| ריצה | בלימה | ממתין לנטיעת שמאל בפאזה 0; אותה פוזה ואותה מהירות כניסה, ללא ערבוב מאולץ |
| גלישה מוחטאת | קימה מהירה | שחזור פוזת הישיבה ההתחלתית של הקימה |
| עמידת שוער | פעולות שוער | פעולות נפרדות וחזרה לעמידת היכון |
| פעולה חד־פעמית | עמידה או חזרה לריצה | חלון סיום מתוזמן |

בדיקת מעבר GLB: `{"from":"run","phase":0,"to":"run_brake","poseDeg":0.0000034150945850063755,"poseM":0,"velocityDeltaMps":0,"airborneFrames":0,"pass":true}`. הדגמת הדפדפן בראיות מודדת בנוסף רציפות מיקום בעולם ומהירות; המצלמה נשארת קבועה במהלך ההחלפה. רציפות מדויקת זו נמדדה במסלול הריצה של 4.5 מ׳/ש׳ ובפאזה המצוינת.

## צילומים וביקורת חזותית

כל גיליון מורכב מארבעה רינדורים של המודל המונפש האמיתי, ב־Chromium עם טקסטורות המקור ועם GLTFLoader ו־Draco המקומיים. זמני הדגימות, גודל התמונה ו־SHA-256 של ה־GLB והגיליון נמצאים בראיות. בדיקות הקבלה דוחות צילומים שאינם מתאימים לקובצי ה־GLB הנוכחיים.

| קליפ | גיליון 844×390 |
|---|---|
| idle_relaxed | [צילום](verification/contact-sheets/idle_relaxed.png) |
| idle_scan | [צילום](verification/contact-sheets/idle_scan.png) |
| idle_weight_shift | [צילום](verification/contact-sheets/idle_weight_shift.png) |
| walk | [צילום](verification/contact-sheets/walk.png) |
| jog | [צילום](verification/contact-sheets/jog.png) |
| run | [צילום](verification/contact-sheets/run.png) |
| sprint | [צילום](verification/contact-sheets/sprint.png) |
| run_backward | [צילום](verification/contact-sheets/run_backward.png) |
| run_lateral | [צילום](verification/contact-sheets/run_lateral.png) |
| run_brake | [צילום](verification/contact-sheets/run_brake.png) |
| turn_in_place | [צילום](verification/contact-sheets/turn_in_place.png) |
| cut_45 | [צילום](verification/contact-sheets/cut_45.png) |
| cut_90 | [צילום](verification/contact-sheets/cut_90.png) |
| cut_135 | [צילום](verification/contact-sheets/cut_135.png) |
| cut_180 | [צילום](verification/contact-sheets/cut_180.png) |
| first_touch_chest_standing | [צילום](verification/contact-sheets/first_touch_chest_standing.png) |
| first_touch_chest_running | [צילום](verification/contact-sheets/first_touch_chest_running.png) |
| first_touch_thigh_standing | [צילום](verification/contact-sheets/first_touch_thigh_standing.png) |
| first_touch_thigh_running | [צילום](verification/contact-sheets/first_touch_thigh_running.png) |
| first_touch_inside_standing | [צילום](verification/contact-sheets/first_touch_inside_standing.png) |
| first_touch_inside_running | [צילום](verification/contact-sheets/first_touch_inside_running.png) |
| first_touch_outside_standing | [צילום](verification/contact-sheets/first_touch_outside_standing.png) |
| first_touch_outside_running | [צילום](verification/contact-sheets/first_touch_outside_running.png) |
| dribble_fast | [צילום](verification/contact-sheets/dribble_fast.png) |
| dribble_cut | [צילום](verification/contact-sheets/dribble_cut.png) |
| body_feint | [צילום](verification/contact-sheets/body_feint.png) |
| spin_kick | [צילום](verification/contact-sheets/spin_kick.png) |
| volley_kick | [צילום](verification/contact-sheets/volley_kick.png) |
| long_shot | [צילום](verification/contact-sheets/long_shot.png) |
| through_pass | [צילום](verification/contact-sheets/through_pass.png) |
| running_pass | [צילום](verification/contact-sheets/running_pass.png) |
| jump_header | [צילום](verification/contact-sheets/jump_header.png) |
| slide_miss | [צילום](verification/contact-sheets/slide_miss.png) |
| quick_getup | [צילום](verification/contact-sheets/quick_getup.png) |
| goalkeeper_ready | [צילום](verification/contact-sheets/goalkeeper_ready.png) |
| goalkeeper_roll | [צילום](verification/contact-sheets/goalkeeper_roll.png) |
| goalkeeper_short_pass | [צילום](verification/contact-sheets/goalkeeper_short_pass.png) |
| goalkeeper_overarm_throw | [צילום](verification/contact-sheets/goalkeeper_overarm_throw.png) |
| goalkeeper_catch_high | [צילום](verification/contact-sheets/goalkeeper_catch_high.png) |
| goalkeeper_punch | [צילום](verification/contact-sheets/goalkeeper_punch.png) |
| goalkeeper_catch_low | [צילום](verification/contact-sheets/goalkeeper_catch_low.png) |
| goalkeeper_getup | [צילום](verification/contact-sheets/goalkeeper_getup.png) |
| celebrate_hop | [צילום](verification/contact-sheets/celebrate_hop.png) |
| celebrate_clap | [צילום](verification/contact-sheets/celebrate_clap.png) |
| celebrate_pump | [צילום](verification/contact-sheets/celebrate_pump.png) |
| celebrate_turn | [צילום](verification/contact-sheets/celebrate_turn.png) |
| disappointed | [צילום](verification/contact-sheets/disappointed.png) |
| throw_in | [צילום](verification/contact-sheets/throw_in.png) |

נבדקו גם ממשק 844×390 וממשק 390×844, מעבר אוטומטי בכל הקליפים, בחירה, עצירה, שינוי מהירות וציר זמן. בדיקת Chromium אינה בדיקת ביצועים של טלפון פיזי.

מודל הייחוס כולל כפות ידיים קבועות ושלד ללא עצמות אצבעות, ולכן אין הנפשה נפרדת של סגירת אצבעות. בפוזות ידיים גבוהות נראים גם קפלי הבגד וחריצי בית השחי של רשת הייחוס. מדידות התנועה אינן טענה לסימולציית בד או לאנימציית אצבעות.

## מקור, שחזור והיקף השינוי

כל התנועות נכתבו ידנית או פרוצדורלית כחלק מהמשימה, והוקדשו ל־CC0-1.0. המקור המדויק לכל קליפ רשום ב־LICENSES.md. אריזת ה־GLB מעתיקה ללא שינוי את זרמי Draco, המשקלים, החומרים, התמונות וה־inverse binds של הדמויות הקיימות; בדיקת שלמות משווה אותם לכל אחד מ־48 הפלטים. כל האנימציות הישנות מוסרות לפני אריזת האנימציה החדשה.

כל הקבצים שנוספו נמצאים בתוך `workout/island/design/soccer-motion-v9/`. לא נערכו קוד קיים, v8, motion2, CLAUDE.md, ops, קובצי release, תגי גרסה או בדיקות קיימות. החבילה אינה מחוברת למשחק החי.

לשחזור מתוך תיקיית v9:

```bash
node source/build.mjs
node verification/render-sheets.mjs
node verification/audit-ball.mjs
node --test --test-reporter=tap verification/*.test.mjs > verification/node-test.tap
node source/report.mjs
```

מדידות התנועה מתבצעות בקובצי GLB המפוענחים, ללא תיקון IK של התצוגה וללא הסתמכות על דגלי “עבר” במקור. תמיכות כוללות את מסלול התנועה בעולם; החלקה מכוונת של גלישה אינה מסומנת כנטיעה. גבולות האנטומיה והמדדים שאינם חלים על פעולה מסוימת מפורטים בשיטת המדידה.

## טבלאות מדידה לכל קליפ


נמדד: 2026-11-07T19:09:14.368Z. Real native GLTFLoader+Draco; bone FK at 120Hz plus all event/support boundaries; no viewer IK.

| קליפ | KB | דגימות | החלקה ס״מ | שגיאת עוגן ס״מ | שגיאת קצב % | לולאה ° | ברכיים הפוכות | חריגות אנטומיה | סיבוב נגדי r | נטייה מיושרת % | זרועות חוצות | מעבר |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| idle_relaxed | 588.8 | 289 | 0.000 | 0.000 | — | 0.0000 | 0 | 0 | — | — | — | PASS |
| idle_scan | 596.1 | 385 | 0.000 | 0.000 | — | 0.0000 | 0 | 0 | — | — | — | PASS |
| idle_weight_shift | 592.4 | 337 | 0.000 | 0.000 | — | 0.0000 | 0 | 0 | — | — | — | PASS |
| walk | 577.9 | 147 | 0.013 | 0.063 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| jog | 573.6 | 90 | 0.050 | 0.312 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| run | 572.3 | 73 | 0.115 | 0.720 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| sprint | 571.7 | 66 | 0.207 | 1.815 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| run_backward | 574.2 | 98 | 0.043 | 0.233 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| run_lateral | 574.2 | 98 | 0.054 | 0.180 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| run_brake | 578.3 | 145 | 0.247 | 0.774 | — | — | 0 | 0 | — | 86.4 | — | PASS |
| turn_in_place | 581.9 | 193 | 0.001 | 0.001 | — | — | 0 | 0 | — | — | — | PASS |
| cut_45 | 579.9 | 169 | 0.050 | 0.102 | — | — | 0 | 0 | — | 100.0 | — | PASS |
| cut_90 | 579.9 | 169 | 0.084 | 0.102 | — | — | 0 | 0 | — | 100.0 | — | PASS |
| cut_135 | 579.9 | 169 | 0.111 | 0.144 | — | — | 0 | 0 | — | 100.0 | — | PASS |
| cut_180 | 579.9 | 169 | 0.151 | 0.336 | — | — | 0 | 0 | — | 100.0 | — | PASS |
| first_touch_chest_standing | 579.2 | 157 | 0.002 | 0.003 | — | — | 0 | 0 | — | — | — | PASS |
| first_touch_chest_running | 582.2 | 198 | 0.392 | 0.395 | 0.0 | — | 0 | 0 | — | — | — | PASS |
| first_touch_thigh_standing | 579.3 | 157 | 0.002 | 0.003 | — | — | 0 | 0 | — | — | — | PASS |
| first_touch_thigh_running | 582.2 | 198 | 0.686 | 0.715 | 0.0 | — | 0 | 0 | — | — | — | PASS |
| first_touch_inside_standing | 579.3 | 157 | 0.002 | 0.003 | — | — | 0 | 0 | — | — | — | PASS |
| first_touch_inside_running | 582.2 | 198 | 0.696 | 0.701 | 0.0 | — | 0 | 0 | — | — | — | PASS |
| first_touch_outside_standing | 579.3 | 157 | 0.002 | 0.003 | — | — | 0 | 0 | — | — | — | PASS |
| first_touch_outside_running | 582.2 | 198 | 0.699 | 0.702 | 0.0 | — | 0 | 0 | — | — | — | PASS |
| dribble_fast | 573.2 | 74 | 0.108 | 0.734 | 0.0 | 0.0000 | 0 | 0 | -1.00 | — | — | PASS |
| dribble_cut | 584.4 | 223 | 0.502 | 0.375 | — | — | 0 | 0 | — | 100.0 | — | PASS |
| body_feint | 579.6 | 169 | 0.034 | 0.037 | — | — | 0 | 0 | — | — | — | PASS |
| spin_kick | 584.3 | 218 | 0.109 | 0.110 | — | — | 0 | 0 | — | — | — | PASS |
| volley_kick | 581.1 | 182 | 0.305 | 0.313 | — | — | 0 | 0 | — | — | — | PASS |
| long_shot | 582.0 | 195 | 0.057 | 0.060 | — | — | 0 | 0 | — | — | — | PASS |
| through_pass | 579.3 | 159 | 0.293 | 0.307 | — | — | 0 | 0 | — | — | — | PASS |
| running_pass | 582.3 | 196 | 0.039 | 0.065 | — | — | 0 | 0 | — | — | — | PASS |
| jump_header | 582.5 | 194 | 0.022 | 0.103 | — | — | 0 | 0 | — | — | — | PASS |
| slide_miss | 583.5 | 218 | 0.311 | 0.317 | — | — | 0 | 0 | — | — | 0 | PASS |
| quick_getup | 579.0 | 160 | 0.513 | 0.525 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_ready | 593.3 | 241 | 0.000 | 0.000 | — | 0.0000 | 0 | 0 | — | — | — | PASS |
| goalkeeper_roll | 590.2 | 195 | 0.077 | 0.075 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_short_pass | 586.5 | 147 | 0.215 | 0.224 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_overarm_throw | 591.1 | 207 | 0.102 | 0.115 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_catch_high | 589.5 | 181 | 0.022 | 0.057 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_punch | 589.5 | 181 | 0.024 | 0.058 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_catch_low | 589.1 | 181 | 0.021 | 0.021 | — | — | 0 | 0 | — | — | — | PASS |
| goalkeeper_getup | 589.9 | 195 | 0.064 | 0.080 | — | — | 0 | 0 | — | — | — | PASS |
| celebrate_hop | 583.7 | 217 | 0.019 | 0.127 | — | — | 0 | 0 | — | — | — | PASS |
| celebrate_clap | 581.4 | 193 | 0.000 | 0.000 | — | 0.0000 | 0 | 0 | — | — | — | PASS |
| celebrate_pump | 583.3 | 217 | 0.004 | 0.004 | — | — | 0 | 0 | — | — | — | PASS |
| celebrate_turn | 585.8 | 249 | 0.087 | 0.128 | — | — | 0 | 0 | — | — | — | PASS |
| disappointed | 587.0 | 265 | 0.000 | 0.000 | — | — | 0 | 0 | — | — | — | PASS |
| throw_in | 584.1 | 217 | 0.001 | 0.002 | — | — | 0 | 0 | — | — | — | PASS |

המדד ״—״ אינו חל על הפעולה. כל חלון תמיכה נמדד בקואורדינטות עולם כולל מסלול התנועה החיצוני; גלישה מכוונת נמדדת מחוץ לחלונות הנטיעה. קצב מגעים מזוהה מגובה ומהירות הסוליה המפוענחת ומושווה ליעד המחבר העצמאי.

מעבר ריצה לבלימה: {"from":"run","phase":0,"to":"run_brake","poseDeg":0.0000034150945850063755,"poseM":0,"velocityDeltaMps":0,"airborneFrames":0,"pass":true}
כפילויות בתוך v9: 0; כפילויות זהות מול v8: 0.

## טווחי מפרקים ושונות

| קליפ | ברך ° | מרפק ° | פיתול ירך ° | הגבהת כתף ° | קרסול swing/twist ° | כף יד swing/twist ° | RMS הקרוב ב־v9 ° | RMS הקרוב ב־v8 ° |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| idle_relaxed | 49.3…51.4 | 91.1…96.6 | 0.6 | 38.6 | 29.2/0.6 | 0.0/0.0 | 4.715 (idle_scan) | 15.827 (receive_foot) |
| idle_scan | 51.8…54.8 | 93.5…99.2 | 3.4 | 35.6 | 30.6/0.9 | 0.0/0.0 | 4.715 (idle_relaxed) | 16.335 (receive_foot) |
| idle_weight_shift | 54.7…59.7 | 86.9…98.9 | 0.9 | 36.0 | 33.3/1.6 | 0.0/0.0 | 5.347 (idle_relaxed) | 16.239 (receive_foot) |
| walk | 26.7…81.0 | 114.2…144.6 | 5.6 | 67.2 | 48.6/1.8 | 0.0/0.0 | 14.548 (jog) | 25.344 (first_touch_moving) |
| jog | 28.2…103.0 | 107.6…146.9 | 5.3 | 77.7 | 44.1/2.3 | 0.0/0.0 | 4.662 (dribble_fast) | 26.610 (first_touch_moving) |
| run | 32.1…111.3 | 104.6…147.2 | 5.0 | 73.8 | 47.7/2.5 | 0.0/0.0 | 7.249 (jog) | 28.521 (first_touch_moving) |
| sprint | 26.0…122.5 | 99.3…147.4 | 4.9 | 70.9 | 49.1/3.1 | 0.0/0.0 | 9.533 (run) | 32.708 (first_touch_moving) |
| run_backward | 26.4…96.4 | 99.5…145.3 | 5.5 | 72.6 | 47.2/2.2 | 0.0/0.0 | 14.732 (run_lateral) | 26.904 (receive_foot) |
| run_lateral | 36.0…101.7 | 93.8…140.0 | 9.4 | 67.3 | 40.0/13.8 | 0.0/0.0 | 14.732 (run_backward) | 23.899 (receive_foot) |
| run_brake | 7.4…107.3 | 95.7…139.3 | 2.7 | 73.8 | 57.6/3.8 | 0.0/0.0 | 15.281 (first_touch_chest_standing) | 20.993 (receive_foot) |
| turn_in_place | 58.1…86.6 | 103.7…107.0 | 39.0 | 39.3 | 41.0/6.5 | 0.0/0.0 | 16.047 (cut_45) | 23.231 (receive_foot) |
| cut_45 | 40.1…106.2 | 87.2…135.9 | 15.1 | 37.5 | 56.9/20.1 | 0.0/0.0 | 9.267 (cut_90) | 23.394 (receive_foot) |
| cut_90 | 33.4…102.3 | 73.3…142.3 | 32.2 | 39.7 | 63.5/22.1 | 0.0/0.0 | 8.892 (cut_135) | 27.794 (receive_foot) |
| cut_135 | 24.7…101.4 | 71.4…147.4 | 49.5 | 40.0 | 80.2/30.5 | 0.0/0.0 | 8.814 (cut_180) | 33.636 (receive_foot) |
| cut_180 | 9.6…100.7 | 71.4…149.7 | 63.3 | 38.3 | 78.8/37.7 | 0.0/0.0 | 8.814 (cut_135) | 39.941 (cut) |
| first_touch_chest_standing | 56.6…64.5 | 89.7…109.7 | 1.4 | 38.8 | 37.6/1.9 | 0.0/0.0 | 5.649 (idle_weight_shift) | 15.360 (receive_foot) |
| first_touch_chest_running | 26.4…107.7 | 95.1…146.6 | 5.4 | 77.7 | 51.5/6.1 | 0.0/0.0 | 7.105 (first_touch_inside_running) | 25.199 (receive_foot) |
| first_touch_thigh_standing | 56.3…117.4 | 89.7…113.7 | 18.8 | 40.0 | 40.3/4.4 | 0.0/0.0 | 11.180 (first_touch_inside_standing) | 18.499 (receive_foot) |
| first_touch_thigh_running | 26.4…122.5 | 95.1…145.2 | 22.6 | 75.2 | 58.9/2.5 | 0.0/0.0 | 6.708 (first_touch_outside_running) | 26.317 (receive_foot) |
| first_touch_inside_standing | 49.2…70.3 | 89.7…109.7 | 1.8 | 41.0 | 33.7/34.1 | 0.0/0.0 | 8.311 (first_touch_chest_standing) | 13.783 (receive_foot) |
| first_touch_inside_running | 26.4…103.9 | 95.1…146.6 | 5.4 | 72.8 | 48.6/35.4 | 0.0/0.0 | 7.105 (first_touch_chest_running) | 24.728 (receive_foot) |
| first_touch_outside_standing | 42.6…65.0 | 89.7…114.8 | 7.9 | 42.2 | 33.7/28.0 | 0.0/0.0 | 8.546 (first_touch_inside_standing) | 15.085 (receive_foot) |
| first_touch_outside_running | 26.4…103.9 | 95.1…144.6 | 6.8 | 74.5 | 48.6/22.4 | 0.0/0.0 | 6.708 (first_touch_thigh_running) | 25.652 (receive_foot) |
| dribble_fast | 24.0…115.0 | 105.6…147.5 | 5.4 | 76.1 | 51.9/2.9 | 0.0/0.0 | 4.662 (jog) | 28.650 (first_touch_moving) |
| dribble_cut | 54.8…108.8 | 59.5…146.9 | 17.2 | 78.3 | 52.7/34.1 | 0.0/0.0 | 19.795 (first_touch_chest_standing) | 26.496 (receive_foot) |
| body_feint | 61.2…72.1 | 87.2…124.6 | 1.3 | 44.8 | 42.0/15.5 | 0.0/0.0 | 10.076 (first_touch_chest_standing) | 20.137 (receive_foot) |
| spin_kick | 41.4…87.1 | 87.3…116.4 | 43.9 | 62.2 | 55.9/45.5 | 0.0/0.0 | 19.079 (turn_in_place) | 26.211 (receive_foot) |
| volley_kick | 57.6…112.8 | 94.4…130.8 | 11.6 | 54.2 | 61.2/13.4 | 0.0/0.0 | 7.731 (long_shot) | 21.798 (receive_foot) |
| long_shot | 54.1…84.9 | 93.0…130.4 | 11.7 | 53.1 | 60.8/12.7 | 0.0/0.0 | 3.815 (through_pass) | 19.954 (receive_foot) |
| through_pass | 47.9…83.0 | 93.8…130.7 | 11.8 | 53.1 | 62.3/11.7 | 0.0/0.0 | 3.815 (long_shot) | 19.373 (receive_foot) |
| running_pass | 43.7…102.5 | 119.3…125.6 | 8.9 | 55.4 | 66.5/42.9 | 0.0/0.0 | 12.521 (goalkeeper_short_pass) | 24.567 (receive_foot) |
| jump_header | 31.6…83.6 | 51.1…107.4 | 1.2 | 39.5 | 46.0/1.3 | 0.0/0.0 | 10.115 (idle_weight_shift) | 17.519 (receive_foot) |
| slide_miss | 34.0…144.6 | 23.2…120.1 | 57.0 | 85.2 | 68.9/20.6 | 0.0/0.0 | 40.840 (first_touch_thigh_standing) | 47.354 (pass_loft) |
| quick_getup | 34.0…152.9 | 23.2…83.8 | 57.0 | 39.6 | 78.6/20.6 | 0.0/0.0 | 30.340 (disappointed) | 34.371 (dribble) |
| goalkeeper_ready | 66.3…69.3 | 105.2…112.6 | 3.1 | 40.9 | 35.8/3.5 | 0.0/0.0 | 12.870 (celebrate_clap) | 21.604 (receive_chest) |
| goalkeeper_roll | 54.9…117.8 | 18.9…145.8 | 8.2 | 82.4 | 82.1/18.3 | 0.0/0.0 | 26.316 (goalkeeper_ready) | 35.557 (receive_chest) |
| goalkeeper_short_pass | 60.8…84.3 | 105.7…126.2 | 16.4 | 46.0 | 62.3/37.6 | 0.0/0.0 | 12.521 (running_pass) | 23.197 (receive_foot) |
| goalkeeper_overarm_throw | 43.1…89.1 | 70.6…143.1 | 9.0 | 130.0 | 46.3/28.0 | 0.0/0.0 | 21.579 (celebrate_pump) | 30.610 (receive_chest) |
| goalkeeper_catch_high | 55.9…88.1 | 35.1…126.4 | 4.1 | 163.8 | 43.8/4.0 | 0.0/0.0 | 13.953 (goalkeeper_punch) | 38.218 (receive_chest) |
| goalkeeper_punch | 55.9…88.2 | 43.8…127.9 | 4.1 | 152.7 | 47.2/15.4 | 0.0/0.0 | 13.953 (goalkeeper_catch_high) | 34.857 (receive_chest) |
| goalkeeper_catch_low | 66.1…126.2 | 32.4…125.2 | 8.9 | 55.2 | 71.9/15.3 | 0.0/0.0 | 21.284 (goalkeeper_ready) | 32.496 (receive_chest) |
| goalkeeper_getup | 66.3…147.7 | 16.9…110.6 | 22.0 | 78.7 | 75.9/13.9 | 0.0/0.0 | 26.859 (goalkeeper_catch_low) | 34.390 (dribble) |
| celebrate_hop | 30.3…79.2 | 82.3…123.8 | 1.3 | 77.7 | 44.0/1.5 | 0.0/0.0 | 14.756 (celebrate_pump) | 22.278 (receive_chest) |
| celebrate_clap | 50.3…53.3 | 85.9…98.5 | 1.0 | 45.2 | 30.7/1.1 | 0.0/0.0 | 12.870 (goalkeeper_ready) | 19.942 (receive_chest) |
| celebrate_pump | 49.4…52.4 | 80.0…120.4 | 1.7 | 119.2 | 32.1/11.9 | 0.0/0.0 | 14.756 (celebrate_hop) | 23.069 (receive_chest) |
| celebrate_turn | 42.2…77.7 | 62.2…122.7 | 3.3 | 51.7 | 47.0/27.7 | 0.0/0.0 | 15.930 (goalkeeper_ready) | 21.395 (receive_chest) |
| disappointed | 51.8…61.1 | 68.9…82.3 | 0.8 | 27.9 | 35.0/1.1 | 0.0/0.0 | 11.830 (idle_weight_shift) | 14.965 (idle) |
| throw_in | 39.2…53.2 | 13.0…117.6 | 1.9 | 163.3 | 38.0/2.0 | 0.0/0.0 | 32.109 (goalkeeper_catch_high) | 48.162 (pass_short) |

## הכנה ומעקב

| פעולה | העברת משקל לתמיכה ס״מ | הכנה→מגע ס״מ | מעקב קדימה ס״מ | ירידת הכנה לנגיחה ס״מ |
|---|---:|---:|---:|---:|
| spin_kick | 4.59 | 62.02 | 18.10 | — |
| volley_kick | 4.59 | 71.96 | 13.26 | — |
| long_shot | 4.59 | 71.50 | 13.61 | — |
| through_pass | 4.59 | 71.61 | 13.09 | — |
| running_pass | 2.73 | 70.00 | 12.00 | — |
| jump_header | — | — | 17.21 | 9.89 |
| goalkeeper_short_pass | 5.61 | 55.60 | 15.71 | — |
