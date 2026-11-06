# Browser verification · 2026-11-06T09:56:32.946Z

Chromium 151.0.7922.173. Real OfflineAudioContext, 44100 Hz output; runtime buffers at 24 kHz. All events requested at their maximum duration, tone 0.75, intensity 1. No external requests.

UI: 36 buttons, gesture unlock, play/stop, category filter, no overflow at 320×640, 390×844, 844×390; buttons ≥44 px. Page errors: 0.

Eight-voice overlap: peak 0.724009, ordinary ninth rejected; official accepted by replacing a lower-priority voice, count stays 8; active after rendering 0, late tail 0.

Prepared playback at Chromium CPU throttle 4×: 17 buffers prepared; 80 calls with varied intensity; median 0.90 ms, worst 6.00 ms; cache 725728/2097152 bytes. This is a CPU proxy, not a physical-phone measurement. UI cancellation during prepare/unlock: PASS.

Real AudioContext interruption: sources after suspend 0, after resume 0; caller-owned context remains running after player disposal.

Listening page: all 36 events completed a real-time audition; zero volume does not report successful playback.

| Sound | Last audible (s) | Cap (s) | Peak through graph | Late tail | Cold/warm median (ms) | Worst (ms) |
|---|---:|---:|---:|---:|---:|---:|
| whistle | 0.24501 | 0.28 | 0.25560 | 0.0e+0 | 0.90 | 2.10 |
| basketballBounce | 0.32630 | 0.42 | 0.41653 | 0.0e+0 | 1.20 | 1.90 |
| basketballCatch | 0.23712 | 0.24 | 0.28490 | 0.0e+0 | 0.90 | 1.00 |
| basketballPass | 0.27766 | 0.28 | 0.25898 | 0.0e+0 | 1.20 | 1.30 |
| netSwish | 0.57773 | 0.58 | 0.25991 | 0.0e+0 | 1.10 | 3.20 |
| rimHit | 0.78422 | 0.80 | 0.36523 | 0.0e+0 | 3.40 | 4.10 |
| backboardHit | 0.34714 | 0.38 | 0.37600 | 0.0e+0 | 0.80 | 0.90 |
| shoeSqueak | 0.28791 | 0.29 | 0.20769 | 0.0e+0 | 1.30 | 1.50 |
| buzzer | 0.64800 | 0.65 | 0.24113 | 0.0e+0 | 1.90 | 2.40 |
| soccerKick | 0.28274 | 0.34 | 0.42307 | 0.0e+0 | 0.70 | 0.80 |
| soccerPass | 0.21404 | 0.22 | 0.28413 | 0.0e+0 | 0.60 | 0.90 |
| soccerTrap | 0.21290 | 0.22 | 0.24779 | 0.0e+0 | 0.80 | 0.90 |
| goalpostHit | 0.99655 | 1.00 | 0.38129 | 0.0e+0 | 2.50 | 2.70 |
| soccerNet | 0.66773 | 0.67 | 0.25730 | 0.0e+0 | 1.80 | 2.10 |
| courtStep | 0.14005 | 0.23 | 0.24133 | 0.0e+0 | 0.50 | 0.70 |
| runningSteps | 0.70138 | 0.85 | 0.25950 | 0.0e+0 | 1.30 | 2.20 |
| grassStep | 0.21347 | 0.32 | 0.23336 | 0.0e+0 | 0.50 | 0.60 |
| grassSlide | 0.73789 | 0.74 | 0.25971 | 0.0e+0 | 1.50 | 1.60 |
| grassRustle | 0.51785 | 0.52 | 0.15708 | 0.0e+0 | 0.50 | 0.60 |
| crowdBed | 3.19776 | 3.20 | 0.10498 | 0.0e+0 | 8.40 | 11.20 |
| crowdCheer | 2.69787 | 2.70 | 0.23483 | 0.0e+0 | 9.80 | 10.40 |
| crowdDisappoint | 2.19769 | 2.20 | 0.18796 | 0.0e+0 | 8.00 | 9.40 |
| applause | 1.84730 | 1.90 | 0.21497 | 0.0e+0 | 4.30 | 4.80 |
| tennisServe | 0.24501 | 0.39 | 0.36925 | 0.0e+0 | 0.90 | 1.00 |
| tennisHit | 0.22844 | 0.29 | 0.33846 | 0.0e+0 | 0.40 | 0.60 |
| tennisBounce | 0.16016 | 0.23 | 0.27853 | 0.0e+0 | 0.30 | 0.50 |
| tennisNet | 0.38798 | 0.39 | 0.22775 | 0.0e+0 | 0.80 | 1.10 |
| skiGlide | 1.09771 | 1.10 | 0.16062 | 0.0e+0 | 1.50 | 1.90 |
| skiCarve | 0.81787 | 0.82 | 0.25098 | 0.0e+0 | 1.20 | 1.40 |
| skiJump | 0.44800 | 0.45 | 0.21753 | 0.0e+0 | 0.90 | 1.00 |
| skiLand | 0.58785 | 0.59 | 0.37184 | 0.0e+0 | 1.20 | 1.40 |
| skiGate | 0.34941 | 0.44 | 0.28649 | 0.0e+0 | 0.70 | 0.70 |
| windGust | 1.79778 | 1.80 | 0.12533 | 0.0e+0 | 2.60 | 4.30 |
| engineBurst | 1.24782 | 1.25 | 0.22159 | 0.0e+0 | 2.30 | 3.20 |
| tireSkid | 0.67748 | 0.68 | 0.24093 | 0.0e+0 | 1.70 | 2.30 |
| landingThud | 0.40957 | 0.43 | 0.34200 | 0.0e+0 | 1.20 | 1.50 |
