# עצירות והחלקה הגנתית לכדורסל · v1

קליפים מקוריים ב־30 הרץ על שלד 18 העצמות הקנוני (`design/motion/soccer.json`, זהה ל־soccer-clips-v13). מטרים, Y למעלה, Z קדימה, X לשמאל הדמות. Root קבוע בראשית ובסיבוב זהות; תנועת האגן מקומית בלבד.

[תצוגה תלת־ממדית](preview.html) · [דוח](REPORT.md) · [רישיונות](LICENSES.md)

## מה יש

| קליפ | קבצים | משך | הערה |
|---|---|---:|---|
| hoops-stop-sprint (עצירת קפיצה) | 5 וריאנטים, כניסה 4.5, 5.5, 6.5, 7.5, 9 מ׳/ש | 0.65 | GLB לווריאנט 7.5 |
| hoops-stop-run | 4 וריאנטים, 3, 4, 5, 6 | 0.55 | GLB ל־5 |
| hoops-stop-jog | 4 וריאנטים, 1.5, 2, 2.75, 3.5 | 0.50 | GLB ל־2.75 |
| hoops-defensive-slide-fast | שמאלה וימינה, לופ 0.8 שנ׳ | 0.8 | טווח מהירות 2.2 עד 5, GLB לשני הצדדים |
| hoops-defensive-slide-recover | קדימה ולאחור, שמאל וימין | 0.5 | GLB לשמאל בלבד |
| hoops-cut-plant | 70 מעלות שמאלה וימינה | 0.6 | GLB לשמאל |
| hoops-pivot-stop | פיבוט 90 מעלות שמאלה וימינה | 0.8 | GLB לשמאל |
| hoops-start-from-stand | שלושה צעדים | 0.9 | |

גרסאות הימין הן שיקוף מדויק (החלפת צדדים, `q -> (x,-y,-z,w)`, x של האגן והמסלול הפוך) והן ב־`runtime/motions.json` וב־catalog; GLB נשמר רק לשמאל כדי לא לעבור את תקרת הגודל.

## נכסי הצריכה

- `runtime/clips/*.glb`: עשרה GLB עצמאיים, בלי Draco, Meshopt או WASM.
- `runtime/motions.json`: כל 24 הקליפים, 18 סיבובי עצמות ו־Hips לכל פריים.
- `runtime/catalog.json`: משכים, `events` (שניות ופריימים מבסיס אפס), `supports` לכל כף רגל (עצם, חלון, נקודת סוליה `[0,-0.08,0]`, עוגן), `path` (מסלול השורש לכל פריים ומהירות), `entry`/`exit`, נתיבים ו־SHA-256.
- `runtime/player.mjs`: דגימה וגשר C1, זהה ל־soccer-clips-v13. הייחוסים (`idle_relaxed`, `run`) נמצאים ב־`../soccer-clips-v13/runtime/reference`.

## מסלול השורש

בניגוד לקליפי הכדורגל, כאן השחקן נע בזמן הקליפ. Root נשאר בראשית ב־GLB; המסלול הוא נתון נפרד (`path.samples`, מטרים בכל פריים, מערכת הקליפ). כף רגל נטועה נטועה בעולם: מיקום הסוליה בקליפ ועוד המסלול קבוע בכל חלון תמיכה. מי שמזיז את השחקן חייב לעקוב אחרי המסלול (בעצירות: האטה קבועה מהמהירות הנכנסת עד אפס ב־`Ts`, ואחר כך עמידה). הקליפים בקנה מידה קנוני; גוף עם קנה מידה s מנגן אותם פי s במהירות ובמרחק (הסיבובים זהים, רק Hips והמסלול מוכפלים).

קליפים עם סיבוב (חיתוך, פיבוט, התאוששות קדימה) מסתיימים כשהאגן מוטה סביב Y; `exit.bodyYawDegrees` אומר בכמה. הגשר אל העמידה או הריצה מתבצע מול הייחוס מסובב באותה זווית.

## שחזור

Node 22 ומעלה; אין התקנת npm.

```sh
node workout/island/design/hoops-stop-clips-v1/tools/build.mjs
node workout/island/design/hoops-stop-clips-v1/tools/bake.mjs
node workout/island/design/hoops-stop-clips-v1/tools/runtime-pack.mjs
node workout/island/design/hoops-stop-clips-v1/tools/measure.mjs
node workout/island/design/hoops-stop-clips-v1/tools/report.mjs
python3 -m http.server 8765 --bind 127.0.0.1
node workout/island/design/hoops-stop-clips-v1/tools/capture.mjs
```

הצילום משתמש ב־Playwright וב־Chromium עם `--use-gl=angle --use-angle=swiftshader` (`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`).
