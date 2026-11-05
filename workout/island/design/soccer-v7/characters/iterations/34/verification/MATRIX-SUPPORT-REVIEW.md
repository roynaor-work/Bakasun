# Complete matrix support findings

The immutable native32/camera34 package (runtime `576c7ddc`, data `d9f17fab`, observer `32d05ea2`) completed all 17 jobs: eight identities at both LODs through 66 sequences at 30 Hz, plus P01 near through 66 sequences at 120 Hz. Total: 84,435 samples; 14m 42.056s wall time with two numeric workers and some independent render overlap. This is not a phone or GPU performance measurement.

The failed snapshot remains at `verification/final32/` while motion diagnosis is active. Aggregate completeness and all provenance checks passed. Aggregate pass is false: ten reports passed and seven failed.

| Finding | Scope | Actual result | Required limit |
|---|---|---:|---:|
| Settled authored slide-palm contact | P02 near/far | Up to 4.14044 mm | 3 mm |
| Settled authored slide-palm contact | Goalkeeper near/far | Up to 3.27338 mm | 3 mm |
| Captured shoulder/body support before first flat foot | P03 near/far, right dive recovery | 8.54633 / 8.37559 mm | 8 mm |
| Observer activation interval incorrectly shrank at zero elapsed intent supersession | P01 near, 120 Hz, fall→stand | 8.33 ms legitimate first-step overrun was rejected | Immutable initial integration interval |

The complete snapshot retained all other gates: deformed-mesh minimum +0.81469 mm, maximum visible joint angular speed 27.52938 rad/s, maximum root-relative bone speed 8.43359 m/s and plant-anchor error ≤0.00032 mm. These do not erase the support failures.

The independent P03 geometry probe found no excluded mixed-weight contact vertex. The actual lowest held Cloth point was a Chest/RightArm blend at 8.375 mm, so the support failure is real rather than a classification proxy error. The motion author is investigating physical corrections; no support threshold was relaxed.

The observer activation allowance alone was corrected to retain the first-observed interval per actual request. Final observer SHA `708a4eca7ee099b5f576aaa56f6148c305b35a240b7b203ce61e90c5f8910d19` has 39 passing controlled fixtures. The exact actual-package dense fall→stand case passes all gates under that observer; its report is `fall-stand-120hz-activation-708a4eca.json`. The subset is explicitly incomplete for the full 66-sequence/17-job coverage. A new complete matrix remains required after the physical support correction.
