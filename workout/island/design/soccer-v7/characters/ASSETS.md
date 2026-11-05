# Character assets

Eight fictional adult football characters: six field players split between teal and amber kits, one goalkeeper with gloves and one referee. Identity shapes blend synthetic anatomical targets; there is no real player likeness. Kit designs use colors, fabric and seams without branding or club insignia.

The geometry starts from the CC0 MakeHuman hm08 human topology. Heads, necks, shoulders, eyes, eyelids and fitted garments retain anatomical surfaces. Scalp grooms, alpha hair cards, eyebrows, boots, socks, glove detail and garment stitches are authored for this package. See [source provenance](source/character-provenance.md) for source hashes and license evidence, and [authoring instructions](source/README.md) for regeneration.

## Runtime contract

- `asset-manifest.json` lists all identities, roles, LOD paths, decoded triangle counts, byte counts, SHA-256 hashes and texture channels. File sizes use decimal bytes; the strict limit is **1,500,000 bytes per GLB**.
- `models/` contains one near and one far Draco GLB per identity. Each is self-contained, including its atlas and 18-joint skin. LOD selection and contact correction are handled by the local viewer.
- Each identity has **one 1024×1024 UV atlas layout** and three shared channels: WebP base color with lossless alpha, PNG tangent-space normal and PNG ORM (occlusion, roughness, metallic). In the eye tile only, R stores corneal clearcoat coverage and eye AO is disabled; the other atlas tiles retain ordinary occlusion in R.
- Five materials use one atlas layout: `Skin`, `Cloth`, `Eyes`, `HairCards`, and `EyesCornea`. Skin, cloth and eye surfaces are opaque. Hair, eyebrows and the fitted upper-lid margin use alpha cutout. The separate curved eye lens uses the existing eye color/normal/ORM images, physical clearcoat and IOR 1.376. This standard glTF material gives the same wet reflections in the local viewer and compatible glTF loaders; it needs no blend adapter, painted catchlight, transmission framebuffer or extra image. The lens occludes the authored shallow iris recess: visible depth comes from the socket, lids and curved lens, not unobstructed iris parallax. Required extensions include `KHR_draco_mesh_compression` and `EXT_texture_webp`.
- Hair uses isotropic specular response. Controlled phone-size material comparisons isolated anisotropy as the cause of metallic crown panels and broad strip highlights; removing it retains the groom and its fine texture. The feathered root band and the remaining crown each receive a useful UV range. Fine-card normals project onto coherent undercoat volume; accepted crown29 locks combine 80% projected and 20% own normals, shorter overlapping paths and restrained fiber pigment variation. Sparse crown31 wisps add attached silhouette detail; only player-03 receives the accepted 8 mm macro sweep. Far caps are welded with loopUVs retained and remapped into the existing opaque hair tile, repairing the former large bald gaps. The remaining cap/lock contour and repeated strands still limit hair realism. The six straight grooms use front-facing cards to remove dark back-facing crown fragments. The two coil grooms retain double-sided cards for their tested temple coverage. The material choice adds no images or draw calls.
- Every GLB uses the same canonical 18 named joints, exact rest translations and inverse binds. The source contract is `workout/island/design/motion2/soccer.json`; +Y is up, +Z is forward and +X is anatomical left. No extra face or finger bones are introduced.
- The rest boot sole starts at +2 mm above the floor. The viewer applies the authored motion plus contact-aware correction. Bare glTF playback does not include this JavaScript correction.

The standalone page and bundled local Three.js r160 runtime work without a network connection or build step. The authoring tools and higher-resolution source cache are unnecessary at runtime. Crowd geometry uses separate instancing in the viewer; it does not duplicate eight full near-character skins per spectator.

## Data license and authoring provenance

The MakeHuman system assets used here are CC0 under the official [system-assets catalog](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) and [2020 license clarification](https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html). The exact `male_casualsuit06` entry is listed as CC0. Its OBJ and MHClO still contain historical AGPL notices; those original headers are preserved byte-for-byte. The clarification explicitly addresses stale pre-2020 notices. Local evidence is retained in [cc0-clothing/README-LICENSE.md](source/cc0-clothing/README-LICENSE.md), the catalog snapshot and the asset-license text. No MakeHuman program code is copied into the viewer.

The final face atlases were baked from original 2048×2048 synthetic system skins fetched into a temporary authoring cache. The original images and 262 MB archive are not part of the deliverable. The fetch script pins and verifies the archive and image SHA-256 hashes. Runtime maps are all 1024×1024.

