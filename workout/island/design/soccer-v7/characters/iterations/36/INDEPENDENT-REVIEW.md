# Final36 · independent final-art review

**The requested 8/10 artistic gate remains unmet.** Final-art recommendations are faces **7.5**, hair **7.0**, cloth **7.5** and combined lighting/shadows **7.5**. The waist repair is a real, visible correction; it does not supply the missing facial integration, layered hair silhouette or fabric richness. These grades are visual judgements against [REFERENCE.md](../../REFERENCE.md), not scores inferred from polygon counts, valid materials or passing physical checks.

## What was reviewed

The current production cohort is exactly the **66 new lossless WebP originals** in [roster/capture.json](roster/capture.json): all eight identities × near LOD0 body, far LOD1 body, front cloth and three-quarter cloth, at both 390×844 and 844×390 (64), plus two pitch views. The atlas reviewer inspected every original through eight temporary labeled sheets and opened 14 selected originals at native size. Its detailed findings, per-identity grades and image receipts are in [INDEPENDENT-CLOTH-REVIEW.md](INDEPENDENT-CLOTH-REVIEW.md). The parent reviewer independently checked all 66 image dimensions, the current 16 model hashes, runtime/data bindings and the empty capture error/remote-request lists, and opened selected current originals.

The parent also inspected all **48 bounded action-control images** in [preflight/waist/actions/capture.json](preflight/waist/actions/capture.json) through four labeled sheets, then selected original phone files. This is 24 baseline/candidate pairs: six P01 poses × two LODs × two orientations. They use fixed round35 bone/camera fixtures and the old frozen runtime, with the candidate model supplied in memory. They are diagnostic comparisons, **not 48 new production movies or an all-identity action survey**. The saved `complete:false` and old-pose floor limitation remain explicit. The rejected unlocked-camera images were not used as accepted pairs.

The actual current production [motor portrait film receipt](motion-films/motor-390x844.json) is closed and reports PASS, unchanged frozen inputs, no page errors and no remote requests. I inspected its newly rendered frame91 and frame165 at native size against the actual round35 counterparts. This review uses those stills to assess the targeted waist correction; it does not claim to have independently watched all eight final movies or assign transition/floor scores from them. The separate motion/physical review owns that scope.

### Face and hair evidence is explicitly inherited

The full all-eight front/three-quarter/90°/stadium face cohort remains in [round35](../35/INDEPENDENT-REVIEW.md). Those images were not copied or renamed as round36 renders. I re-opened the new round36 P01 front face in both phone sizes and its new portrait three-quarter face. The two front images are independently verified RGBA-pixel-identical to round35, matching [unchanged-face-core.json](verification/unchanged-face-core.json).

For all16 models I additionally checked that the entire old BIN is a byte-exact prefix, non-Cloth primitive JSON is unchanged, and materials/images/skins/native animation JSON are unchanged. Thus the earlier face/hair closeups remain relevant to the unchanged art while the new body/cloth renders establish the changed garment state. This does **not** relabel all older photos as captures of the current runtime. The round35 review records all64 face/stadium originals and their original runtime/model scope.

Asset and atlas contributors participated in earlier authoring. This is a separate final review by those agents, not an external blind reference panel. Contact sheets are temporary arrangements of actual originals; no recoloring, retouching, substituted render, camera or product change was made for this review. The official reference pages and their documented access limits are in REFERENCE.md; this is not a same-camera test of EA FC Mobile on a physical phone.

## Final artistic grades and unmet gates

| Item | /10 | Current strengths | Specific unmet 8/10 criterion |
| --- | ---: | --- | --- |
| Faces |7.5|Distinct fictional features/complexions; readable nose, lips, ears and jaw; sockets/lids and visible iris with real curved-lens reflections.|Thin uniformly outlined brows, taut/dark mouth seam, broad smooth cheek/temple form and bright exposed sclera remain. P02/GK eye-cheek form is particularly dark/mottled compared with eye whites. Optical detail does not yet integrate into a natural full-phone face.|
| Hair |7.0|Filled near/far scalp coverage, legible grooms, fewer earlier black back-facing panels and restrained attached wisps.|Continuous cap-like macro contour, repeated serrated hairline and ruled crown-card streaks remain. P04's ginger crown exposes diagonal repeated ribbons; coil styles retain small dark flecks. Hair still reads as a groom shell at full-phone size rather than varied layered strands.|
| Cloth/kit |7.5|The large sprint waist wedges are removed in the current film; idle shirt/short boundary is continuous across the roster. P03's old idle hem notches are improved. Collars stay attached, kit hues remain distinct, gloves and far bodies are readable.|Broad smooth torso/tunic drape and brushed vertical streaks dominate fine knit and varied tension. Pinched underarm dents, dark cuff/seam endpoints, notched sock tops, simple gloves and washed-out white referee detail remain. The surgical waist correction is not universal garment collision proof.|
| Lighting/shadows |7.5|Current body shadows start at the boots and extend consistently; no conspicuous detached boot shadow, broad acne or rectangular hair-card shadow in the assigned views.|Dark P02/GK faces remain less readable than their bright eye whites; pale skin and white cloth sometimes look flat. Body contact shadows do not satisfy the whole close-face lighting gate or prove every side/evening condition.|

P03 cloth improves from the old 7.0 estimate to 7.5 because the visible idle waist notches are gone. The overall cloth grade remains 7.5; the referee remains about7.25. P02/GK face/shading remain the weakest identity-specific cases (about7.0 face and7.25 shading). Other per-identity face/hair findings remain those of the unchanged round35 art. No grade is rounded to8 because the delivery and numerical tests pass.

## Waist and action findings

