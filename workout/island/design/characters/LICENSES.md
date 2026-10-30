# מקורות ורישיונות · דמויות האי

ארבע הדמויות בדויות. אין שימוש בדמותו של שחקן אמיתי, בשם קבוצה או ליגה, או בלוגו אמיתי. אין נכסים שנלקחו ממשחק ספורט מסחרי.

| קובץ | מקור | רישיון |
| --- | --- | --- |
| `soccer-player.glb` | גאומטריה ושלד מתוך Kenney Animated Characters Protagonists 1.1; התאמות מקוריות למדי כדורגל, פלטת צבעי קודקודים ופרטי פנים | CC0-1.0 למקור ולהתאמות |
| `goalkeeper.glb` | אותו בסיס Kenney; התאמות מקוריות למדי שוער ולכפות ידיים/כפפות מוגדלות | CC0-1.0 למקור ולהתאמות |
| `basketball-player.glb` | אותו בסיס Kenney; התאמות מקוריות לגופיית כדורסל, צבעים ופרטי פנים | CC0-1.0 למקור ולהתאמות |
| `skier.glb` | אותו בסיס Kenney; התאמות מקוריות לחליפה, קסדה, משקף ומגלשיים | CC0-1.0 למקור ולהתאמות |
| `soccer-player-{front,three-quarter,back}.png` | רינדור מקורי של `soccer-player.glb` | CC0-1.0 |
| `goalkeeper-{front,three-quarter,back}.png` | רינדור מקורי של `goalkeeper.glb` | CC0-1.0 |
| `basketball-player-{front,three-quarter,back}.png` | רינדור מקורי של `basketball-player.glb` | CC0-1.0 |
| `skier-{front,three-quarter,back}.png` | רינדור מקורי של `skier.glb` | CC0-1.0 |
| `rig.json` ותיעוד החבילה | תיעוד מקורי שנוצר למסירה זו | CC0-1.0 |

התאמות הגאומטריה, פלטות הצבע, פרטי הפנים, המשקף, המגלשיים, התאמת השלד והרינדורים נוצרו לחבילה זו ומוקדשים לנחלת הכלל לפי [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). טקסטורות המקור של Kenney אינן כלולות או בשימוש ב־GLB המוגשים; המראה נשמר בצבעי קודקודים ללא טקסטורות.

## בסיס Kenney ורישום מקור

המקור הוא [Animated Characters Protagonists מאת Kenney](https://kenney.nl/assets/animated-characters-protagonists), גרסה 1.1. העותק שכבר נמצא במאגר מכיל FBX בשם `characterMedium.fbx`, המקודד ב־`FBX_B64` בתוך [character.js](../../../3d/model/character.js), ואת [הודעת הרישיון המקורית](../../../3d/model/License.txt). מקור זה נשמר ללא שינוי.

קומיט המקור: [`91dbfabb4236f1366f6994e6230c455013af9637`](https://github.com/roynaor-work/Bakasun/tree/91dbfabb4236f1366f6994e6230c455013af9637).

| נתיב במאגר | SHA-256 של קובץ המקור |
| --- | --- |
| `workout/3d/model/character.js` | `5495f73ac7ad786761393537855a3c7996d7e8c410134c19aafe13a7295562b6` |
| `workout/3d/model/License.txt` | `68280323c6dca1f532c71fb248a6f344abed39a574278a2edfa27801aea3d0cd` |

גאומטריית הבסיס מכילה 1,604 משולשים. בחבילה זו הוסרו עצמות בקרה ועצמות אצבעות/בהונות מהשלד המוגש; משקליהן אוחדו לעצמות הידיים והרגליים, ומשקלי `UpperChest` אוחדו ל־`Chest`. נשמרו עד שתי השפעות מנורמלות לקודקוד. כל ארבע הדמויות משתמשות בחוזה השלד המשותף המתועד ב־`rig.json`.

## הודעת Kenney המקורית

```text


	Animated Characters Protagonists (1.1)

	Created/distributed by Kenney (www.kenney.nl)

			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney

	Follow on social media for updates:

	• Twitter:	 twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:	 mastodon.gamedev.place/@kenney
```
