# האי שלי · motion2

32 קליפים נוספים: 12 כדורגל, 9 כדורסל, 11 סקי. בסיס ענף המסירה הוא main `e67c65668696821299cf260072716c8107a348ed`; הבדיקות נוצרו על `3853d282b6dd7719db49a864fec4286dc7b63cb0`, וכל 21 קובצי הקלט שנבדקו זהים בבתים לגרסה העדכנית, לרבות motion וה־retarget-map הקיימים. כל הקבצים החדשים תחת motion2; קבצים קיימים, לוגיקת משחק ותגי גרסה לא השתנו. המחוללים הם כלי עבודה בלבד; נתוני JSON מקוריים ברישיון CC0-1.0, אינם motion capture.

## שימוש

1. פתחו את החבילה באותו מאגר שיש בו design/motion ו־design/viewer. קראו JSON המתאים למשחק והוסיפו את states שלו לטבלת המצבים הקיימת. כל שם חדש; אין להחליף את טבלת הבסיס. initialState נשאר idle מהבסיס.
2. המלצות המעברים נמצאות ב־transitions. השאירו את כללי reset וה־wildcard המקוריים לפני ההמלצות הנוספות, והוסיפו eventInputs בעת בניית נתוני תצוגה משולבים. שמות present_/motion_ הם בקשות תצוגה מפורשות של מתאם עתידי; החבילה אינה מחברת אותם למשחק.
3. לבדיקה ולתצוגה הריצו את הפקודות להלן. ב־viewer בחרו משחק, דמות ואחד משמות הקליפים החדשים. הצלחה נמדדת ב־report.json עם pass=true; ראו גם VALIDATION.md.

```sh
node workout/island/design/motion2/validate-motion2.mjs
node workout/island/design/motion2/test-motion2.mjs
```

נדרש Node ו־Playwright עם Chromium או Chrome. PLAYWRIGHT_MODULE יכול להפנות לחבילת Playwright מותקנת; --channel chrome ו־--executable נתמכים על ידי הבודק המקורי. העטיפה יוצרת עותק זמני של נכסי ה־viewer, טוענת בו את הבסיס בתוספת הקליפים החדשים, ומפעילה את viewer/test-viewer.mjs המקורי ללא שינוי. קובצי המקור והספים נשארים כפי שהם. כל state חדש נכלל בלולאת הבדיקה של הבודק.

תתי־התיקיות המקבילות motion2/soccer, motion2/hoops ו־motion2/alpine נוספו ב־main במהלך העבודה ונשארו ללא שינוי. חבילה זו היא שלושת קובצי JSON בשורש motion2. בעת חיבור בחרו חבילה אחת לכל פעולה; אין לטעון רקורסיבית את כל קובצי motion2 לתוך טבלת states אחת, משום ששמות פעולות עשויים לחזור בחבילות המקבילות.

הניתור הקטן וטריק ה־360° כוללים טעינה, המראה וטיסה ומסתיימים באוויר; מצב land הקיים משלים את הנחיתה ברצף ערבוב חיובי.

## שלד, מגע ומעברים

אותו schemaVersion:1, kind, skeleton וכל 18 העצמות של motion. כל פריים מכיל quaternion מנורמל xyzw מקומי מוחלט לכל עצם, hipsOffsetMeters ו־referenceRootTranslationMeters. צירים: +Y למעלה, +Z קדימה, +X שמאל אנטומי; מטרים. keyframes.time, contact.time וחלונות startTime/endTime מנורמלים ל־0..1; atSeconds ו־startSeconds/endSeconds מספקים גם שניות. interpolation זהה: shortest-arc slerp ו־smoothstep.

Root נשאר זהות; rootMotion=false. מסלול referenceRootTranslationMeters ואורך מחזור הם לבדיקות בלבד; סימולציית המשחק קובעת תזוזה ו־yaw. אין להוסיף את המסלול פעם נוספת למיקום הדמות. חלונות plant נועלים סוליה לעוגן; ski-slide מגביל גובה ומאפשר תנועת מגלש על השלג. אין plant בזמן זינוק או תעופה. בחיתוך ובנפילת צד הגוף מחליק במכוון; מגעי הגוף רשומים ב־groundContacts ואינם נעילת רגל.

