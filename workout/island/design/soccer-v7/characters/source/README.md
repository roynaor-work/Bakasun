# שחזור מקורות הדמויות · soccer-v7

התוצרים המוכנים נמצאים בתיקייה שמעל: שמונה זהויות בדיוניות, שני LOD לכל זהות, מפות PBR ותצוגה מקומית. לפתיחת `../preview.html` אין צורך ב־Blender, ב־npm, בתהליך build או ברשת. הפקודות להלן הן כלי מחבר לשחזור התוצרים; הן אינן חלק מהפעלת המשחק.

כל הפקודות מניחות שתיקיית העבודה היא שורש הריפו `Bakasun`. הבנייה כותבת רק תחת `workout/island/design/soccer-v7/characters/`; כלי העזר מותקנים ב־`/tmp`. מקורות `soccer-v6` משמשים לקריאה בלבד. פירוט רישוי ומקורות נמצא ב־[character-provenance.md](character-provenance.md), וב־[ASSETS.md](../ASSETS.md) נמצאות מדידות הנכסים.

## סביבת המחבר

הגאומטריה נבנתה ב־Blender **4.3.2**, עם Python **3.13.5**, ‏NumPy **2.2.4**, ‏Pillow **11.1.0** ו־libwebp **1.5.0**. נדרשים NumPy ו־Pillow בתוך סביבת Python של Blender, כולל תמיכה ב־WebP. הבדיקה הבאה בודקת את המפרש שבאמת יריץ את המחולל:

```sh
PYTHONDONTWRITEBYTECODE=1 blender --background --factory-startup --python-expr "import bpy, numpy, PIL; from PIL import features; print('Blender', bpy.app.version_string, 'NumPy', numpy.__version__, 'Pillow', PIL.__version__, 'WebP', features.check('webp')); assert features.check('webp')"
```

אם יבוא נכשל, צריך להתקין את החבילה לסביבת Python ש־Blender משתמש בה. התקנה למפרש `python3` אחר אינה מבטיחה שהיא תהיה זמינה ב־Blender. למחולל התנועה ולשרת המקומי מספיק גם Python 3 רגיל.

לכלי המחבר ב־Node השתמשנו בחבילות הבאות. ההתקנה אינה יוצרת `package.json`, קובץ נעילה או `node_modules` בריפו:

```sh
mkdir -p /tmp/soccer-v7-tools
npm install --prefix /tmp/soccer-v7-tools --save-exact @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 draco3dgltf@1.5.9 gltf-validator@2.0.0-dev.3.10 esbuild@0.28.2
export SOCCER_ASSET_TOOLS=/tmp/soccer-v7-tools/package.json
export SOCCER_V7_TOOLS=/tmp/soccer-v7-tools/package.json
export PYTHONDONTWRITEBYTECODE=1
```

הדחיסה והטמעת התנועה משתמשות ב־`SOCCER_ASSET_TOOLS`; האריזה וחלק מכלי האימות משתמשים ב־`SOCCER_V7_TOOLS`. ברירת המחדל של שניהם היא הנתיב המוצג. Playwright ‏1.62.1 ו־Chromium נדרשים רק לצילומים ולבדיקות דפדפן; Sharp ‏0.35.4 משמש לקידוד תמונות הביקורת ולקריאת ממדי התמונות במלאי. כלי הדפדפן מחפשים את `playwright` ואת `sharp` דרך פתרון המודולים הרגיל של Node, ואת Chromium דרך `CHROMIUM_PATH` או `/usr/bin/chromium`; אין צורך בהם לבניית הגאומטריה. אפשר להתקין את חבילות הביקורת מחוץ לריפו ולחשוף אותן לכלי CommonJS באמצעות `NODE_PATH`:

```sh
npm install --prefix /tmp/soccer-v7-browser-tools --save-exact playwright@1.62.1 sharp@0.35.4
export NODE_PATH=/tmp/soccer-v7-browser-tools/node_modules
```

## מקורות ו־cache של העור

