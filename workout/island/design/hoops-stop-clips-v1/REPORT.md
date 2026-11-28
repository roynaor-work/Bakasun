# דוח: עצירות והחלקה הגנתית לכדורסל · v1

## הבעיה
במדידת החלקת רגל נטועה (`tools/hoops-v250-touch.mjs feet=1`) 43% מהפריימים עברו 0.6 מ'/ש: המנוע עצר שחקן מספרינט ל-0 תוך 0.37 שנ' בלי קליפ עצירה, וקליפ ההחלקה ההגנתית כיסה רק עד 2.2 מ'/ש.

## מה נוצר
עשרה GLB עצמאיים (שלד קנוני 18 עצמות, 30 הרץ, מטרים, Root קבוע, בלי Draco/Meshopt/WASM) ו-24 קליפים ב-`runtime/motions.json` (שיקופי ימין בלי GLB). ראו README. נכס הריצה: `workout/island/assets/hoops-stop-clips-v1/stop-clips.json` (כ-63KB).

## סיכום מדידות
| מדד | יעד | תוצאה |
|---|---|---|
| החלקת סוליה נטועה (240 הרץ, נתוני תנועה וגם ערוצי GLB) | עד 2 ס"מ | מרבי 1.27 ס"מ |
| קפיצת עצם בקצה הגשר, ערוצי GLB | עד 3 מעלות | 40/40 עברו, מרבי 0.000003 מעלות |
| צעד גשר מרבי ב-240 הרץ | (לא הוגדר) | 6.2 מעלות |
| אנטומיה (ברך, מרפק, ירך, רגליים, ידיים בגוף, רצפה) | תקינה | 0 כשלונות |
| חדירת סוליה לרצפה | עד 1.5 ס"מ (הוגדר בחבילה, הוחמר מ-0.5 בטעות ראשונה) | מרבי 1.2 ס"מ (עצירת ספרינט 9 מ'/ש) |

שלושה תיקונים בסבב הזה: סגירת לופ ההחלקה המהירה (הייתה 2.5 מעלות, יצרה קפיצת גשר של 167 מעלות), "שומר רצפה" לפריימי תנופה, ותנאי מגע אחרונים שהצביעו מרחוק מדי (רגל נבעטת אחורה, ירך עד מינוס 59 מעלות, עכשיו מינוס 15).

## בדיקה בדפדפן
8 פריימים מארבע זוויות לכל אחד מעשרת ה-GLB, Chromium עם swiftshader, ב-`verification/sheets`. נצפו בעין כולם: נחיתת רגליים קדימה וכריעה בעצירות, עמידה נמוכה ורחבה בהחלקה, פיבוט סביב רגל שמאל, חיתוך 70 מעלות. לא נצפתה תקלה גלויה. לא נבדק בטלפון.

## חיבור למנוע: מדידת החלקת רגל לפני ואחרי (hoops-v250-touch.mjs feet=1, 900 טיקים, seed 4242)
| | פריימים | ממוצע מ'/ש | p95 | אחוז מעל 0.6 מ'/ש |
|---|---:|---:|---:|---:|
| לפני (hoopsStopClips=0) | 6637 | 1.049 | 4.37 | 43.9% |
| אחרי (קליפים מופעלים) | 6420 | 1.368 | 5.54 | 48.7% |

**אין שיפור מדוד, יש החמרה קלה.** שמות הקליפים hoops_stop_* לא מופיעים בכלל בטבלת הקליפים שנוגנו, כלומר מצב העצירה לא הופעל במשחק האוטומטי (הוא דורש שחרור מוחלט של הסטיק ושחקן שרץ לכיוון המבט, בלי כדור). ההחלקה המהירה כן נוגנה והחלקה שלה גרועה (שמאל: ממוצע 3.29, 94.7% מעל הסף; ימין: 3.38, 90.7%), והספרינט והריצה החמירו (58.8% ו-86.3%). לכן הדגל כבוי כברירת מחדל (`?hoopsStopClips=1` מפעיל). מה שנשאר: להבין למה הרגל נטועה ב-GLB אך מחליקה בנגן (מהירות מנוע מול נתיב השורש של הקליפ, קצב `rate`), ולמה העצירה לא מופעלת.

## טבלאות מלאות
| קליפ | GLB | משך | כניסה מ׳/ש | חלונות | החלקה מרבית ס״מ | סטיית גובה ס״מ | ברך | מרפק | ירך | פער רגליים מ׳ | נטיית גו |
|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|
| stop_sprint_4p5 | לא | 0.65 | 4.5 | 3 | 0.078 | 0.32 | 36..111 | 40..106 | 22..71 | 0.20 | 22 |
| stop_sprint_5p5 | לא | 0.65 | 5.5 | 3 | 0.133 | 0.49 | 31..111 | 40..107 | 22..74 | 0.20 | 22 |
| stop_sprint_6p5 | לא | 0.65 | 6.5 | 3 | 0.206 | 0.71 | 25..111 | 40..108 | 22..76 | 0.20 | 22 |
| stop_sprint_7p5 | כן | 0.65 | 7.5 | 3 | 0.298 | 0.99 | 20..111 | 40..107 | 15..79 | 0.20 | 22 |
| stop_sprint_9 | לא | 0.65 | 9 | 3 | 0.485 | 1.57 | 20..113 | 40..108 | 5..83 | 0.20 | 22 |
| stop_run_3 | לא | 0.55 | 3 | 4 | 0.043 | 0.13 | 40..92 | 40..103 | 22..61 | 0.20 | 13 |
| stop_run_4 | לא | 0.55 | 4 | 4 | 0.065 | 0.23 | 35..96 | 40..106 | 22..64 | 0.20 | 13 |
| stop_run_5 | כן | 0.55 | 5 | 4 | 0.092 | 0.37 | 30..101 | 40..107 | 19..67 | 0.20 | 13 |
| stop_run_6 | לא | 0.55 | 6 | 4 | 0.149 | 0.54 | 24..105 | 40..107 | 12..70 | 0.20 | 13 |
| stop_jog_1p5 | לא | 0.50 | 1.5 | 3 | 0.005 | 0.03 | 50..77 | 40..100 | 22..39 | 0.18 | 8 |
| stop_jog_2 | לא | 0.50 | 2 | 3 | 0.009 | 0.06 | 50..78 | 40..102 | 22..40 | 0.19 | 8 |
| stop_jog_2p75 | כן | 0.50 | 2.75 | 3 | 0.017 | 0.10 | 50..81 | 40..104 | 22..44 | 0.19 | 8 |
| stop_jog_3p5 | לא | 0.50 | 3.5 | 3 | 0.032 | 0.17 | 50..85 | 40..106 | 21..47 | 0.19 | 8 |
| defensive_slide_fast_left | כן | 0.80 | 3.4 | 4 | 0.722 | 0.66 | 20..111 | 48..73 | 32..75 | 0.15 | 20 |
| defensive_slide_fast_right | כן | 0.80 | 3.4 | 4 | 0.722 | 0.66 | 20..111 | 48..73 | 32..75 | 0.15 | 20 |
| defensive_slide_recover_forward_left | כן | 0.50 | 3.4 | 3 | 1.273 | 0.71 | 20..122 | 51..108 | 2..89 | 0.09 | 20 |
| defensive_slide_recover_forward_right | לא | 0.50 | 3.4 | 3 | 1.273 | 0.71 | 20..122 | 51..108 | 2..89 | 0.09 | 20 |
| defensive_slide_recover_back_left | כן | 0.50 | 3.4 | 3 | 0.487 | 0.51 | 23..104 | 51..107 | -15..68 | 0.16 | 20 |
| defensive_slide_recover_back_right | לא | 0.50 | 3.4 | 3 | 0.487 | 0.51 | 23..104 | 51..107 | -15..68 | 0.16 | 20 |
| cut_plant_left | כן | 0.60 | 4.5 | 3 | 1.167 | 0.93 | 15..107 | 54..107 | 4..86 | 0.20 | 17 |
| cut_plant_right | לא | 0.60 | 4.5 | 3 | 1.167 | 0.93 | 15..107 | 54..107 | 4..86 | 0.20 | 17 |
| pivot_stop_left | כן | 0.80 | 3 | 4 | 0.115 | 0.12 | 44..95 | 40..107 | 16..56 | 0.17 | 11 |
| pivot_stop_right | לא | 0.80 | 3 | 4 | 0.115 | 0.12 | 44..95 | 40..107 | 16..56 | 0.17 | 11 |
| start_from_stand | כן | 0.90 |  | 6 | 0.132 | 0.53 | 17..95 | 40..106 | -25..74 | 0.20 | 20 |

| GLB | בתים | ציון החלקה ב־GLB ס״מ | פער סיבוב מול motions.json (מעלות) | SHA מתאים |
|---|---:|---:|---:|---|
| stop_sprint_7p5 | 776080 | 0.298 | 0.000004 | כן |
| stop_run_5 | 775104 | 0.092 | 0.000003 | כן |
| stop_jog_2p75 | 774368 | 0.017 | 0.000004 | כן |
| defensive_slide_fast_left | 777392 | 0.722 | 0.000004 | כן |
| defensive_slide_fast_right | 777416 | 0.722 | 0.000004 | כן |
| defensive_slide_recover_forward_left | 774408 | 1.273 | 0.000003 | כן |
| defensive_slide_recover_back_left | 774516 | 0.487 | 0.000004 | כן |
| cut_plant_left | 775404 | 1.167 | 0.000005 | כן |
| pivot_stop_left | 777404 | 0.115 | 0.000003 | כן |
| start_from_stand | 778256 | 0.132 | 0.000003 | כן |

| קליפ | כיוון | ייחוס | שלב | קפיצת עצם בקצה (מעלות) | צעד מרבי ב־240 הרץ (מעלות) | עבר |
|---|---|---|---|---:|---:|---|
| stop_sprint_7p5 | כניסה | run | catalog-zero | 0.000003 | 3.796 | כן |
| stop_sprint_7p5 | כניסה | run | interior | 0.000003 | 3.778 | כן |
| stop_sprint_7p5 | יציאה | idle_relaxed | catalog-zero | 0.000002 | 0.685 | כן |
| stop_sprint_7p5 | יציאה | idle_relaxed | interior | 0.000003 | 0.685 | כן |
| stop_run_5 | כניסה | run | catalog-zero | 0.000002 | 2.408 | כן |
| stop_run_5 | כניסה | run | interior | 0.000002 | 2.384 | כן |
| stop_run_5 | יציאה | idle_relaxed | catalog-zero | 0.000002 | 0.595 | כן |
| stop_run_5 | יציאה | idle_relaxed | interior | 0.000003 | 0.595 | כן |
| stop_jog_2p75 | כניסה | run | catalog-zero | 0.000003 | 2.199 | כן |
| stop_jog_2p75 | כניסה | run | interior | 0.000003 | 2.012 | כן |
| stop_jog_2p75 | יציאה | idle_relaxed | catalog-zero | 0.000002 | 0.519 | כן |
| stop_jog_2p75 | יציאה | idle_relaxed | interior | 0.000003 | 0.519 | כן |
| defensive_slide_fast_left | כניסה | idle_relaxed | catalog-zero | 0.000003 | 4.423 | כן |
| defensive_slide_fast_left | כניסה | idle_relaxed | interior | 0.000003 | 4.424 | כן |
| defensive_slide_fast_left | יציאה | idle_relaxed | catalog-zero | 0.000003 | 2.475 | כן |
| defensive_slide_fast_left | יציאה | idle_relaxed | interior | 0.000003 | 2.474 | כן |
| defensive_slide_fast_right | כניסה | idle_relaxed | catalog-zero | 0.000003 | 4.423 | כן |
| defensive_slide_fast_right | כניסה | idle_relaxed | interior | 0.000003 | 4.424 | כן |
| defensive_slide_fast_right | יציאה | idle_relaxed | catalog-zero | 0.000003 | 2.47 | כן |
| defensive_slide_fast_right | יציאה | idle_relaxed | interior | 0.000003 | 2.469 | כן |
| defensive_slide_recover_forward_left | כניסה | hoops_defensive_slide_fast_left | catalog-zero | 0.000003 | 4.19 | כן |
| defensive_slide_recover_forward_left | כניסה | hoops_defensive_slide_fast_left | interior | 0.000002 | 5.117 | כן |
| defensive_slide_recover_forward_left | יציאה | run | catalog-zero | 0.000002 | 6.19 | כן |
| defensive_slide_recover_forward_left | יציאה | run | interior | 0.000002 | 6.171 | כן |
| defensive_slide_recover_back_left | כניסה | hoops_defensive_slide_fast_left | catalog-zero | 0.000003 | 4.029 | כן |
| defensive_slide_recover_back_left | כניסה | hoops_defensive_slide_fast_left | interior | 0.000002 | 4.944 | כן |
| defensive_slide_recover_back_left | יציאה | run | catalog-zero | 0.000002 | 3.952 | כן |
| defensive_slide_recover_back_left | יציאה | run | interior | 0.000002 | 3.932 | כן |
| cut_plant_left | כניסה | run | catalog-zero | 0.000002 | 3.233 | כן |
| cut_plant_left | כניסה | run | interior | 0.000002 | 3.207 | כן |
| cut_plant_left | יציאה | run | catalog-zero | 0.000003 | 3.321 | כן |
| cut_plant_left | יציאה | run | interior | 0.000003 | 3.336 | כן |
| pivot_stop_left | כניסה | run | catalog-zero | 0.000002 | 2.167 | כן |
| pivot_stop_left | כניסה | run | interior | 0.000002 | 1.997 | כן |
| pivot_stop_left | יציאה | idle_relaxed | catalog-zero | 0.000000 | 0.51 | כן |
| pivot_stop_left | יציאה | idle_relaxed | interior | 0.000003 | 0.51 | כן |
| start_from_stand | כניסה | idle_relaxed | catalog-zero | 0.000002 | 0.519 | כן |
| start_from_stand | כניסה | idle_relaxed | interior | 0.000003 | 0.519 | כן |
| start_from_stand | יציאה | run | catalog-zero | 0.000003 | 5.086 | כן |
| start_from_stand | יציאה | run | interior | 0.000003 | 5.107 | כן |

