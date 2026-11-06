# Native ball path / whole-body skin proximity audit

Measured UTC: 2026-11-06T10:42:56.368Z. Input SHA-256: `fc16b24ff5c08dc36615700adc630675fad63d4d17620057c638727642c89cdc`. 25 native clips, 6820 poses, 427,354 exact closest-triangle tests; elapsed 39.49 s.
All clips sampled at 60 Hz, all ball trajectory keys and event times, plus 5.0 ms samples within ±100 ms of every contact/release. Geometry comes from actual local Draco decoding and shipped native AnimationClips; no source evaluator, viewer IK, proxy shape, region filter or texture substitution affects positions.

Overlap = ball radius − nearest whole-body skinned-triangle distance. Positive overlap means an actual surface point lies inside the sphere; a negative value is surface clearance. All body meshes participate, including the other hand, boots, clothing and head. Axis-aligned triangle-box distance only prunes triangles that cannot improve the nearest result. This unsigned finite-sample test does not prove closed-volume containment, self-collision freedom or collision freedom between sample instants. Reference travel translates body and ball together, so relative distance is unchanged.

Clips with a sampled whole-body overlap above 5 mm: 0/25. The 5 mm tolerance is the delivered geometry acceptance limit; native contact and release cues are checked separately against their intended effector surfaces.