המחולל קורא את האנטומיה וה־shape targets שנכללו קודם ב־`workout/island/design/soccer-v6/characters/source/makehuman/`. הוא אינו מריץ או מעתיק את קוד תוכנת MakeHuman, ואינו משנה את הקבצים האלה. שני קובצי הגזרה המקומיים של החולצה נמצאים ב־`cc0-clothing/`; ההרשאה וההודעות ההיסטוריות שלהם נשמרו ומתועדות שם.

מקור העור באיכות 2048 הוא cache אופציונלי למחבר, מחוץ למוצר. אפשר להכינו כך:

```sh
export SOCCER_AUTHORING_SKIN_CACHE=/tmp/soccer-v7-authoring-skin
python3 workout/island/design/soccer-v7/characters/source/character_fetch_skin.py /tmp/soccer-v7-authoring-skin
```

הכלי מוריד חבילת נתונים רשמית בגודל **262,831,670 בתים**, מאמת SHA-256 לארכיון ולשתי תמונות העור, ומחלץ רק אותן עם `sources.json` ל־cache. הוא אינו מתקין חבילה במערכת. בשלב זה בלבד נדרשת גישה לרשת. `character_atlas.py` קורא את המשתנה `SOCCER_AUTHORING_SKIN_CACHE` בזמן היבוא.

ללא cache קיימת נפילה למפות 1024 שנכללו ב־v6; הבנייה נשארת מקומית, אך פירוט הפנים והפיקסלים יהיו שונים. לשחזור בחירת המקור של המסירה יש להשוות את `authoring.skinInputs` ב־`asset-manifest.json`: שם קובץ, ממדים ו־SHA-256. התמונות הגדולות והארכיון נשארים ב־`/tmp`; ה־GLB מכיל רק אטלס סופי בגודל **1024×1024**.

## בנייה מלאה

בחירת המחבר העדכנית משלבת את ענפי הניסוי שאושרו. יש לקבע אותם לפני בנייה או מדידת אטלסים; ללא המשתנים מופעלים ענפי הבסיס שנשמרו להשוואות ההיסטוריות:

```sh
export SOCCER_CHARACTER_CLOTH_VARIANT=18
export SOCCER_CHARACTER_CLOTH_FINISHING=31
export SOCCER_CHARACTER_EYE_VARIANT=19
export SOCCER_CHARACTER_FACE_VARIANT=27
export SOCCER_CHARACTER_MOUTH_COMPRESSION=.40
export SOCCER_CHARACTER_EYE_CLOSURE_EXTRA=.05
export SOCCER_CHARACTER_EYE_COLOR_FACTOR=.88
export SOCCER_CHARACTER_HAIR_VARIANT=29
export SOCCER_CHARACTER_HAIR_TEXTURE_VARIANT=20
export SOCCER_CHARACTER_HAIR_NORMAL_FIELD=projected
export SOCCER_CHARACTER_CROWN_OWN_NORMAL=.20
export SOCCER_CHARACTER_CROWN_FLYAWAYS=1
export SOCCER_CHARACTER_HAIR_MACRO_SHAPE=31
export SOCCER_CHARACTER_HAIR_MACRO_IDS=player-03
export SOCCER_CHARACTER_FAR_CAP=32
export SOCCER_CHARACTER_SOCK_VARIANT=23
export SOCCER_CHARACTER_HAIR_SIDEDNESS=front-straight
```

תחילה מייצרים את נתוני התנועה אם שינו אותם. זהו מחולל של תנועות מחוברות ודגומות, ללא נתוני motion capture של אדם:

```sh
python3 workout/island/design/soccer-v7/characters/source/motion-build.py
```

בנייה מלאה של הדמויות מייצרת 16 קובצי GLB ביניים, שלוש מפות לאותה פריסת UV לכל זהות ו־`asset-manifest.json`. שחקנים 01–03 משתמשים בערכה בצבע טורקיז, 04–06 בענבר; לשוער ולשופט צבעי תפקיד נפרדים. אין סמלים, מותגים או זהויות של אנשים אמיתיים.

```sh
PYTHONDONTWRITEBYTECODE=1 blender --background --factory-startup --python workout/island/design/soccer-v7/characters/source/character_build.py
node workout/island/design/soccer-v7/characters/source/character_compress.mjs
```

