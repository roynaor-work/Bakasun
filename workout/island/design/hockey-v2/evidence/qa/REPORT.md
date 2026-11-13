# דוח מדידת תנועה

נוצר: 2026-11-13T12:45:32.866Z. מצב המדידה: **per-clip explicit contact model**. 30 קליפים, 60Hz וגם זמני מפתח ומגע מדויקים.

[דוח אינטראקטיבי](report.html) · [הגדרות המודלים והפעלה](../../../motion-qa-v1/README.md) · [רישיונות ומקור](../../../motion-qa-v1/LICENSES.md).

| ספרייה | קליפים | ממוצע | מינימום | מדדים אדומים |
|---|---:|---:|---:|---:|
| hockey-v2 | 30 | 95.67 | 89.7 | 0 |

| ספרייה / קליפ | ציון | ממצאים |
|---|---:|---|
| hockey-v2 / shot_wrist | 89.7 | החלקת רגליים: תזוזת סוליה 0.0347 מ׳, RightFoot, בזמן 0.6333 ש׳ (צהוב) |
| hockey-v2 / pass | 90.1 | החלקת רגליים: תזוזת סוליה 0.0347 מ׳, RightFoot, בזמן 0.5667 ש׳ (צהוב) |
| hockey-v2 / shot_slap | 90.1 | החלקת רגליים: תזוזת סוליה 0.0347 מ׳, RightFoot, בזמן 0.7667 ש׳ (צהוב) |
| hockey-v2 / skate_stop_left | 92 | כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 1.3141 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.0593 (צהוב) |
| hockey-v2 / skate_stop_right | 92 | כניסה ויציאה מול המתנה: פער ב־יציאה מול המתנה; יחס חריגה 1.3141 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.0593 (צהוב) |
| hockey-v2 / skate_crossover_left | 92.8 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.6562 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.0919 (צהוב) |
| hockey-v2 / skate_crossover_right | 92.8 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.61 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.096 (צהוב) |
| hockey-v2 / skate_push_fast | 93.7 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.5634 (צהוב) |
| hockey-v2 / celebrate_2 | 95 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.6269 (צהוב) |
| hockey-v2 / skate_push_medium | 95 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.5764 (צהוב) |
| hockey-v2 / goalie_slide_left | 95.2 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.2413 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.0577 (צהוב) |
| hockey-v2 / goalie_slide_right | 95.2 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.2413 (צהוב); סימטריה: mirrored clip pair: הפרש עצמות 0, פער תנועה מנורמל 0.0577 (צהוב) |
| hockey-v2 / celebrate_1 | 95.4 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.5826 (צהוב) |
| hockey-v2 / skate_glide | 95.5 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.5724 (צהוב) |
| hockey-v2 / skate_backward | 95.6 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.5828 (צהוב) |
| hockey-v2 / skate_turn_45 | 95.6 |  |
| hockey-v2 / goalie_glove_low | 95.8 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.1452 (צהוב) |
| hockey-v2 / skate_push_slow | 95.9 | כניסה ויציאה מול המתנה: פער ב־כניסה מול המתנה; יחס חריגה 1.586 (צהוב) |
| hockey-v2 / skate_turn_90 | 96.2 |  |
| hockey-v2 / skate_turn_180 | 96.9 |  |

הציון הוא מדד אבחוני משוקלל. מודל להב מופעל רק בקליפים שמצהירים עליו. מודל הרגל הנטועה המקורי נשמר עבור שאר הקליפים, ועבור הרצת `--legacy`. הספים והמשקלות לא השתנו.

- Skeleton and declared sole/blade/contact points are audited; compressed mesh geometry and texture pixels are not decoded.
- Reference-root paths describe the author scenario. Actual simulation speed/IK/blending are not executed.
- Feeling score is a reproducible weighted diagnostic heuristic, not a perceptual or medical validation.
- Missing applicable metadata is unavailable and earns zero points; not-applicable metrics are excluded. Coverage is shown.
- All upstream metric weights and green/yellow thresholds are unchanged. Blade contact changes physical semantics only for clips explicitly declaring contactModel=blade.
- Blade continuity removes the authored root heading from body markers, while retaining root height, limb pose, rotation and velocity errors.

מקור הכלי: קומיט `5eb4f093bc22523ee417a7f2345c3b813bffba24`. חתימות המקור והשינויים נמצאים ב־[provenance.json](../../../motion-qa-v1/provenance.json). בדיקות כשלים מכוונים ושוויון לנוסחאות המקור: [skating.test.mjs](../../../motion-qa-v1/skating.test.mjs). אימות חזותי ובדיקות של כל רשת הגוף מופיעים ב־[דוח המסירה](../../../motion-qa-v1/../hockey-v2/REPORT-fix.md).
