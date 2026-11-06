# Browser capture 07

receiver-height-pass-endpoints-and-final-motion-review · 2026-11-06T09:56:49.465Z

Actual delivered Draco GLBs were decoded locally and played with THREE.AnimationMixer. The Ball node is part of each delivered clip. Every sheet contains eight real browser WebGL captures. Chromium used ANGLE SwiftShader; this is visual and framing evidence, not a physical-phone GPU benchmark.

| Check | Result |
|---|---|
| Clips | 15 |
| Frozen GLB / gzip SHA parity | 15/15 |
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

Source paths, SHA-256, exact frame times, projected body/ball positions and all assertions are in [capture.json.gz](capture.json.gz).

All sampled near-body and far-ball framing checks passed. No horizontal overflow.

## Final viewer self critique after rendering

| Visual check (1–10) | Score | Observation |
|---|---:|---|
| Phone layout and controls | 9 | Selection, play/pause, restart, speed, frame step, near/far, three angles, state labels and all eight frames remain visible without horizontal overflow. |
| Full body, hands and ball | 9 | Every sampled near-body and far-ball bound passes. Actual textured GLBs and their Ball node are rendered directly. |
| Ground contact and garment | 9 | Floor matches the authored ground and the repaired garment silhouette stays coherent. |
| Pass endpoint naturalness | 9 | Four direct passes now end at 1.150m; the bounce pass ends at 1.059m. The missing receiver waist/chest reference from round 06 is corrected. |
| Continuous playback | 9 | All 15 observed-RAF checks pass: loops wrap and non-loops progress monotonically to a held final pose. |
| Decoder and source consistency | 9 | Zero failed requests, page errors or external requests. All 15 frozen GLB/gzip SHA pairs match. |

All four full phone/distance previews were visually inspected after capture, together with far chest and bounce-pass strips. Round 07 changes the concrete pass endpoint issue found in round 06; the preview page and runtime remain frozen for the independent sustained run. Software-renderer results do not establish physical-phone FPS.

## Integration finding discovered after round 07

**Actual Island CSP integration: 6/10 — FAIL.** Round 07 did not enforce the game's Content-Security-Policy. Independent testing with the exact Island policy subsequently blocked its default blob worker and left clip loading waiting. The successful unrestricted round-07 renders and playback checks do not establish CSP compatibility. Round 08 replaces the default decoder with a same-origin static worker, adds the unchanged Island policy to this new preview page, and records actual worker URLs and policy violations. The existing game and its policy remain unchanged.
