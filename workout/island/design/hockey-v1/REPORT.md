# נכסי הוקי קרח על שלד השחקנים המאוחד

תאריך: 12/11/2026. בסיס: `claude/unified-athletes-v1`, קומיט `34c9dee36497f0a242975c12004a3450259ddf03`. כל התוספות נמצאות ב־`workout/island/design/hockey-v1/`.

## מצב המסירה

**טיוטה שאינה מוכנה לחיבור למשחק. רף התחושה המחייב טרם הושלם: 15 מתוך 30 קליפים מתחת ל־88. הציון הנמוך הוא 63.5.**

קיימים גוף שחקן, גוף שוער ומקל נפרד, 30 קליפים עם 1920 פריימי מפתח, וגיליון שמונה רגעים לכל קליפ. סדר העצמות ומנוחתן זהים לשלד הקנוני. כל 14 קליפי התנועה עברו את ATHLETE_STANDARD באמצעות המדדים המקוריים. אין שינוי בקוד המשחק, בגרסה, ב־ops או בבדיקות הקיימות.

הפער אינו מוסתר באמצעות שינוי ספים, קיצור מלאכותי של חלונות מגע או הסרת מדדים מהציון. התוצאות הגולמיות נשמרות גם כאשר להב שנע לאורך הקרח מקבל ציון נמוך במדד המניח סוליה נטועה. אין להסיק מכך שכל כשל הוא כשל בכלי: יש לבדוק גם רציפות, אנטומיה ומגע, כמפורט בכל קליפ.

## צפייה

[תצוגה אינטראקטיבית](preview.html) מציגה את קובצי GLB עצמם, עם בחירת תנועה, עצירה, דגימת זמן, מבט, צבעי קבוצה ועמידת מנוחה. [שחקן משלוש זוויות](preview/skater.png), [שוער משלוש זוויות](preview/goalie.png), [תמונת הגלריה](preview/gallery.png).

להצגה מקומית, משורש המאגר:

```sh
python3 -m http.server 8765
```

