# Eye primitive and reflection isolation

The packed manifest, motion, runtime, all embedded model payloads and local r160 module are identified by SHA-256 in `diagnostic.json`. The page/model responses were frozen in memory for the capture. No vendor, model, manifest or motion files were changed.

36 captures cover player01, player02 and the goalkeeper at frontal and 0.45 rad views, each 390×844. In each comparison strip, left to right:

1. Actual packaged materials.
2. Cyan `MeshBasicMaterial` Eyes with neutral gray other primitives.
3. Cyan Eyes with other primitives hidden.
4. Black-base clearcoat-only Eyes, original corneal mask retained.
5. Same clearcoat without the mask.
6. Unmasked clearcoat Eyes with other primitives hidden.

The visible sclera/iris aperture belongs to the separate Eyes primitive. On frontal player01, 1,014 cyan pixels remain visible through the face, versus 3,843 on the isolated full eye globes. The visible eye is therefore not just skin texture.

The strong reflected environment is mostly above the visible eyelid aperture. With black basecolor and base specular suppressed, frontal player01 has 74 bright isolated reflection pixels but only 6 visible through the face; player02 has 78 isolated and zero visible. All three-quarter views have zero visible pixels above the same RGB 180 threshold. The original mask and unmasked material retain the same small number of brightest visible pixels. Exact counts are in `glint-visibility-summary.json`.

The companion `../motion-eye-review-mask15/` capture shows the original clearcoat texture's red channel using the actual eye UV transform. A white central circle and black surrounding sclera establish that the corneal mask is placed correctly. Reflection direction and eyelid occlusion explain the weak catchlight more directly than insufficient clearcoat intensity. A lower, more frontal reflected light source was a candidate for a separate lighting review. The subsequent controlled four-height sweep in `../motion-eye-height-review15/` did not produce a convincing new catchlight, so it does not justify changing the baseline height.

There were zero browser errors and zero external requests. These diagnostic material overrides isolate geometry and reflection location; they do not score final eye realism, preserve the full original BRDF, or establish physical-device performance.
