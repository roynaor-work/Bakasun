# Controlled front reflection pane height sweep

48 actual phone captures compare four identities (player01, player02, player04 and goalkeeper), three yaw angles (0, 0.16, 0.45 radians), and four front-pane heights. CSS viewport is 390×844, DPR 1.5; actual PNGs are 585×1266. All packaged data/runtime/model responses were frozen in memory; exact input and model SHA-256 values are in `diagnostic.json`.

The four shared PMREM targets have front strength 8, sigma 0 and heights +0.15, −0.45, −0.90, −1.35. Pane X/Z, size, target orientation policy, the other four HDR panels, background, direct lights, tone mapping, camera and all physical materials are identical. Eye environment intensity is 1 and the original corneal clearcoat mask remains active.

Each comparison strip is ordered from baseline +0.15 to −0.45, −0.90, −1.35. The `eye-detail` strips enlarge the same pixel band without smoothing, so small reflections can be compared directly.

The proposed lower pane does not produce a convincing new corneal catchlight in these actual materials. The changes are subtle on the full phone frame; lower heights generally darken the eye band slightly. Bright neutral eye-band pixel counts fall instead of increasing. For example, frontal player01 has 22 pixels above RGB 220 at baseline and 17 at −1.35; at default 0.16 yaw the counts are 10 and 5. Those counts include sclera and are descriptive, not an eye realism score. `pixel-comparison.json` records every case.

The test therefore does not justify replacing the baseline +0.15 height. The earlier isolation still establishes correct Eye geometry and mask visibility, but identifying the occluded broad-panel glint did not prove that lowering this particular small pane would solve the final material appearance. This unsuccessful hypothesis is retained as evidence.

No model, source motion, manifest, vendor or offline files were changed. There were zero browser errors and zero external requests. The four generated targets and PMREM scratch resources were disposed after capture; this is not a physical-device performance measurement.
