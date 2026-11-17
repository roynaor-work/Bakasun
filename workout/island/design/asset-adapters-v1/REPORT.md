# Asset adapters v1

תאריך הבדיקה: 17.11.2026. ענף: `codex/asset-adapters-v1`. בסיס: `43b27dc235387e3cb737aee9558cdf9d5fd5a262`.

קריטריון סיום: מתאם עצל לכל 34 החבילות, מלאי חתום, תכנית העתקה ואופליין ובדיקות טעינה/כשל/dispose, בקבצים חדשים בלבד. 34/34 החבילות אינן מחוברות בקוד הריצה של בסיס זה; עדות החיפוש ורשימת ההחרגות מופיעות ב־catalog.json. תאריך יצירת ענף אינו נתון ש־Git שומר; נבדקו במפורש הענפים שצוינו בבקשה, לפי קומיטי המקור הנעולים שלהם.

נבחרו 1296 קבצים להעתקה: **136,241,471 B (129.93 MiB)** כולל רישיונות. החבילות עצמן אינן מועתקות ואינן מחוברות בשינוי הזה. 33 מתאמים זמינים לטעינת הנכסים; soccer-kits-venues-v1 נשארת ב־fallback עד למסירת 12 דגמי GLB ללא Draco. הקבצים החסומים מתועדים תחת unsupported ואינם נכללים בהעתקה, באופליין או בטעינה.

Draco יכול להתפענח גם במימוש JavaScript נפרד; במאגר הנוכחי קיים רק מפענח Draco ב־WASM, והמסירה אינה מוסיפה מפענח. לכן הטוען המובנה דוחה את 12 הקבצים האלה, ונדרשת מסירה ללא דחיסה כדי להשתמש בהם בגרסה זו.

כל קוד המסירה הוא JavaScript ב־ES modules, ללא חבילות npm או WASM. המתאמים מחזירים נתוני נכסים; קוד המשחק המארח אחראי על פירוש GLB באמצעות GLTFLoader הקיים, יצירת טקסטורות/צלילים ומיפוי אירועי המשחק. קוד עזר מקורי של חבילה שמוחזר כטקסט אינו מופעל, מוזרק ל־DOM או מוערך.

## מלאי לפי חבילה

הגודל הוא סכום הבתים המדויק לאחר העתקה, כולל הודעות הרישוי, ללא מקורות בנייה, תמונות ביקורת, סרטוני/דפי תצוגה וספריות vendor. נתיבי היעד נשמרים יחסית ל־assets/<pack>/. החריג היחיד: מודל ייחוס GLB של טניס שנדרש בריצה הועתק בתכנית מ־source/reference/ אל reference/; קובץ מקור עריכתי אינו מועתק.

