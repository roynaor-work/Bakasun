# רישיונות ומקורות

הדמויות בדיוניות. הגאומטריה, האטלסים והתנועות בחבילה זו זמינים תחת [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). אין מותגים או סמלי קבוצות.

| רכיב | מקור ורישיון | מה נעשה בחבילה |
|---|---|---|
| גוף, פנים, שיער, משקלי עור ומדי הבסיס | נכס השופט הקיים ב־[soccer-v6/characters](../soccer-v6/characters/ASSETS.md), ברישיון CC0; מבוסס על [MakeHuman Community](https://github.com/makehumancommunity/makehuman) | בנייה מחדש מהמקורות, צמצום פוליגונים, השלמת תפרי הלבוש ואטלס מוטמע 512×512 |
| נתוני MakeHuman | [רישיון הנכסים המלא הקיים בריפו](../soccer-v6/characters/source/makehuman/LICENSE.ASSETS.md), [הכרזת המערכת על CC0 לשיער ולעורות](../soccer-v6/characters/source/makehuman/official-system-assets.md), [מחקר המקור](../soccer-v6/characters/source/makehuman/SOURCE-RESEARCH.md) | נכסי נתונים בלבד; קוד תוכנת MakeHuman אינו מועתק לחבילה |
| חוזה השלד | [motion2/soccer.json](../motion2/soccer.json), CC0 | אותם 18 שמות, הורים, תרגומי מנוחה וצירי bind |
| פתרון IK קנוני | [soccer-header-v1/source/rig.mjs](../soccer-header-v1/source/rig.mjs), CC0 | הועתק אל source/canonical-rig.mjs; ייבוא Three מקומי מותאם |
| כרטיסים, משרוקית, דגלונים, חיזוקי לבוש, עשרת הקליפים, התצוגה וכלי הבדיקה החדשים | יצירה לחבילה זו, CC0-1.0 | קוד ונתוני תנועה מקוריים; ללא motion capture |
| כלי motion-qa-v1 | [קומיט מוצמד 5eb4f093](https://github.com/roynaor-work/Bakasun/tree/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1), CC0 | כלי המדידה מחולץ ל־tmp ונקרא ללא שינוי; נשמרים פלטיו ומתאם קלט חדש בלבד |
| Three.js, GLTFLoader ו־SkeletonUtils | תלות מקומית קיימת ב־island/vendor, [רישיון MIT](../../vendor/LICENSE.three) | קריאה בלבד, ללא העתקת הספרייה או שינוי קובץ קיים |
| Blender 4.3.2 | [Blender](https://www.blender.org/about/license/), GPL | כלי בנייה בלבד; רישיון התוכנה אינו משנה את רישיון הפלט |
| Khronos glTF Validator | [glTF-Validator](https://github.com/KhronosGroup/glTF-Validator), Apache-2.0 | כלי אימות בלבד, מותקן מחוץ לחבילת המסירה |
| Playwright 1.62.1 | [Playwright](https://github.com/microsoft/playwright), Apache-2.0 | כלי צילום ובדיקת דפדפן בלבד |

חתימות SHA-256 של המקורות והסבר השימוש נמצאים ב־[source/model-provenance.json](source/model-provenance.json). חתימות קובצי כלי ה־QA נמצאות ב־[qa/summary.json](qa/summary.json); חתימות הנכסים שנמסרו נמצאות ב־manifest.json. כותרות AGPL היסטוריות בחלק מנתוני MakeHuman מתועדות במקור; הרשאת CC0 העדכנית מסתמכת על הכרזת הנכסים הרשמית המקושרת לעיל.
