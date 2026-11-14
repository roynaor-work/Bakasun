# soccer v24.1 runtime copies

Converted from the Codex packs below by tools/soccer-v241-clips.mjs (keyframes only; no mesh, texture or GLB is shipped). Each pack's own licence follows.

## soccer-tackle-keeper-v2 (codex/soccer-tackle-keeper-v2 1bd4ccb5d53a8ff21bb03930ad3b26e7c4815e17)

# רישיון ומקורות

כל התנועות החדשות, הקוד, הנתונים, התיעוד, הדוחות וצילומי התצוגה מוקדשים לפי **CC0-1.0**; ראו [LICENSE.txt](LICENSE.txt) ואת [הנוסח המשפטי](https://creativecommons.org/publicdomain/zero/1.0/legalcode). אלה פוזות מקוריות, לא motion capture. אין צילום אדם אמיתי, מותגים או לוגואים.

## נכסי מקור קיימים

| קובץ בחבילה | מקור CC0 וקומיט נעול | SHA-256 |
|---|---|---|
| runtime/reference/idle_relaxed.glb | [workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-header-v1/runtime/reference/idle_relaxed.glb) | 7a8421e3d81cb472435f523a2e99f6d75daa16afe14a423bd25d80d5df6f6b41 |
| runtime/reference/run.glb | [workout/island/design/soccer-header-v1/runtime/reference/run.glb @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-header-v1/runtime/reference/run.glb) | 71576c2d48fdbed1361a1cc8281b23330702c836caad524654f2b49f8b4db934 |
| runtime/keeper.glb | [workout/island/design/soccer-keeper-crowd-v1/runtime/keeper.glb @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-keeper-crowd-v1/runtime/keeper.glb) | 56ccc07410c485d5cc99fa4ce4303c9a2621b1da643e5c16055f62fe2778d33b |
| runtime/keeper-open.glb | [workout/island/design/motion-fix-v12/runtime/models/canonical-keeper.glb @ 5d71491ea9a3](https://github.com/roynaor-work/Bakasun/blob/5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad/workout/island/design/motion-fix-v12/runtime/models/canonical-keeper.glb) | 2314b1942ef5bc2534c25adb5ed40b2a8e9e406ab064096cdccacc1aa1fb13b9 |
| source/rig.mjs | [workout/island/design/soccer-header-v1/source/rig.mjs @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-header-v1/source/rig.mjs) | fdfccf8692d71753853522b8b831ea1e143a1eb03e7f969458a09b852665d87d |
| source/rig.json | [workout/island/design/soccer-keeper-crowd-v1/source/rig.json @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-keeper-crowd-v1/source/rig.json) | 4fafafe448028f3e4ba07a5d18448f3a0c336b1fb9d203541bc925c0bc2ec5f3 |
| source/glb-writer.mjs | [workout/island/design/soccer-keeper-crowd-v1/source/glb-writer.mjs @ d759582c1716](https://github.com/roynaor-work/Bakasun/blob/d759582c171600dd7c7df7906c2fb38ae7f8b88a/workout/island/design/soccer-keeper-crowd-v1/source/glb-writer.mjs) | 46eed61301dcb808dab2bd2f62c5738271d8affe6fd0334fc4d2fe7262c8d79c |

הגאומטריה הבדיונית והטקסטורות נגזרות מ־soccer-motion-v10/v8 ו־MakeHuman hm08 CC0 לפי [רישיון v8](../soccer-motion-v8/LICENSE.md) ו־[מקורות חבילת הנגיחות](../soccer-header-v1/LICENSES.md). השוער בכפפות פתוחות מועתק מ־motion-fix-v12 בקומיט 5d71491ea9a3b44b5fe6139e516c1d2e5577e9ad (CC0), עם אותו bind; כפפת הפאנץ׳ המקורית היא מ־[soccer-keeper-crowd-v1](../soccer-keeper-crowd-v1/LICENSES.md). התנועות החדשות אינן תנועות המקור.

runtime/player.mjs נגזר מכלי CC0 של soccer-header-v1, עם תוספת קשת אגן לרצפה; source/field.mjs ו־source/keeper.mjs משתמשים רק בפוזת הייחוס הראשונית של idle מתוך runtime/motions.json שם. source/measure.mjs קורא GLB דרך כלי CC0 של אותה חבילה.

## תלויות שאינן מועתקות

Three.js ו־GLTFLoader נקראים מקבצים קיימים ברישיון MIT תחת soccer-motion-v8/runtime/vendor; [רישיון Three](../soccer-motion-v8/runtime/vendor/LICENSE.three). מקור המתמטיקה המועתק מפנה לאותה תלות. כלי QA הוא CC0 בקומיט 5eb4f093bc22523ee417a7f2345c3b813bffba24, מחולץ ל־/tmp בלבד, ללא שינוי נוסחאות או ספים. CSS של כלי ה־QA הוא תוצר מקור CC0 שנכלל כ־style.css. חתימות התלויות ומקורות כל עותק ב־[provenance.json](verification/provenance.json), וחתימות כלי QA ב־[qa/summary.json](qa/summary.json).

## soccer-volley-scissor-v1 (codex/soccer-volley-scissor-v1 8277a659f43315036eed250bda2f53f44f8613bb)

# רישוי ומקורות

הכוריאוגרפיה, מסלולי הכדור, נתוני המגע, הקוד המקורי, התיעוד וצילומי התצוגה בחבילה מוקדשים לנחלת הכלל לפי [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). ככל שהחוק מאפשר, היוצרים מוותרים על זכויות היוצרים והזכויות הנלוות; כשהוויתור אינו תקף חל רישיון הגיבוי של CC0. אין אחריות.

## תנועה, דמות וכלים — CC0-1.0

התנועות החדשות נכתבו באופן פרוצדורלי עם קינמטיקה הפוכה על השלד הקנוני בן 18 העצמות. הן אינן הקלטת motion capture ואינן מבוססות על זהות של ספורטאי מסוים. הדמות הבדיונית, הגאומטריה, ה־skin והחומרים מקורם בדמות MakeHuman hm08 ונכסי מערכת CC0, דרך soccer-motion-v8 ו־[soccer-motion-v10](https://github.com/roynaor-work/Bakasun/blob/57c536e1291803161e069eff97987295c6194466/workout/island/design/soccer-motion-v10/LICENSES.md).

| קבצים | מקור |
|---|---|
| `reference/idle_relaxed.glb`, `reference/run.glb`; גאומטריית `clips/*.glb` | [soccer-kicks-v2 @ d4a27a94](https://github.com/roynaor-work/Bakasun/tree/d4a27a94dd63127dd9f38fc641db414bd09bac35/workout/island/design/soccer-kicks-v2), שמעתיק את ייחוסי soccer-header-v1 ללא שינוי |
| `reference/locomotion_idle.glb`, `reference/locomotion_run.glb` | [soccer-locomotion-v2 @ ec6c7394](https://github.com/roynaor-work/Bakasun/tree/ec6c73949fb5820826b4c082972f5d4f1136641f/workout/island/design/soccer-locomotion-v2), ייחוסי האנימציה המלאים לבדיקת תאימות |
| `source/rig.mjs`, `source/glb.mjs`, `source/hermite.mjs` | כלי soccer-header-v1 מתוך קומיט kicks לעיל. ב־rig הותאם נתיב הייבוא המקומי בלבד |
| `player.mjs` | גשר Hermite C1 ותיקון רצפה מ־soccer-kicks-v2; נתיבי הייבוא הותאמו לתיקייה העצמאית |
| `vendor/qa/metrics.mjs`, `vendor/qa/glb.mjs` | [motion-qa-v1 @ 5eb4f093](https://github.com/roynaor-work/Bakasun/blob/5eb4f093bc22523ee417a7f2345c3b813bffba24/workout/island/design/motion-qa-v1/LICENSES.md). המדדים הועתקו ללא שינוי; ב־parser הותאם נתיב Three בלבד |
| יתר הקבצים מחוץ ל־`vendor/` | תרומה מקורית למשימה זו, או נתונים נגזרים מהמקורות המפורטים כאן; CC0-1.0 |

## תוכנה — MIT

`vendor/three.module.js`, `vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js` הם Three.js r160, Copyright © 2010–2023 Three.js authors, לפי [רישיון MIT המצורף](vendor/LICENSE.three). הועתקו מהריפו ללא שינוי. תנאי MIT נשמרים ואינם מוחלפים בהקדשת CC0.

Playwright/Chromium, Python/Pillow ו־Khronos glTF Validator משמשים לבנייה ולבדיקה מחוץ לחבילת הנכסים ואינם נמסרים כתלויות ריצה. אין צורך בהורדות רשת כדי להפעיל את התצוגה דרך שרת HTTP מקומי.

חתימות המקורות וחתימת כל קובץ מסירה נמצאות ב־[provenance.json](verification/provenance.json) וב־[inventory.json](verification/inventory.json). למלאי עצמו אין חתימה עצמית, כדי למנוע תלות מעגלית.

## soccer-kicks-v2 (codex/soccer-kicks-v2 d4a27a94dd63127dd9f38fc641db414bd09bac35)

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

## soccer-whistle-crowd-v1 (codex/soccer-whistle-crowd-v1 9478aa43b018d9aa2690a0f493006a3e52216af1)

MIT License

Copyright (c) 2026 Bakasun contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Scope and provenance
--------------------
This license covers all original files in soccer-whistle-crowd-v1, including
the synthesized audio, generator, manifest, report, and listening page.

All audio is generated mathematically by synthesize.py from seeded noise,
oscillators, glottal pulses, formant resonators, envelopes, and delay networks.
There are no external samples, field recordings, recorded human voices,
protected recordings, text-to-speech outputs, model weights, recognizable
songs, team chants, or third-party audio assets. The goal and miss reactions
are artificial vowel crowds, not recordings of people or voice imitations.

Build tools (Python, NumPy, SciPy, FFmpeg, libopus, libmp3lame) are not bundled.
They retain their own licenses. Playback needs only the supplied audio files.
