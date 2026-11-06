# Native ball path / whole-body skin proximity audit

Measured UTC: 2026-11-06T10:29:50.463Z. Input SHA-256: `d7b97eaed73bfe8d2fae81f433c2af0b04b3fdd5e1051e365975969a9c8b51d6`. 25 native clips, 4423 poses, 280,924 exact closest-triangle tests; elapsed 21.44 s.
All clips sampled at 60 Hz, all ball trajectory keys and event times, plus 5.0 ms samples within ±100 ms of every contact/release. Geometry comes from actual local Draco decoding and shipped native AnimationClips; no source evaluator, viewer IK, proxy shape, region filter or texture substitution affects positions.

Overlap = ball radius − nearest whole-body skinned-triangle distance. Positive overlap means an actual surface point lies inside the sphere; a negative value is surface clearance. All body meshes participate, including the other hand, boots, clothing and head. Axis-aligned triangle-box distance only prunes triangles that cannot improve the nearest result. This unsigned finite-sample test does not prove closed-volume containment, self-collision freedom or collision freedom between sample instants. Reference travel translates body and ball together, so relative distance is unchanged.

Clips with a sampled whole-body overlap above 5 mm: 12/25. The 5 mm tolerance is the delivered geometry acceptance limit; native contact and release cues are checked separately against their intended effector surfaces.

| Clip | Poses | Maximum sphere overlap (mm) | Time (s) | Nearest mesh / triangle | Ball center [m] | Nearest surface point [m] | Samples above 5 mm |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| idle | 109 | -208.726 | 0.433333 | player-01-lod1_1/393 | [0.00000, 0.11000, 0.54000] | [0.10926, 0.05804, 0.24513] | 0 |
| pass_short | 87 | 0.000 | 0.288000 | player-01-lod1_1/95 | [-0.13924, 0.11000, 0.48799] | [-0.20291, 0.10182, 0.39866] | 0 |
| pass_long | 106 | 0.000 | 0.468000 | player-01-lod1_1/91 | [-0.12000, 0.11000, 0.66530] | [-0.12173, 0.11291, 0.55535] | 0 |
| pass_loft | 111 | 0.000 | 0.481600 | player-01-lod1_1/89 | [-0.04767, 0.11000, 0.64811] | [-0.04679, 0.09503, 0.53914] | 0 |
| shot | 97 | -0.000 | 0.342000 | player-01-lod1_1/91 | [-0.12000, 0.11000, 0.68530] | [-0.12173, 0.11291, 0.57535] | 0 |
| receive_chest | 100 | 25.300 | 0.594800 | player-01-lod1/1198 | [0.00000, 1.16415, 0.21293] | [0.00000, 1.24701, 0.19535] | 28 |
| receive_foot | 107 | 7.328 | 0.466667 | player-01-lod1_1/128 | [-0.08154, 0.12276, 0.63410] | [-0.06869, 0.10427, 0.53393] | 5 |
| first_touch_moving | 114 | 5.543 | 0.600000 | player-01-lod1_1/91 | [-0.14000, 0.11377, 0.60960] | [-0.14201, 0.11379, 0.50517] | 2 |
| dribble | 138 | 11.727 | 0.766667 | player-01-lod1_1/393 | [0.09659, 0.11227, 0.59833] | [0.10926, 0.09336, 0.50273] | 13 |
| turn_with_ball | 107 | -0.000 | 0.451500 | player-01-lod1_1/116 | [-0.04755, 0.11500, 0.35118] | [-0.13846, 0.10679, 0.28979] | 0 |
| shield | 81 | -9.166 | 1.000000 | player-01-lod1_1/231 | [-0.32000, 0.11000, 0.12000] | [-0.24110, 0.17067, 0.05447] | 0 |
| cut | 117 | 108.377 | 0.566667 | player-01-lod1_1/131 | [-0.07303, 0.11326, 0.48373] | [-0.07337, 0.11167, 0.48374] | 49 |
| slide | 242 | 0.000 | 1.005000 | player-01-lod1_1/91 | [-0.06000, 0.11000, 1.32433] | [-0.06208, 0.09396, 1.21552] | 0 |
| block | 125 | -0.000 | 0.598000 | player-01-lod1_1/1495 | [0.32844, 1.11019, 0.25135] | [0.30493, 1.10162, 0.14423] | 0 |
| keeper_ready | 97 | -261.054 | 1.233333 | goalkeeper-lod1_1/393 | [0.00000, 0.11000, 0.54000] | [0.18927, 0.05801, 0.22511] | 0 |
| keeper_throw | 166 | 107.432 | 0.450000 | goalkeeper-lod1/1034 | [-0.14852, 1.25417, -0.08975] | [-0.14717, 1.25198, -0.08968] | 26 |
| keeper_dive_low_left | 271 | 1.065 | 1.283333 | goalkeeper-lod1/430 | [1.58000, 0.26962, 0.35000] | [1.47133, 0.27708, 0.34880] | 0 |
| keeper_dive_low_center | 270 | 3.383 | 1.300000 | goalkeeper-lod1/430 | [-0.00000, 0.26275, 0.74070] | [0.01478, 0.26793, 0.63524] | 0 |
| keeper_dive_low_right | 271 | 1.150 | 1.283333 | goalkeeper-lod1/723 | [-1.58000, 0.26962, 0.35000] | [-1.47165, 0.27851, 0.34450] | 0 |
| keeper_dive_middle_left | 280 | 27.010 | 1.266667 | goalkeeper-lod1/472 | [1.65315, 1.07407, 0.33129] | [1.57375, 1.05607, 0.31517] | 44 |
| keeper_dive_middle_center | 280 | 10.949 | 1.366667 | goalkeeper-lod1/430 | [0.00000, 0.88167, 1.23094] | [0.02411, 0.85368, 1.13903] | 25 |
| keeper_dive_middle_right | 280 | 29.271 | 1.266667 | goalkeeper-lod1/761 | [-1.65315, 1.07407, 0.33129] | [-1.57493, 1.05783, 0.31967] | 44 |
| keeper_dive_high_left | 289 | 78.069 | 1.291000 | goalkeeper-lod1/475 | [1.67118, 1.83832, 0.32361] | [1.64058, 1.83902, 0.33271] | 55 |
| keeper_dive_high_center | 289 | 51.726 | 1.514000 | goalkeeper-lod1/445 | [0.00355, 1.70183, 0.53420] | [0.00780, 1.69169, 0.47698] | 71 |
| keeper_dive_high_right | 289 | 79.087 | 1.300000 | goalkeeper-lod1/748 | [-1.66812, 1.82332, 0.32082] | [-1.63915, 1.82208, 0.33152] | 55 |

Runtime and audit inputs were hashed before and after sampling; any mutation aborts this report.

| File | SHA-256 |
| --- | --- |
| LocalDRACOLoader.mjs | `b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a` |
| catalog.mjs | `d2864c54984da04c8deb63c8eac5a08c49790a16ff06e1fd1ec5ebfb340196a2` |
| contact-solver.mjs | `ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8` |
| controller.mjs | `da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0` |
| draco-worker.js | `5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194` |
| keeper.glb | `15af452a5ef3ba7fb80258846dc48d992ad0620181b2aff24c0bf758a9841d6b` |
| player.glb | `a73b10a80b861a9d5169eff398bab5e79ce82f702546f301cfe41934756657af` |
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
