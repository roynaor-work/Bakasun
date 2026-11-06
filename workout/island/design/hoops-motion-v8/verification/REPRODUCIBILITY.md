# בנייה חוזרת נקייה

תוצאה: **PASS**. 30 קובצי runtime נוצרו מחדש בתיקייה זמנית מתוך קוד המקור ומודל התצוגה שסופק.

לא נעשה שימוש ב־node_modules מתוך הריפו. המקור הקנוני הועתק לקריאה בלבד אל מבנה ריפו זמני. תיקיות האיטרציות והבדיקות החזותיות לא הועתקו. הבנייה הרציפה וביקורות התנועה והגוף עברו לפני השוואת הבתים.

| קובץ | בתים | התאמה מלאה | SHA-256 משוחזר |
|---|---:|---|---|
| runtime/keyframes/block.json.gz | 51431 | PASS | `9644767a84de407d9bcd1fcd0a8fffcbecc6b641ee658c7eb8c7a04aeb94b9bd` |
| runtime/keyframes/dribble_behind_back.json.gz | 47380 | PASS | `156cc068aa81462e505597c1e05323af11669c96a1556a898035ea7e8a609742` |
| runtime/keyframes/dribble_idle.json.gz | 32275 | PASS | `966ef5e2eb6c314823a408daf0f84d4060eadac53c080d91efa15f38f56241c7` |
| runtime/keyframes/dribble_run.json.gz | 29386 | PASS | `824d3602b98aa72eb66652873f50141ba8b54b236d730e448720cb2a32803895` |
| runtime/keyframes/pass_bounce.json.gz | 41676 | PASS | `b8ada7b8dd328d9ad988bdb20bb286cdca3ceb969edeb4ec0768be961df0dab0` |
| runtime/keyframes/pass_chest.json.gz | 38255 | PASS | `bcdd0aa2dbba5aed1d792edc0345b062e984420e826c08bd87dc83141592999f` |
| runtime/keyframes/pass_jump.json.gz | 47194 | PASS | `5b0d2ccccca2ce582d94469fa322a962adca2945f078f4bbf96493f85ae0ce85` |
| runtime/keyframes/pass_overhead.json.gz | 45184 | PASS | `6ba8d79b6f85ae630c88e600d72b84c844c1aae6ac5a9b9df179836f6a8a1562` |
| runtime/keyframes/pass_side.json.gz | 45428 | PASS | `95bc1cc37c26b6e86d45999f00fb8251bc32be01915a34d6b6ef02c7bf7a2e7e` |
| runtime/keyframes/pivot.json.gz | 45366 | PASS | `e51803d642c7f245c2d30115264e8140c779c294e79b835d982f77afa0c0544e` |
| runtime/keyframes/receive_moving.json.gz | 45795 | PASS | `2d289d9226ccafac6d0a960ff0ee37133b9605693959eaecad215e06aeeecb25` |
| runtime/keyframes/receive_two_hands.json.gz | 24957 | PASS | `bff4257887c7ee059efb227699fc042c1bec9b5c58bb8982b059a8dc71a2aba4` |
| runtime/keyframes/shot_start.json.gz | 50858 | PASS | `c9cc5998f3f976ed902df6c83b3ca75f315aa52a34966bcffd5e7ba4c3b56207` |
| runtime/keyframes/steal.json.gz | 45109 | PASS | `92f9da07de2a5d5729b486ee0cba93f4b3327ec471468bea202c2d97a59ef1e9` |
| runtime/keyframes/stop_two_feet.json.gz | 41622 | PASS | `d177b5bb886e1d4ffd44decd5d96017d9e00447768a2fd8fc7164182b8efd93c` |
| runtime/clips/block.glb | 231904 | PASS | `afa9494cac5e024727dcdb57bc357571b6e30740aa18cc2cff3dbde8a44a5446` |
| runtime/clips/dribble_behind_back.glb | 226928 | PASS | `96a54b90f789ce7ee1193484e88d04b7961d57e37c4d4057cf76939459b1eb5b` |
| runtime/clips/dribble_idle.glb | 216468 | PASS | `68820a451097323784df3fa668144b413ef54035b0162f935dc456fed28f8817` |
| runtime/clips/dribble_run.glb | 211108 | PASS | `7ed953188a33ad78bf2493142a456243441a27b1d697006a34cea53e4482e254` |
| runtime/clips/pass_bounce.glb | 230720 | PASS | `38e1b98e91dca5d09a4a5699f4b52b404f60fefa6bcc42e9fc2240859f3707e6` |
| runtime/clips/pass_chest.glb | 226384 | PASS | `2b360533a5f29c37d74503dec694878a6b70849b05b4d6e816a6441e1dbdf833` |
| runtime/clips/pass_jump.glb | 232996 | PASS | `e5da9695aa604711bf04ca40519340931e9cbdf9eaf0599623fc8edd7f80b7b6` |
| runtime/clips/pass_overhead.glb | 232760 | PASS | `2ccef2745931b17e1e885b13a0b37aa26fce83908f2113ce6854f0ac3192644a` |
| runtime/clips/pass_side.glb | 227684 | PASS | `be29820426fa5376c8e1da2f2789fdfc087c9209139ed59bc9b8fee6708cf289` |
| runtime/clips/pivot.glb | 233896 | PASS | `00581fd0290f45e894c8794de94bbded913291bf99c6351b26baceaf9f382793` |
| runtime/clips/receive_moving.glb | 227144 | PASS | `9cbb4ea27a268eedd45d1929aaae7cc8b428a2eab0072aede6575a087eda87f2` |
| runtime/clips/receive_two_hands.glb | 224560 | PASS | `22066cb9e5cef11ba79991409fe91ef46bd1bdac8c721b362e02d7e665e7b652` |
| runtime/clips/shot_start.glb | 232360 | PASS | `c60bd907cd4b8cd05df107ee409ad71e4786432f5d55b43d634f8e0f5ea685bf` |
| runtime/clips/steal.glb | 228580 | PASS | `8aed95510ea4f02492ad7b678b757e1d05d4ecd52ca0da4acc04a43773de6194` |
| runtime/clips/stop_two_feet.glb | 228444 | PASS | `98cadcb7a504ae9f2f0c3ae9497644dc3e816571505dda5ecccecf501d484f7b` |

מיקום עבודה זמני לצורכי בדיקה: `/tmp/hoops-motion-v8-reproduce-qWLzn4`. שום קובץ runtime בחבילה שנמסרת לא נכתב בתהליך זה.
