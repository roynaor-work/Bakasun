# האי שלי · קליפי סקי נוספים

18 קליפים מקוריים, 1,649 פוזות מלאות, CC0-1.0. בסיס: `main` בקומיט `3853d282b6dd7719db49a864fec4286dc7b63cb0`. כל תוספות החבילה נמצאות בתיקייה הזו.

[alpine.json](alpine.json) משתמש באותה מעטפת ובאותו פורמט פוזה של [חבילת המקור](../../motion/alpine.json): שלד קנוני זהה של 18 עצמות, quaternion מקומי מוחלט `[x,y,z,w]`, היסט אגן במטרים, זמנים מנורמלים, `rootMotion: false`, ו־smoothstep עם slerp בקשת הקצרה. המיפוי ל־20 עצמות [rig.json](../../characters/rig.json) נשאר של הצופה המקורי. תרגום וכיוון בעולם נשלטים בסימולציה.

## הקליפים

| קליפ | פעולה | משך בשניות | סמני presentation בשניות |
| --- | --- | ---: | --- |
| `tuck` | כריעת מהירות | 1.20 · לולאה | `tuck_settled` 0.096 |
| `sharp_turn_left` | פנייה חדה שמאלה | 0.82 | `edge_engage_left` 0.148, `pole_touch_left` 0.197, `carve_apex_left` 0.394, `edge_release` 0.672 |
| `sharp_turn_right` | פנייה חדה ימינה | 0.82 | `edge_engage_right` 0.148, `pole_touch_right` 0.197, `carve_apex_right` 0.394, `edge_release` 0.672 |
| `brake` | בלימה | 1.15 | `brake_scrape_begin` 0.230, `brake_load_peak` 0.575, `brake_settled` 1.035 |
| `air_grab` | גרב באוויר | 1.10 | `grab_contact` 0.275, `pole_strap_support` 0.275, `grab_release` 0.682, `pole_regrip` 0.682, `landing_ready` 0.924 |
| `air_spin_180` | סיבוב 180° | 1.15 | `spin_begin` 0.172, `spin_midpoint` 0.575, `spin_complete` 0.978, `landing_ready` 1.093 |
| `air_spin_360` | סיבוב 360° | 1.50 | `spin_begin` 0.225, `spin_midpoint` 0.750, `spin_complete` 1.275, `landing_ready` 1.425 |
| `air_easy_flip` | פליפ קדמי קל | 1.80 | `flip_begin` 0.216, `flip_inverted` 0.900, `flip_complete` 1.584, `landing_ready` 1.710 |
| `land_perfect` | נחיתה מושלמת | 0.85 | `ski_contact` 0.102, `landing_absorb` 0.400, `landing_clean` 0.637 |
| `land_bad_recover` | נחיתה גרועה והתאוששות | 1.65 | `ski_contact_right` 0.297, `ski_contact_left` 0.429, `landing_stumble` 0.528, `recovery_pole_contact` 0.775, `balance_regained` 1.073, `recovery_complete` 1.419 |
| `fall_forward` | נפילה קדימה | 1.10 | `ski_support_lost` 0.132, `body_snow_contact` 0.792, `fall_settled` 0.990 |
| `recover_forward` | קימה מנפילה קדימה | 1.90 | `recovery_begin` 0.342, `recovery_pole_contact` 0.380, `knees_under_hips` 0.855, `ski_support_regained` 1.216, `recovery_complete` 1.672 |
| `fall_backward` | נפילה אחורה | 1.10 | `ski_support_lost` 0.132, `body_snow_contact` 0.792, `fall_settled` 0.990 |
| `recover_backward` | קימה מנפילה אחורה | 1.90 | `recovery_begin` 0.342, `recovery_pole_contact` 0.380, `knees_under_hips` 0.855, `ski_support_regained` 1.216, `recovery_complete` 1.672 |
| `fall_side` | נפילה לצד | 1.10 | `ski_support_lost` 0.132, `body_snow_contact` 0.792, `fall_settled` 0.990 |
| `recover_side` | קימה מנפילה לצד | 1.90 | `recovery_begin` 0.342, `recovery_pole_contact` 0.380, `knees_under_hips` 0.855, `ski_support_regained` 1.216, `recovery_complete` 1.672 |
| `finish_celebrate` | חגיגת סיום | 2.40 | `finish_arms_up` 0.528, `finish_salute` 1.056, `celebration_settled` 2.040 |
| `start_gate` | פתיחה במסדרון הזינוק | 2.15 | `gate_ready` 0.430, `pole_contact` 0.903, `gate_push` 1.247, `pole_release` 1.505, `gate_clear` 1.677 |

