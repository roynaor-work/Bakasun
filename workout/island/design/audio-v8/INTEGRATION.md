# חיבור מודול הספורט

`runtime/sports-audio.mjs` הוא מודול ES עצמאי יחיד. הוא מסנתז PCM בזיכרון ומנגן אותו ב־WebAudio; אין build, תלות, דגימה, הורדת שמע או קובץ נתונים. אין קוד שפועל בזמן import. כל הפעלה היא one-shot עם `loop = false`, buffer חסום ו־`stop()` מפורש.

החבילה היא תוצר לחיבור: המשחקים הקיימים לא נערכו. הדוגמה הבאה מתאימה למודול בתוך `workout/island/minigames/`. אם מעתיקים את המודול למיקום אחר, משנים רק את נתיב הייבוא בקוד המשלב.

```js
import {createSportsAudio} from '../design/audio-v8/runtime/sports-audio.mjs';

const sound = createSportsAudio({volume: 0.65});

// מפעילים מתוך לחיצת משתמש. ממתינים להכנה לפני לולאת המשחק.
startButton.addEventListener('click', async () => {
  try {
    if (await sound.unlock()) {
      await sound.prepare([
        'whistle', 'basketballBounce', 'netSwish', 'rimHit',
        'backboardHit', 'courtStep', 'crowdCheer', 'crowdDisappoint',
      ]);
    }
  } catch { sound.clearCache(); }
  if (!sound.metrics.disposed) startMatch(); // אפשר לשחק גם בלי שמע.
});

// קוראים מאירועי משחק חד-פעמיים, ולא מכל frame או עדכון מצב.
function onBallFloor(speed) {
  sound.basketballBounce({intensity: Math.min(1, 0.3 + speed * 0.08)});
}
function onMadeBasket() {
  sound.netSwish({intensity: 0.85});
  sound.crowdCheer({intensity: 0.55, delay: 0.12});
}
function onFoul() {
  sound.whistle({duration: 0.17, intensity: 0.8});
}
function onPause(paused) { sound.setPaused(paused); }
function onSoundSetting(enabled) { sound.setMuted(!enabled); }
async function onExit() { await sound.dispose(); }
```

אירוע חזרה מהשהיה עשוי לדרוש `await sound.unlock()` בלחיצת המשתמש שממשיכה את המשחק. אין תור של קולות שמנוגנים באיחור לאחר חזרה. קריאה שנדחתה אינה מנוגנת אוטומטית שוב.

בחיבור בפועל מפנים את בקר השמע הקודם באמצעות dispose ומנתבים את אירועי המשחק לבקר החדש. כך נשאר מנוע שמע אחד, ורקע ישן אינו ממשיך לצד המודול החדש. הגדרת ההשתקה הקיימת במשחק מועברת ל־setMuted; המודול אינו קורא או כותב אחסון מקומי.

| משפחה | אירועים לחיבור |
|---|---|
| כדורסל | floor → basketballBounce; rim → rimHit; board → backboardHit; pass → basketballPass; catch → basketballCatch; score → netSwish; foul/violation → whistle; quarterEnd → buzzer |
| כדורגל | בעיטה → soccerKick; מסירה → soccerPass; עצירה ברגל → soccerTrap; קורה → goalpostHit; שער → soccerNet; החלטת שופט → whistle |
| טניס | הגשה → tennisServe; מחבט → tennisHit; מגרש → tennisBounce; רשת → tennisNet |
| סקי | גלישה/פנייה → skiGlide/skiCarve; ניתור → skiJump; נחיתה → skiLand; שער → skiGate; משב → windGust |
| מירוצים ותנועה | האצה → engineBurst; החלקה → tireSkid; מגעי רגל/דשא → courtStep/grassStep; נחיתה יבשה → landingThud |
| קהל | מצב רגוע/אירוע פתיחה → crowdBed; הצלחה → crowdCheer; החמצה → crowdDisappoint; מחיאות → applause. מנגנים מקטע לפי אירוע, בלי טיימר חוזר |

למגע בודד משתמשים ב־courtStep או grassStep; runningSteps כבר מכיל שלושה מגעים. בזמן ניתור סקי מפסיקים קרצוף שלג באמצעות ה־handle המתאים, ובנחיתה מפעילים skiLand. מיפוי האירועים נעשה בקוד המשלב; לחבילת הנכסים אין גישה למצב המשחק.