| Clip | Poses | Maximum sphere overlap (mm) | Time (s) | Nearest mesh / triangle | Ball center [m] | Nearest surface point [m] | Samples above 5 mm |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| idle | 109 | -208.726 | 0.433333 | player-01-lod1_1/393 | [0.00000, 0.11000, 0.54000] | [0.10926, 0.05804, 0.24513] | 0 |
| pass_short | 87 | 0.000 | 0.288000 | player-01-lod1_1/95 | [-0.13924, 0.11000, 0.48799] | [-0.20291, 0.10182, 0.39866] | 0 |
| pass_long | 106 | 0.000 | 0.468000 | player-01-lod1_1/91 | [-0.12000, 0.11000, 0.66530] | [-0.12173, 0.11291, 0.55535] | 0 |
| pass_loft | 111 | 0.000 | 0.481600 | player-01-lod1_1/89 | [-0.04767, 0.11000, 0.64811] | [-0.04679, 0.09503, 0.53914] | 0 |
| shot | 97 | -0.000 | 0.342000 | player-01-lod1_1/91 | [-0.12000, 0.11000, 0.68530] | [-0.12173, 0.11291, 0.57535] | 0 |
| receive_chest | 161 | 0.000 | 0.394800 | player-01-lod1_1/1492 | [0.00000, 1.30415, 0.19793] | [0.01718, 1.24903, 0.10430] | 0 |
| receive_foot | 156 | 0.997 | 0.466667 | player-01-lod1_1/128 | [-0.08155, 0.12454, 0.64040] | [-0.06796, 0.10476, 0.53407] | 0 |
| first_touch_moving | 115 | -0.000 | 0.417600 | player-01-lod1_1/91 | [-0.14000, 0.11500, 0.64530] | [-0.14173, 0.11791, 0.53535] | 0 |
| dribble | 139 | 0.000 | 0.739200 | player-01-lod1_1/394 | [0.12000, 0.11282, 0.60277] | [0.11973, 0.11438, 0.49279] | 0 |
| turn_with_ball | 107 | -0.000 | 0.451500 | player-01-lod1_1/116 | [-0.04755, 0.11500, 0.35118] | [-0.13846, 0.10679, 0.28979] | 0 |
| shield | 81 | -9.166 | 1.000000 | player-01-lod1_1/231 | [-0.32000, 0.11000, 0.12000] | [-0.24110, 0.17067, 0.05447] | 0 |
| cut | 117 | 0.000 | 0.408000 | player-01-lod1_1/95 | [-0.18476, 0.11500, 0.54586] | [-0.25808, 0.09682, 0.46589] | 0 |
| slide | 242 | 0.000 | 1.005000 | player-01-lod1_1/91 | [-0.06000, 0.11000, 1.32433] | [-0.06208, 0.09396, 1.21552] | 0 |
| block | 125 | -0.000 | 0.598000 | player-01-lod1_1/1495 | [0.32844, 1.11019, 0.25135] | [0.30493, 1.10162, 0.14423] | 0 |
| keeper_ready | 97 | -261.054 | 1.233333 | goalkeeper-lod1_1/393 | [0.00000, 0.11000, 0.54000] | [0.18927, 0.05801, 0.22511] | 0 |
| keeper_throw | 309 | 1.364 | 0.612000 | goalkeeper-lod1/723 | [-0.34453, 1.48030, -0.40542] | [-0.40211, 1.43723, -0.32398] | 0 |
| keeper_dive_low_left | 497 | 0.647 | 1.193000 | goalkeeper-lod1/430 | [1.58007, 0.28649, 0.35003] | [1.47113, 0.29594, 0.35032] | 0 |
| keeper_dive_low_center | 496 | 0.900 | 1.300000 | goalkeeper-lod1/430 | [-0.00001, 0.25868, 0.74296] | [0.01304, 0.26646, 0.63492] | 0 |
| keeper_dive_low_right | 497 | 0.707 | 1.252000 | goalkeeper-lod1/723 | [-1.58012, 0.27251, 0.35018] | [-1.47153, 0.28410, 0.34594] | 0 |
| keeper_dive_middle_left | 518 | 0.825 | 1.233333 | goalkeeper-lod1/430 | [1.67983, 1.14017, 0.34988] | [1.57113, 1.13005, 0.35038] | 0 |
| keeper_dive_middle_center | 518 | 0.984 | 1.366667 | goalkeeper-lod1/723 | [0.00002, 0.85339, 1.24695] | [-0.01587, 0.84597, 1.13935] | 0 |
| keeper_dive_middle_right | 518 | 0.872 | 1.233333 | goalkeeper-lod1/723 | [-1.67984, 1.14017, 0.34988] | [-1.57109, 1.13201, 0.34580] | 0 |
| keeper_dive_high_left | 539 | 1.763 | 1.300000 | goalkeeper-lod1/430 | [1.69158, 1.95524, 0.34503] | [1.59765, 1.90165, 0.34955] | 0 |
| keeper_dive_high_center | 539 | 1.439 | 1.433333 | goalkeeper-lod1/430 | [0.00093, 1.93275, 0.49252] | [0.03721, 1.85402, 0.42717] | 0 |
| keeper_dive_high_right | 539 | 1.713 | 1.300000 | goalkeeper-lod1/723 | [-1.69158, 1.95524, 0.34502] | [-1.59701, 1.90250, 0.34515] | 0 |

Runtime and audit inputs were hashed before and after sampling; any mutation aborts this report.

| File | SHA-256 |
| --- | --- |
| LocalDRACOLoader.mjs | `b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a` |
| catalog.mjs | `fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b` |
| contact-solver.mjs | `ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8` |
| controller.mjs | `da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0` |
| draco-worker.js | `5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194` |
| keeper.glb | `4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42` |
| player.glb | `2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef` |
| vendor/BufferGeometryUtils.js | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| vendor/DRACOLoader.js | `e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb` |
| vendor/GLTFLoader.js | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| vendor/LICENSE.three | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |
| vendor/SkeletonUtils.js | `0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d` |
| vendor/draco/LICENSE.draco | `d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4` |
| vendor/draco/draco_decoder.wasm | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| vendor/draco/draco_wasm_wrapper.js | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| vendor/three.module.js | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| ../verification/audit-ball-path.mjs | `d3aa7473aebbf4b776c351252b2754f04cda66a4c93501bf346317b2e27cfdc6` |
| ../verification/glb-reader.mjs | `d2c79262d3dc2579e887230c8fd69d7ca52289f4c29b19c672cb92cf978ba9a5` |
