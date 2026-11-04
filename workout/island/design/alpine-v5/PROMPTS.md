# הנחיות יצירה · 04.11.2026

הרפרנס המקומי שנבדק לפני העבודה: `../environment/backgrounds/ski-mountains-landscape.webp`, מפרט הסקי הקיים וחוזי היחידות ב־`../alpine-world/` וב־`../alpine-track/`. היעד: נוף הרים עשיר בסגנון משחק ספורט מודרני, עם מרחב מרכזי פנוי לקריאת המסלול.

הכלי לשלושת לוחות המקור: `image_gen.imagegen`, יצירה חדשה, רקע אטום, ללא תמונות קלט. אין תיקון צבע, ציור מחדש או הוספת אלמנטים בקוד ללוחות אלה. כלי הייצוא מבצע רק חיתוך, שינוי גודל וקידוד ל־WebP. פרטי המקור ו־SHA-256 נשמרים ב־`sources.json`.

## שקיעה

Production background texture for a modern mobile downhill ski game. Cinematic, semi-realistic 3D game mountain vista at sunset, wide 16:9. Distant Alpine snowy ridges and glacial valley; apricot and salmon light on summits, lilac-blue shadows, mauve-to-amber sky with soft clouds. Camera looks gently down from a high slope. Crisp cornices, stratified rock, atmospheric depth. Summit slightly left of center, central valley open, lower quarter quiet distant snowy valley. Sky about 40 percent; skyline 40–65 percent. Premium sports-game art. Background plate only: no piste stripes, foreground trees, skier, people, buildings, words, borders, logos or HUD.

## ערפל

Production background plate for the same game, wide 16:9. Distant Alpine range in pearl-blue mountain fog at overcast dawn. Semi-realistic 3D environment: snow-capped rock spires, main summit slightly left of center, pale grey-blue clouds. Fine ribbons of fog fill the glacial valley. Near distant ridge retains snow/rock detail; farther ridges fade into cool mist. Center opens to the valley, lower quarter pale haze. Slate, frost, ice-blue and pearl palette, convincing depth, readable shapes. No people, tracks, signs, close trees, buildings, text, logos or UI.

## לילה עם זרקורים

Production background plate, wide 16:9. Deep indigo night in the Alps, jagged snowy peaks in cold moonlight, sparse stars and thin clouds, layered mountains in cobalt haze. Sculptural snow and rock, premium semi-realistic 3D sports-game art. Summit slightly left of center, open central valley; sky top 40 percent. Calm snowy basin in lower quarter. At the far left and right edges of the lower third only: two small distant ski-resort floodlight towers, three warm white lamps each, narrow downward cones in faint haze. Soft blue readable night snow, cyan frost and cream lights. No giant moon, aurora, buildings, skier, people, UI, piste markings, letters or logos.

## נכסים פרוצדורליים

שבעת המודלים, אטלסי האבקה/נחיתה/גרגרים, משטחי השלג, שכבות הערפל והאור ו־16 הסמלים נוצרו מתוך צורות פשוטות ומתמטיקה ב־`tools/build-assets.py`. זרעים קבועים: 504 למשטח השלג, 511 לאבקה, 524 לנחיתה ו־572 לגרגרים. הנכסים מקוריים; רמת האטימות, padding, מעטפות הזמן והמידות אינם מתקבלים ממודל יצירת התמונות.
