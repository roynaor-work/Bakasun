# Continuous browser endurance

Status: **PASS**

Profile: narrow screens, asymmetric safe areas before every gesture, DPR 3
Started: 2026-11-06T11:17:47.907Z
Last checkpoint: 2026-11-06T11:47:48.391Z
Elapsed: 1800.5 seconds; requested: 1800 seconds.

Chromium 151.0.7922.173; trusted CDP multi-touch, actual keyboard, DOM geometry assertions; no external requests.

| Scenario | Completed |
|---|---:|
| gestures | 3475 |
| cancel | 1158 |
| rotate | 1158 |
| dialogs | 1158 |
| keyboard | 1158 |
| geometry | 6949 |
| loads | 232 |

Completed cycles: 6949.

Initial runtime SHA-256: `0ade0681513b67618b95774f8b80fee8cd44d3ff78f2218609a44dc53591c06b`
Current runtime SHA-256: `0ade0681513b67618b95774f8b80fee8cd44d3ff78f2218609a44dc53591c06b`

Each cycle performs a fresh gesture/cancellation/orientation/dialog/keyboard scenario and verifies the current DOM bounds. The page reloads every 30 cycles to exercise lifecycle cleanup and load current runtime files. Changes during the soak are covered after the next reload; final acceptance checks run separately.