בגרב, היד השמאלית מגיעה לשפת המגלש בין 0.275 ל־0.682 שניות. המקל נשמר ברצועת פרק היד בזמן האחיזה, והיד חוזרת לאחוז בו בשחרור. נקודת האחיזה כוילה גם בשלד הגולש הממשי, מעבר לשלד הקנוני. בנחיתה הגרועה ימין נוגע לפני שמאל, ולאחר שני תיקוני שיווי משקל הגוף חוזר לגלישה. לכל נפילה יש קימה נפרדת שמתחילה באותה פוזה בדיוק.

## מגעים ואירועים

| שדה | פירוש |
| --- | --- |
| `events` | `time` מנורמל ו־`atSeconds` בשניות; `channel: presentation`, `authoritative: false`. אין הפעלת פיזיקה או ניקוד מזמן הקליפ. |
| `equipmentContacts` | מגע, שחרור או אחיזה של מגלשיים ומקלות. בגרב יש חלון החזקה ונקודות מקומיות בשלד המקור ובשלד היעד. |
| `groundContacts` | חלונות המגע בשלג של מגלשיים, קצות מקלות ואיברי גוף בנפילה ובקימה. |
| `supportContacts` | חלונות נשיאת עומס של כפות הרגליים במצב `ski-slide`; הסבילות המקורית היא 2 ס״מ, והצופה רוכש ומשחרר תמיכה לאורך 0.06 שניות. |
| `attachmentContacts` | חיבור המגפיים למגלשיים ואחיזת המקלות או רצועתם לאורך הקליפ. |

כל חלון משתמש ב־`startTime`/`endTime` מנורמלים. חלונות ריקים באוויר מציינים שאין תמיכת קרקע. בנחיתה המושלמת המגע בשלג מתחיל ב־0.102 שניות, ונשיאת העומס המלאה מתחילה ב־0.272 שניות, אחרי תחילת הספיגה. כך גם קטיעת ערבוב במהלך רכישת תמיכה נבדקת ללא קפיצת סוליה.

הצופה הקיים מפעיל IK לתמיכות כפות רגליים ומשטח את הסוליות. מגעי יד־מגלש, קצות מקלות ותמיכות גוף הם נתוני presentation; אין בו פותר אילוצים נוסף עבורם. בדיקת האחיזה הנוספת מודדת את היד מול נקודת המגלש לאורך כל חלון ההחזקה.

## המלצות מעבר

רשומות `transitions` כוללות כניסה ויציאה מכל קליפ, ערבוב 0.22–0.28 שניות, `sourcePose: current-displayed`, המשך מהירות המקור ו־`footLock: carry-until-release`. נדרשת שמירת הפוזה המוצגת כשמעבר נקטע.

| רצף | המלצה |
| --- | --- |
| פתיחה | `idle → start_gate → glide` |
| מהירות ושליטה | `glide → tuck`; שחרור הכריעה חוזר ל־`glide`. פניות חדות חוזרות לגלישה; בלימה מסתיימת ב־`idle`. |
| טריק | `air → air_grab / air_spin_180 / air_spin_360 / air_easy_flip → land_perfect → glide` |
| נחיתה גרועה | `air → land_bad_recover → glide`; לבחור לפי תוצאת הנחיתה בסימולציה. |
| נפילה וקימה | `glide → fall_<direction> → recover_<direction> → idle`; אירוע `moving` המקורי מחזיר לגלישה. |
| סיום | `idle → finish_celebrate → idle` |