ballContacts מכיל effector, נקודה מקומית, נקודת FK ומרכז כדור בזמן המגע. מגעי שתי ידיים חולקים אותו מרכז כדור. ballContactWindows, כשקיים, מתאר אחיזה ממושכת; דגימות המגע וה־trajectory הן המלצות חזותיות. כאשר אין מגע כדור או ציוד נפרד הוא מסומן במערך ריק/סיבת היעדרות. בסקי equipmentContacts מכסה קשירת מגף למגלש ואחיזת מקל לאורך הקליפ, ומגעי שלג/ניתור/נחיתה בזמנים מפורשים. בסקי גוף הדמות מבצע bank ו־counterbalance; מתאם ה־viewer הקיים משטח כפות רגליים נתמכות, ולכן ה־edge markers הם המלצה למתאם ציוד עתידי ואינם הוכחה לפיזיקת קנט.

events הם presentation בלבד: פעם אחת בחציית הסמן בכל מחזור, ללא שכפול ב־seek לאותו זמן או בגבול מחזור. אחיזה רציפה חוצה לולאה בלי ניתוק. בהשהיה הזמן קופא; reset או interrupt מבטל סמנים עתידיים. אין תוצאה, בעלות, ניקוד, פיזיקה או אישור פגיעה הנגזרים מזמן הקליפ.

כל המלצת מעבר מגדירה visualBlendSeconds חיובי, sourcePose=current-displayed, sourceContinuation=velocity-extrapolation, blendCurve=smoothstep, targetTime=0 ו־footLock=carry-until-release. שומרים את הפוזה והמהירות המוצגות בפועל, ממשיכים מקור ויעד, משמרים עוגן בעולם ופותרים IK אחרי ערבוב; בשחרור תמיכה משתמשים ברמפה חלקה. גם reset יורש את הערבוב החזותי של הבסיס. אין להחליף פוזה בנקודת מעבר. kick_charge מחזיק את פוזת הטעינה האחרונה עד action ל־kick או stopped/reset; הוא אינו נוגע בכדור. בלולאות היציאה דורשת אירוע מפורש. הקליפים מיועדים להצגה של משחקי ספורט; לא להדגמת בטיחות או אימון מקצועי.

## רשימת הקליפים וזמני המגע

הטבלה מציגה שניות. חלונות התמיכה והמגע המלאים, כולל תחילת/סוף אחיזה וקשר לציוד, נמצאים בכל קליפ ב־JSON.

