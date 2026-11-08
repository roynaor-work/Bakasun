# דוח מדידת תנועה

נוצר: 2026-11-08T08:43:52.724Z. 549 קליפים/פרופילים, 60 דגימות לשנייה וגם זמני מפתח ומגע מדויקים. זמן הרצה 9.83 שניות.

הרצה אחת משורש המאגר:

```sh
node workout/island/design/motion-qa-v1/run.mjs
```

[לוח הדוח הממוין](output/report.html) · [תצוגה והשוואה](preview.html) · [נוסחאות, ספים והפעלה](README.md) · [רישיונות ומקור לכל קובץ](LICENSES.md).

## סיכום ספריות

| ספרייה | קליפים | ציון ממוצע | ציון נמוך | מדדים אדומים | מדדים ללא נתונים |
|---|---:|---:|---:|---:|---:|
| soccer-v8 | 25 | 93.34 | 88.9 | 1 | 27 |
| soccer-v9 | 48 | 91.15 | 65 | 10 | 61 |
| soccer-v10 | 30 | 84.88 | 70.6 | 17 | 43 |
| hoops-v8 | 15 | 88.19 | 72.9 | 3 | 16 |
| hoops-v9 | 83 | 87.55 | 70.8 | 49 | 116 |
| hoops-v10 | 54 | 77.75 | 59.8 | 89 | 75 |
| hoops-tall-v1 | 294 | 69.88 | 49.8 | 347 | 546 |

## 20 הקליפים הגרועים

הציון הוא מדד אבחוני משוקלל, אינו ציון תפיסה אנושי. יש לקרוא את הכיסוי ואת הראיות לצד הדירוג.