האטלס כולל base color עם alpha ב־WebP, normal ב־PNG עם פלטת 256 צבעים, ו־ORM ב־PNG עם פלטה מדויקת. חמשת החומרים משתמשים באותה פריסת UV ובאותן שלוש מפות, ללא תמונה נוספת לעדשה. `EXT_texture_webp` נדרש למפת הצבע; Draco משמש לגאומטריה. הדוח הסופי מודד את הקובץ לאחר כל שלבי האריזה מול **1,500,000 בתים לכל GLB**.

באזור העיניים בלבד, ערוץ R של ORM משמש מסכה לקרנית ו־AO כבוי בחומר העין; G ממשיך לייצג roughness ו־B נשאר metallic אפס. החומר הנוסף EyesCornea הוא עדשה קמורה ואטומה עם אותו אטלס, clearcoat ו־IOR 1.376; הוא מציג השתקפות תאורה אמיתית ללא נקודת אור מצוירת, מתאם blend, shader מותאם או מעבר transmission. העדשה מסתירה את שקע הקשתית שמתחתיה; העומק הנראה מגיע מהארובה, העפעפיים ומקמירות העדשה. ניסוי additive נשמר להשוואה בלבד ואינו חומר ברירת המחדל.

אפשר למדוד מחדש את שגיאת הקידוד מבלי לשנות את הנכסים. הכלי בוחר את ענפי האטלס מתוך מתכון המסירה ב־`asset-manifest.json`, יוצר מועמדים בתיקייה חדשה ב־`/tmp`, שומר את התמונה המדויקת שלפני WebP ושלפני פלטת normal, ומשווה כל ערוץ לקובץ המסירה. ללא `--write` הוא משאיר רק דוח זמני; הדגל מעדכן את `character-texture-quality.json` רק אם כל 24 הקבצים תואמים. הדוח קושר את 18 קובצי המקור הרלוונטיים, כולל כלי המדידה עצמו, ואת מתכון המסירה והפיקסלים המדויקים:

```sh
PYTHONDONTWRITEBYTECODE=1 blender --background --factory-startup --python workout/island/design/soccer-v7/characters/source/character-measure-textures.py -- --write
```

לסבב ממוקד אפשר לבחור מזהי דמויות אחרי `--` של Blender. זו בחירה בשם זהות, לא דגל של המחולל:

```sh
PYTHONDONTWRITEBYTECODE=1 blender --background --factory-startup --python workout/island/design/soccer-v7/characters/source/character_build.py -- player-01
node workout/island/design/soccer-v7/characters/source/character_compress.mjs asset-manifest-player-01.json
```

למועמד מבודד, אפשר לייצא את קובצי הביניים ל־`/tmp` ולכתוב רק GLB דחוס ומפות לתיקיית מועמד חדשה. כך לא משנים את המודלים או את ה־manifest של התצוגה הקיימת:

```sh
SOCCER_CHARACTER_OUTPUT=/tmp/soccer-character-candidate PYTHONDONTWRITEBYTECODE=1 blender --background --factory-startup --python workout/island/design/soccer-v7/characters/source/character_build.py -- player-01 goalkeeper
SOCCER_CHARACTER_INPUT=/tmp/soccer-character-candidate SOCCER_CHARACTER_OUTPUT="$PWD/workout/island/design/soccer-v7/characters/source/character-candidate" node workout/island/design/soccer-v7/characters/source/character_compress.mjs asset-manifest-player-01.json
```

הקבצים הלא דחוסים נשארים זמניים; יש לבדוק ש־GLB שנשמר בסגל או במועמד עומד בגבול 1,500,000 בתים. המניפסט של המועמד יחסי לתיקיית הפלט שלו, ואינו מחליף אוטומטית את מניפסט התצוגה. `SOCCER_CHARACTER_RUNTIME_OUTPUT` יכול לקבע מראש את מיקום ההתקנה הסופי לצורך נתיבי השלד היחסיים, כשהקבצים עדיין נכתבים לתיקיית מועמד נפרדת.

