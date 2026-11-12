# הוראות ImageGen ומקור גרפי

שתי קריאות לכלי ImageGen המובנה של OpenAI, ב־12.11.2026. בשתיהן `transparent_background=true`, ללא תמונות ייחוס חיצוניות. התמונות המקוריות נשמרו ללא שינוי בתיקייה זו. אריזת פריימים, הקטנה, מיקומים ומעטפות מתועדים ב־`../tools/generate.py`.

## explosion-generated.png

מקור RGBA בגודל 1254×1254. מחולק לרשת אחידה 8×8 ונארז מחדש לאטלס הסופי 1024×1024, תאים 128×128, תוכן 112×112 ושוליים 8px. הקטנה במרחב premultiplied alpha; הפלט straight alpha. ב־16 פריימי הסיום מוחלת דעיכה חלקה עד שקיפות מלאה. פריימי הסיום במקור כוללים כמעט־שקיפות; אין להציג את האטלס כלולאה.

```text
Create a production-ready transparent PNG sprite sheet of a powerful naval dock warehouse explosion for a polished stylized 3D mobile ship game. EXACT OUTPUT: 1024 by 1024 pixels. EXACT GRID: 8 columns and 8 rows = 64 equally sized 128x128 animation frames, read chronologically left-to-right then top-to-bottom. No gutters between cells. Each effect must stay within its own cell leaving 8 transparent pixels at each cell edge. Fixed camera, consistent effect center at (64,80) inside every frame, no perspective scene. Frame sequence: initial small brilliant amber ignition in frames 0-3; rapid white-hot yellow core and orange cauliflower fireball with a broken expanding shockwave in frames 4-13; rolling orange flame lobes with dark sooty smoke in frames 14-30; cooling red-orange embers and rising charcoal smoke in frames 31-47; thinning smoke that fades to near complete transparency by frame 62, frame 63 fully transparent. Organic detailed volumetric billowing turbulent fire, crisp readable shape at small size, restrained glow, smooth temporal progression, no repeated overview views. Render ONLY the effect on genuine alpha transparency. No background, no black rectangle, no fake checkerboard, no ground, no buildings, ships, debris props, humans, text, borders, frame numbers, grid lines or logos. Output a downloadable PNG suitable for inclusion in a repository.
```

## smoke-puff-generated.png

מרקם ענן בודד RGBA בגודל 1254×1254. שישה מופעי ענן נעים מלמטה למעלה, גדלים ומסתובבים; מעטפות כניסה ויציאה מחליקות את הלידה וההיעלמות. מייצרים 16 פאזות `i/16`; פאזה 1 שווה בדיוק לפאזה 0. אין שכפול של פריים 0 בתא האחרון ואין היפוך של כיוון התנועה. השקיפות המקורית נשמרת ללא color-key.

```text
A single isolated volumetric black soot smoke puff texture for use as a particle sprite in a polished naval battle mobile game. One irregular round cloud, center dense charcoal black, rounded cauliflower lobes with subtle cool slate highlights and fine soft turbulent wisps toward the transparent edges. Realistic billowing three-dimensional smoke. Upper-left soft lighting. BLACK smoke, not pale fog. Square composition with generous 15 percent fully transparent padding around all sides. Genuine alpha transparency everywhere outside the smoke, no black backdrop, no checkerboard, no scene, no fire, no glow, no ground, no shadow, no text, no borders. A single puff only, not a sprite grid, not a tall plume. Deliver downloadable transparent PNG.
```

## ניצוצות וצליל

אינם תוצרי ImageGen. הניצוצות מסונתזים מתנועת 42 חלקיקים; הצליל מאותות ורעש מסונן ללא דגימות חיצוניות. קוד ומתכון מלאים: `../tools/generate.py`, ‏seed ‏20261112. לאחר הקידוד כל פורמט נמדד בנפרד ומותאם ל־−16 LUFS בטולרנס 0.1 LU ו־true peak מתחת ל־−1 dBTP.