| דירוג | ספרייה / קליפ | ציון | הסיבות |
|---:|---|---:|---|
| 1 | hoops-tall-v1 / center/v9/cut_180_right_ball | 49.8 | החלקת רגליים: תזוזת סוליה 0.189 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.9805 (אדום); קפיצות פוזה: LeftFoot בזמן 1.15 ש׳; קפיצת סיבוב שקולה 10.7424 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1277 (אדום) |
| 2 | hoops-tall-v1 / center/v9/cut_180_left_ball | 50.1 | החלקת רגליים: תזוזת סוליה 0.1893 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.9812 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 10.546 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1002 (אדום) |
| 3 | hoops-tall-v1 / center/v9/cut_135_left_ball | 50.4 | החלקת רגליים: תזוזת סוליה 0.1892 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.6377 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1008 (אדום) |
| 4 | hoops-tall-v1 / center/v9/cut_135_right_ball | 50.6 | החלקת רגליים: תזוזת סוליה 0.189 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.1191 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 10.2073 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1229 (אדום) |
| 5 | hoops-tall-v1 / center/v9/brake_ball | 51.1 | החלקת רגליים: תזוזת סוליה 0.3034 מ׳, LeftFoot, בזמן 0.28 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); קפיצות פוזה: RightFoot בזמן 0.1667 ש׳; קפיצת סיבוב שקולה 21.9523 מעלות ב־60Hz (אדום); כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 2.6918 (צהוב) |
| 6 | hoops-tall-v1 / wing/v9/brake_ball | 51.1 | החלקת רגליים: תזוזת סוליה 0.2458 מ׳, LeftFoot, בזמן 0.28 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); קפיצות פוזה: RightFoot בזמן 0.1667 ש׳; קפיצת סיבוב שקולה 21.9523 מעלות ב־60Hz (אדום); כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 2.6755 (צהוב) |
| 7 | hoops-tall-v1 / center/v9/cut_90_left_ball | 51.8 | החלקת רגליים: תזוזת סוליה 0.1892 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 7.0817 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1021 (אדום) |
| 8 | hoops-tall-v1 / guard/v9/brake_ball | 51.8 | החלקת רגליים: תזוזת סוליה 0.1882 מ׳, LeftFoot, בזמן 0.28 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); קפיצות פוזה: RightFoot בזמן 0.1667 ש׳; קפיצת סיבוב שקולה 21.9523 מעלות ב־60Hz (אדום); כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 2.6437 (צהוב) |
| 9 | hoops-tall-v1 / wing/v9/cut_180_right_ball | 51.9 | החלקת רגליים: תזוזת סוליה 0.1533 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.6688 (אדום); קפיצות פוזה: LeftFoot בזמן 1.15 ש׳; קפיצת סיבוב שקולה 10.7424 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1277 (אדום) |
| 10 | hoops-tall-v1 / wing/v9/cut_180_left_ball | 52.3 | החלקת רגליים: תזוזת סוליה 0.1535 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.6695 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 10.546 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1002 (אדום) |
| 11 | hoops-tall-v1 / center/v9/cut_90_right_ball | 52.5 | החלקת רגליים: תזוזת סוליה 0.1889 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 6.1539 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1176 (אדום) |
| 12 | hoops-tall-v1 / wing/v9/cut_135_left_ball | 52.5 | החלקת רגליים: תזוזת סוליה 0.1535 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.3532 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1008 (אדום) |
| 13 | hoops-tall-v1 / wing/v9/cut_135_right_ball | 52.8 | החלקת רגליים: תזוזת סוליה 0.1532 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 7.8274 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 10.2073 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1229 (אדום) |
| 14 | hoops-tall-v1 / wing/v9/cut_90_left_ball | 53.9 | החלקת רגליים: תזוזת סוליה 0.1535 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 6.8697 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1021 (אדום) |
| 15 | hoops-tall-v1 / center/v9/cut_45_left_ball | 54 | החלקת רגליים: תזוזת סוליה 0.1891 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 4.649 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1045 (אדום) |
| 16 | hoops-tall-v1 / guard/v9/cut_180_right_ball | 54.4 | מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); החלקת רגליים: תזוזת סוליה 0.1175 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.2189 (אדום); קפיצות פוזה: LeftFoot בזמן 1.15 ש׳; קפיצת סיבוב שקולה 10.7424 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1277 (אדום) |
| 17 | hoops-tall-v1 / wing/v9/cut_90_right_ball | 54.6 | החלקת רגליים: תזוזת סוליה 0.1532 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 5.9304 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1176 (אדום) |
| 18 | hoops-tall-v1 / guard/v9/cut_180_left_ball | 54.7 | מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); החלקת רגליים: תזוזת סוליה 0.1178 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 8.2195 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 10.546 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1002 (אדום) |
| 19 | hoops-tall-v1 / center/v9/cut_45_right_ball | 54.9 | החלקת רגליים: תזוזת סוליה 0.189 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 3.5959 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1124 (אדום) |
| 20 | hoops-tall-v1 / guard/v9/cut_135_left_ball | 55 | מגע בכדור: חסרים נתוני מדידה (Tall preview ball is attached to the hand guide; no independent retargeted ball trajectory is supplied.); החלקת רגליים: תזוזת סוליה 0.1178 מ׳, LeftFoot, בזמן 0.351 ש׳ (אדום); כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 7.9443 (אדום); קפיצות פוזה: RightFoot בזמן 1.5 ש׳; קפיצת סיבוב שקולה 9.9364 מעלות ב־60Hz (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.1008 (אדום) |

## תחומי המדידה

- Skeleton and declared sole/contact points are audited; compressed mesh geometry and texture pixels are not decoded.
- Reference-root paths describe the author scenario. Actual simulation speed/IK/blending are not executed.
- Feeling score is a reproducible weighted diagnostic heuristic, not a perceptual or medical validation.
- Missing applicable metadata is unavailable and earns zero points; not-applicable metrics are excluded. Coverage is shown.

החדירה לרצפה נמדדת בנקודות סוליה מוצהרות ובמפרקי השלד; זו אינה מדידת כל קודקודי הנעל. בדיקות אנטומיה מכסות טווחי מפרקים גסים ואינן מאבחנות פציעות. סימטריה בודקת אורכי עצמות, ותנועה סימטרית רק כשהוגדרה ככזו. רציפות משווה קצות קליפ לעמידת המתנה באותו תפקיד; המשחק עצמו עשוי ליישם מעבר ו-IK.

## אימות המסירה

[תוצאות הבדיקות והמדידות](verification/summary.json) כוללות בדיקות יחידה, טעינת כל התוצרים ומקורותיהם, ובדיקת דפדפן במחשב ובנייד עם WebAssembly חסום. בדיקות המשחק הקיימות לא הורצו בגלל ה־sparse checkout; הן לא שונו.

## מקור ושחזור

- soccer-v8: main ae09529bc8fc9ff42f6aa76b8e79e7f760992f62; 25 קליפים.
- soccer-v9: codex/soccer-motion-v9 5d516207d66cdf91af062b93142e04c6dcbae131; 48 קליפים.
- soccer-v10: codex/soccer-motion-v10 57c536e1291803161e069eff97987295c6194466; 30 קליפים.
- hoops-v8: main ae09529bc8fc9ff42f6aa76b8e79e7f760992f62; 15 קליפים.
- hoops-v9: codex/hoops-motion-v9 6dd1675ded8ef2c9d361821aa1642ab75de90541; 83 קליפים.
- hoops-v10: codex/hoops-motion-v10 a5d245981acba83c1bad88de59bf30ca7bde53a5; 54 קליפים.
- hoops-tall-v1: codex/hoops-tall-v1 cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa; 294 קליפים.

קבצי המקור נשארים ללא שינוי. המטמון נמצא רק ב-.cache שבתיקייה זו. קובצי JSON/HTML ו-SVG לכל קליפ נוצרים ב-output. כל התוצרים נשמרים ב-Git וניתנים להפקה מחדש בפקודה לעיל.
