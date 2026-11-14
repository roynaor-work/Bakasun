# רישוי ומקורות · soccer-kicks-v2

כל הקבצים החדשים בחבילה מוקדשים לנחלת הכלל לפי **[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)**. במידה המותרת בחוק, היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות; כשוויתור אינו תקף חל רישיון הגיבוי הרחב שב־CC0. אין אחריות. ההקדשה כוללת את הכוריאוגרפיה המקורית, הפוזות, המסלולים, קוד המקור, תיעוד, דוחות המדידה, הגרפיקה והצילומים שנוצרו למשימה.

## גאומטריה וייחוסי תנועה קיימים · CC0

runtime/reference/idle_relaxed.glb ו־run.glb הועתקו ללא שינוי מ־[soccer-header-v1](../soccer-header-v1/LICENSES.md). החתימות מאמתות העתקה זהה בתים. כל GLB חדש משתמש באותה גאומטריה, skin וחומרים בלתי דחוסים; התנועה חדשה. השרשרת מתועדת ב־[מקור header-v1](../soccer-header-v1/verification/provenance.json), ב־[soccer-motion-v10 @57c536e](https://github.com/roynaor-work/Bakasun/blob/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md), וב־[soccer-motion-v8/LICENSE.md](../soccer-motion-v8/LICENSE.md). מקור הדמות הוא אדם בדיוני המבוסס על MakeHuman hm08 ונכסי מערכת CC0. אין motion capture חיצוני או שימוש בזהותו של ספורטאי מסוים.

source/author.mjs ו־source/bake.mjs משתמשים בכלי המתמטיקה, GLB ו־Hermite הקיימים של header-v1 ברישיון CC0, בלי לערוך אותם. הקשתות, 14 הכוריאוגרפיות ותיקון הרצפה בגשר הם תרומה מקורית בחבילה זו.

## תוכנה קיימת · MIT

[three.js r160](../soccer-motion-v8/runtime/vendor/three.module.js), [GLTFLoader](../soccer-motion-v8/runtime/vendor/GLTFLoader.js) ו־[BufferGeometryUtils](../soccer-motion-v8/runtime/vendor/BufferGeometryUtils.js), Copyright Three.js authors, תחת [רישיון MIT הקיים](../soccer-motion-v8/runtime/vendor/LICENSE.three). הקבצים נטענים מהמאגר הקיים; הם אינם מועתקים או משונים בחבילה. רישיון CC0 אינו מחליף את תנאי MIT של התלויות. כלי הצילום Playwright/Chromium ו־Python/Pillow רצים מחוץ לחבילת הנכסים ואינם נמסרים בתוכה. אין decoder, Draco, Meshopt או WASM בנכסים החדשים.

## מדידה ומלאי

קוד motion-qa-v1 נקרא מקומיט [5eb4f093bc22523ee417a7f2345c3b813bffba24](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md), CC0, ומחולץ ל־/tmp בלבד. מדדים ו־SVG הם תוצאות הרצה מקוריות על הנכסים החדשים. דוח JSON המקורי נשמר; HTML מקומי רק מציג את ערכיו.

[provenance.json](verification/provenance.json) מכיל נתיבים, רישיונות, מקורות ו־SHA-256 לתלויות ולייחוסים. [inventory.json](verification/inventory.json) מונה **כל קובץ חדש** בחבילה, רישיונו, אופן יצירתו, גודלו וחתימתו. קובץ המלאי עצמו מופיע ללא חתימה עצמית כדי למנוע תלות מעגלית. כך גם REPORT.md, כל 14 גיליונות הפריימים וכל קובצי ה־GLB מכוסים במלאי.