מזהים תקינים: `player-01` עד `player-06`, `goalkeeper`, `referee`. בחירה חלקית כותבת `asset-manifest-<first-id>.json` עם הדמויות שנבחרו; היא אינה מניפסט מסירה מלא. אין להחליף את המניפסט הראשי בפלט חלקי או לארוז ממנו תצוגה כאילו כל הסגל נבדק.

## הטמעת תנועה ואריזה סופית

`motion-embed.mjs` מטמיע את הקליפים אחרי יצירת הגאומטריה הרגילה ולפני תיקון המותן המתואר להלן. הוא מעדכן קבצים, גדלים וחתימות. אין להריצו מחדש על קובצי waist36 עם accessors שנוספו אחרי ההטמעה; יש להשתמש במאמת התנועה השמורה. פקודת שלב ההטמעה הראשוני היא:

```sh
node workout/island/design/soccer-v7/characters/source/motion-embed.mjs
```

בדיקת תקציב שאינה מחליפה GLB אפשרית באמצעות `--dry-run`, ולבדיקה חלקית באמצעות `--dry-run --only=models/referee-lod0.glb`. גם dry-run כותב דוח preview; הוא אינו דוח ההטמעה הסופי. ההטמעה כוללת 31 קליפים של glTF ב־30Hz, עם 18 ערוצי סיבוב ותרגום לאגן. מסלול הדמות בעולם, נעילת רגליים ו־IK לאחר מעבר נשארים באחריות מתאם התנועה; הם אינם נעשים אוטומטית בידי נגן GLB רגיל. ראו [motion-README.md](motion-README.md).

אחרי שינוי GLB, תנועה או קוד פתרון מגעים יש לחדש את האימות ומעטפת הרצפה לפני אריזת התצוגה:

```sh
node workout/island/design/soccer-v7/characters/source/audit.mjs
node workout/island/design/soccer-v7/characters/source/boot-bounds.mjs --convex-hull
node workout/island/design/soccer-v7/characters/source/floor-envelope.mjs
node workout/island/design/soccer-v7/characters/source/package-viewer.mjs
```

בדיקת מעטפת הנעליים יוצרת `verification/boot-bounds.json` ומוכיחה תמיכה והכלה מול 16 המודלים המדויקים. היא משתמשת בכלי מחבר בלבד: NumPy 2.3.5 ו־SciPy 1.17.0 ב־Python של המארח; גרסאות Blender/NumPy/Pillow של מחולל האטלס נשארות כפי שתועדו לעיל. אין תלות כזו בזמן צפייה. אחרי שינוי או הטמעה ב־GLB יש לחדש את ההוכחה מפני שהיא קשורה לחתימות המודלים.

מעטפת הרצפה סורקת את כל הקודקודים אחרי skinning ו־IK ועלולה להימשך זמן רב. היא תקפה לקליפים מדויקים ולחתימות שנמדדו; מעברים שנקטעו דורשים בדיקה נפרדת של הפוזה המוצגת. `package-viewer.mjs` בודק שה־SHA ב־manifest תואם לקבצים, ואז מייצר payloads מקומיים ב־`offline/` ואת קוד הצופה ונתוניו ב־`vendor/`. הוא כולל מעטפת רצפה רק אם חתימות המודל, התנועה והמתאם תואמות. לכן אין להריץ דחיסה או הטמעת תנועה נוספת אחרי האריזה בלי לחדש את החתימות והבדיקות.

התצוגה המוכנה משתמשת ב־three.js r160, ב־Draco ובנתונים מקומיים. אין build בזמן צפייה. קוד האריזה תומך ב־`file://`; בסביבת הבדיקה המנוהלת מדיניות Chromium חסמה פתיחת קבצים, ולכן הצילומים נעשו דרך שרת localhost עם חסימת בקשות לרשת חיצונית. אפשר להריץ את השרת האופציונלי:

```sh
python3 workout/island/design/soccer-v7/characters/source/serve.py --port 8765
```

ואז לפתוח `http://127.0.0.1:8765/preview.html`. השרת מאזין רק למחשב המקומי ואינו נדרש במכשיר שמאפשר פתיחת ה־HTML המקומי ישירות.

## מפת המודולים