| קליפ | משך שנ׳ | לולאה | כדור: שניות ועצם | סמני מגע ותנועה |
| --- | ---: | --- | --- | --- |
| soccer / `short_pass` | 0.86 | לא | 0.327 RightFoot | 0.327 visual_contact |
| soccer / `long_pass` | 1.3 | לא | 0.559 RightFoot | 0.559 visual_contact |
| soccer / `kick_charge` | 1 | לא | אין | חלונות מפורטים ב־JSON |
| soccer / `slide_tackle` | 1.45 | לא | 0.624 RightFoot | 0.290 visual_support_release; 0.624 visual_contact |
| soccer / `header` | 1.25 | לא | 0.650 Head | 0.263 visual_takeoff; 0.650 visual_contact; 1.000 visual_land |
| soccer / `dribble` | 0.92 | כן | 0.294 LeftFoot; 0.754 RightFoot | 0.294 visual_left_tap; 0.754 visual_right_tap |
| soccer / `chest_trap` | 1.05 | לא | 0.336 Chest | חלונות מפורטים ב־JSON |
| soccer / `keeper_dive_side_left` | 1.45 | לא | 0.725 LeftHand | 0.725 visual_glove_contact; 1.189 visual_side_land |
| soccer / `keeper_dive_corner_left` | 1.65 | לא | 0.825 RightHand | 0.825 visual_glove_contact; 1.353 visual_side_land |
| soccer / `keeper_dive_side_right` | 1.45 | לא | 0.725 RightHand | 0.725 visual_glove_contact; 1.189 visual_side_land |
| soccer / `keeper_dive_corner_right` | 1.65 | לא | 0.825 LeftHand | 0.825 visual_glove_contact; 1.353 visual_side_land |
| soccer / `keeper_punt` | 1.65 | לא | 0.297 LeftHand; 0.297 RightHand; 0.792 RightFoot | 0.297 visual_ball_release; 0.792 visual_contact |
| hoops / `dribble` | 0.9 | כן | 0.180 RightHand; 0.720 RightHand | חלונות מפורטים ב־JSON |
| hoops / `dribble_fast` | 0.5 | כן | 0.100 RightHand; 0.400 RightHand | חלונות מפורטים ב־JSON |
| hoops / `run_with_ball` | 0.72 | כן | 0.000 RightHand; 0.000 LeftHand; 0.360 RightHand; 0.360 LeftHand | 0.173 visual_left_foot_release; 0.533 visual_right_foot_release |
| hoops / `layup` | 1.18 | לא | 0.000 RightHand; 0.000 LeftHand; 0.425 RightHand; 0.425 LeftHand; 0.684 RightHand | 0.094 visual_left_foot_release; 0.307 visual_right_foot_release; 0.448 visual_takeoff; 0.448 visual_left_foot_release; 0.684 visual_ball_release; 1.015 visual_land |
| hoops / `dunk` | 1.34 | לא | 0.764 RightHand | 0.322 visual_takeoff; 0.322 visual_left_foot_release; 0.322 visual_right_foot_release; 0.764 visual_dunk_release; 1.139 visual_land |
| hoops / `block` | 1.02 | לא | 0.510 RightHand | 0.245 visual_takeoff; 0.245 visual_left_foot_release; 0.245 visual_right_foot_release; 0.867 visual_land |
| hoops / `rebound` | 1.14 | לא | 0.570 RightHand; 0.570 LeftHand; 0.969 RightHand; 0.969 LeftHand | 0.274 visual_takeoff; 0.274 visual_left_foot_release; 0.274 visual_right_foot_release; 0.969 visual_land |
| hoops / `jump_shot` | 1.16 | לא | 0.580 RightHand | 0.278 visual_takeoff; 0.278 visual_left_foot_release; 0.278 visual_right_foot_release; 0.580 visual_ball_release; 0.986 visual_land |
| hoops / `chest_pass` | 0.78 | לא | 0.406 RightHand; 0.406 LeftHand | 0.406 visual_chest_release |
| alpine / `tuck` | 1.6 | כן | אין | חלונות מפורטים ב־JSON |
| alpine / `turn_left_light` | 1.2 | לא | אין | 0.240 visual_edge_engage; 1.020 visual_edge_release |
| alpine / `turn_left_medium` | 1.4 | לא | אין | 0.280 visual_edge_engage; 1.190 visual_edge_release |
| alpine / `turn_left_hard` | 1.65 | לא | אין | 0.330 visual_edge_engage; 1.403 visual_edge_release |
| alpine / `turn_right_light` | 1.2 | לא | אין | 0.240 visual_edge_engage; 1.020 visual_edge_release |
| alpine / `turn_right_medium` | 1.4 | לא | אין | 0.280 visual_edge_engage; 1.190 visual_edge_release |
| alpine / `turn_right_hard` | 1.65 | לא | אין | 0.330 visual_edge_engage; 1.403 visual_edge_release |
| alpine / `small_hop` | 1.25 | לא | אין | 0.125 visual_takeoff; 1.250 visual_landing_ready |
| alpine / `trick_jump` | 2.1 | לא | אין | 0.210 visual_takeoff; 2.100 visual_landing_ready |
| alpine / `bad_landing` | 1.65 | לא | אין | 0.330 visual_left_ski_contact; 0.446 visual_right_ski_contact |
| alpine / `fall_side` | 1.35 | לא | אין | 0.203 visual_edge_catch; 0.931 visual_side_snow_contact |

## גבולות המסירה

זו חבילת נתוני תנועה ותצוגה, עם בדיקות על המודלים הקיימים; היא אינה חיבור למשחק חי. אין שינוי לטעינת נכסים במשחק, לוגיקה או תגי ?v=. בדיקת CPU בדפדפן אינה מדידת GPU או ביצועי טלפון. בדיקת ball FK אינה בדיקת התנגשות של כדור פיזיקלי. תוצאות viewer בוחנות skinning, IK ותיקון רצפה של מתאם הבסיס; הבדיקה הקנונית הנפרדת בוחנת גם את נתוני הסוליה והמפרקים לפני ההתאמה.
