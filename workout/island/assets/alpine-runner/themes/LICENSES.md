# מקורות ורישיונות — alpine-themes-v1

כל הקבצים החדשים בתיקייה זו הם יצירה מקורית שנוצרה למשימה זו ב־13 בנובמבר 2026: גאומטריה, טקסטורות, שמיים, חלקיקים, פריסות שלבים, תצוגה, קוד מקור ותיעוד. לא הועתקו נכסי צד שלישי, מותגים, פונטים, תמונות או מודלים.

כל התרומות המקוריות בתיקייה זו מוקדשות לנחלת הכלל לפי **CC0 1.0 Universal (SPDX: CC0-1.0)**. ככל שוויתור על הזכויות אינו אפשרי, חלה הרשאת הגיבוי של CC0. מותר שימוש מסחרי, שינוי, שילוב והפצה ללא דרישת ייחוס. [נוסח הרישיון המלא](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

## מקור היצירות

- `source/build_assets.py`: גאומטריה מקורית מתוך קוד, PNG מתוך נוסחאות וצורות גאומטריות מקוריות, צבעים ומיפוי 30 המסלולים. ללא הורדת מדיה וללא חומרי גלם חיצוניים.
- `source/capture_previews.py`: ייצוא ישיר של קנבס התצוגה אל PNG; התוכן החזותי הוא המודלים והטקסטורות המקוריים של החבילה. ללא עיבוד תמונה נוסף.
- `preview.html`, `preview.css`, `preview.mjs`: קוד מקור ועיצוב מקוריים. קורא ה־GLB המצומצם נכתב לחבילה זו; הוא אינו העתק של GLTFLoader.
- `source/catalogue.py`: יצירת הרשימה המדויקת שלהלן ושל `asset-inventory.json` עם גיבובי SHA-256.
- שאר קובצי המקור והתיעוד נכתבו במיוחד למשימה זו; הקובץ עצמו הוא המקור.

## תלות קיימת במאגר, מחוץ לחבילה

התצוגה משתמשת ב־`workout/3d/lib/three.module.min.js` הקיים במאגר, Three.js r160, ברישיון **MIT**, Copyright 2010–2023 Three.js Authors. [מקור ורישיון רשמיים](https://github.com/mrdoob/three.js/blob/r160/LICENSE). הוא אינו מועתק לתיקייה זו ואינו מקבל רישיון CC0. פונטים הם פונטי מערכת. Python, NumPy, Pillow, Playwright ו־Chromium הם כלי בנייה בלבד ואינם נכללים בחבילה. לא נכללים Draco, קוד מפענח או נכסים דחוסים באמצעותו.

## רישום מדויק לכל קובץ חדש

כל שורה להלן היא יצירה מקורית; `source` מציין את המחולל, או את קובץ המקור עצמו. הנתיבים יחסיים לתיקייה זו.

| קובץ | מקור | רישיון |
|---|---|---|
| `LICENSES.md` | `source/catalogue.py` | CC0-1.0 |
| `REPORT.md` | `original authored source; this file` | CC0-1.0 |
| `asset-inventory.json` | `source/catalogue.py` | CC0-1.0 |
| `levels.json` | `source/build_assets.py` | CC0-1.0 |
| `manifest.json` | `source/build_assets.py` | CC0-1.0 |
| `preview.css` | `original authored source; this file` | CC0-1.0 |
| `preview.html` | `original authored source; this file` | CC0-1.0 |
| `preview.mjs` | `original authored source; this file` | CC0-1.0 |
| `previews/01-pine.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `previews/02-ice.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `previews/03-volcano.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `previews/04-aurora.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `previews/05-village.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `previews/06-summit.png` | `source/capture_previews.py + preview.mjs + original models/textures` | CC0-1.0 |
| `shared/reference-skier.glb` | `source/build_assets.py` | CC0-1.0 |
| `source/build_assets.py` | `original authored source; this file` | CC0-1.0 |
| `source/capture_previews.py` | `original authored source; this file` | CC0-1.0 |
| `source/catalogue.py` | `original authored source; this file` | CC0-1.0 |
| `source/requirements.txt` | `original authored source; this file` | CC0-1.0 |
| `themes/01-pine/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/pine-round.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/pine-tall.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/pine-young.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/01-pine/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/ice-arch.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/ice-cluster.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/ice-spire.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/02-ice/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/basalt-stack.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/glow-stones.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/soot-boulder.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/03-volcano/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/frost-boulder.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/moon-crystal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/night-pine.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/04-aurora/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/chalet.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/garden-boulder.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/rope-fence.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/snow-fir.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/models/village-pine.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/05-village/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/effects.json` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/arrow-sign.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/cloud-boulder.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/gate-coral.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/gate-teal.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/granite-slab.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/ramp.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/snow-spire.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/models/terrain-tile.glb` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/glow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/ground-a.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/ground-b.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/particles.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/powder.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/sky.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/snow.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/snowflake.png` | `source/build_assets.py` | CC0-1.0 |
| `themes/06-summit/textures/sparkle.png` | `source/build_assets.py` | CC0-1.0 |
