# Browser verification · 2026-11-06T09:27:04.799Z

Chromium 151.0.7922.173. Real OfflineAudioContext, 48 kHz output; runtime buffers at 24 kHz. All events requested at their maximum duration, tone 0.75, intensity 1. No external requests.

UI: 36 buttons, gesture unlock, play/stop, category filter, no overflow at 320×640, 390×844, 844×390; buttons ≥44 px. Page errors: 0.

Eight-voice overlap: peak 0.724009, ninth rejected, active after rendering 0, late tail 0.

Prepared playback at Chromium CPU throttle 4×: 17 buffers prepared; 80 calls with varied intensity; median 0.70 ms, worst 2.20 ms; cache 725728/2097152 bytes. This is a CPU proxy, not a physical-phone measurement. UI cancellation during prepare/unlock: PASS.

Real AudioContext interruption: sources after suspend 0, after resume 0; caller-owned context remains running after player disposal.

| Sound | Last audible (s) | Cap (s) | Peak through graph | Late tail | Cold/warm median (ms) | Worst (ms) |
|---|---:|---:|---:|---:|---:|---:|
| whistle | 0.24500 | 0.28 | 0.26099 | 0.0e+0 | 1.00 | 2.10 |
| basketballBounce | 0.32629 | 0.42 | 0.41791 | 0.0e+0 | 1.30 | 1.50 |
| basketballCatch | 0.23713 | 0.24 | 0.28666 | 0.0e+0 | 1.00 | 1.10 |
| basketballPass | 0.27767 | 0.28 | 0.26099 | 0.0e+0 | 1.30 | 2.30 |
| netSwish | 0.57773 | 0.58 | 0.28666 | 0.0e+0 | 1.10 | 1.50 |
| rimHit | 0.78423 | 0.80 | 0.36638 | 0.0e+0 | 3.30 | 3.40 |
| backboardHit | 0.34715 | 0.38 | 0.37811 | 0.0e+0 | 0.90 | 0.90 |
| shoeSqueak | 0.28792 | 0.29 | 0.21497 | 0.0e+0 | 1.20 | 1.60 |
| buzzer | 0.64800 | 0.65 | 0.24143 | 0.0e+0 | 1.60 | 2.40 |
| soccerKick | 0.28275 | 0.34 | 0.42343 | 0.0e+0 | 0.60 | 0.80 |
| soccerPass | 0.21402 | 0.22 | 0.29299 | 0.0e+0 | 0.40 | 0.50 |
| soccerTrap | 0.21292 | 0.22 | 0.24798 | 0.0e+0 | 0.90 | 1.00 |
| goalpostHit | 0.99656 | 1.00 | 0.38391 | 0.0e+0 | 2.80 | 2.90 |
| soccerNet | 0.66773 | 0.67 | 0.26099 | 0.0e+0 | 1.80 | 2.00 |
| courtStep | 0.14004 | 0.23 | 0.24143 | 0.0e+0 | 0.50 | 0.80 |
| runningSteps | 0.70140 | 0.85 | 0.26099 | 0.0e+0 | 1.70 | 2.00 |
| grassStep | 0.21348 | 0.32 | 0.23486 | 0.0e+0 | 0.60 | 0.90 |
| grassSlide | 0.73790 | 0.74 | 0.26099 | 0.0e+0 | 1.50 | 1.80 |
| grassRustle | 0.51785 | 0.52 | 0.16772 | 0.0e+0 | 0.50 | 0.70 |
| crowdBed | 3.19796 | 3.20 | 0.10558 | 0.0e+0 | 7.10 | 13.20 |
| crowdCheer | 2.69796 | 2.70 | 0.23486 | 0.0e+0 | 10.10 | 10.50 |
| crowdDisappoint | 2.19800 | 2.20 | 0.18811 | 0.0e+0 | 7.80 | 8.10 |
| applause | 1.84729 | 1.90 | 0.21497 | 0.0e+0 | 4.10 | 4.60 |
| tennisServe | 0.24500 | 0.39 | 0.37226 | 0.0e+0 | 0.80 | 1.00 |
| tennisHit | 0.22844 | 0.29 | 0.34852 | 0.0e+0 | 0.40 | 0.50 |
| tennisBounce | 0.16017 | 0.23 | 0.28029 | 0.0e+0 | 0.30 | 0.40 |
| tennisNet | 0.38798 | 0.39 | 0.22825 | 0.0e+0 | 0.80 | 0.90 |
| skiGlide | 1.09796 | 1.10 | 0.16089 | 0.0e+0 | 1.60 | 1.60 |
| skiCarve | 0.81798 | 0.82 | 0.25450 | 0.0e+0 | 1.10 | 1.20 |
| skiJump | 0.44800 | 0.45 | 0.22162 | 0.0e+0 | 0.70 | 0.80 |
| skiLand | 0.58783 | 0.59 | 0.37226 | 0.0e+0 | 1.30 | 1.30 |
| skiGate | 0.34942 | 0.44 | 0.28666 | 0.0e+0 | 0.60 | 0.70 |
| windGust | 1.79796 | 1.80 | 0.12644 | 0.0e+0 | 2.10 | 2.20 |
| engineBurst | 1.24783 | 1.25 | 0.22162 | 0.0e+0 | 2.00 | 2.30 |
| tireSkid | 0.67748 | 0.68 | 0.24143 | 0.0e+0 | 1.30 | 1.70 |
| landingThud | 0.40956 | 0.43 | 0.34249 | 0.0e+0 | 0.80 | 1.10 |
