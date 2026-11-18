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
