# Browser capture 08

exact-game-csp-and-static-decoder-worker · 2026-11-06T10:36:51.121Z

Actual delivered Draco GLBs were decoded locally and played with THREE.AnimationMixer. The Ball node is part of each delivered clip. Every sheet contains eight real browser WebGL captures. Chromium used ANGLE SwiftShader; this is visual and framing evidence, not a physical-phone GPU benchmark.

| Check | Result |
|---|---|
| Clips | 15 |
| Frozen GLB / gzip SHA parity | 15/15 |
| Exact Island CSP | Enforced |
| CSP violations | 0 |
| Same-origin static workers | 2 |
| Viewports | 390×844, 844×390 |
| Distances | near, far |
| Timeline frames checked | 480 |
| Actual playback checks | 15/15 |
| Contact sheets | 60 |
| Full page captures | 4 |
| External requests | 0 |
| Page errors | 0 |
| Failed requests | 0 |
| Capture findings | 0 |
| Image bytes | 774,964 |

Source paths, SHA-256, exact frame times, projected body/ball positions, the enforced CSP string, securitypolicyviolation events and actual worker URLs are in [capture.json.gz](capture.json.gz).

All sampled near-body and far-ball framing checks passed. No horizontal overflow.

## CSP integration self critique after rendering

| Visual/integration check (1–10) | Score | Observation |
|---|---:|---|
| Exact game-policy compatibility | 9 | The preview enforces the unchanged Island CSP. All 15 delivered clips load and play under that policy. |
| Decoder workers | 9 | Two actual dedicated workers use the same-origin static path `/runtime/vendor/draco/draco-worker.js`; no blob worker URL is used. |
| Policy and network errors | 9 | Zero securitypolicyviolation events, failed requests, page errors or external requests. |
| Real GLB playback and framing | 9 | All 15 RAF-based playback checks, all 15 input SHA pairs and all 480 sampled near-body/far-ball frames pass. |
| Visual continuity | 9 | The policy/worker repair changes no animation assets. Portrait-near and landscape-far previews were visually inspected; all 64 encoded image hashes match round 07 exactly. |

The 6/10 integration failure discovered after round 07 is resolved by a static worker and an enforced preview policy. No existing game file or policy was changed. The exact policy string, observed worker URLs and violation list are stored in capture.json.gz. Sustained-run validation must restart on these corrected runtime/page bytes; this capture does not claim physical-phone FPS.
