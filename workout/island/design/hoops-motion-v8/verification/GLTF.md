# בדיקת פורמט glTF

תוצאה: **PASS**. Khronos glTF Validator 2.0.0-dev.3.10, כל 15 קובצי ה־GLB שנמסרים.

| קליפ | בתים | שגיאות | אזהרות | הודעות מידע | SHA-256 |
|---|---:|---:|---:|---:|---|
| pass_chest | 226384 | 0 | 0 | 16 | `2b360533a5f29c37d74503dec694878a6b70849b05b4d6e816a6441e1dbdf833` |
| pass_bounce | 230720 | 0 | 0 | 16 | `38e1b98e91dca5d09a4a5699f4b52b404f60fefa6bcc42e9fc2240859f3707e6` |
| pass_overhead | 232760 | 0 | 0 | 16 | `2ccef2745931b17e1e885b13a0b37aa26fce83908f2113ce6854f0ac3192644a` |
| pass_side | 227684 | 0 | 0 | 16 | `be29820426fa5376c8e1da2f2789fdfc087c9209139ed59bc9b8fee6708cf289` |
| pass_jump | 232996 | 0 | 0 | 16 | `e5da9695aa604711bf04ca40519340931e9cbdf9eaf0599623fc8edd7f80b7b6` |
| receive_two_hands | 224560 | 0 | 0 | 16 | `22066cb9e5cef11ba79991409fe91ef46bd1bdac8c721b362e02d7e665e7b652` |
| receive_moving | 227144 | 0 | 0 | 16 | `9cbb4ea27a268eedd45d1929aaae7cc8b428a2eab0072aede6575a087eda87f2` |
| dribble_idle | 216468 | 0 | 0 | 16 | `68820a451097323784df3fa668144b413ef54035b0162f935dc456fed28f8817` |
| dribble_run | 211108 | 0 | 0 | 16 | `7ed953188a33ad78bf2493142a456243441a27b1d697006a34cea53e4482e254` |
| dribble_behind_back | 226928 | 0 | 0 | 16 | `96a54b90f789ce7ee1193484e88d04b7961d57e37c4d4057cf76939459b1eb5b` |
| stop_two_feet | 228444 | 0 | 0 | 16 | `98cadcb7a504ae9f2f0c3ae9497644dc3e816571505dda5ecccecf501d484f7b` |
| pivot | 233896 | 0 | 0 | 16 | `00581fd0290f45e894c8794de94bbded913291bf99c6351b26baceaf9f382793` |
| shot_start | 232360 | 0 | 0 | 16 | `c60bd907cd4b8cd05df107ee409ad71e4786432f5d55b43d634f8e0f5ea685bf` |
| block | 231904 | 0 | 0 | 16 | `afa9494cac5e024727dcdb57bc357571b6e30740aa18cc2cff3dbde8a44a5446` |
| steal | 228580 | 0 | 0 | 16 | `8aed95510ea4f02492ad7b678b757e1d05d4ecd52ca0da4acc04a43773de6194` |

הבודק מדווח הודעת מידע על KHR_draco_mesh_compression, שאינו מפוענח על ידו, ועל משאבים שעשויים להיות לא בשימוש. מידע זה אינו שגיאה או אזהרה. פענוח Draco בפועל, משקלי עור, טקסטורה בדפדפן ומסלולי אנימציה נבדקים בנפרד ב־node --test וברנדרי Chromium.

שחזור: node source/validate-gltf.mjs. כלי הפיתוח מותקן מחוץ לחבילה; ראו source/README.md.