| קובץ | תפקיד |
| --- | --- |
| `character_build.py` | מורפים אנטומיים בדיוניים, התאמת בגדים, skin בן 18 עצמות, LOD ויצוא GLB ביניים |
| `character_atlas.py` | חלוקת אטלס, חיתוך פנים, UV של חולצה, normal, roughness, alpha וקידוד המפות |
| `character_face_helper.py` | היטל גבות על העור ומדידות פתח עין |
| `character_face27.py` | עידון C1 מקומי של הלחי ונפח גבה לפני חלוקת־משנה והתאמת העיניים |
| `character_hair.py` | קרקפת אנטומית וכרטיסי שיער מעוקלים ותלתלים מקוריים |
| `character_hair29.py` | חלוקת רצועות כתר ארוכות לקווצות קצרות וחופפות תוך שימור השוליים הדקים |
| `character_hair31.py`, `character_hair_shape31.py` | שכבת קצוות כתר זעירה ונפח משותף מאושר רק ל־P03 |
| `character_farcap32.py` | ריתוך קרקפת LOD1, שימור UV, כיסוי 216 קרניים ומיפוי לתחום האטום הקיים |
| `character_cloth_finish.py` | תיקון מרווח הקולר מול Skin שנמסר ושני קפלי מתח עליונים, ללא שינוי טופולוגיה/UV/משקלים |
| `character_groom_atlas.py` | שכבת שיער אטומה עם סיבים וקשתות קטנות במפת normal |
| `character_seams.py` | תפרים גאומטריים, מכפלת רציפה ובדיקת מרווח אחרי פישוט |
| `character_fetch_skin.py` | הורדה מאומתת של שתי מפות עור ל־cache המחבר בלבד |
| `character-measure-textures.py` | השוואת WebP ופלטות מול 24 מפות המסירה, עם פלט מועמדים ב־/tmp בלבד |
| `character-waist36.mjs` | תיקון משקלי מכנסיים ברצועת האגן, אחרי הטמעת תנועה וללא קידוד Draco מחדש |
| `motion-native-verify.mjs` | אימות 31 קליפים שמורים ללא כתיבה ל־GLB לאחר התיקון |
| `character_compress.mjs` | קימפקט של primitives, נרמול משקלים, Draco, מדידת משולשים ו־SHA-256 |
| `motion-build.py`, `motion-runtime.js` | נתוני תנועה קנוניים דגומים ומתאם דגימה, ערבוב ו־IK |
| `motion-embed.mjs` | הטמעת 31 קליפים רגילים בכל GLB לאחר הקפאת הנכסים |
| `audit.mjs`, `audit-skinning.mjs` | אימות Draco/GLB/טקסטורות ושלד; השוואת skinning מול הצופה |
| `boot-bounds.mjs --convex-hull` | מעטפת תמיכה של הנעליים במרחב Foot, עם הוכחת הכלה מול 16 חתימות GLB |
| `floor-envelope.mjs`, `audit-transitions.cjs`, `audit-transition-matrix.cjs` | מרווח רצפה ומדידת מעברים בפוזות המוצגות |
| `package-viewer.mjs`, `scene.js`, `props.js` | אריזת HTML מקומית, תאורת הבמה והאביזרים |
| `capture.mjs`, `capture-roster.mjs` | צילומי סבב וסגל בשתי מידות הטלפון; ביקורת הסבב נכתבת בנפרד |
| `audit-cpu.mjs` | פרופיל CPU ורינדור של דפדפן המחשב, עם תיעוד המשאבים שהוגשו בפועל |
| `audit-ui.mjs` | בדיקה דרך פקדי DOM, מקלדת ועכבר בפועל: בחירה, ציר זמן, ניגון, LOD, תאורה, מגרש ושינוי כיוון המסך |

הפקודות משחזרות תהליך מחבר עם התלויות שצוינו; הבדל גרסאות, מקור עור או פרמטרים עשוי לשנות את הבתים והחתימות. בדיקות מבניות אינן דירוג חזותי, ופרופיל SwiftShader אינו מדידת 30fps בטלפון פיזי. מצב האיכות, תוצאות הבדיקות והפערים שנותרו מתועדים ב־[REPORT.md](../REPORT.md) וב־`iterations/NN/REVIEW.md`.