| חבילה | גודל אחרי העתקה | תלות | מה חסר / נדרש בחיבור |
|---|---:|---|---|
| hoops-realism-v2 | 3,722,297 B (3.55 MiB); 76 קבצים | GLTFLoader ו־AnimationMixer של המארח; שלד Canonical18 לשחקנים; בורר LOD לקהל; OGG או MP3 לניגון הצלילים. | השלמת שרשרת רישוי לשיער ולנעליים של שחקני הבסיס, כפי שמוצהר ברישיון החבילה. |
| hoops-motion-v14 | 12,006,563 B (11.45 MiB); 28 קבצים | שלד Canonical18 ו־GLTFLoader/AnimationMixer של המארח; runtime/reference/athlete.glb כלול.; runtime/player.mjs תלוי ב־../../soccer-header-v1/runtime/player.mjs; ההעתקה שומרת אותו כטקסט בלבד.; קטלוג referenceClips מפנה ל־hoops-motion-v13 עבור idle/run; אלה הפניות למעברים ואינם חלק מ־20 קליפי v14. | אם משתמשים בגשרי ה־JavaScript המקוריים, יש לנתב את הייבוא המשותף ל־soccer-header-v1 ולמפות את הפניות v13 לנכסים זמינים. |
| hoops-arena-v2 | 2,184,032 B (2.08 MiB); 8 קבצים | GLTFLoader עם KHR_mesh_quantization רגיל; אין צורך במפענח או WASM.; תאורה, מיפוי גוון ו־LOD/איחוד ציור באחריות המארח. arena.mjs המקורי דורש bare import של three ושני נתיבי vendor מקומיים שאינם מועתקים. | בירור תנאי הרישוי של המאגר לפני הפצה מחוץ למאגר; החבילה אינה מעניקה CC0 לנכסים.; לשימוש ב־arena.mjs יש לנתב imports לתלויות Three.js של המארח; במתאם הוא נמסר כטקסט בלבד. |
| tennis-motion-v2 | 7,213,613 B (6.88 MiB); 8 קבצים | GLTFLoader/AnimationMixer ו־WebP של המארח; שלד Canonical18 עם racket_mount, grip_hand_L ו־Ball בהתאם לקטלוג.; reference/grip-player.glb הוא מודל זמן ריצה עצמאי, שהועתק ללא שינוי מ־source/reference; הקטלוג המקורי נשמר ללא עריכה. | יש להשתמש ב־get('reference/grip-player.glb') עבור הדמות: catalog.referenceAsset המקורי מפנה ל־source/reference/grip-player.glb שהועבר אל מחוץ ל־source/.; תנועת העולם בריצה ואירועי פגיעת הכדור נשארים בשליטת הסימולציה; יש למפות את אירועי הקטלוג. |
| tennis-ui-v2 | 293,891 B (0.28 MiB); 61 קבצים | נכסי PNG/SVG ו־CSS מקומיים; נדרש מארח DOM המייצר את מבנה data-* שבחוזה הממשק.; tennis-config.js ו־tennis-ui.js הם סקריפטים קלאסיים המגדירים window.TENNIS_UI_V2_CONFIG/window.TennisUIV2; המתאם חושף אותם כטקסט ואינו מריץ אותם. | חיבור סמנטיקת ההגשה, השליטה ומיקום האפקטים לאירועי המשחק; שימוש חוזר בבקר המקורי מצריך עטיפת ES module או מימוש מארח. |
| tennis-crowd-people-v2 | 3,210,358 B (3.06 MiB); 16 קבצים | GLTFLoader ו־AnimationMixer; כל GLB כולל טקסטורה ומודלים ל־LOD0/1/2 כסצנות נפרדות. | על המארח לבחור סצנת LOD אחת לכל אוהד ולשמר זמן אנימציה בזמן החלפה; אלה אינם MSFT_lod אוטומטיים. |
| soccer-crowd-people-v2 | 2,563,087 B (2.44 MiB); 50 קבצים | GLTFLoader ו־AnimationMixer; 16 דמויות כפול 3 קובצי LOD עם טקסטורות מוטמעות. | יש לבחור GLB אחד לכל אוהד לפי גובהו במסך ולשמר זמן קליפ במעבר בין רמות הפירוט. |
| soccer-run-cycles-v3 | 21,883,878 B (20.87 MiB); 22 קבצים | GLTFLoader/AnimationMixer או sampler מבוסס runtime/motions.json; שלד Canonical18. runtime/player.mjs הוא מודול עצמאי ללא imports. | תרגום עולם, כיוון, אירועי כדור ועוגני תמיכה/IK במעברים שרירותיים באחריות המארח, לפי מהירויות הקטלוג. |
| soccer-keeper-motion-v3 | 16,789,355 B (16.01 MiB); 21 קבצים | GLTFLoader/AnimationMixer או sampler מבוסס motions.json; שלד Canonical18. runtime/player.mjs עצמאי ללא imports. | מיפוי possession_transfer, שחרור הכדור ושיקוף הזינוקים לסימולציה; referenceTravel אינו תרגום Root אוטומטי. |
| soccer-celebrations-v1 | 12,055,471 B (11.50 MiB); 16 קבצים | GLTFLoader ו־AnimationMixer; שעון משותף לכל משתתפי הכוריאוגרפיה. | תנועת העולם אפויה ב־Root: יש להציב מקור קבוצה פעם אחת ולשמור סנכרון משתתפים ומגעים בזמן קטיעה. |
| soccer-kits-venues-v1 | 42,012 B (0.04 MiB); 6 קבצים | כל 12 קובצי ה־GLB המקוריים דורשים KHR_draco_mesh_compression; המפענח היחיד בענף הוא WASM ולכן אינו מועתק.; apply.mjs דורש ./vendor/three.module.js של המארח; הוא נמסר כטקסט בלבד. | חסומות שמונה ערכות, ספריית הספרות ושלוש הזירות: אין חלופה בלתי דחוסה בענף; נדרשת מסירת GLB ללא Draco כדי לטעון תחת איסור WASM. |
| fire-multifloor-v2 | 4,293,883 B (4.09 MiB); 29 קבצים | המארח מפענח GLB רגיל באמצעות GLTFLoader ו־AnimationMixer של Three.js; runtime.mjs עצמאי ומוחזר כטקסט. | חיבור קומות בהיסט 3.2 מ׳, מצבי burn_/intact_/burnt_, סולם ועוגני מים למנוע האש; האטלסים אינם מערכת חלקיקים מוטבעת. |
| fire-rescue-people-v2 | 5,236,481 B (4.99 MiB); 14 קבצים | GLTFLoader, AnimationMixer ושכפול שלד עצמאי במארח; 18 עצמות קנוניות והקליפים מוטבעים. | חיבור בחירת ציוד לפי clip.equipment, נשיאה בזוג ועוגני פיות; scale כבר נאפה ל־GLB ואין להכפילו שוב. |
| fire-fx-v2 | 433,572 B (0.41 MiB); 3 קבצים | מנוע ציור Canvas או WebGL התומך WebP ובמלבני אטלס; קודקודי UV ופיבוט במניפסט. | חיבור מצבי האש וכיבוי לאנימציות האטלס; נדרשת אינטרפולציית RGBA מוכפלת־אלפא ומיון השכבות המוגדר במניפסט. |
| alpine-runner-v1 | 1,732,339 B (1.65 MiB); 49 קבצים | המארח מספק GLTFLoader ו־AnimationMixer של Three.js; כל 26 ה־GLB מכילים נתונים פנימיים. | חיבור מנוע שלושה נתיבים ואריחי 30 מ׳; גובה הקפיצה מובנה בצומת Root ואין להוסיף אותו שוב; חיבור lane-change נעשה בעולם. |
| alpine-content-v1 | 1,112,009 B (1.06 MiB); 61 קבצים | GLTFLoader/AnimationMixer במארח עבור GLB; effects/runtime.mjs מקבל את THREE, הסצנה והטקסטורות של המארח ומוחזר כטקסט. | חיבור תנועה לרוחב ותזמון הופעת מפריעים; נדרש collider מסונכרן לעץ הנופל ברדיוס 4.5 מ׳; בוחרים חלופת GLB או חלקיקים רציפים לאותה פליטה. |
| aliens-weapons-v2 | 945,195 B (0.90 MiB); 80 קבצים | Canvas/WebGL לאטלסי PNG ו־SVG; Web Audio או HTMLAudio לפענוח OGG/MP3 ולפתיחת שמע במחוות משתמש. | חיבור מיפוי כלי הנשק הקיימים להנחיית טיל, חדירה, מטען, זוג טילים ומלאי; המניפסט מתאר נכסים ואינו מממש נזק. |
| alien-hits-v1 | 429,283 B (0.41 MiB); 16 קבצים | מנוע Canvas/WebGL לאטלסים ושמע OGG/MP3; אין תלות במודלי החלליות או ברינדורי ההדגמה. | חיבור earliest swept contact ומחיקת הקליע בפגיעה הראשונה; המרת נקודת הפגיעה למערכת החללית והפעלת שכבות לפי ספי HP. |
| alien-enemies-v2 | 2,923,264 B (2.79 MiB); 51 קבצים | Canvas/WebGL עם תמיכת PNG; patterns.json מגדיר מסלולים ותקיפות לצריכת מנוע המשחק. | חיבור hitbox, שריון, פיצול והתחמקות לקוד הפגיעות; אטלסי המסגרות ומסלולי JSON אינם סימולציית המשחק. |
| boars-weapons-v2 | 694,540 B (0.66 MiB); 38 קבצים | GLTFLoader רגיל ללא Draco; effects.mjs מקבל את THREE של המארח ומוחזר כטקסט; שמע OGG/MP3. | מניפסט האופליין ב־main אינו כולל דלי boars; יש לחבר games.boars או לבחור שיוך במועד האינטגרציה.; חיבור מסלולי קליעים, פיזור, פגיעות ו־WeaponEffects; ספריות/מודל Draco המוזכרים בסעיף preview אינם חלק מתכנית ההעתקה. |
| boars-world-v1 | 1,585,048 B (1.51 MiB); 25 קבצים | GLTFLoader ו־AnimationMixer במארח; SkeletonUtils.clone לשכפול חזיר עם שלד עצמאי; אין תלות בטקסטורות. | מניפסט האופליין ב־main אינו כולל דלי boars; יש לחבר games.boars או לבחור שיוך במועד האינטגרציה.; חיבור תנועת העולם לקבוצה חיצונית: ארבעת הקליפים מונפשים במקום; החלפת שלושת מצבי היום לפי scene.json. |
| catch-vehicles-v2 | 3,769,619 B (3.59 MiB); 17 קבצים | GLTFLoader/AnimationMixer במארח; בקר הרכב כטקסט משתמש ב־./vendor/engine.mjs המיועד לתצוגה ואינו מועתק. | לפני ייבוא vehicle-controller.mjs יש להתאים את ייבוא המנוע ל־Three.js המקומי של המארח או לספק loadAsset מותאם; הפונקציות אינן מופעלות אוטומטית.; נדרשת בחירת סצנה intact/damaged/crushed והפעלת בקר אחד לכל גלגל; אין להריץ בקר ו־AnimationMixer על אותו גלגל. |
| catch-city-v1 | 681,633 B (0.65 MiB); 32 קבצים | GLTFLoader ו־AnimationMixer במארח; walk בקובצי הולכי הרגל ב־30Hz, תנועת עולם 0.90 מ׳/ש׳ לאורך +Z. | LICENSES.md מגדיר את רוב הנכסים repository-original ותנאי בעל המאגר ללא רישיון SPDX מפורש; נדרשת הבהרת הרשאת הפצה.; יש ליצור colliders מורכבים לגשר ולמנהרה כדי לשמר פתחים ולחבר מסלולי הולכי רגל ותנועה. |
| naval-sinking-v1 | 11,189,199 B (10.67 MiB); 24 קבצים | נגן אטלסים ב־Canvas 2D לפי הפריימים והעוגנים במניפסט, במבט אלכסוני קבוע; פענוח Ogg או MP3 בדפדפן והפעלת שמע במחוות משתמש. אטלסי התמונות אינם דורשים את קובצי ה־GLB המקוריים. | אין בחבילת המקור הוכחת רישוי עצמאית עבור atlases/{patrol,gunboat,legacy-enemy,legacy-boss}.png והתאים המתאימים ב־hulls.png. למצלמת תלת־ממד נעה יש להציב את האפקטים כספרייטים ולממש נזק וטביעה של גוף תלת־ממדי בנפרד. |
| naval-sea-v2 | 4,779,445 B (4.56 MiB); 33 קבצים | Three.js ו־GLTFLoader מקומיים של המארח למודלים; טקסטורות sRGB, קצף באלפא ישרה ופרמטרי דגימת מים ומפות נורמל מהמניפסט. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| racing-themes-v1 | 751,218 B (0.72 MiB); 42 קבצים | מנוע המרוצים של המארח צריך לצרוך פלטות תאורה, שכבות רקע בפרלקסה, טקסטורות כביש חוזרות ואטלסי אביזרים בני שישה תאים. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| racing-customize-v1 | 1,351,057 B (1.29 MiB); 121 קבצים | Three.js ו־GLTFLoader מקומיים וסצנת Formula מקורית עם השמות Body/FrontWing/RearWing/Helmet/Wheel. ההרכבה נעשית על עותק נפרד לכל רכב, לפני מיזוג; יש להחריג בהמשך חלקים נסתרים ומתחלפים מ־mergeFormula. מודולי runtime/*.mjs נמסרים כטקסט; בחיבור אפשר לייבא אותם במפורש, והמארח אחראי לבעלות על הגאומטריה והטקסטורות החיצוניות. | מערכת המטבעות, הרכישות ושמירת הבחירות דורשות חיבור למשחק; חבילת המקור כוללת בחירה קוסמטית בלבד. |
| racing-podium-v1 | 2,154,016 B (2.05 MiB); 18 קבצים | Three.js, ‏GLTFLoader ו־SkeletonUtils מקומיים לשכפול דמויות עם שלדים נפרדים ולערבוב אנימציות; שלד canonical18 ונתוני התנועות והאביזרים במניפסטים. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| city-citizens-v1 | 5,168,586 B (4.93 MiB); 45 קבצים | Three.js, ‏GLTFLoader ו־SkeletonUtils מקומיים לשכפול דמויות עם שלדים נפרדים, קליפים מוטבעים ושלד canonical18; אין צורך בקובצי המקור של החיות. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| city-buildings-v2 | 2,875,633 B (2.74 MiB); 124 קבצים | Three.js ו־GLTFLoader מקומיים למודלים עצמאיים ללא דחיסה. runtime.mjs ו־effects.mjs מוחזרים כטקסט; הייבוא המקורי שלהם מפנה אל ./vendor/three.module.js, עותק לתצוגה שאינו נכלל בתכנית ההעתקה. | לפני הפעלת מודולי העזר יש להפנות את ייבוא Three.js למודול המקומי הקיים באפליקציה, או להשתמש ישירות ב־GLTFLoader של המארח; טעינת המודלים אינה תלויה במודולי העזר. |
| avatar-customization-v1 | 719,486 B (0.69 MiB); 95 קבצים | גוף קיים מתוך assets/athlete-body-v22 עם עצמות canonical18, מאפייני _region/color/skin, משקלי עיוות ספורט מאופסים ונתוני רוחב ועומק שמורים. Three.js ו־GLTFLoader מקומיים ועותק SkeletonUtils נפרד; runtime/customization.mjs מקבל את מופעי המארח ואת הפריטים המפוענחים. | גופי הייחוס והאטלס של התצוגה אינם נכללים בהעתקה; בחיבור יש להשתמש בגוף athlete-body-v22 התואם שכבר נמצא במשחק. |
| coach-mascot-v1 | 1,020,471 B (0.97 MiB); 4 קבצים | Three.js, ‏GLTFLoader ו־AnimationMixer מקומיים לדמות המאמן העצמאית, עם שלד בן 18 עצמות קנוניות, הבעות עיוות וקליפים מוטבעים. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| ui-sounds-v1 | 358,237 B (0.34 MiB); 56 קבצים | פענוח Ogg או MP3 בדפדפן, מערבל השמע הקיים והפעלת שמע במחוות משתמש; בחירת הפורמט לפי תמיכת הדפדפן. | אין חסם נכס שנמצא; חיבור האירועים והמיקום נשאר בידי המארח |
| lighting-presets-v1 | 72,700 B (0.07 MiB); 7 קבצים | מנוע ציור וסצנה של המארח התואמים ל־Three.js r160, הגדרת תאורה וחומרים ועדכון בכל פריים באמצעות update(seconds,camera). ‏lighting.js הוא סקריפט קלאסי החושף יוצר גלובלי ומוחזר כטקסט בלבד; presets.json וקובצי PNG נטענים ישירות דרך מתאם ה־ES module. | לפני הפעלת לוגיקת lighting.js יש להסב את היוצר ל־ES module המקבל את Three.js הקיים; המתאם אינו מזריק סקריפט קלאסי. |

## רישוי ודגלי URL מוצעים

הדגלים הם הצעה בלבד, כבויים עד שהמארח יבחר לחבר אותם. get() משתמש בשם הקובץ היחסי המלא, כולל תיקיות וסיומת; כך שמות אינם מתנגשים ואינם תלויים בכותרות פנימיות של מודלים.

| חבילה | רישיון לפי מקור | דגל מוצע |
|---|---|---|
| hoops-realism-v2 | LicenseRef-Mixed-Provenance | `?assetHoopsRealismV2=1` |
| hoops-motion-v14 | CC0-1.0 | `?assetHoopsMotionV14=1` |
| hoops-arena-v2 | LicenseRef-Repository-Terms | `?assetHoopsArenaV2=1` |
| tennis-motion-v2 | CC0-1.0 | `?assetTennisMotionV2=1` |
| tennis-ui-v2 | CC0-1.0 | `?assetTennisUiV2=1` |
| tennis-crowd-people-v2 | CC0-1.0 | `?assetTennisCrowdPeopleV2=1` |
| soccer-crowd-people-v2 | CC0-1.0 | `?assetSoccerCrowdPeopleV2=1` |
| soccer-run-cycles-v3 | CC0-1.0 | `?assetSoccerRunCyclesV3=1` |
| soccer-keeper-motion-v3 | CC0-1.0 | `?assetSoccerKeeperMotionV3=1` |
| soccer-celebrations-v1 | CC0-1.0 | `?assetSoccerCelebrationsV1=1` |
| soccer-kits-venues-v1 | CC0-1.0 | `?assetSoccerKitsVenuesV1=1` |
| fire-multifloor-v2 | CC0-1.0 | `?assetFireMultifloorV2=1` |
| fire-rescue-people-v2 | CC0-1.0 | `?assetFireRescuePeopleV2=1` |
| fire-fx-v2 | CC0-1.0 AND MIT | `?assetFireFxV2=1` |
| alpine-runner-v1 | CC0-1.0 | `?assetAlpineRunnerV1=1` |
| alpine-content-v1 | CC0-1.0 | `?assetAlpineContentV1=1` |
| aliens-weapons-v2 | CC0-1.0 AND MIT | `?assetAliensWeaponsV2=1` |
| alien-hits-v1 | CC0-1.0 | `?assetAlienHitsV1=1` |
| alien-enemies-v2 | CC0-1.0 | `?assetAlienEnemiesV2=1` |
| boars-weapons-v2 | CC0-1.0 AND MIT | `?assetBoarsWeaponsV2=1` |
| boars-world-v1 | CC0-1.0 | `?assetBoarsWorldV1=1` |
| catch-vehicles-v2 | CC0-1.0 | `?assetCatchVehiclesV2=1` |
| catch-city-v1 | LicenseRef-Repository-Original AND CC0-1.0 | `?assetCatchCityV1=1` |
| naval-sinking-v1 | CC0-1.0 AND LicenseRef-Existing-Repository-Rights | `?assetNavalSinkingV1=1` |
| naval-sea-v2 | CC0-1.0 | `?assetNavalSeaV2=1` |
| racing-themes-v1 | CC0-1.0 | `?assetRacingThemesV1=1` |
| racing-customize-v1 | CC0-1.0 AND MIT | `?assetRacingCustomizeV1=1` |
| racing-podium-v1 | CC0-1.0 | `?assetRacingPodiumV1=1` |
| city-citizens-v1 | CC0-1.0 | `?assetCityCitizensV1=1` |
| city-buildings-v2 | CC0-1.0 | `?assetCityBuildingsV2=1` |
| avatar-customization-v1 | CC0-1.0 | `?assetAvatarCustomizationV1=1` |
| coach-mascot-v1 | CC0-1.0 | `?assetCoachMascotV1=1` |
| ui-sounds-v1 | CC0-1.0 | `?assetUiSoundsV1=1` |
| lighting-presets-v1 | MIT | `?assetLightingPresetsV1=1` |

אין הצהרת CC0 גורפת על hoops-realism-v2, hoops-arena-v2, catch-city-v1 או על רינדורי הספינות הישנים ב־naval-sinking-v1. הודעות הרישוי המקוריות מועתקות ללא שינוי; פירוט ההסתייגות והמקור מופיע ב־catalog.json.

## API וטעינה עצלה

מומלץ לייבא רק את src/index.mjs. הוא אינו מייבא שום מתאם עד לקריאה מפורשת ל־loadAdapter(id, options); גם כשל ב־import() עצמו מוחזר בשקט כמתאם fallback. ייבוא ישיר של מתאם אינו מבצע I/O עד load().

```js
import { loadAdapter } from './design/asset-adapters-v1/src/index.mjs';

// בדיקת הדגל נמצאת בקוד המארח העתידי.
const enabled = new URLSearchParams(location.search).get('assetFireFxV2') === '1';
let adapter;
if (enabled) {
  adapter = await loadAdapter('fire-fx-v2', {
    // cache: currentVersionCache, // מטמון האופליין שהמארח כבר פתח לגרסה הנוכחית
  });
}
const atlas = adapter?.get('manifest.json', existingAtlas) ?? existingAtlas;
adapter?.dispose();
```

| קריאה | חוזה |
|---|---|
| load() | Promise<boolean>; טוען פעם אחת במקביל, מפרסם את כל הנכסים יחד; כשל/timeout מחזיר false, ואפשר לנסות שוב |
| ready() | boolean סינכרוני; אינו מפעיל טעינה |
| get(name, existing = null) | הנכס אם כל הטעינה הצליחה; אחרת existing. ללא שם מוכר מתקבל existing |
| dispose() | מבטל טעינה, פוסל תוצאות מאוחרות ומנקה משאבים בבעלות המתאם; אפשר לטעון שוב |

create(options) יוצר מתאם מבודד לכל מסך/סשן; הייצואים הישירים load/ready/get/dispose הם singleton לנוחות. metadata כוללת גדלים, רישיון, דגל, תלויות ושמות מדויקים. כל URL מחושב באמצעות import.meta.url ולא לפי כתובת הדף.

JSON מפורש ומוחזר כאובייקט, SVG/CSS/קוד עזר מוחזרים כמחרוזת, ותמונה/צליל/GLB מוחזרים כ־ArrayBuffer לאחר בדיקת פורמט. GLB עם דחיסה המחייבת מפענח או קישורים חיצוניים נדחה. תמונות HTML שמוחזרות בטעות עם HTTP 200 נדחות. loadAsset/releaseAsset ניתנים להזרקה לפענוח באמצעות המנוע הקיים; יש לשחרר רק משאבים שנוצרו עבור המתאם ולא את נכס הגיבוי הקיים. הבטחת בדיקת הפורמט היא של הטוען המובנה; טוען מוזרק אחראי לאותו חוזה.

## העתקה ואופליין

מתיקיית המאגר:

```sh
sh workout/island/design/asset-adapters-v1/copy-plan.sh
```

זו בדיקה בלבד. הכלי קורא את הקבצים מהקומיטים הנעולים, מאמת blob, בתים ו־SHA-256, ומדפיס בדיוק מה יועתק. אין צורך למזג ענפי מקור או להחליף ענף עבודה. אם קומיט חסר בעותק מקומי אחר, הכלי מדפיס פקודת fetch מפורשת.

```sh
sh workout/island/design/asset-adapters-v1/copy-plan.sh --pack fire-fx-v2 --apply
sh workout/island/design/asset-adapters-v1/copy-plan.sh --pack fire-fx-v2 --verify
```

--apply יוצר רק קבצים חדשים תחת assets/<pack>/; קובץ זהה נשמר, קובץ שונה אינו נדרס. --destination מאפשר חזרה גנרלית לתיקייה זמנית. קובצי המקור מוכרעים באמצעות allowlist מפורשת ב־catalog.json; unsupported/excluded הם תיעוד ואינם מועתקים.

offline-entries.json הוא תוספת באותה סכמה כמו offline-manifest.json: core/shell/games הן רשימות נתיבים יחסיות לאי. יש למזג רק את רשומות החבילות שנבחרו והועתקו, יחד עם src/index.mjs, src/runtime.mjs ומתאם החבילה ב־shell. הוספה של כל החבילות תגדיל את ההורדה ב־136,241,471 B (129.93 MiB); אין זו הורדה שמופעלת כעת, ומגבלת 90 MiB הנוכחית תצריך החלטת חלוקה לפי משחק. אין לשנות את תקרת הבדיקה בלי החלטה מפורשת.

מפתחות המשחקים תואמים ל־main, פרט ל־games.boars שהוא דלי מוצע: ב־main אין רשומת OFFLINE_GAMES עבור חזירים, ונדרשת הוספתה בחיבור או בחירת שיוך אחר. חבילות העיר משויכות ל־games.city; אווטאר, מאמן, צלילים ותאורה ל־core.

המוריד הקיים שומר כל נתיב שבמניפסט, אך ה־service worker אינו משרת סיומות רישוי כמו .md/.txt/.assets. מתאמים אינם טוענים רישיונות כתנאי לזמינות. options.cache מקבל Cache של **הגרסה הנוכחית** ונותן גישה ישירה לכל קובץ ששמור בו; אם אין פגיעה במטמון, עוברים לרשת. אין בחירה אוטומטית במטמון מגרסה ישנה. קוד המארח יכול לספק cache גם לצלילים בפורמט אחר בעתיד.

נתוני manifest מקוריים נשמרים ללא שינוי לצורך ההעתקה החתומה, וכוללים לעתים קישורי preview/source שאינם תלות ריצה. במיוחד catalog.referenceAsset בטניס עדיין מציין את הנתיב הישן; יש לבקש get('reference/grip-player.glb'). עזרי JavaScript דורשים התאמות המתועדות בטבלה; המתאם אינו מבטיח שהפעלת מקור ממוקם מחדש תעבוד.

## אימות

```sh
node --test workout/island/design/asset-adapters-v1/tests/*.test.mjs
```

בדיקות חוזה לכל מתאם: ייבוא ללא I/O, טעינה מדומה ושמות/נתיבים, כשל שקט ונכס גיבוי, ניקוי וטעינה חוזרת. נוסף כיסוי תחרות, timeout, ביטול/תוצאות מאוחרות, ניקוי אסינכרוני, פורמטים, מטמון וכשל import של מתאם. בדיקות ההעתקה יוצרות מאגר זמני ובודקות קומיטים, hash, אי־דריסה, סימלינקים ומיפוי מודל הטניס.

```sh
sh workout/island/design/asset-adapters-v1/copy-plan.sh --apply --destination /tmp/asset-adapters-rehearsal
ASSET_ADAPTERS_PAYLOAD_ROOT=/tmp/asset-adapters-rehearsal node --test workout/island/design/asset-adapters-v1/tests/real-payload.test.mjs
```

בבדיקת המטען האמיתי נוצרת Response מכל קובץ שהועתק, ונבחן הטוען המובנה בפורמט האמיתי, ללא WebGL או שינוי בקוד הפעיל. חתימות SHA-256 נבדקות בעת ההעתקה; טעינת הריצה בודקת פורמט וזמינות ואינה אימות קריפטוגרפי. בדיקת טלפון/מראה תיעשה לאחר החיבור למשחקים.

### תוצאות המסירה

- Node v24.19.0: כל 178 בדיקות המסירה עברו, 0 נכשלו, 0 דולגו, כולל בדיקת המטען האמיתי לכל 34 החבילות.
- העתקה זמנית מלאה ואימות חוזר: 34 תיקיות חבילה, 1,296 קבצים, 136,241,471 בתים; כל החתימות תואמות. היעד היה `/tmp/asset-adapters-rehearsal`, ללא יצירת קבצים תחת assets של המאגר.
- 598 קובצי GLB נבחרים עברו בדיקת המבנה והתלויות בטוען המובנה. 12 דגמי ה־Draco החסומים אינם נכללים בהם.
- ביקורת נוספת של המתאמים, המלאי, הטעינה העצלה ותכנית ההעתקה הסתיימה ללא ממצאים פתוחים.
- בדיקת Git: 81 קבצים חדשים בתיקיית המסירה בלבד; אין שינוי או מחיקה של קובץ קיים.

- הרצת `npm test`: נרשמו 4,204 הצלחות בקובצי הבדיקות האחרים, ללא כשל מדווח בהם. ההרצה לא הפיקה סיכום כולל: `workout-royiki.test.mjs` נתקעה לאחר ש־Playwright לא מצא את הדפדפן המצורף, ובדיקת המקור השאירה שרת פתוח בעקבות כשל ההפעלה. ההרצה התקועה נעצרה.
- הקובץ האחרון הורץ בנפרד עם Chromium המערכתי 151.0.7922.173: כל 5 הבדיקות עברו, כולל בדיקת הדפדפן של 50 האנימציות. הוגדרה עטיפת Playwright זמנית דרך `ISLAND_PLAYWRIGHT` בתיקיית `/tmp`, בהתאם לתמיכה הקיימת של עזר הבדיקות; לא הותקן דבר ולא נערך קובץ קיים.
- פקודת בדיקות המסירה אינה זקוקה ל־Playwright או לדפדפן. תוצאת 178/178 לעיל כוללת את כל הבדיקות החדשות ואת המטען האמיתי.
