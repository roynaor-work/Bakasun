# רישיונות ומקורות

התנועות החדשות, כוריאוגרפיית הקבוצה, מסלולי הכדור, נתוני המגע והתמיכה, התצוגה, גיליונות הפריימים והתיעוד המקוריים מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). אין צילום, סריקה או לכידת תנועה של אדם אמיתי, ואין שימוש בדמות ספורטאי, בסמל קבוצה או במותג מסחרי.

## דמויות ושלד קיימים

| קבצים | מקור ורישיון |
|---|---|
| `reference/keeper-template.glb`, עשרת `clips/keeper_*.glb` | דמות השוער הבדיונית, הכפפות, הגאומטריה, החומרים וה־skin מתוך [soccer-motion-v8/runtime/keeper.glb](../soccer-motion-v8/runtime/keeper.glb). קובץ המקור נשמר ללא שינוי; התבנית החדשה מפוענחת ללא Draco והאנימציות מוחלפות. [רישיון v8](../soccer-motion-v8/LICENSE.md), CC0-1.0. |
| ארבעת `clips/field_*.glb` | הדמות הבדיונית שבתבנית העמידה של soccer-locomotion-v2, שעברה דרך [soccer-header-v1](../soccer-header-v1/LICENSES.md) מ־soccer-motion-v10. גאומטריה וחומרים קיימים, CC0-1.0. |
| `reference/idle_relaxed.glb`, `reference/run.glb` | עותקים מדויקים של קליפי הייחוס מתוך [soccer-locomotion-v2 בקומיט ec6c73949fb5820826b4c082972f5d4f1136641f](https://github.com/roynaor-work/Bakasun/tree/ec6c73949fb5820826b4c082972f5d4f1136641f/workout/island/design/soccer-locomotion-v2), CC0-1.0. אלו ייחוסים נלווים, ואינם חלק מ־14 התנועות החדשות. |
| השלד הקנוני | 18 שמות, סדר, הורים ומידות מנוחה תואמים ל־[motion2/soccer.json](../motion2/soccer.json). מקור IK וקריאת GLB: [soccer-header-v1/source](../soccer-header-v1/source/rig.mjs), CC0-1.0. |

גאומטריית הדמויות מקורה ב־MakeHuman hm08 ובנכסי המערכת CC0 של soccer-v7/characters. [ASSETS.md המקורי](../soccer-v7/characters/ASSETS.md) מתעד את [קטלוג נכסי המערכת](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) ואת [הבהרת הרישוי מ־2020](https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html), לרבות כותרות רישוי היסטוריות של נכסי לבוש. אין בחבילה קוד תוכנה של MakeHuman. אין לייחס את הגאומטריה ל־Kenney או ל־characters2.

## תוכנה וכלי יצירה

| תוכנה | רישיון ושימוש |
|---|---|
| `source/rig.mjs`, `source/glb.mjs` | עותקים של כלי soccer-header-v1 הקיימים, CC0-1.0. |
| `runtime/player.mjs` | מתמטיקת הדגימה ו־Hermite C1 של soccer-header-v1 ועטיפות soccer-locomotion-v2, CC0-1.0. |
| [three.js ו־GLTFLoader המקומיים](../soccer-motion-v8/runtime/vendor/LICENSE.three), לרבות SkeletonUtils | MIT, Copyright Three.js authors. מיובאים מהעותקים הקיימים בריפו, ללא ספריית זמן ריצה נוספת. |
| [motion-qa-v1](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1) | CC0-1.0 לפי LICENSES.md של הקומיט המוצמד. חולץ לתיקייה זמנית ללא שינוי נוסחאות, ספים או משקלים. `verification/qa/` הוא פלט הכלי; HTML מקומי מציג את הנתונים המקוריים. |
| glTF Transform 4.5.1 | MIT; פענוח תבנית השוער. תלות יצירה זמנית בלבד. |
| Draco 1.5.9 | Apache-2.0; פענוח קובץ המקור בלבד. אין decoder או WASM בחבילה החדשה. |
| Khronos glTF Validator 2.0.0-dev.3.10 | Apache-2.0; אימות קובצי המסירה. |
| Playwright ו־Chromium | כלי צילום ובדיקה; אינם מצורפים לנכסי זמן המשחק. |

`source/prepare-keeper.mjs`, `verification/keeper-template.json`, `verification/transitions.json` ו־`verification/provenance.json` מתעדים מקורות וחתימות. תנאי הרישיונות של התלויות נשמרים. קובצי המקור, ההפעלה, הקטלוג, הפוזות, צילומי המסך ויתר הראיות החדשים הם CC0-1.0, בכפוף לתנאי המקורות המפורטים לעיל.
