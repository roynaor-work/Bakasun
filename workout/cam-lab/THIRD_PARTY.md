# נכסים מקומיים

- ספרייה: `@mediapipe/tasks-vision` גרסה `0.10.32`, מ־npm הרשמי. `vision_bundle.cjs` הועתק ללא שינוי ל־`vendor/vision_bundle.js` כדי ש־importScripts יקבל MIME של JavaScript. משתמשים ב־classic worker בגלל loader ה־WASM שמשתמש ב־importScripts; הזיהוי עדיין ב־VIDEO עם `detectForVideo`.
- WASM: ארבעת קובצי SIMD ו־no-SIMD מאותה חבילה. הדפדפן בוחר את המתאים. אין build או loader ממקור אחר.
- שלמות חבילת npm: `sha512-3tiAZnmKloYnRXYoO3dKltTUGnqeCwzC4lV03uY0vCsE+aveJTyEVQyZHOlQGQNsjK+gRHzkf9q08C99Qm2K0Q==`.
- מודל: `pose_landmarker_lite`, float16, גרסה 1. מקור רשמי: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task . הורד ב־TLS מאומת; MD5 תאם ל־`x-goog-hash`/ETag של המקור: `04a75ddf7c811ac7a1a4523266dd7d88` (5,777,746 בתים).
- קובץ רישיון MediaPipe: `vendor/LICENSE`, מהמאגר הרשמי `google-ai-edge/mediapipe`. מקור: https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE .
- `assets.sha256` מכיל SHA-256 של כל קובץ runtime, לבדיקת שלמות מהשורש. כל הנכסים כבר מחויבים ל־Git; אין הורדה בזמן שימוש במעבדה.

אין לשנות checksum, להשבית TLS או להחליף קובץ בנכס לא מאומת כדי לעקוף תקלה. שדרוג צריך להחליף מודל/חבילה בצורה מבוקרת, לאמת מקור ושלמות ולהריץ שוב את הבדיקות.