## API

| פעולה | חוזה |
|---|---|
| `createSportsAudio(options)` | יוצר בקר שקט; אינו פותח AudioContext עד unlock |
| `await sound.unlock()` | מחזיר true כשהשמע מוכן; false בהשתקה, הסתרה, השהיה, היעדר תמיכה או כשל פתיחה |
| `await sound.prepare(names, parameters)` | הכנה שקטה אחרי unlock. רשימת שמות מפורשת, ארבע וריאציות foley ווריאציה אחת לקהל. מחזיר `{prepared, cacheBytes}`. מחלק את העבודה בין buffers באמצעות המתנות סופיות של 0 מ״ש |
| `sound.whistle(parameters)` וכדומה | פונקציה לכל אחד מ־36 השמות ב־`SOUND_CATALOG` |
| `sound.play(name, parameters)` | אותו ממשק לפי שם דינמי |
| `handle.stop()` | דעיכה בת 8 מ״ש לכל היותר; אם שעון ההקשר אינו מתקדם, ניקוי מיידי |
| `await handle.ended` | מסתיים בסיום טבעי, עצירה או פינוי; אינו נדחה |
| `sound.stopAll()` | עצירה וניקוי מיידיים של כל המקורות, כולל מקורות שתוזמנו לעתיד |
| `setMuted(bool)` / `setPaused(bool)` | true עוצר קולות קיימים. false מאפשר אירועים חדשים בלבד |
| `setVolume(0..1)` | עוצמת master; אפס גם עוצר קולות קיימים |
| `clearCache()` | מפנה buffers מהמטמון; אינו עוצר קולות קיימים |
| `await dispose()` | עוצר, מנתק, מפנה מטמון ומסיר מאזינים. סוגר רק הקשר שהמודול יצר |
| `sound.metrics` | snapshot של קולות פעילים, מגבלה, מספר buffers, בתים במטמון ומצב הנגן |
| `renderSound(name, parameters)` | מחזיר `{samples, sampleRate, duration, maxDuration, seed}` למדידה/יצירה טהורה גם ב־Node |

הפעלה מצליחה מחזירה handle עם `duration`, `maxDuration`, `stop`, `ended`. אחרת מוחזר null. שמות לא מוכרים גורמים ל־RangeError, גם כשהנגן שקט; `prepare` מצפה למערך שמות. כשל משאב בעת prepare יכול לדחות את ה־Promise, ולכן במשחק שמחייב המשך גם במקרה של מחסור בזיכרון יש לעטוף את שלב ההכנה ב־try/catch. `play` ו־unlock מטפלים בכשלי WebAudio ללא זריקת חריגה.

## פרמטרים

| פרמטר | תחום וברירת מחדל |
|---|---|
| `intensity` | 0–1, ברירת מחדל 0.8. אפס אינו יוצר מקור. משנה gain בלי ליצור buffer נוסף |
| `volume` | 0–1, ברירת מחדל 1 לכל אירוע; מוכפל ב־intensity וב־master |
| `tone` | 0.75–1.25, ברירת מחדל 1. מסונתז בתוך הגל; playbackRate תמיד 1, ולכן אינו מאריך צליל |
| `duration` | 0.06 שניות עד `maxDuration` של האירוע; ברירת המחדל בקטלוג. התקרה לעולם אינה ניתנת להרחבה |
| `seed` | מספר שלם לא שלילי עד 2³²−1. בלי seed, וריאציות מגע מתחלפות בין ארבעה גלים; קהל משתמש במקטע יחיד. seed מפורש מאפשר שחזור |
| `pan` | ‎−1 עד 1; ברירת מחדל 0; נופל למונו אם StereoPanner אינו זמין |
| `delay` | 0–0.25 שניות, ברירת מחדל 0. נחשב לפני הצליל; אינו חלק ממשך הגל |

ערכים מספריים מחוץ לתחום נחתכים לגבול. NaN, Infinity וערכים שאינם מספרים חוזרים לברירת המחדל. `renderSound` מקבל גם `sampleRate`, מספר שלם 8,000–48,000; ברירת מחדל 24,000. עוצמת השיא תלויה בהגדרת האירוע ומוכפלת ב־intensity.

