# Browser stress probe

Measured UTC: 2026-11-06T10:59:51.939Z. Chromium headless, ANGLE SwiftShader, 390×844 CSS pixels, DPR=1.5.
One actor demonstrates library cost; twelve actors test shared geometry/materials with ten field players and two keepers. All actors use independent skeletons and native animation mixers. Includes the preview floor, lights and ball. No real-time shadow-map pass.
Cloud CPU throttling does not emulate phone GPU, thermals, browser driver or memory bandwidth. These numbers are bounded engineering evidence for the 30fps target; physical midrange-phone verification remains separate.

| Actors | CPU multiplier | Animation + render CPU p50/p95 (ms) | rAF p50/p95 (ms) | Triangles | Draw calls | Geometry / texture objects |
| ---: | ---: | --- | --- | ---: | ---: | --- |
| 1 | 1 | 0.80/2.30 | 33.30/50.10 | 6065 | 12 | 21/21 |
| 1 | 4 | 3.70/16.00 | 33.30/50.00 | 6065 | 12 | 21/21 |
| 12 | 1 | 2.00/7.80 | 100.00/133.30 | 70088 | 67 | 21/76 |
| 12 | 4 | 11.00/25.30 | 116.70/150.00 | 70088 | 67 | 21/76 |

Runtime inputs unchanged: true. Page errors: 0.

## Runtime inputs

- runtime/player.glb: 2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef (821680 bytes)
- runtime/keeper.glb: 4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42 (948984 bytes)
- runtime/catalog.mjs: fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b (285494 bytes)
- runtime/controller.mjs: da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0 (15082 bytes)
- runtime/contact-solver.mjs: ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8 (12007 bytes)
- runtime/LocalDRACOLoader.mjs: b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a (2778 bytes)
- runtime/draco-worker.js: 5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194 (6495 bytes)