לאחר מכן פותחים [את דף התצוגה המקומי](http://localhost:8765/workout/island/design/hockey-v1/preview.html). הקישורים לגיליונות מופיעים בדף ובטבלה להלן.

## גופים וציוד

| קובץ | משולשים | קודקודים | בתים |
|---|---:|---:|---:|
| models/skater.glb | 5,095 | 2,906 | 1,015,100 |
| models/goalie.glb | 6,211 | 3,560 | 1,076,208 |
| models/stick.glb | 368 | 214 | 19,236 |

שני הגופים בגובה 1.85 מטר, כולל הקסדה והלהב, ומכילים skin עם 18 עצמות בסדר CANON_BONES. מנוחת העצמות, צירי הסיבוב ומטריצות הקשירה נבדקו מול athletes-core.mjs. אין Draco, משאבים חיצוניים או עצמות עזר בתוך skin. השוער כולל מסכת הגנה, רפידות שוק וירך, כפפה ומחסום יד ימין.

צבעי הקבוצה נמצאים ב־COLOR_0 לפי האזורים `uniform_primary`, `uniform_secondary`, `uniform_trim`, כולל הקסדה. שמות החומרים ו־primitive.extras.region מזהים את האזור; חומר הבסיס לבן כדי לא להכפיל גוון. דף התצוגה מדגים החלפת צבעי קודקודים בין שתי קבוצות. אין חיבור אוטומטי ל־applyKit של משחק קיים.

המקל הוא GLB נפרד. נקודות החיבור הן `RightHandGrip` ו־`BladePoint`; הטרנספורמציה ליד מתועדת ב־clips.json. זרועות הפעולה מכוילות לאחיזה, ושינוי גובה הלהב בקליעת סלאפ ובחגיגה הוא מכוון. הקליפים מספקים אירועי תצוגה בלבד; אין כאן החלטות פיזיקה או תוצאת קליעה.

## חוזה התנועות

`schemaVersion: 1`, `fps: 30`, `states` במבנה soccer-v9, `rotations` מלא לכל 18 העצמות ו־`hipsOffsetMeters` בכל פריים. זמן keyframe מנורמל ל־0–1; supports ו־events.timeSeconds נמדדים בשניות. לכל קליפ loop מפורש ואירוע אחיזה במקל, ולפעולות הרלוונטיות אירועי מגע ושחרור. ה־supports הם מגע להב על הקרח, עם `contact: blade` ו־`allowSlide: true`.

הקליפים נוצרו במקום. מסלול referenceRootTranslationMeters מתאר תרחיש מחבר לצורך מדידה, כולל קשתות פנייה והאטה בבלימה. הוא אינו משנה את תנועת השחקן במשחק ואינו תחליף לבקר המהירות ולמערבל שיחוברו בהמשך. אין לנעול מגע להב כמיקום רגל נטועה.

## מדידת התחושה

הכלי המבוקש אינו כלול בענף הבסיס. נשאבה גרסה נעולה של [PR 371](https://github.com/roynaor-work/Bakasun/pull/371), קומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`, לתיקייה זמנית. run.mjs והנוסחאות ב־metrics.mjs נותרו ללא שינוי. loader מחליף רק את sources.mjs כדי לספק את ספריית ההוקי במקום רשימת הספריות הקבועה. הציונים מהרצת CLI המקורית הושוו למדידה ישירה ונמצאו זהים. חתימות הקוד והפקודות נמצאות ב־[ראיית מקור הכלי](qa-tool-provenance.json).

footSliding מחשב כל תנועה אופקית בחלון תמיכה כהחלקת סוליה. bodySliding משווה מהירות גוף לסריקת רגל לאחור. שני המדדים אינם מפרשים מגע להב או גלישה חופשית. הם נשארו בציון הגולמי. מדידת גובה להב ומהירות לאורך ולרוחב הלהב מופיעה בנפרד ואינה ציון חלופי. כל מסלולי ההחלקה נכללו במדידה; לא הוכרזו כפעולה נייחת כדי להימנע מהמדדים.

[דוח CLI גולמי](evidence/codex-qa/report.json) · [מדידה מלאה לפי קליפ](evidence/motion-measurements.json) · [התאמה בין CLI ל־API](evidence/codex-qa-run.json).

| תנועה | מזהה | ציון גולמי | רף 88 | גיליון |
|---|---|---:|---|---|
| דחיפה רגועה | `skate_push_slow` | 68.7 | לא עבר | [8 פריימים](sheets/skate_push_slow.png) |
| דחיפה בקצב בינוני | `skate_push_medium` | 67.6 | לא עבר | [8 פריימים](sheets/skate_push_medium.png) |
| דחיפה מהירה | `skate_push_fast` | 66.2 | לא עבר | [8 פריימים](sheets/skate_push_fast.png) |
| גלישה | `skate_glide` | 67.9 | לא עבר | [8 פריימים](sheets/skate_glide.png) |
| חצייה שמאלה | `skate_crossover_left` | 65.6 | לא עבר | [8 פריימים](sheets/skate_crossover_left.png) |
| חצייה ימינה | `skate_crossover_right` | 65.6 | לא עבר | [8 פריימים](sheets/skate_crossover_right.png) |
| בלימה לשמאל | `skate_stop_left` | 63.9 | לא עבר | [8 פריימים](sheets/skate_stop_left.png) |
| בלימה לימין | `skate_stop_right` | 64.3 | לא עבר | [8 פריימים](sheets/skate_stop_right.png) |
| פנייה של 45 מעלות | `skate_turn_45` | 66.8 | לא עבר | [8 פריימים](sheets/skate_turn_45.png) |
| פנייה של 90 מעלות | `skate_turn_90` | 64.8 | לא עבר | [8 פריימים](sheets/skate_turn_90.png) |
| פנייה של 180 מעלות | `skate_turn_180` | 63.5 | לא עבר | [8 פריימים](sheets/skate_turn_180.png) |
| החלקה אחורה | `skate_backward` | 68.2 | לא עבר | [8 פריימים](sheets/skate_backward.png) |
| מוכנות נמוכה | `ready_1` | 99.7 | עבר | [8 פריימים](sheets/ready_1.png) |
| מוכנות עם מבט לצדדים | `ready_2` | 99.6 | עבר | [8 פריימים](sheets/ready_2.png) |
| מוכנות עם העברת משקל | `ready_3` | 99.9 | עבר | [8 פריימים](sheets/ready_3.png) |
| קליעת פרק יד | `shot_wrist` | 89.7 | עבר | [8 פריימים](sheets/shot_wrist.png) |
| קליעת סלאפ | `shot_slap` | 90.1 | עבר | [8 פריימים](sheets/shot_slap.png) |
| מסירה | `pass` | 90.1 | עבר | [8 פריימים](sheets/pass.png) |
| קבלת מסירה | `receive` | 98.2 | עבר | [8 פריימים](sheets/receive.png) |
| מפגש כתף מבוקר | `body_check` | 98.6 | עבר | [8 פריימים](sheets/body_check.png) |
| עמידת שוער | `goalie_stance` | 99.9 | עבר | [8 פריימים](sheets/goalie_stance.png) |
| נפילה לפרפר | `goalie_butterfly` | 98.5 | עבר | [8 פריימים](sheets/goalie_butterfly.png) |
| החלקת שוער שמאלה | `goalie_slide_left` | 67.6 | לא עבר | [8 פריימים](sheets/goalie_slide_left.png) |
| החלקת שוער ימינה | `goalie_slide_right` | 67.6 | לא עבר | [8 פריימים](sheets/goalie_slide_right.png) |
| עצירה עם כפפה גבוהה | `goalie_glove_high` | 98.3 | עבר | [8 פריימים](sheets/goalie_glove_high.png) |
| עצירה עם כפפה נמוכה | `goalie_glove_low` | 95.8 | עבר | [8 פריימים](sheets/goalie_glove_low.png) |
| עצירה עם מקל | `goalie_stick_save` | 98.6 | עבר | [8 פריימים](sheets/goalie_stick_save.png) |
| חגיגה עם אגרוף | `celebrate_1` | 95.4 | עבר | [8 פריימים](sheets/celebrate_1.png) |
| חגיגה עם הרמת מקל | `celebrate_2` | 95 | עבר | [8 פריימים](sheets/celebrate_2.png) |
| חגיגה עם סיבוב על הקרח | `celebrate_3` | 72.1 | לא עבר | [8 פריימים](sheets/celebrate_3.png) |

## זרועות וגו

measure.mjs המקורי מקבל תיקיית פלט בלבד ומודד את הספריות הקיימות, ולכן אינו יודע לטעון את clips.json החדש. הוא הורץ ללא שינוי ל־evidence/canonical-baseline/ והחזיר `planned fails []`. בנוסף נמדדו קליפי ההוקי באמצעות gaitMetrics ו־checkGait/checkStand המקוריים, ב־120 דגימות למחזור, ללא שינוי התקן. זו מדידת ההוקי בפועל; היא נפרדת מהרצת קו הבסיס.

| תנועה | רמת התקן | פיסוק זרוע מרבי ° | נדנוד ° | מרפק פנימי ממוצע ° | נטייה ° | תוצאה |
|---|---|---:|---:|---:|---:|---|
| דחיפה רגועה | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| דחיפה בקצב בינוני | jog | 8.4 | 64.4 | 70.0 | 8.8 | עבר |
| דחיפה מהירה | sprint | 7.7 | 84.5 | 70.0 | 11.8 | עבר |
| גלישה | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| חצייה שמאלה | run | 10.8 | 76.8 | 70.0 | 10.8 | עבר |
| חצייה ימינה | run | 10.8 | 76.8 | 70.0 | 10.8 | עבר |
| בלימה לשמאל | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| בלימה לימין | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| פנייה של 45 מעלות | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| פנייה של 90 מעלות | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| פנייה של 180 מעלות | walk | 8.6 | 48.3 | 70.0 | 7.3 | עבר |
| החלקה אחורה | jog | 8.4 | 64.4 | 70.0 | 8.8 | עבר |
| החלקת שוער שמאלה | walk | 8.0 | 48.3 | 70.0 | 9.8 | עבר |
| החלקת שוער ימינה | walk | 8.0 | 48.3 | 70.0 | 9.8 | עבר |

פיסוק מותר עד 24°, מרפק פנימי ממוצע 40–100°, נדנוד לפחות 40/55/65/70° ונטייה לפחות 0/3/6/9° לפי walk/jog/run/sprint. נתוני המינימום והאבחון המלאים נמצאים בקובץ המדידה. תנועות פעולה נשמרות בנפרד ואינן מחויבות לנדנוד של הליכה בזמן אחיזה בשתי ידיים.

## ראיות אימות

| בדיקה | תוצאה | ראיה |
|---|---|---|
| מבנה GLB, שלד, קשירה, צבעים, קווטרניונים, קצב, כיסוי ולולאות | עבר, 6174 בדיקות נתונים | [validation.json](evidence/validation.json) |
| Khronos glTF Validator | 0 שגיאות, 0 אזהרות | [gltf-validation.json](evidence/gltf-validation.json) |
| קודקודי גוף מעל מישור הקרח, סבילות 5 מ״מ | עבר, 0 קליפים חורגים | [mesh-contact.json](evidence/mesh-contact.json) |
| קודקודי המקל מעל מישור הקרח, סבילות 5 מ״מ | עבר, 0 קליפים חורגים | [mesh-contact.json](evidence/mesh-contact.json) |
| טעינת שני הגופים והמקל בדפדפן אמיתי | 0 שגיאות, 30 גיליונות | [browser-evidence.json](preview/browser-evidence.json) |
| בדיקת השלד המאוחד המבוקשת | 11 עברו, 0 נכשלו | [הרצה ממוקדת](evidence/unified-athletes-tests.log) |
| כלל בדיקות המאגר | לא התקבל סיכום; נשמר צילום מצב עם כשל קיים אחד לפחות | [רישום ההרצה](evidence/repository-tests.log), [מצב הריצה](evidence/repository-tests-status.json) |

בריצה הרחבה נמצא כשל קיים בבדיקת סיווג מכשיר: tests/island-perf-v16.test.mjs מצפה ל־mid בהיעדר נתוני חומרה, והקוד מחזיר low. הוא משתחזר גם בהרצת אותו קובץ לבדו: 4 עברו, 1 נכשל. קובץ הבדיקה ו־device-tier.mjs זהים בבתים לקומיט הבסיס, כפי שמראה [השוואת המקור](evidence/baseline-perf-provenance.json); [פלט השחזור](evidence/baseline-perf-tests.log) מצורף. הקבצים לא שונו במסגרת משימת הנכסים.

בדיקת המגע מפעילה skinning של כל קודקודי המשולשים המצוירים ב־60 הרץ, כולל הרפידות והמקל. היא אינה בדיקת התנגשויות בין חלקי הגוף. גיליונות הדפדפן מציגים את הרשתות והציוד בפועל; גיליונות השלד של QA נשמרים גם הם לצורך השוואה. לא בוצעה בדיקת טלפון, ולא נבדק חיבור למערבל משחק ההוקי שטרם נבנה.

## הפקה חוזרת

נדרשים Python עם numpy, Node, GitHub CLI עם גישה למאגר לצורך הורדת כלי QA הנעול, ולצילומים Playwright ו־Chromium. אין תלות בהתקנת חבילות בזמן הרצת המשחק. פקודות משורש המאגר:

```sh
python3 workout/island/design/hockey-v1/source/build-models.py
node workout/island/design/hockey-v1/source/build-clips.mjs
node workout/island/design/hockey-v1/source/validate.mjs
node workout/island/design/hockey-v1/source/qa-adapter-run.mjs
node workout/island/design/hockey-v1/source/mesh-contact-audit.mjs
node workout/island/design/hockey-v1/source/render-sheets.mjs
node --test tests/island-athletes-unified.test.mjs
```

אימות Khronos דורש חבילת gltf-validator חיצונית, הנבחרת באמצעות HOCKEY_GLTF_VALIDATOR. אין העתקה של הספרייה לתוצר. source/validate-gltf.mjs שומר את דוח הבודק. קו הבסיס ניתן לשחזור בפקודה:

```sh
node workout/island/tools/athletes/measure.mjs workout/island/design/hockey-v1/evidence/canonical-baseline/
```

לאחר סיום כל ההרצות מעדכנים את הדוח והמניפסט:

```sh
node workout/island/design/hockey-v1/source/build-report.mjs
node workout/island/design/hockey-v1/source/build-manifest.mjs
```

## רישיון וחתימות

[LICENSES.md](LICENSES.md) מפרט את מקור CC0 של הגוף ואת היצירה המקורית של הציוד, התנועות, הקוד והתוצרים. [manifest.json](manifest.json) כולל רישיון, מקור, גודל ו־SHA-256 לכל קובץ אחר בתיקייה. SHA-256 של המניפסט עצמו מפורסם בתיאור ה־PR, כדי להימנע מחתימה שתלויה בעצמה.

המשך נדרש לפני חיבור: הכרעה ברמת כלי התנועה המשותף כיצד למדוד מגע להב נע, ולאחריה הרצה חוזרת ואימות שכל קליפ מגיע ל־88. הדוח הנוכחי אינו מעניק חריגה או אישור לרף זה.