The final eight atlas sets were regenerated into a temporary directory using the manifest's exact Face27/Hair20/Cloth18/Eye19 recipe and matched all 24 delivered image files byte-for-byte. WebP quality 98 preserves alpha exactly; face RGB mean error is 0.782–1.072/255 and face PSNR is 44.80–47.05 dB. Palette PNG leaves ORM exact; mean normal-map angular error stays below 0.001856 degrees, with maximum per-character 99th-percentile error 0 degrees. Full per-character metrics, image hashes, delivery recipe and 18 source hashes (including the measuring code) are in `source/character-texture-quality.json`. These codec measurements do not score photorealism.

## Review limits

Phone-size screenshots, per-round critiques and the final score table are in `iterations/` and `REPORT.md`. Close-up face, hair and cloth quality must be judged from those images. A valid atlas, a small file and a passing rig audit do not establish EA FC Mobile visual parity. The final report records any remaining visual shortfall and the limits of desktop performance measurements versus a physical midrange phone.

The selected cloth construction uses flat sewn facings, ribbed collar/cuff bands, asymmetric tension folds and surface-projected seams. The final collar repair preserves topology/UV/weights and passes 48 decoded pre-native pose cases across all 8 identities with 100% collar-ray coverage, zero negative samples and a minimum 0.254 mm gap. Native embedding preserves that geometry prefix. This finite clearance check does not prove seam closure or every pose: small band endpoint notches, broad smooth drape and angular action folds remain visible, with independent cloth quality around 7.5/10. Upper sock rings fit their own anatomical calf/knee and inherit its skin weights; the opposite leg is excluded from raycasting. Deep-flexion phone frames remain necessary to verify the resulting silhouette.

All sixteen delivered GLBs include the 31 native glTF clips sampled at 30 Hz. The ordinary motion packaging step runs after geometry is frozen. The final waist36 correction is an append-only skin-weight edit made after native embedding: all original BIN bytes and the 31 clips remain exact. Its new raw Cloth joint/weight accessors coexist with Draco position/normal/UV data. Verify these files with `source/motion-native-verify.mjs`; do not rerun a legacy embedding writer that truncates trailing accessors. See the final manifest, animation audit and report for the packaged clip count. The JSON motion controller remains responsible for contact correction and action transitions in the interactive page.

## Final file weights

MB uses 1,000,000 bytes. Model names are `models/{identity}-lod0.glb` and `models/{identity}-lod1.glb`; each GLB includes its three images and native clips. The image columns describe the separate authoring/runtime image files, so their sizes are already included inside the GLB columns. Every image is 1024×1024.

| Identity | LOD0 triangles | LOD0 MB | LOD1 triangles | LOD1 MB | Basecolor MB | Normal MB | ORM MB |
|---|---:|---:|---:|---:|---:|---:|---:|
| player-01 | 35,365 | 1.452956 | 5,781 | 0.944336 | 0.121600 | 0.212719 | 0.030215 |
| player-02 | 33,865 | 1.425840 | 5,778 | 0.924844 | 0.115832 | 0.200843 | 0.030271 |
| player-03 | 35,296 | 1.477440 | 5,759 | 0.965948 | 0.142894 | 0.212779 | 0.030071 |
| player-04 | 35,327 | 1.494560 | 5,780 | 0.983444 | 0.160098 | 0.212999 | 0.030128 |
| player-05 | 33,673 | 1.390208 | 5,773 | 0.930292 | 0.110934 | 0.212979 | 0.030204 |
| player-06 | 35,365 | 1.475516 | 5,777 | 0.959316 | 0.138386 | 0.213521 | 0.029973 |
| goalkeeper | 35,426 | 1.468864 | 5,997 | 0.951796 | 0.137478 | 0.202968 | 0.030852 |
| referee | 35,365 | 1.477204 | 5,778 | 0.967220 | 0.144638 | 0.213142 | 0.030104 |

The authored near budget was revised to 36,000 triangles to retain the anatomical face curvature, physical eye lens, crown locks and sewn cloth; the far budget remains 6,000. Actual decoded maxima are 35,426 near and 5,997 far. These are project budgets; the strict user cap remains 1,500,000 bytes per GLB including images and all 31 native clips. The largest final GLB is `models/player-04-lod0.glb` at 1,494,560 bytes (1.494560 MB).

The complete 16-model set occupies 19,289,784 bytes (19.289784 MB). The largest file has 5,440 bytes of headroom below the strict cap. The waist repair follows a smooth 0.70–0.84 m transition from the original shorts leg weights to the same Hips/Spine rule as the jersey. It removes the large sprint waist intrusion documented in round35 while preserving the skin, eyes, materials, maps, rig and native clips. Round36 retains exact before/after phone frames and gait regression evidence. Fresh floor/contact/LOD audits bind the changed weights; bounded projection checks do not prove universal garment collision clearance. This repair does not raise the independent cloth realism grade above 7.5/10.
