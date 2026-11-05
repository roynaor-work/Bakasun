# P01 waist rebind: partial floor diagnostic

The candidate removes the large shorts wedge visible through the shirt in motor frame 91. Reusing the old displayed bones is insufficient for its changed garment shape: the frozen Slide `.8` pose places the new shorts about 14.54 mm below the floor.

The independent canonical solver was rerun on the exact candidate near/far files, with unchanged motion `7c90…abc` and IK helper `80fdd9…c13`. All 31 clips pass at 120 Hz and intermediate 240 Hz probes. The lowest corrected vertex is **+1.480260 mm**. Slide requires up to **17.311935 mm** lift near and **17.308630 mm** far; foot reach residual is zero and sole-anchor error is below `6e-16 m`.

The separate boot proof uses the candidate P01 pair and the other fourteen unchanged native32 files. Both exact boot support hulls equal the previous hulls. Every file hash and the isolated mirror's inputs are recorded in [inputs.json](inputs.json); [summary.json](summary.json) states the scope.

This is **partial evidence**, not acceptance. The canonical solver preserves foot contacts but does not run C16's actual anatomical palm solver. The new root lift must also preserve real palm pressure, hand/boot clearance, visible body support, transition continuity and LOD state in the actual browser. Those gates remain unchanged and are pending. Production models, runtime, data and canonical reports were not changed.

The visible waist repair does not resolve the remaining drape, weave and cuff defects; it does not justify raising the overall cloth grade to 8.
