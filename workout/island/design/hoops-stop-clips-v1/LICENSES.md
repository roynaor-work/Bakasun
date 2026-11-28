# רישיונות ומקור לכל קובץ

כל התנועות, הקוד, המסמכים והראיות בחבילה הם מקוריים ומוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). אין נכסי motion capture, מותגים או אדם מצולם.

| קובץ | רישיון | מקור |
|---|---|---|
| tools/synth.mjs, author.mjs, clips.mjs, build.mjs, bake.mjs, qa.mjs, anatomy.mjs, measure.mjs, report.mjs, runtime-pack.mjs, capture.mjs, compose-sheets.py | CC0-1.0 | מקוריים לחבילה |
| tools/rig.mjs, tools/glb.mjs, runtime/player.mjs | CC0-1.0 | הועתקו ללא שינוי מ-[soccer-clips-v13](../soccer-clips-v13/LICENSES.md) (מתמטיקת השלד, כלי ה-GLB והגשר) |
| preview.html, preview.css, preview.mjs | CC0-1.0 | התאמה של [soccer-clips-v13/preview.*](../soccer-clips-v13/preview.mjs) |
| runtime/motions.json, runtime/catalog.json, runtime/clips/*.glb | CC0-1.0 | תנועה מקורית שנוצרה בכלי החבילה; הגאומטריה, העור והחומרים של הדמות הבדיונית זהים ל-[soccer-clips-v13/runtime/reference/idle_relaxed.glb](../soccer-clips-v13/runtime/reference/idle_relaxed.glb) (CC0, ראו [LICENSES של soccer-clips-v13](../soccer-clips-v13/LICENSES.md)) |
| verification/** | CC0-1.0 | ראיות מקוריות (מדידות וצילומי מסך של ה-GLB) |
| ../../assets/hoops-stop-clips-v1/stop-clips.json | CC0-1.0 | נגזרת של runtime/motions.json בקידוד חבילת ה-tall |

תלויות קיימות שאינן מועתקות: three.js r160 ו-GLTFLoader ב-[soccer-motion-v8/runtime/vendor](../soccer-motion-v8/runtime/vendor/LICENSE.three) (MIT). Playwright, Chromium, Python ו-Pillow ופונט DejaVu משמשים לצילום בלבד, מחוץ למאגר.