## בחירת חומר השיער והתקנת סגל שאושר

ההשוואה ב־`../iterations/23/preflight/hair-side-probes/` הראתה ש־FrontSide מסיר שאריות כתר כהות בתספורות הישרות. בבדיקת השוער אותו culling הפחית כיסוי ברקה, ולכן שתי זהויות התלתלים שומרות DoubleSide; שש האחרות משתמשות FrontSide. אין שינוי בגאומטריה, בתמונות או במספר החומרים.

`character_material24.mjs` מדגים את שינוי דגל החומר בלבד בתיקיית מועמד חדשה ושומר הוכחת BIN ותמונות ללא שינוי. `character_promote.mjs` מאמת את כל 16 המודלים ו־24 המפות לפני העתקה למיקום הסופי; הוא אינו מפענח או דוחס שוב את הגאומטריה. משתמשים בו רק לסגל מלא שכבר נבדק חזותית:

```sh
node workout/island/design/soccer-v7/characters/source/character_material24.mjs source/character-candidates23-final source/character-candidates24-final
node workout/island/design/soccer-v7/characters/source/character_promote.mjs source/character-candidates24-final
```

לאחר ההתקנה יש להטמיע שוב תנועה ולחדש את מעטפות הנעליים והרצפה, האימות וחבילת התצוגה. אין להריץ התקנה נוספת אחרי שלבי הסגירה בלי לחדשם.


## Final append-only waist36 correction

Round35's actual motor movie exposed a large shorts wedge through the front jersey during sprint. The shorts inherited the raised thigh while the sewn jersey hem followed Hips/Spine. The selected correction changes only shorts skin weights, transitioning smoothly over bind-space Y=0.70–0.84 m toward the existing torso pelvis rule. The rest geometry, atlas UVs, positions, normals, indices, materials, all 24 image files, Skin/eye skinning, canonical rig and 31 native clips remain unchanged. The complete original BIN remains a byte-exact prefix.

`character-waist36.mjs` reads Draco-decoded point order and appends `UNSIGNED_BYTE` JOINTS_0 and `FLOAT` WEIGHTS_0 for the Cloth primitive. Only those two semantic mappings are removed from its Draco extension so standard r160 GLTFLoader reads the new raw accessors. It refuses an already patched input, a partial roster, a missing native motion set, a shared skin accessor or any file over 1,500,000 bytes. It writes a separate candidate stage. Do not recompress the resulting GLBs, rerun the legacy native writer, or promote a partial stage.

The preserved pre-fix input is `../iterations/35/frozen-package/`. From the repository root, reproduce all 16 exact model bytes without Blender or the high-resolution skin cache:

```sh
node workout/island/design/soccer-v7/characters/source/character-waist36.mjs --input=workout/island/design/soccer-v7/characters/iterations/35/frozen-package --output=/tmp/soccer-v7-waist36-reproduced
```

The candidate tool's `patch-proof.json` records each source/output SHA, original BIN prefix, changed vertices, original/new byte counts and Khronos errors. `character-waist36-report.json` records the installed cohort and local baseline provenance. The candidate manifest has a candidate scope and requires explicit reviewed publication; it is not a replacement for the packaged live manifest. The accepted 16-model output was regenerated and compared byte-for-byte before publication.

For a completely new authoring run, order the stages as: anatomical build → Draco compression → native 31-clip embedding → waist correction → retained-native verification → fresh structural, boot, floor, contact and LOD checks → viewer packaging. The final set is 19,289,784 bytes, largest `player-04-lod0.glb` 1,494,560 bytes. After publication, model-bound proof hashes must be regenerated; unchanged Skin geometry does not make an old whole-mesh floor report current. See `../iterations/36/preflight/waist/` for locked-camera original/candidate frames and bounded gait/skin regressions, and `../iterations/36/preflight/runtime-support/` for actual controller contact/LOD evidence. Neither constitutes an 8/10 visual-quality claim or a physical-phone frame-rate measurement.
