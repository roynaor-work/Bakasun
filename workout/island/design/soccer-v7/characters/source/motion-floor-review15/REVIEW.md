# Motion floor review 15

The final source is `animations.json` SHA-256 `e60a29039e6888d6b548ca325b507f06dd5867b480c27df446451301b6020f65`. The viewer helper SHA-256 is `80fdd932df73e95ff4ed39623cb6f5445d7531850b41954312a0dc77bd75fc13`. The manifest/model hashes in `diagnostic.json` identify the exact round14 geometry reviewed.

This review served a freshly bundled viewer and the final authored motion through in-memory HTTP responses. It froze the embedded model scripts in memory as well. It did not replace any packaged vendor, offline, model or manifest files. The baked floor envelope was disabled, so the actual skinned vertices determined floor correction.

40 captures cover get-up, slide, and three goalkeeper dives in 390×844 and844×390. Each peak and settled pose has normal, skeleton-through-skin, and alpha-mask-disabled views. There were zero browser errors and zero external requests. Alpha-masked geometry controlled none of the10 reviewed floor extrema.

## Critique and correction

- The previous slide revision fixed the seated endpoint but still lowered the fingers through the floor during the blend. The old actual-viewer sweep needed103.78mm root lift at0.867s. That made the body hover while a fingertip touched the ground.
- The final hand path uses nine measured skin extrema and a phase-shaped interpolation margin. At that same0.867s sample, the required root lift is0.000mm. Across the complete final slide sweep the maximum is0.000mm on player01. The endpoint visibly rests on the side of the pelvis with a flat supporting hand behind it.
- The three dive endpoints retain the parry and settle the pelvis onto the body/cloth surface. The final round14 hem requires about6.2–6.5mm whole-body floor correction, with displayed skin minimum about2mm; a fingertip or invisible hair-card corner no longer suspends the body.
- Get-up still needs about60mm correction at its first, side-fallen pose because the cloth has thickness beyond the canonical hip. The flat-hand support phase and standing endpoint remain grounded; this review does not treat the entry correction as hand support.

## Limits

These are paused software-WebGL renders and dense authored-pose diagnostics, not physical-device framerate or pressure simulation. Open hands have no finger joints in the fixed18bone skeleton. Cloth has weighted deformation and normal detail, without simulated folds or body compression. Final native GLB hashes and the complete all16 displayed floor/transition audits are separate deliverables.
