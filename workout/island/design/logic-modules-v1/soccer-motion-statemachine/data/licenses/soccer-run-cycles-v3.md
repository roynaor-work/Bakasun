# רישיונות ומקור

התנועות, מסלולי הכדור, נתיבי הייחוס, קוד ההפקה, הבקר, התצוגה, גיליונות הפריימים והתיעוד החדשים מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). אלה אנימציות מחוברות ומחושבות; אין נתוני לכידת תנועה או דמות של ספורטאי אמיתי.

| רכיב | מקור | רישיון |
|---|---|---|
| סגנון הריצה והידיים | [soccer-locomotion-v2, קומיט ec6c73949fb5](https://github.com/roynaor-work/Bakasun/tree/ec6c73949fb5820826b4c082972f5d4f1136641f/workout/island/design/soccer-locomotion-v2). הגאומטריה של הצעד וזמני התמיכה חוברו מחדש למהירויות המשחק | CC0-1.0 |
| שלד, IK ואריזת GLB | `source/rig.mjs`, `source/glb.mjs`, מתוך soccer-header-v1 באותו קומיט; מקורם ב־[soccer-motion-v10, קומיט 57c536e12918](https://github.com/roynaor-work/Bakasun/tree/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10) | CC0-1.0 |
| רשת, skin וחומרים בכל GLB | `reference/mesh-template.glb`: עותק idle_relaxed של soccer-header-v1, שמקורו ב־soccer-motion-v10. SHA-256: `7a8421e3d81cb472435f523a2e99f6d75daa16afe14a423bd25d80d5df6f6b41` | CC0-1.0 |
| מקור אנטומי של הרשת | דמות בדיונית מבוססת MakeHuman hm08 ונכסי המערכת, דרך [soccer-v7/characters/ASSETS.md](../soccer-v7/characters/ASSETS.md) ו־[soccer-motion-v8/LICENSE.md](../soccer-motion-v8/LICENSE.md). קוד MakeHuman אינו מופץ כאן | CC0-1.0 |
| מודל ניקוד, קורא GLB וממשק דוח QA | [motion-qa-v1, קומיט 5eb4f093bc22](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1). המנוע והספים מחולצים זמנית מ־Git ללא שינוי; עותקי ממשק הדוח ב־verification נשמרים ללא שינוי | CC0-1.0 |
| קוד ותוצרים חדשים ביתר התיקייה | `source/`, `runtime/`, `clips/`, `catalog.json`, `preview.*`, `sheets/`, `verification/` ותיעוד. תוצרים מופקים מהמקורות המפורטים; גיבובי קלט ופלט נרשמים בראיות | CC0-1.0 |

התלויות הקיימות [three.js r160 וה־loaders](../soccer-motion-v8/runtime/vendor/) הן ברישיון [MIT](../soccer-motion-v8/runtime/vendor/LICENSE.three), Copyright Three.js authors. הן נקראות מהמאגר ואינן מועתקות לחבילה. תנאי הרישיון וההודעות המקוריות ממשיכים לחול. אין שימוש ב־Draco, Meshopt או WASM בנכסי החבילה.

Playwright, Chromium ו־[Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) הם כלי אימות חיצוניים ואינם מופצים כנכסי החבילה. רישיון הכלים אינו משתנה בעקבות רישיון תוצרי המדידה.
