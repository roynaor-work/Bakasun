# מקורות דמויות v7

רשתות גוף ופנים אנושיות מ־MakeHuman hm08, יעדי צורה של בוגרים סינתטיים, טקסטורות עור וכרטיסי שיער משמשים בסיס אנטומי. הם כבר נכללים בריפו בתיקיית `soccer-v6/characters/source/makehuman/`, ונקראים ממנה ללא שינוי. כל זהות חדשה היא שילוב פרמטרי בדיוני; אין אדם אמיתי או סריקת פנים אישית.

המחולל החדש מתקן את מיפוי הפרופורציות של הראש והצוואר, מתאים גבות לפני העור, משמר רשתות עיניים ופנים, מתאים בגד אמיתי, מייצר גרביים ונעליים ותוחם מפות PBR באטלס UV אחד. הנתונים בזמן הצפייה עצמאיים ונמצאים ב־GLB; קריאת מקור v6 נחוצה לבנייה חוזרת בלבד.

## רישיון הנתונים

[הצהרת נכסי המערכת הרשמית](https://github.com/makehumancommunity/makehuman-static-website/blob/master/content/Assets/AssetPacks/makehuman_system_assets.md) מסמנת CC0 לשיער `short01`–`short04`, `afro01`, עורות בוגרים ולבגד `male_casualsuit06`. עותק ההצהרה ורישיון הנכסים מצויים במקור v6. קובצי מקור ישנים נושאים כותרות AGPL היסטוריות; הן נשמרו כפי שהן, וההיתר העדכני לנתוני הנכסים הוא CC0 לפי ההצהרה הרשמית. לא הועתק קוד התוכנית MakeHuman.

## חולצה חדשה

לאחר שהרינדור הראשון הראה קצוות בד פגומים, נבדקו תלבושות המערכת. `male_casualsuit06` נבחר מפני שהוא מכיל חולצה קצרה בעלת לולאות צווארון, כתף, שרוול ומכפלת סדורות. הועתקו רק קובצי OBJ ומפת התאמה MHClO מ־[מראה נתוני MakeHuman](https://github.com/dmaugis/makehuman-py3-assets/tree/master/base/clothes/male_casualsuit06). טקסטורת הבגד המקורית אינה משמשת בתוצר; החולצה צבועה בצבע ערכה אחיד עם normal ותפרים מקוריים לחבילה. ה־MHClO מעוות את החולצה לפי אותה רשת אנטומית של הזהות, ואז היא משוקללת לשלד הקנוני.

## קבצים וחתימות

| קובץ מקור | SHA-256 |
|---|---|
| `workout/island/design/soccer-v6/characters/source/makehuman/base.obj` | `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c` |
| `workout/island/design/soccer-v6/characters/source/makehuman/skin-diffuse.png` | `ef5cde3401a5eaa19d8fdd73718a98f969fb481a434f8a1eb77e7b47c89315b4` |
| `workout/island/design/soccer-v6/characters/source/makehuman/skin-dark-diffuse.png` | `6c7822f62eb45fbc658592fc2ec6291f4b01279b638d5940a7fa2dedbafbd525` |
| `workout/island/design/soccer-v7/characters/source/cc0-clothing/male_casualsuit06.obj` | `fdd06d0e7d07a1e0928a64824ad073e6b0a56128ad7ce525575b383e4ecc908a` |
| `workout/island/design/soccer-v7/characters/source/cc0-clothing/male_casualsuit06.mhclo` | `79752495a7d6277df69501c7a0ca0d775df92a921648caea10c463389047d180` |

מפות צבע/normal/ORM נוצרות ב־1024×1024. כל חומר משתמש באותו אטלס ובאותם שלושה ערוצים. שיער משתמש בשקיפות מקורית; עור ובד אטומים. הפנים והעיניים נשמרים בפירוט הגבוה, ו־LOD רחוק מפחית את הפירוט. קובצי Draco הם נכסי הצריכה, והמחוללים אינם נדרשים בזמן ריצה.

## עפעפיים וכרטיסי שיער נוספים

שישה יעדי סגירת עפעף עדינים הועתקו כנתוני CC0 מ־[יעדי ההבעה הרשמיים](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data/targets/expression/units). כותרת CC0 נשמרת בכל קובץ. היעדים משולבים בעוצמה חלקית בהתאם למבנה הפנים הסינתטי, כדי לעטוף את הקשתית בעפעף עליון; אין שלד פנים נוסף. כרטיסי הקצוות הדקים, דגם אלפא של השערות, הגבות, פרטי הבד והאטלס נוצרו פרוצדורלית בחבילה זו.

| יעד CC0 | SHA-256 |
|---|---|
| `african-eye-left-closure.target` | `5a9fc811ddff5f5657f7c9566ca07dfe31f68865d001804324fca5ecffd3992f` |
| `african-eye-right-closure.target` | `3bb393418e84b1c3ebc9af075dbeff54f9161cafd9bb7e04caa40d155d4619ff` |
| `asian-eye-left-closure.target` | `96d43015f95af63d1d5d64c2d234ac29571d7b05a21e900cf5ee15a246337ebf` |
| `asian-eye-right-closure.target` | `772a8a1c62dac36fa2ed6b0808d167bda298ec1ece956af0561e7324a0c91a6b` |
| `caucasian-eye-left-closure.target` | `e38cb77fd888de3d0d944efe6f3511bf3ca4076b0397fa7c840d8368f08205c2` |
| `caucasian-eye-right-closure.target` | `58faf2c199272bfd87478ea122cdaa4b4b8669505be0d75f777c5471527b2b15` |

פרטי הסתירה ההיסטורית בין כותרות AGPL לבין ההרשאה העדכנית של הנכס מתועדים ב־[README-LICENSE.md](cc0-clothing/README-LICENSE.md), כולל הבהרת הרישיון הרשמית משנת 2020 והעתקים מקומיים של הצהרת חבילת הנכסים ורישיון CC0. כותרות הקבצים המקוריות נשמרו.

## Original-resolution authoring skin inputs

The final atlases use the original **2048×2048** MakeHuman system skin maps, extracted from the official Ubuntu data package by `character_fetch_skin.py`. These are synthetic system assets, not photographs of identified people. The previously committed 1024 maps remain a deterministic authoring fallback. A direct comparison confirmed that each fallback is exactly the Lanczos downsample of its corresponding original, with RGB mean absolute error 0.0.

Source archive: <https://archive.ubuntu.com/ubuntu/pool/universe/m/makehuman/makehuman-data_1.1.1-1_all.deb>, 262,831,670 bytes, SHA-256 `881a79c3a6640e2ecc579093f6895d161fd902856504b123ef750e843f4304a7`. The script verifies both the archive and the extracted image hashes. It installs no package.

| Original authoring input | Dimensions | Bytes | SHA-256 |
|---|---|---:|---|
| `young_lightskinned_male_diffuse.png` | 2048×2048 | 3,597,309 | `6222821cf0425b4459f00c3db4cffc1fa965922fc314f328076bdec7a2791510` |
| `young_darkskinned_male_diffuse.png` | 2048×2048 | 2,754,119 | `a541ebd3e900f61bcd84cdccb36293759bc88d76f636f7011a11daf42cae5959` |

The archive and original images stay in `/tmp/soccer-v7-authoring-skin/`, configurable with `SOCCER_AUTHORING_SKIN_CACHE` or the fetch script's directory argument. They are **not shipped in this directory**. Every final runtime image is 1024×1024. The manifest records the actual inputs, hashes and source UV crop. Tightening the face crop to U `.78–.99`, V `.32–.65` assigns more atlas texels to the visible face; partitioned polygons prevent interpolation through unrelated atlas tiles.

## Additional synthetic identity targets

Eight CC0 cheek, chin and temple targets from the [official MakeHuman target tree](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data/targets) are blended at restrained strengths to distinguish the fictional identities. Their original headers are retained. These augment the six eyelid targets listed above; they do not add bones or a real person's likeness.

| Target | SHA-256 |
|---|---|
| `chin-height-decr.target` | `acf83b5b7f2d6665f19d0d91205472878c23ab78b3f43d48420f75afe8e82818` |
| `chin-prominent-incr.target` | `d2493ca5f69aabeb8557d77a56c49cfcf2062ff90c0cad03073d87990d11448b` |
| `chin-width-incr.target` | `deef506bfe1883d9d4c38667332c9970785226566efbae4724fd3d60c02efcf4` |
| `forehead-temple-incr.target` | `5befc93f4a58ba09f51fcad625fd659b0dc99a86e1d1581373a4e8aecf2e3965` |
| `l-cheek-bones-incr.target` | `244ffa39d2d2db94ff15130719346b4cae2236bf2a309c5682eac352da06be50` |
| `l-cheek-volume-decr.target` | `527d19395f33c02caf3b32254e78702156cdf63c17e4c0e3dd79cca004fa27be` |
| `r-cheek-bones-incr.target` | `a393f67acce21568ab832091daadab267685d464492647cb0c4e8cb5af58c4c9` |
| `r-cheek-volume-decr.target` | `3a356f2f6434ccefa633981dff1b7866ce1feb8427918f35f81b6adffa4599b5` |

## Authored hair, garment details and texture encoding

The final default grooms are new scalp-conforming undercoats, curved alpha cards, tapered fringes and fine curl ribbons generated by `character_hair.py`. Root alpha coverage follows distance above a curved receding hairline; a separately preserved fine fringe bridges the roots. The old MakeHuman hair source remains an optional authoring branch and is not used by the final default roster. Brow placement, socket-fitted upper-lid margins, boots, socks, glove details, protected stitches and collar/cuff binding are authored in this package. The MakeHuman shirt topology is retained above a true closed cross-section; its lower panel below the closed cross-section at 1.025 m is replaced by a continuous tailored panel and inward sewn fold to remove the source garment's side slits. The panel is fitted outside the actual shorts surface, and a post-simplification guard preserves at least 6 mm of radial clearance at sampled overlap vertices. The round-14 phone preflight confirms a continuous visible hem.

Each identity has one UV atlas layout shared by base color, tangent-space normal and ORM. Five materials—`Skin`, `Cloth`, `Eyes`, `HairCards`, `EyesCornea`—share these images. The separate opaque curved eye lens reuses the exact eye atlas/ORM/normal, clearcoat and IOR 1.376, so the local viewer and standard compatible glTF tools show the same physical light reflections without an additive adapter or transmission framebuffer. The lens occludes the shallow underlying iris recess; depth comes from socket/lids/lens curvature, not transparent iris parallax. In the eye tile, ORM.R is repurposed as a radial clearcoat mask and Eye AO is disabled; G remains roughness and B remains metallic zero. The sclera is rougher than the iris, and the physical corneal bulge follows the socket-aligned iris. Base color is WebP quality 98 with lossless alpha, declared through required `EXT_texture_webp`; normal and ORM are lossless palette PNGs. No texture exceeds 1024 in either dimension.

The final eight atlas sets were regenerated into a temporary directory using the manifest's exact Face27/Hair20/Cloth18/Eye19 recipe and matched all 24 delivered image files byte-for-byte. WebP quality 98 preserves alpha exactly; face RGB mean error is 0.782–1.072/255 and face PSNR is 44.80–47.05 dB. Palette PNG leaves ORM exact; mean normal-map angular error stays below 0.001856 degrees, with maximum per-character 99th-percentile error 0 degrees. Full per-character metrics, image hashes, delivery recipe and 18 source hashes (including the measuring code) are in `character-texture-quality.json`. These codec measurements do not score photorealism.

The GLBs use Draco-compressed geometry and the canonical 18-joint rest transforms from `workout/island/design/motion2/soccer.json`. The source meshes and generated atlases contain no logos, brands, real player likenesses, customer data or secrets. Runtime loading requires no external service.

Controlled phone-size material isolation found that anisotropic reflection produced triangular crown panels and broad strip highlights on the short-card grooms. The final exporter omits `KHR_materials_anisotropy`; ordinary isotropic reflection remains. The accepted preflight candidates were changed at the GLB JSON material level while preserving their complete BIN chunks, including every compressed mesh and embedded image byte. The scoped before/after proof is in `character-material-proof.json`. The remaining identities are exported directly with the same isotropic material.


## Restrained rest expression

Nine additional CC0 data targets from the same official expression-unit tree are retained with their original headers. A `.40` mouth-compression blend and `.060` eye-slit blend, weighted by each synthetic identity's heritage parameters, reduce the parted resting lip shape and relax exposed sclera. The changes deform the anatomical mesh; no expression, catchlight or shadow is painted onto the face. Eyes, upper-lid margins and brows are refitted to the exact triangulated near-face surface.

| Target | SHA-256 |
|---|---|
| `african-eye-left-slit.target` | `f2724e8d865211ded6022ba886ece6a47ca9bbb4d279f302f93329d3fa624d10` |
| `african-eye-right-slit.target` | `713283452d24f0b68d9026e26fb3b3ee2e479dd33b31021926f94bf4e593d368` |
| `african-mouth-compression.target` | `12b8dc506faa0cde0c30a07b89c725dc728d4770900a7dd6956dceb91566c7ef` |
| `asian-eye-left-slit.target` | `95fdd2d24f2a1b2a2d3c9fdaed6e64f5653bc829301b17749739771ca48edfc8` |
| `asian-eye-right-slit.target` | `2fbcf811893a44cff66ef7139441d48ac0cfc5896c62e562083862be49c8bfc7` |
| `asian-mouth-compression.target` | `b7abd0826708d7e4344559583edd0fc80e098b08b91f3e6d67d83b1eed20ccbe` |
| `caucasian-eye-left-slit.target` | `f2724e8d865211ded6022ba886ece6a47ca9bbb4d279f302f93329d3fa624d10` |
| `caucasian-eye-right-slit.target` | `713283452d24f0b68d9026e26fb3b3ee2e479dd33b31021926f94bf4e593d368` |
| `caucasian-mouth-compression.target` | `b7abd0826708d7e4344559583edd0fc80e098b08b91f3e6d67d83b1eed20ccbe` |

## Final authored construction variants

The accepted combination uses cloth18 flat sewn facings, matte rib collar/cuffs and asymmetric tension folds; measured common-axis eye19 geometry with the portable opaque atlas-colored lens; hair20 fine pigment variation and projected undercoat normals; and sock23 below-knee anatomical cuffs with skin overlap. The two coil grooms retain double-sided cards for temple coverage. The six other grooms use front-facing cards to remove dark back-facing crown fragments. Actual phone ablations are retained under `iterations/19/` and `iterations/23/`; they are separate from the source/license evidence.

`character_material24.mjs` changes only the per-groom material side flag and proves the compressed BIN, images, rig and geometry JSON are unchanged. `character_promote.mjs` installs that complete reviewed stage by byte copy, with final canonical paths already encoded. Native motion embedding follows and independently proves the original compressed geometry/image prefix is preserved.


## Selected combined32 anatomical and garment refinement

The final recipe is recorded in the main manifest and source README. Face27 adds restrained local C1 malar/outer-cheek curvature (about 2.6 mm maximum) with exact zero-displacement masks at the eyes, lips, nose and neck, then Catmull–Clark 1 before near-face triangulation and fitting. Boundary guards preserve the canonical attachment; this is refinement of a synthetic anatomical cage, not a real person's face. The .40 resting mouth compression is retained; the .25 experiment was rejected for widening the empty lip opening. A further .05 authored upper-lid closure and standard glTF Eyes/EyesCornea RGB factor .88 reduce exposed/overbright sclera. Skin normal strength stays .5.

Crown29 replaces long straight-style locks with shorter overlapping curved sections while keeping the original fine fringe exact. Crown31 adds tiny attached crown-only wisps. P03 alone receives the accepted 8 mm shared sweep deformation; P04's 14 mm macro and the 100% projected-normal control were rejected. The standard 80/20 projected/own vertex-normal blend and per-style sidedness remain. Coils are preserved. FarCap32 welds disconnected cap positions while retaining loopUVs, uses UV-preserving simplification, and remaps to the existing opaque interior of the same hair tile. All 8 source/QEM caps pass 216/216 crown rays with worst 1.59 mm approximation error; actual all 8 far phone views show no large scalp gaps. No new atlas, material workaround or extra joint is used.

Cloth finishing 31 repairs the delivered-Skin collar clearance and adds two restrained upper tension folds without changing topology, UVs, materials or weights. The all 8 combined pre-native Draco near models pass 48 finite collar-pose cases with all rays measured, zero negatives and minimum 0.254 mm clearance; see `character-collar32-decoded-proof.json`. Later native embedding preserves the original compressed geometry/image prefix, so that measurement remains scoped through the append operation. It is not a universal seam/floor proof. Small collar endpoints, broad smooth drape and angular moving folds remain visible. Independent authoring reviews remain about 7.5 for faces/cloth and 7–7.5 for hair; small refinements are not relabeled as EA FC Mobile parity. Final floor, controller and physical-phone limitations are recorded separately in REPORT.md.


The final waist36 binding correction is authored for this package. It modifies only shorts skin weights in the existing Cloth primitive, using the original native32 GLB files preserved in `../iterations/35/frozen-package/`. `character-waist36.mjs` appends mixed raw joint/weight attributes without reencoding Draco, and `character-waist36-report.json` binds the exact input/output hashes. All original BIN bytes, native clips and 24 atlas images remain unchanged. This stage uses no new third-party art or texture input.
