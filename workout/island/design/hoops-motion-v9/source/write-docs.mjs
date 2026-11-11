#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {CATALOG} from '../runtime/catalog.mjs';
const root=new URL('../',import.meta.url);
const source=c=>`source/${c.group==='locomotion'?'locomotion':c.group==='attack'?'attack':'actions'}.mjs`;
const lines=['# מקורות ורישיונות — hoops-motion-v9','','כל 83 ביצועי התנועה נכתבו פרוצדורלית עבור משימה זו. לא הועתקו, הומרו או נדגמו קליפי אנימציה קיימים; לא נעשה שימוש ב־motion capture או בנתוני אדם אמיתי. שורות הטבלה מזהות כל קובץ GLB, את פונקציית הביצוע לפי מזהה הקטלוג, ואת הרישיון.','','המחברים מקדישים את נתוני התנועה, מסלולי הכדור, סמני המגע, ודמות הבדיקה והגאומטריה המקוריות לנחלת הכלל תחת [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode). לכל קליפ חלות אותה הקדשה ואותו רישיון.','','| קליפ GLB | מקור ביצוע מקורי | רישיון |','|---|---|---|',...CATALOG.map(c=>`| runtime/clips/${c.id}.glb | [${source(c)}](${source(c)}), pose(meta.id=${c.id}) | CC0-1.0 |`),'',
'## רכיבים נוספים','','| רכיב | מקור | רישיון |','|---|---|---|',
'| דמות הספורטאי, חולצה, מכנסיים, נעליים, פנים, ידיים וכדור | source/model.mjs; גאומטריה פרוצדורלית מקורית, ללא רשתות או טקסטורות חיצוניות | CC0-1.0 |',
'| שמות 18 העצמות, הורים, היסטי מנוחה וצירים | ../motion2/hoops.json, snapshot ב־runtime/skeleton.mjs; חוזה קיים ללא שינוי | חוזה השלד במאגר; אינו קליפ תנועה |',
'| פעולות וקטוריות, קווטרניונים ו־IK בשתי עצמות | source/authoring.mjs, מותאם מכלי החיבור המקוריים CC0 של ../hoops-motion-v8/source/motion-author.mjs; ללא פונקציות ביצוע או דגימות תנועה של v8 | CC0-1.0 |',
'| Three.js r160, GLTFLoader, DRACOLoader, BufferGeometryUtils | עותקים מה־vendor של v8, מקורות upstream https://github.com/mrdoob/three.js/tree/r160 | MIT; נוסח מלא runtime/vendor/LICENSE.three |',
'| מפענח Draco WASM ועטיפה | ../hoops-motion-v8/runtime/vendor/draco; https://github.com/google/draco | Apache-2.0; נוסח והודעות מקור runtime/vendor/draco/LICENSE.draco |',
'| Worker סטטי של Draco | פרוטוקול Three r160 מתוך v8; הודעת מקור בראש הקובץ | MIT; runtime/vendor/LICENSE.three |',
'| ממשק library ו־node-adapter | התאמה חדשה לממשק v8 הקיים במאגר; אין העתקת נתוני ביצוע | תנאי קוד המאגר ורישיונות ה־vendor לפי העניין |',
'| HTML, דוח וצילומי מסך של הביצועים המקוריים | קבצים מקוריים למשימה זו; צילומים מ־WebGL של ה־GLB שנמסר | CC0-1.0 ליצירה המקורית; ה־vendor שומר על רישיונו |','',
'כלי ההפקה @gltf-transform, Draco encoder, Playwright ו־gltf-validator מותקנים מחוץ למאגר. רישיונות כלי ההפקה אינם רישיון של קליפי התנועה. קובצי v8 נשארו במקומם; החבילה החדשה אינה משכפלת את 15 קליפי runtime של v8 או את תשעת הקליפים המקוריים של motion2.',''];
await writeFile(new URL('LICENSES.md',root),lines.join('\n'));
