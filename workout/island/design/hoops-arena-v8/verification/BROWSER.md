# בדיקות דפדפן

Chromium + SwiftShader; זהו אימות תוכנה, לא מדידת GPU של טלפון פיזי.

| בדיקה | תוצאה | פירוט |
|---|---|---|
| 390×844 DPR1 — controls/replay/LOD | עבר | 0L=13138, 0R=27004, 1L=11442, 1R=23300, 2L=6166, 2R=12676 |
| 390×844 DPR1 — texture bounds | עבר | All 8 disk/canvas textures ≤1024 |
| 390×844 DPR1 — scoreboard state | עבר | 3-digit score, foul count, urgent shot clock, text escaping |
| 390×844 DPR1 — adaptive LOD | עבר | drops after slow frames, recovers, 3m hysteresis |
| 390×844 DPR1 — parented camera | עבר | LOD uses camera world position |
| 390×844 DPR1 — local assets | עבר | zero page errors and zero external requests |
| 390×844 DPR1 — disposal | עבר | 0 GPU geometries, 0 GPU textures |
| 844×390 DPR1 — controls/replay/LOD | עבר | 0L=13598, 0R=27228, 1L=11634, 1R=23300, 2L=6286, 2R=12676 |
| 844×390 DPR1 — texture bounds | עבר | All 8 disk/canvas textures ≤1024 |
| 844×390 DPR1 — scoreboard state | עבר | 3-digit score, foul count, urgent shot clock, text escaping |
| 844×390 DPR1 — adaptive LOD | עבר | drops after slow frames, recovers, 3m hysteresis |
| 844×390 DPR1 — parented camera | עבר | LOD uses camera world position |
| 844×390 DPR1 — local assets | עבר | zero page errors and zero external requests |
| 844×390 DPR1 — disposal | עבר | 0 GPU geometries, 0 GPU textures |
| 390×844 DPR2 — controls/replay/LOD | עבר | 0L=13138, 0R=27004, 1L=11442, 1R=23300, 2L=6166, 2R=12676 |
| 390×844 DPR2 — texture bounds | עבר | All 8 disk/canvas textures ≤1024 |
| 390×844 DPR2 — scoreboard state | עבר | 3-digit score, foul count, urgent shot clock, text escaping |
| 390×844 DPR2 — adaptive LOD | עבר | drops after slow frames, recovers, 3m hysteresis |
| 390×844 DPR2 — parented camera | עבר | LOD uses camera world position |
| 390×844 DPR2 — local assets | עבר | zero page errors and zero external requests |
| 390×844 DPR2 — disposal | עבר | 0 GPU geometries, 0 GPU textures |
| GLB load failure | עבר | Visible Hebrew error and retry; completed assets disposed |
| WebGL context loss | עבר | Recoverable reload returns to a ready scene |
| Draco worker failure | עבר | Rejects loading and offers retry |
| Draco wasm failure | עבר | Rejects loading and offers retry |
| Production island CSP | עבר | script-src self + worker-src self; static local worker; zero policy violations |
| 5 load/dispose cycles, same renderer | עבר | All 3 LOD allocated each cycle; GPU resources return to 0 |