אפשרויות הבקר: `volume` (0.65), `maxVoices` (6, תחום 1–8), `cacheBytes` (2 MiB, תחום 0–4 MiB), `sampleRate` (24 kHz), `muted` (false). אפשר להעביר `context` קיים או `AudioContext` כ־constructor לבדיקה. `document: null, pageTarget: null` מבטלים את מאזיני הדף אם המשחק מנהל אותם בעצמו.

## תקציב ובטיחות זמן

המטמון הוא LRU וחסום בבתים. שמות הקטלוג הם המקור להגדרות משך, שיא ו־cooldown; קובץ manifest נוסף אינו נדרש. הכינו רק את אירועי המשחק הנוכחי, כי הכנת כל הספרייה עלולה לפנות אירועים מוקדמים מהמטמון. cacheBytes מתאר את buffers במטמון; buffers פעילים וצמתי WebAudio צורכים זיכרון נוסף, החסום במספר הקולות.

הנגן דוחה אירוע רגיל כשהוא מגיע למגבלת הקולות, כולל מקורות מושהים. שריקה וזמזם מפנים קול קיים, עם העדפה לפינוי קהל, צעדים ואז foley; אם כל הקולות הם קריאות שופט, מפנים את הישן ביותר. כך קריאת שופט נשמעת גם בעומס, בלי להגדיל את מספר הקולות. cooldown לכל שם מונע הצפה; לשריקה 300 מ״ש. שיאי PCM מוגבלים, ו־WaveShaper רך מגביל סכום חפיפות ללא זנב פילטר. העיבוד אינו מוסיף echo או reverb. יש 2 מ״ש של אפס מפורש בסוף כל גל. הדעיכה הסופית היא לפחות 18 מ״ש; לקהל עד 320 מ״ש, לרוח עד 280 מ״ש ולגלישת שלג עד 90 מ״ש, בתוך משך הגל המוגדר.

מעבר הדף לרקע, pagehide או AudioContext שעובר למצב שאינו running מפנים את המקורות. pageshow אינו מנגן אירועים ישנים. מצב הקשר חיצוני נשאר באחריות המשחק; המודול אינו סוגר אותו. לאחר `dispose` יוצרים בקר חדש עבור משחק חדש.

קהל הרקע והשלג הם מקטעים סופיים. אין להפעילם ב־setInterval, בלולאת render או מתוך onended. להמשך אווירה משתמשים באירועי משחק מפורשים ובהקשבה לעוצמת המיקס. אין חיבור אוטומטי לרקע בכדורסל.

## הפעלה ובדיקות

1. משורש הריפו הפעילו שרת מקומי ופתחו את דף ההקשבה:

```sh
python3 -m http.server 8765
```

[דף ההקשבה המקומי](http://localhost:8765/workout/island/design/audio-v8/index.html)

2. לחצו “הפעלת שמע”, בחרו צליל, ולאחר מכן “שריקה אחת + בדיקת שקט”. מצופה צליל קצר, חזרה לשקט ומונה קולות אפס. “עצירת הכול” מבטלת גם התחלה אסינכרונית שטרם בוצעה.

3. מתוך תיקיית החבילה הריצו את הבדיקה העצמאית. אין צורך ב־npm install:

```sh
node --test
```

נמדדים משך ושיא של כל 36 הגלים, חמישה קצבי דגימה, גבולות הפרמטרים, שקט בקצה, ניקוי, השתקה, השהיה, תזמון, זיכרון וכשלי משאב. diagnostics מדפיסים משך, זמן הדגימה הנשמעות האחרונות, שיא ותקרה לכל צליל.

כלי מדידה נוספים:

```sh
node tools/measure.mjs
node tools/acoustic-audit.mjs
```

בדיקת Chromium אופציונלית דורשת Playwright בסביבת הפיתוח בלבד. היא מרנדרת את כל הצלילים דרך הגרף, בודקת חפיפה, עצירה, דף הקשבה והאטת CPU; הפרטים בכותרת `tools/browser-check.mjs`. `tools/soak.mjs` מריץ בדיקת עמידות בזמן אמת. תוצאות הבדיקות האחרונות נשמרות ב־`iterations/05` וב־`iterations/06` בלבד. עותקי המודול שם משמשים לתיעוד ההשוואה; המשחק מייבא רק את המודול שבתיקיית runtime.
