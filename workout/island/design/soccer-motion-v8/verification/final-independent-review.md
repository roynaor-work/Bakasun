# Independent final package review

Reviewed 2026-11-06 after round 07 capture. This review is read-only except for this new report. No blocking discrepancy was found. Final plain Node acceptance and the detached-copy run passed and are recorded separately in REPORT.md and standalone.md; they were not duplicated for this independent review.

The reviewed working-tree status contains only the new `workout/island/design/soccer-motion-v8/` directory. The active branch is `codex/soccer-motion-v8-20261105`. Existing application code, release files, version query tags, repository instructions and pre-existing tests were not changed.

| Requirement | Independent evidence |
| --- | --- |
| Package budgets | Review snapshot was approximately 28.24 MB before this report and final summary documents. Runtime is 3,191,160 bytes. Every individual file is under 5 MB and both GLBs are under 1.5 MB; the largest file is 948,984 bytes. No raw JSON, video or archive file was found. The sole HTML file is 5,747 bytes. |
| Native assets | `player.glb` is 821,680 bytes and contains 14 native clips; `keeper.glb` is 948,984 bytes and contains 11. All mesh primitives use `KHR_draco_mesh_compression`; buffers and images are embedded. |
| Canonical rig | Compared fresh against the authoritative existing `design/motion2/soccer.json`: exact equality of all 18 ordered names, parent links and rest translations. Native GLB joints use the same contract. Units and documented axes agree: metres, +Y up, +Z forward, +X anatomical left, local xyzw quaternions. |
| Coverage and graph | Delivered catalog has 25 clips, 80 legal edges and 43 contact/release cues. It also includes 82 plant cues, 9 takeoffs and 10 landings. All nine keeper zones are distinct. |
| Real geometry checks | Prior independent official 07 noncapture run passed 31/31 checks. Native cue points reach actual effector triangles; whole-body path sampling covers 6,820 poses and reports maximum overlap 1.763 mm. The independent 80-edge audit covers 240 departure cases and 26,191,614 skinned vertices, with no floor, handoff-continuity, non-finite or shared-anchor failure. These statements describe measured samples, not a continuous collision proof. |
| Retained evidence | Only 06 and 07 remain as numeric iteration directories. Each contains 100 four-by-two WebP sheets for 25 clips × two viewport sizes × two camera distances, 800 captured frames and cue/measurement provenance. Rounds 01–05 have one text archive line each. |
| Local runtime closure | Controller dependencies, real GLTFLoader, static Draco worker, wrapper, WASM, textures and both GLBs are delivered locally. `runtime/` does not import authoring or verification files. Vendor license notices remain local. |
| Standalone Node assumptions | `verify.test.mjs` and its imported helpers use Node built-ins and the delivered runtime only. They do not read the original motion2 data, source character GLBs, npm packages or a network service. The hard-coded standalone canonical contract was independently compared with the authoritative source during this review. Node 24 syntax detection supports the vendored ES-module `.js` files without a package manifest. Temporary transition reports use the OS temporary directory. |
| Documentation | INTEGRATION includes every clip ID, role-specific loading and playback, update/disposal examples, marker semantics, graph-respecting requests, axes, resource sharing and limitations. Its standalone test commands point to the actual acceptance entry point. The checklist frame-count discrepancy was corrected to 768 for rounds 01–03 and 800 for rounds 04–07. |

Largest shipped files at the reviewed snapshot:

| File | Bytes |
| --- | ---: |
| `runtime/keeper.glb` | 948,984 |
| `runtime/player.glb` | 821,680 |
| `runtime/vendor/three.module.js` | 670,681 |
| `runtime/catalog.mjs` | 285,494 |
| `runtime/vendor/draco/draco_decoder.wasm` | 192,420 |

Remaining limits are explicit and do not require a runtime change:

- In this environment, Node 24's default process-isolated reporter emits one file-level result, even for a minimal unrelated two-test file importing only `node:test` and `node:assert/strict`. An intentional failing assertion in that control correctly produces exit 1; the passing control produces exit 0. `--test-isolation=none` exposes the individual tests. This is not specific to Draco or this package, and no premature `process.exit` was found. The task owner records both the required plain command and the expanded standalone result.
- The 30 fps target has cloud Chromium/software-rendering evidence, not a physical midrange-phone GPU measurement. The final benchmark/soak records should retain that distinction.
- Floor/support solving assumes a flat local Y=0 field, an upright local Y axis, yaw and uniform scale. Teleport/respawn should reset the controller to release old anchors. Native poses and sampled handoffs are checked; analytic C1 continuity is not promised.
- Native ball-path checks use the authored reference trajectory. The host game owns physical ball simulation, collision response, possession, scoring and placement. A mixed skeletal transition does not itself implement a physical ball handover or prove ball/body clearance during every possible live game transition.
- Triangle proximity is unsigned and finitely sampled. It does not prove closed-volume containment, cloth self-collision freedom or clearance between every sample instant.
- Node replaces raster decoding with a neutral pixel while loading actual Draco geometry, weights and animation tracks. Real texture decoding, CSP, worker failures and visual visibility are covered by separate browser evidence.
- Optional browser QA tools require Playwright/Chromium. Rebuilding authoring sources requires the original repository's canonical motion data and source character GLBs. These are not dependencies of the delivered runtime or standalone Node acceptance.
- `preview.html` has an obsolete pre-initialization fallback href for its eight-frame link (`iterations/06/frames/pass_short.webp`). Successful viewer initialization immediately replaces it with the valid round 07 per-clip path. This does not affect the ready viewer, runtime loading or captured evidence; the frozen preview was not edited for this minor fallback issue.
- The final review's 43-cue shorthand means contact/release cues; the complete public event list also contains plant, takeoff and land markers. Visual scores remain informed self-assessment, rather than values generated by a passing numerical test.

No existing file, runtime asset, source file or preview byte was edited for this review. Final exact package bytes and the final plain-command result belong in the task owner's delivery report after all documentation has been written.
