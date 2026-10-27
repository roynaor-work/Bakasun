# מקורות ונכסים · גרפיקה 5

- מנוע, מסלול, שליטה, סאונד ושיאים: עותקים זהים מהענף שסיפק רועי, קומיט 5bedb77129324ccc16435fe3a2f09815ab28f4b1. אינם מימוש מנוע חדש של Codex.
- assets/alpine-rush/athlete.glb: Soldier/Vanguard של Mixamo מתוך הדוגמה הרשמית של Three.js: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb . הדוגמה מייחסת את המודל ל־Mixamo: https://threejs.org/examples/webgl_animation_skinning_blending.html . אין להציג אותו כ־CC0 או כנכס שרישיון MIT של הספרייה בהכרח חל עליו. פרטי שימוש של Adobe: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html . זהו פרויקט משחק משולב, לא מאגר למכירת דמויות.
- athlete.mjs מסיר בזיכרון חלקי ציוד מותן וראש, מתאים צבעי לבוש ותנוחות ומוסיף קסדה, מסכת פנים ומשקפי סקי שנוצרו בגאומטריה מקורית. קובץ GLB המקור נשאר ללא שינוי.
- vendor: Three.js ו־GLTFLoader מאותו ענף; LICENSE.three מצורף. מומלץ לשמור את vendor המשותף של main בשילוב.
- alpine-panorama.png ו־snow-fir.png נוצרו למשימה בגרסה 2 בעזרת ImageGen. רקעי ההרים הם תמונות רחוקות; העצים הם תמונות שקופות על שתי רשתות מצטלבות. הקרקע, הדמויות, הקרשים, המצוקים, הבקתות, המטבעות והמכשולים מוצגים בזמן אמת בתלת־ממד.
- רפרנסים אמנותיים: Ski Master, Snowboard Master 3D, וסרטון SSX 3 שנבחר בשיחה: https://www.youtube.com/watch?v=oQU4NAj0Piw . לא הועתקו קוד, סאונד או נכסים ממשחקי הרפרנס.

## יצירת תמונות ב־imagegen המובנה

שני נכסים חדשים נוצרו בכלי המובנה, הועתקו לפרויקט ונצרכים ממנו. לא נעשה שימוש במסלול CLI או במפתח API.

### granite-v5.png — פרומפט היצירה

Use case: game-asset. Create a single production-quality seamless tileable PBR BASE COLOR TEXTURE, 2048x2048 square, for rugged dark alpine granite cliffs in a premium snowboarding video game. Entire image filled edge to edge with the rock surface, perfectly orthographic top-down flat material scan, NO perspective, NO objects, NO scenery or horizon. Natural fractured blue-gray and charcoal granite, fine crystalline grain, thin pale mineral veins and irregular horizontal strata, realistic rock roughness at several scales, subtly weathered by mountain frost. Mostly dark cool gray with mid-tone stone variations, tiny sparse frost in cracks only; NO large snow patches, since snow is a separate game shader. Uniform neutral diffuse illumination, no cast shadows, no directional light or specular highlights baked in, no vignette, no text, no logos, no border. Rich detailed physically plausible material, continuous repeat in both directions. Save the image as an asset for the Alpine Rush project.

### alpine-dusk-v5.png — פרומפט העריכה

Reference: assets/alpine-rush/alpine-panorama.png.

Use case: game-asset, precise atmospheric variant of the supplied alpine panorama. Edit this existing image to BLUE HOUR / LATE DUSK for the storm-ridge stage of the Alpine Rush snowboarding game. Preserve the exact wide panoramic 3:1 composition, all mountain silhouettes, detailed natural rock formations, valley depth, forests and horizon placement. Change only the time of day and atmosphere: deep slate-indigo upper sky, a subtle muted lavender and warm rose band near the horizon, cool blue snow shadows and faint warm last-light highlights on the highest peaks. Realistic, premium atmospheric winter sports game matte painting, natural photographic detail, gentle distant haze, readable mountain layers, no flat geometric mountain shapes. Do not make it night or excessively dark. Do not add buildings, people, snowboarders, interface, logos, text, moon or aurora. Keep the original very wide aspect ratio, all landscape details, and clear separation between sky and peaks.
