# רישיונות ומקור

כל הקבצים בתיקיית **athlete-body-v2**, לרבות קוד, תיעוד, תוצרים נגזרים וצילומים, מוקדשים לנחלת הכלל ברישיון [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). במידה המותרת בחוק, המחברים מוותרים על זכויות היוצרים והזכויות הנלוות בתוכן המקורי שלהם. נכסי הקלט המתועדים להלן הם CC0. הדמויות בדויות; המספרים והמגן הגיאומטרי מקוריים, ללא מותג או לוגו של קבוצה אמיתית.

## קלט הגוף והאטלס

הקלט הישיר הוא [assets/athlete-body-v22](https://github.com/roynaor-work/Bakasun/tree/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/assets/athlete-body-v22), בקומיט `d759582c171600dd7c7df7906c2fb38ae7f8b88a`. `body-manifest.json` בחבילה זו שומר SHA-256 לכל גוף קלט ולכל גוף תוצר. האטלס בתוצר זהה לקלט: SHA-256 `7024031216a0af3bd15d6295d4bb4d525f01322f9d93b2cc2121e2975eb2c8fc`.

מקור הגוף והאטלס: [athlete-body-v1 / LICENSES.md](https://github.com/roynaor-work/Bakasun/blob/5075ff850f6a1c9dab8e557eb95745b45d785df5/workout/island/design/athlete-body-v1/LICENSES.md), קומיט `5075ff850f6a1c9dab8e557eb95745b45d785df5`, ברישיון CC0-1.0. השרשרת המתועדת שם:

- [motion-fix-v12 / canonical-player-01.glb](https://github.com/roynaor-work/Bakasun/blob/5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad/workout/island/design/motion-fix-v12/runtime/models/canonical-player-01.glb), SHA-256 `d6c8ac7d103a51fb7a48875641a88623173e466c05e87c52cf1cec2b6366b122`, [רישיון CC0](https://github.com/roynaor-work/Bakasun/blob/5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad/workout/island/design/motion-fix-v12/LICENSES.md).
- [soccer-motion-v11 / celebrate_player.glb](https://github.com/roynaor-work/Bakasun/blob/0c6b5877bd81d69bf389b1e3831e5c49b5feb770/workout/island/design/soccer-motion-v11/runtime/clips/celebrate_player.glb), SHA-256 `b723711ad5c46afca7ef3651e80fba2effcf439f91639418f2527433250ea85a`, [רישיון CC0 ושרשרת v10/v8](https://github.com/roynaor-work/Bakasun/blob/0c6b5877bd81d69bf389b1e3831e5c49b5feb770/workout/island/design/soccer-motion-v11/LICENSES.md).
- [תיעוד מקור MakeHuman hm08 ונכסי המערכת CC0](https://github.com/roynaor-work/Bakasun/blob/0c6b5877bd81d69bf389b1e3831e5c49b5feb770/workout/island/design/soccer-v7/characters/ASSETS.md), כפי שתועד ב־v1. אין כאן קוד תוכנה של MakeHuman.

הידיים, צללית האגודל וקבוצות האצבעות, חיבור שורש כף היד, מורף הכפפה, שבעת מקטעי הספרות ומסכת המגן נכתבו למשימה זו. לא הורד נכס ידיים, פונט או סמל חיצוני.

## מקורות התנועה המשמשים לתצוגה

קובצי `assets/soccer-v9..v12/clips.json` ו־`assets/hoops-tall/motion-v12.json` הקיימים נקראים מהמאגר; הם אינם מועתקים או נערכים. המיפוי שומר את השלד הקנוני הקיים.

`runtime/hoops-v11.json` נגזר מכל 90 קובצי `runtime/keyframes/<profile>/*.json` של [hoops-motion-v11](https://github.com/roynaor-work/Bakasun/tree/20b8740bfc28779815eb5171246ab76816748a46/workout/island/design/hoops-motion-v11), קומיט `20b8740bfc28779815eb5171246ab76816748a46`, [רישיון CC0-1.0](https://github.com/roynaor-work/Bakasun/blob/20b8740bfc28779815eb5171246ab76816748a46/workout/island/design/hoops-motion-v11/LICENSES.md). קובצי הקלט מציינים במפורש כוריאוגרפיה מקורית ללא mocap מיובא. לכל קליפ נארזו כל דגימות הסיבוב והיסט הירכיים ב־float32, עם SHA-256 ונתיב הקלט. `tools/pack-hoops-v11.py` מאמת גם את Git blob SHA לפני האריזה. לא מועתקת גאומטריית שחקן מן הקליפים.

## ספריות וכלים חיצוניים

Three.js, GLTFLoader ו־SkeletonUtils מקושרים לעותקים הקיימים במאגר. רישיון MIT שלהם נשמר ב־[vendor/LICENSE.three](../../vendor/LICENSE.three); הם מחוץ לחבילה ואינם מוכרזים CC0. NumPy, Playwright, Chromium ו־Khronos glTF Validator הם כלי בנייה ומדידה המותקנים בנפרד, ואינם קובצי מסירה. אין מפענח Draco או meshopt בחבילה.

## מקור ורישיון לכל קובץ

`manifest.json` מכיל משקל, רישיון, מקור ו־SHA-256 לכל קובץ מלבד עצמו. רענון הרשימה: `python3 tools/inventory.py`; אימות ללא כתיבה: `python3 tools/inventory.py --check`.

| קובץ | רישיון | מקור |
|---|---|---|
| [LICENSES.md](<LICENSES.md>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [REPORT.md](<REPORT.md>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [body-manifest.json](<body-manifest.json>) | CC0-1.0 | מטא־דאטה ומדידות מקוריים של tools/build.py |
| [manifest.json](<manifest.json>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [preview.css](<preview.css>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [preview.html](<preview.html>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [preview.mjs](<preview.mjs>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [runtime/appearance.mjs](<runtime/appearance.mjs>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [runtime/hoops-v11.json](<runtime/hoops-v11.json>) | CC0-1.0 | דגימות מפתח CC0 של hoops-motion-v11 בקומיט המוצמד להלן; נתיב ו־SHA-256 לכל קלט בתוך הקובץ |
| [runtime/models/center.glb](<runtime/models/center.glb>) | CC0-1.0 | נגזרת CC0 של assets/athlete-body-v22/models/center.glb; ידיים ומורף כפפות מקוריים ב־tools/build.py |
| [runtime/models/guard.glb](<runtime/models/guard.glb>) | CC0-1.0 | נגזרת CC0 של assets/athlete-body-v22/models/guard.glb; ידיים ומורף כפפות מקוריים ב־tools/build.py |
| [runtime/models/soccer.glb](<runtime/models/soccer.glb>) | CC0-1.0 | נגזרת CC0 של assets/athlete-body-v22/models/soccer.glb; ידיים ומורף כפפות מקוריים ב־tools/build.py |
| [runtime/models/wing.glb](<runtime/models/wing.glb>) | CC0-1.0 | נגזרת CC0 של assets/athlete-body-v22/models/wing.glb; ידיים ומורף כפפות מקוריים ב־tools/build.py |
| [runtime/motion.mjs](<runtime/motion.mjs>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [runtime/textures/athlete-atlas.png](<runtime/textures/athlete-atlas.png>) | CC0-1.0 | עותק זהה של אטלס CC0 מ־assets/athlete-body-v22/textures/athlete-atlas.png; שרשרת המקור להלן |
| [tools/build.py](<tools/build.py>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [tools/inventory.py](<tools/inventory.py>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [tools/measure.py](<tools/measure.py>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [tools/pack-hoops-v11.py](<tools/pack-hoops-v11.py>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [tools/review.cjs](<tools/review.cjs>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [tools/validate-glb.cjs](<tools/validate-glb.cjs>) | CC0-1.0 | קוד, עיצוב או תיעוד מקוריים שנכתבו למשימת athlete-body-v2 |
| [verification/back.png](<verification/back.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/browser.json](<verification/browser.json>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/crest.png](<verification/crest.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/existing-tests.json](<verification/existing-tests.json>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/full.png](<verification/full.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/gloves.png](<verification/gloves.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/gltf-validation.json](<verification/gltf-validation.json>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/hands.png](<verification/hands.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/invariants.json](<verification/invariants.json>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/mobile-390x844.png](<verification/mobile-390x844.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/mobile-844x390.png](<verification/mobile-844x390.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
| [verification/shorts.png](<verification/shorts.png>) | CC0-1.0 | תוצר מדידה או צילום מקורי של נכסי CC0 בחבילה; כלים: tools/measure.py, tools/review.cjs, tools/validate-glb.cjs |
