# מקורות ורישיונות

המסלולים, 48 דגמי התפאורה, שש תמונות השמיים, הממשק, קוד המקור, הבדיקות והתיעוד נוצרו לחבילה זו. הם מוקדשים לנחלת הכלל ברישיון CC0-1.0, בהתאם לנוהג בחבילות העיצוב המקוריות של המאגר. [נוסח CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)

| קבצים | מקור | רישיון |
|---|---|---|
| `tracks/*.json` | פריסות מקוריות ומדידות מספליין המנוע. מקור ב־`source/circuits.mjs` וב־`source/build-tracks.mjs` | CC0-1.0 |
| `assets/props/*/*.glb` | מידול מקורי בקנה מידה מטרי. מקור ב־`source/build-props.py` | CC0-1.0 |
| `assets/skies/*.webp` | פנורמות מקוריות שנוצרו משדות עננות מחזוריים. מקור ב־`source/build-skies.py` | CC0-1.0 |
| `preview.html`, `preview.css`, קובצי `.mjs` החדשים, `tests/` והתיעוד | תצוגה ובדיקות לחבילה, עם גופני מערכת | CC0-1.0 |

## תלויות שקיימות במאגר

- התצוגה משתמשת בקובצי Three.js r160 המקומיים `three.module.js`, `GLTFLoader.js` ו־`BufferGeometryUtils.js`. הם כפופים לרישיון MIT הקיים. [רישיון Three.js במאגר](../racing-v7/vendor/LICENSE.three)
- מצלמת המרדף משתמשת ב־`formula-lod1.glb` מתוך `assets/racing-formula-cars-v1`, ברישיון CC0-1.0. גוון הצבע מותאם בזמן התצוגה. [רישיון דגם הרכב](../../assets/racing-formula-cars-v1/LICENSES.md)
- קוד המסלולים והגדרות v2 נצרכים מהמאגר. הזכויות בקבצים אלה נקבעות לפי מקורם. [קוד המסלולים](../../minigames/racing-tracks.mjs) · [רישיון חבילת v2](../racing-tracks-v2/LICENSES.md)
