# ספריית דגמים — האי שלי

27 דגמי GLB מקוריים שנמחקו מהמשחק ב־PR 147 ולא הוחזרו אליו בסבב G9. הקבצים הועתקו ללא שינוי מהקומיט `fa3b133880234a0d88d0226b61db011a0dfdb30b`, מהנתיב `workout/island/assets/models/`. הטבלה מתעדת את גודל ו־SHA256 הבתים בקומיט המקור.

הספרייה נמצאת מחוץ ל־`workout/island/`, אינה נטענת במשחק ואינה נכללת בתקציב ההורדה שלו. דגם עובר למשחק רק כשהוא נרשם ב־config וב־manifest; אז מעתיקים אותו ל־`workout/island/assets/models/` ורושמים את נתיבו ואת חתימתו.

בדיקת השלמות: `node --test tests/island-library.test.mjs`. הבדיקה משווה כל קובץ לחתימת המקור שבטבלה, ללא תלות בגישת רשת או בהיסטוריית Git מקומית.

| שם | גודל בבתים | sha256 |
|---|---:|---|
| `ambulance-512.glb` | 303668 | `d95613b66f6121563951d2ac97a0fb264dece39fe94259ef3bacbecb1837edfe` |
| `bus-512.glb` | 339584 | `42aa416d0a58f05d28c814f4db7f982d7d71b94f9aea848c70d9f4393916b64b` |
| `bush-512.glb` | 206072 | `07f5d1304808f336cf1838f7a62e800c22ba42579c511b480b87f171e7929105` |
| `firefighter-512.glb` | 314580 | `3ceb8ed60c863140209f25e2759da8e328e3dfda24a78c3630f98d5d9a70e310` |
| `gas-station-512.glb` | 294284 | `736e170d29f04f260ccdf3b97a426214a261acfe5a54cd545d13ad7015bdbd0f` |
| `grocery-512.glb` | 328620 | `af537c8d83caf2b71fee9714d237793d2fef24ab24fd5cfa4bd29d44c58f88c7` |
| `helicopter-512.glb` | 306524 | `e7305db37e4e3c6fa2e01612bc2a58d25f59bbb5f2c66980a86095298a07da8d` |
| `house-a-512-orig.glb` | 281152 | `99aae93b0ae2ac5e8c355105b4adf8ca86c5a045661a39d1518c556d1c6da884` |
| `kid-boy-512.glb` | 301420 | `f5f093aebed1e8590bc1158103278a4883e5c146ca8cf27442f1889fd6b468db` |
| `kid-boy-rigged-512.glb` | 974924 | `220c362d037ab06ab5b7f5f1ae8f2829c78fbb0f39a7f6642ddb3658e60beded` |
| `kid-girl-512.glb` | 320132 | `121dd3c356285bdea109d864c70a5a7b2dd53d7f13f01eff76e9d66eac2af16d` |
| `kid-girl-rigged-512.glb` | 1204980 | `b815d02955c478031fb71ec31e8a15a205af07f4bbb8714b4d1d4e66139fff45` |
| `pine-tree-512.glb` | 296728 | `fd86606e4a4032f2164eb91abf9fb9a5201f9d2bee3d454ab8059d99d507f2b9` |
| `playground-park-512.glb` | 301036 | `78c9e6df6fd29ea9752f08bb6d2dc643bf1c6af11fe196eab2e56b92cafbae45` |
| `police-car-512.glb` | 301012 | `f0bc1483761dd712ecb708e06a4c9e5e35b8121b50fa23c1e550a772e4cf23e6` |
| `police-officer-512.glb` | 340436 | `fb9ed303ed55504f8b6e775df706d41071e0be7c60e46edea6111c01116f3949` |
| `police-officer-rigged-512.glb` | 1201532 | `34ec2bb36b58a90a5ce9674438b4d0a96349a0e8d2c88a4533d7cbd3922feacf` |
| `police-station-512.glb` | 274056 | `823e85a33cb28b6bdb6a1b37cca5e6a95d3e2d0daf7a713a0aead5d5d7cc1d75` |
| `rock-512.glb` | 270772 | `a8807807b1a3860d698c0cfdf36af04fda1d102b0c98d5e5443813b07ce03a60` |
| `school-512.glb` | 320732 | `d43b10f70226893f029a8e267a7b53b717162da942630a1b730757366e5fc1fa` |
| `shop-corner-512-orig.glb` | 248848 | `211da0f2ed1e660636de1ff95f42f8bf1d227e0aa81817dcc99463c440e70cf2` |
| `shop-corner.glb` | 1276148 | `9c09f7ad0c3216b806c83253fd63d9c1047ddac97bbde3c8f99b90bb61143209` |
| `soccer-field-512.glb` | 381976 | `c0103f9c49199230eb6b552ed790a317c493e9e4f9f0178d1c6a334b05c4a6e2` |
| `street-lamp-512.glb` | 284096 | `bf47b974272f54c847dc1b6dbd090d5907ec5b75c91f0ec19b69ab02ad7e4127` |
| `tennis-court-512.glb` | 335848 | `30b92304cc970a1642e9f6c48080c717fb9ddc6383563e2850ead869ded5e7bd` |
| `trash-bin-512.glb` | 355756 | `1c9642ccdeb1b3e353ae66cf0aa8bb9cce877c12bfe1d907261c109a327d015f` |
| `water-tower-512.glb` | 334972 | `e70ff8bc1a3f1df397d280c8ecb6e93879ba3ffaf7fad240cec65d131fe62509` |
