# Browser verification · 2026-11-06T10:00:59.976Z

Chromium 151.0.7922.173. Real OfflineAudioContext, 48000 Hz output; runtime buffers at 24 kHz. All events requested at their maximum duration, tone 0.75, intensity 1. No external requests.

UI: 36 buttons, gesture unlock, play/stop, category filter, no overflow at 320×640, 390×844, 844×390; buttons ≥44 px. Page errors: 0.

Eight-voice overlap: peak 0.724009, ordinary ninth rejected; official accepted by replacing a lower-priority voice, count stays 8; active after rendering 0, late tail 0.

Prepared playback at Chromium CPU throttle 4×: 17 buffers prepared; 80 calls with varied intensity; median 0.80 ms, worst 2.00 ms; cache 725728/2097152 bytes. This is a CPU proxy, not a physical-phone measurement. UI cancellation during prepare/unlock: PASS.

Real AudioContext interruption: sources after suspend 0, after resume 0; caller-owned context remains running after player disposal.

Listening page: all 36 events completed a real-time audition; zero volume does not report successful playback.

CSP: exact policy read from the supplied shipped HTML, enforced as an HTTP header; violations: 0.

| Sound | Last audible (s) | Cap (s) | Peak through graph | Late tail | Cold/warm median (ms) | Worst (ms) |
|---|---:|---:|---:|---:|---:|---:|
| whistle | 0.24500 | 0.28 | 0.26099 | 0.0e+0 | 0.80 | 2.80 |
| basketballBounce | 0.32629 | 0.42 | 0.41791 | 0.0e+0 | 1.20 | 1.30 |
| basketballCatch | 0.23713 | 0.24 | 0.28666 | 0.0e+0 | 0.90 | 1.00 |
| basketballPass | 0.27767 | 0.28 | 0.26099 | 0.0e+0 | 1.10 | 1.70 |
| netSwish | 0.57773 | 0.58 | 0.28666 | 0.0e+0 | 1.00 | 1.30 |
| rimHit | 0.78423 | 0.80 | 0.36638 | 0.0e+0 | 3.20 | 3.80 |
| backboardHit | 0.34715 | 0.38 | 0.37811 | 0.0e+0 | 0.90 | 1.20 |
| shoeSqueak | 0.28792 | 0.29 | 0.21497 | 0.0e+0 | 0.60 | 0.80 |
| buzzer | 0.64800 | 0.65 | 0.24143 | 0.0e+0 | 1.80 | 2.20 |
| soccerKick | 0.28275 | 0.34 | 0.42343 | 0.0e+0 | 0.70 | 0.90 |
| soccerPass | 0.21402 | 0.22 | 0.29299 | 0.0e+0 | 0.40 | 0.60 |
| soccerTrap | 0.21292 | 0.22 | 0.24798 | 0.0e+0 | 1.00 | 1.30 |
| goalpostHit | 0.99656 | 1.00 | 0.38391 | 0.0e+0 | 2.70 | 4.00 |
| soccerNet | 0.66773 | 0.67 | 0.26099 | 0.0e+0 | 1.90 | 4.00 |
| courtStep | 0.14004 | 0.23 | 0.24143 | 0.0e+0 | 0.50 | 0.60 |
| runningSteps | 0.70140 | 0.85 | 0.26099 | 0.0e+0 | 1.30 | 1.80 |
| grassStep | 0.21348 | 0.32 | 0.23486 | 0.0e+0 | 0.50 | 0.80 |
| grassSlide | 0.73790 | 0.74 | 0.26099 | 0.0e+0 | 1.70 | 2.00 |
| grassRustle | 0.51785 | 0.52 | 0.16772 | 0.0e+0 | 0.50 | 0.60 |
| crowdBed | 3.19775 | 3.20 | 0.10558 | 0.0e+0 | 13.10 | 16.80 |
| crowdCheer | 2.69787 | 2.70 | 0.23486 | 0.0e+0 | 11.00 | 15.20 |
| crowdDisappoint | 2.19769 | 2.20 | 0.18811 | 0.0e+0 | 7.60 | 7.90 |
| applause | 1.84729 | 1.90 | 0.21497 | 0.0e+0 | 4.40 | 6.10 |
| tennisServe | 0.24500 | 0.39 | 0.37226 | 0.0e+0 | 0.80 | 4.80 |
| tennisHit | 0.22844 | 0.29 | 0.34852 | 0.0e+0 | 0.40 | 0.50 |
| tennisBounce | 0.16017 | 0.23 | 0.28029 | 0.0e+0 | 0.40 | 0.40 |
| tennisNet | 0.38798 | 0.39 | 0.22825 | 0.0e+0 | 0.70 | 1.10 |
| skiGlide | 1.09771 | 1.10 | 0.16089 | 0.0e+0 | 1.60 | 1.90 |
| skiCarve | 0.81785 | 0.82 | 0.25450 | 0.0e+0 | 1.10 | 1.20 |
| skiJump | 0.44800 | 0.45 | 0.22162 | 0.0e+0 | 0.70 | 0.90 |
| skiLand | 0.58783 | 0.59 | 0.37226 | 0.0e+0 | 1.20 | 1.40 |
| skiGate | 0.34942 | 0.44 | 0.28666 | 0.0e+0 | 0.70 | 1.20 |
| windGust | 1.79777 | 1.80 | 0.12644 | 0.0e+0 | 2.10 | 2.30 |
| engineBurst | 1.24783 | 1.25 | 0.22162 | 0.0e+0 | 2.10 | 2.20 |
| tireSkid | 0.67748 | 0.68 | 0.24143 | 0.0e+0 | 1.20 | 1.30 |
| landingThud | 0.40956 | 0.43 | 0.34249 | 0.0e+0 | 0.70 | 0.80 |