[Current motor frame91](motion-films/motor-390x844-0091.png) has a continuous teal hem. The large mountain-shaped navy intrusions visible in [actual round35 frame91](../35/motion-films/motor-390x844-0091.png) are absent. [Current frame165](motion-films/motor-390x844-0165.png) remains clean, with no new exposed waist gap. These are actual newly rendered packaged36 frames, beyond the earlier fixed-pose candidate proof.

The paired get-up, kick, run and dive controls show no new obvious wholesale shirt split or newly exposed Skin patch in the inspected comparisons. High hip flexion still produces projected shorts/thigh overlap in some run/get-up/slide images. Such projection may be legitimate foreground self-occlusion and is not itself a 3D penetration proof; equally, the preserved positive masks prevent any claim of universal collision-free clothing. The [regression packet](preflight/waist/regression/index.json) retains those limits and the earlier failed old-fixed-pose floor check. Fresh floor/contact/LOD acceptance is separate from those fixed-pose stills, especially slide phase0.8.

The current idle far bodies preserve coherent scalp coverage for all8 and both orientations. The two pitch images retain readable kit sides and silhouettes; their small heads and subtle grass shadows cannot establish eye detail, seam quality, temporal planting or30fps. No physical-phone performance score or motion continuity grade is inferred here.

## Actual-original receipts

All66 production roster files were dimension-checked. Their set digest is `49840f638dffd5bb47c358ded7df34ae313f0b169322ecea2d08c55da6bcd557`: SHA256 of UTF8 compact JSON for the sorted `(filename,imageSHA256)` list using separators `(',',':')`. Detailed native-original cloth/pitch receipts are in the child review. Selected additional originals opened by the parent are:

| Actual original | SHA256 |
| --- | --- |
| [face-390x844.png](face-390x844.png) | `508512f5501c4a6f84de3e880f0741aed27cc0e57cc29d857ff3ae6fd2684ddf` |
| [face-844x390.png](face-844x390.png) | `8aea5db008051e35b138e665d58a4381bd67a28750f8b4a13d58784d7128dedd` |
| [face-profile-390x844.png](face-profile-390x844.png) | `7cd67bcf2a16eecfa7567e753f6b1983f88732afd4233342f07836200107c54f` |
| [player-03-cloth-390x844.webp](roster/player-03-cloth-390x844.webp) | `3b5b88f875be15eba456d45fe3a1e089901970bdc9a39ed1f7ea195ec6c3a7ab` |
| [referee-cloth-profile-844x390.webp](roster/referee-cloth-profile-844x390.webp) | `5ae1bc70968d4a701e3ccc963849ccdab598ddf7471e6c6cb89cd1262f54d08a` |
| [motor-390x844-0091.png](motion-films/motor-390x844-0091.png) | `5f57f1b7f14c9dabcb9c718faaac738670f644e800190238664cf7107c031c95` |
| [motor-390x844-0165.png](motion-films/motor-390x844-0165.png) | `fe1120e024947d98be293450fa0c209a46c991e71608812d1564394e33b524ac` |
| [candidate-run_5-0.8-lod0-390x844.png](preflight/waist/actions/candidate-run_5-0.8-lod0-390x844.png) | `5692e7f32b158181bbc468f2c85bb8abb5cbfeedd37e3d64dc08ddabbb65f925` |
| [candidate-get_up-0.5-lod1-390x844.png](preflight/waist/actions/candidate-get_up-0.5-lod1-390x844.png) | `e7ed623ae71b081288376331030eaa9c3fd3f1c265ab4276af76f977f8c50763` |
| [candidate-keeper_dive_right-0.8-lod0-844x390.png](preflight/waist/actions/candidate-keeper_dive_right-0.8-lod0-844x390.png) | `e1912117f11110731aa39636d92d29b369f45b3462c9ce6b29a44ca4e83a3378` |

## Current core bindings

| File/input | SHA256 |
| --- | --- |
| `iterations/36/capture.json` | `4de4ffa0a68936c3acf0054a9674917938aa74db4f043448eed64da91bfaae03` |
| `iterations/36/roster/capture.json` | `ce6fe0f3ccef7c99cacf99220060a58d03ca1c8a8407501b5f203ae4a06dd5a8` |
| `vendor/viewer-runtime.js` | `c3221f8578ede967b73319a9f465fc7229220e21c0cf97921480ef65f5a8d51d` |
| `vendor/data.js` | `68ddec0174bf30eda27e71901ea638d3ac9b9b6af1363af788c909e9d859bb65` |
| `asset-manifest.json` | `f0e5f049fd0683e35615e0824e3d3411d3b05dce5c2ffae7c5e0d33a8e851caf` |
| `animations.json` | `7c90b679d353a229a73f4d89275981809a0a9f33e5cc2d4c1938d27cfdf4cabc` |
| `source/character-waist36-report.json` | `a6655cf02aa818a4aecd7e2c1c03619d18649915126e891c6942f23c3b8645e3` |
| `source/motion-embedded-report.json` | `a1740bf42504b5ed2c5428ca3ff1ebf33dbf918576deb4befc198f2b313f21c8` |
| `iterations/36/verification/unchanged-face-core.json` | `f975966ad4bd590f0a0e39aa2c7f01d9a92c1b1a8012fbd2c6b58b39d6652553` |
| `iterations/36/motion-films/motor-390x844.json` | `882b085490d3f4ceb02ad25790bbb1a42085997fca77180c388165cb43449125` |

All16 current model hashes in roster/capture.json were independently compared with disk. Model positions, UVs, materials and native clips remain those of the accepted native32 art; the final waist36 change is shorts-only skin binding in Cloth. The manifest includes the exact new model sizes/hashes. Only this review Markdown and temporary contact-sheet layouts were written by the parent for this review; source, models, maps, manifest, runtime, camera and original images remain untouched.