בסיבוב 180° הפוזה מסתיימת בחצי סיבוב אמיתי. שדה `headingHandoff` במעבר מסביר את החיבור: בעת השלמת הקליפ יש לשמר את הפוזה העולמית ולחשב את Hips המקומי מול כיוון הדמות העדכני שהסימולציה מספקת. אם הכיוון העולמי התקדם בחצי סיבוב, מסירים את אותו חצי סיבוב מהערוץ המקומי לפני הערבוב. כך הכיוון אינו מוחזר לאפס ואינו נספר פעמיים. זהו חוזה לחיבור עתידי; הסמנים עצמם אינם מסובבים את הסימולציה. בדיקת הצופה מפעילה את הערבובים המקומיים הקיימים, ואינה בדיקת חיבור של כיוון העולם במשחק.

## טעינה ובדיקה

יש להוסיף את `states` לפי שם ייחודי לחבילת alpine המקורית, לצרף את ההמלצות לפני מעברי wildcard, ולאחד את `eventInputs`. משאירים את מצב הפתיחה של המשחק; אפשר לבחור `start_gate` לפתיח. [manifest.json](manifest.json) מתעד את קובצי הייחוס וה־SHA-256 שלהם.

סקריפט הבדיקה יוצר עותק זמני, משלב בו את הנתונים, ומריץ את **אותו** [test-viewer.mjs](../../viewer/test-viewer.mjs), ללא שינוי בבתי המקור או בספים. הבודק עובר על כל 18 הקליפים החדשים וגם על 12 קליפי הבסיס, כולל כל ההמלצות החדשות ומעברי wildcard קיימים, עם דמות `skier` ובשני גדלי חלון. אין כתיבה לתיקיות המקור.

בדיקת נכסים ללא דפדפן:

```sh
node workout/island/design/motion2/alpine/verify.mjs --assets-only
```

בדיקה מלאה, עם Playwright ודפדפן מותקנים; אפשר להשמיט את משתני הסביבה כשהם מאותרים אוטומטית:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium node workout/island/design/motion2/alpine/verify.mjs --keep-stage
```

הדוח נכתב ל־[verification/report.json](verification/report.json), ולצדו [summary.json](verification/summary.json) עם תוצאות לכל קליפ, בדיקות זוויות מצטברות והאחיזה, וחותמות של קובצי הצופה הזהים. כשל מחזיר קוד יציאה 1. [VALIDATION.md](VALIDATION.md) מרכז את המדדים ואת תוצאות הרגרסיה.

לצפייה אינטראקטיבית אחרי הרצה עם `--keep-stage`, מפעילים את הסקריפט המקורי מתוך הנתיב הזמני שהודפס:

```sh
node <STAGE>/design/viewer/test-viewer.mjs --serve
```

פותחים את כתובת localhost שהודפסה, בוחרים `skier`, חבילת `alpine` וקליפ מהרשימה. [גיליון 1](verification/clips-1.webp) ו־[גיליון 2](verification/clips-2.webp) מציגים 0%, 25%, 50%, 75% ו־100% מכל קליפ. שני צילומי המסך ששמם מתחיל `skier-alpine` הם פלט הבודק המקורי, המציג את `pole_push`.

## מקור ורישיון

פוזות המקור של החיבורים הן של החבילה הקיימת; שלבי התנועה החדשים חוברו עם קינמטיקה אנליטית ואחיזה מכוילת לשלד היעד. אין קטעי motion capture חיצוניים. הנתונים החדשים משוחררים ב־CC0-1.0, כמו חבילת המקור.
