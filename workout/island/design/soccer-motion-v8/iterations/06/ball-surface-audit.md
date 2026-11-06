# Native ball / skinned-surface contact diagnostic

Measured UTC: 2026-11-06T10:26:50.682Z. Input SHA-256: `54210c4ba71cffde873240b33e52ea7c18377a9afb2bc9e995f788da28958113`. 42 contact/release cue rows; elapsed 0.29 s.
Actual local Draco-decoded triangle geometry is skinned by the shipped native AnimationClips at the exact cue seconds. Native poses only: no runtime IK, viewer correction, source evaluator, raster-image approximation or event-position substitution.

Effector region uses the named bone plus its same-limb direct parent (Foot + Leg, Hand + ForeArm; Chest + Spine). A triangle qualifies if at least one corner has ≥0.5 combined region skin weight, or its average is ≥0.25. This includes weighted seams and excludes an unrelated nearby limb. All distances are exact closest points on these deformed triangles, not nearest vertices or bone centers. The unfiltered whole-body sphere distance is also reported to reveal other-body intersections.

Sphere overlap = ball radius − nearest center-to-surface distance. Positive values mean some sampled surface lies inside the ball; negative values mean a gap to that surface. This is unsigned surface proximity, without a closed-volume inside/outside test. A zero result alone does not establish a plausible contact normal or prove an entire motion collision-free. Duplicate contact/release rows at the same cue intentionally share geometry.

Largest effector-region overlap: 1.003 mm (keeper_dive_high_center, contact, 1.2060 s). Cue rows with region overlap above 20 mm: 0/42. This 20 mm count is a review flag, not an acceptance threshold or a physical guarantee.

| Clip | Cue / time (s) | Effector | Event point → region skin (mm) | Ball center → region skin (mm) | Region sphere overlap (mm) | Nearest region mesh / triangle | Whole-body sphere overlap (mm) | Whole-body mesh / triangle | Region / all triangles |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | ---: |
| pass_short | contact / 0.2880 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/95 | 0.000 | player-01-lod1_1/95 | 328/5781 |
| pass_short | release / 0.2880 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/95 | 0.000 | player-01-lod1_1/95 | 328/5781 |
| pass_long | contact / 0.4680 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/91 | 0.000 | player-01-lod1_1/91 | 328/5781 |
| pass_long | release / 0.4680 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/91 | 0.000 | player-01-lod1_1/91 | 328/5781 |
| pass_loft | contact / 0.4816 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/89 | 0.000 | player-01-lod1_1/89 | 328/5781 |
| pass_loft | release / 0.4816 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/89 | 0.000 | player-01-lod1_1/89 | 328/5781 |
| shot | contact / 0.3420 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/91 | -0.000 | player-01-lod1_1/91 | 328/5781 |
| shot | release / 0.3420 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/91 | -0.000 | player-01-lod1_1/91 | 328/5781 |
| receive_chest | contact / 0.3948 | Chest | 0.000 | 110.000 | 0.000 | player-01-lod1_1/1492 | 0.000 | player-01-lod1_1/1492 | 933/5781 |
| receive_foot | contact / 0.4368 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/128 | 0.000 | player-01-lod1_1/128 | 328/5781 |
| first_touch_moving | contact / 0.4176 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/91 | -0.000 | player-01-lod1_1/91 | 328/5781 |
| first_touch_moving | release / 0.4176 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/91 | -0.000 | player-01-lod1_1/91 | 328/5781 |
| dribble | contact / 0.2992 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/91 | -0.000 | player-01-lod1_1/91 | 328/5781 |
| dribble | contact / 0.7392 | LeftFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/394 | 0.000 | player-01-lod1_1/394 | 327/5781 |
| turn_with_ball | contact / 0.4515 | RightFoot | 0.000 | 110.000 | -0.000 | player-01-lod1_1/116 | -0.000 | player-01-lod1_1/116 | 328/5781 |
| cut | contact / 0.4080 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/95 | 0.000 | player-01-lod1_1/95 | 328/5781 |
| cut | release / 0.4080 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/95 | 0.000 | player-01-lod1_1/95 | 328/5781 |
| slide | contact / 1.0050 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/91 | 0.000 | player-01-lod1_1/91 | 328/5781 |
| slide | release / 1.0050 | RightFoot | 0.000 | 110.000 | 0.000 | player-01-lod1_1/91 | 0.000 | player-01-lod1_1/91 | 328/5781 |
| block | contact / 0.5980 | Chest | 0.000 | 110.000 | -0.000 | player-01-lod1_1/1495 | -0.000 | player-01-lod1_1/1495 | 933/5781 |
| block | release / 0.5980 | Chest | 0.000 | 110.000 | -0.000 | player-01-lod1_1/1495 | -0.000 | player-01-lod1_1/1495 | 933/5781 |
| keeper_throw | contact / 0.0000 | LeftHand | 0.000 | 109.705 | 0.295 | goalkeeper-lod1/430 | 0.529 | goalkeeper-lod1/723 | 216/5997 |
| keeper_throw | contact / 0.0000 | RightHand | 0.000 | 109.471 | 0.529 | goalkeeper-lod1/723 | 0.529 | goalkeeper-lod1/723 | 216/5997 |
| keeper_throw | release / 1.0800 | RightHand | 0.000 | 109.537 | 0.463 | goalkeeper-lod1/723 | 0.463 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_low_left | contact / 1.0980 | LeftHand | 0.000 | 109.365 | 0.635 | goalkeeper-lod1/430 | 0.635 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_low_left | release / 1.3420 | LeftHand | 0.000 | 109.413 | 0.587 | goalkeeper-lod1/430 | 0.587 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_low_center | contact / 1.0980 | LeftHand | 0.000 | 109.185 | 0.815 | goalkeeper-lod1/430 | 0.815 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_low_center | release / 1.3420 | LeftHand | 0.000 | 109.199 | 0.801 | goalkeeper-lod1/430 | 0.801 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_low_right | contact / 1.0980 | RightHand | 0.000 | 109.308 | 0.692 | goalkeeper-lod1/723 | 0.692 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_low_right | release / 1.3420 | RightHand | 0.000 | 109.312 | 0.688 | goalkeeper-lod1/723 | 0.688 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_middle_left | contact / 1.1520 | LeftHand | 0.000 | 109.305 | 0.695 | goalkeeper-lod1/430 | 0.695 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_middle_left | release / 1.4080 | LeftHand | 0.000 | 109.547 | 0.453 | goalkeeper-lod1/430 | 0.453 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_middle_center | contact / 1.1520 | LeftHand | 0.000 | 109.791 | 0.209 | goalkeeper-lod1/430 | 0.518 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_middle_center | release / 1.4080 | LeftHand | 0.000 | 109.715 | 0.285 | goalkeeper-lod1/430 | 0.549 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_middle_right | contact / 1.1520 | RightHand | 0.000 | 109.297 | 0.703 | goalkeeper-lod1/723 | 0.703 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_middle_right | release / 1.4080 | RightHand | 0.000 | 109.382 | 0.618 | goalkeeper-lod1/723 | 0.618 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_high_left | contact / 1.2060 | LeftHand | 0.000 | 109.094 | 0.906 | goalkeeper-lod1/430 | 0.906 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_high_left | release / 1.4740 | LeftHand | 0.000 | 109.350 | 0.650 | goalkeeper-lod1/430 | 0.650 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_high_center | contact / 1.2060 | LeftHand | 0.000 | 108.997 | 1.003 | goalkeeper-lod1/430 | 1.003 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_high_center | release / 1.4740 | LeftHand | 0.000 | 109.184 | 0.816 | goalkeeper-lod1/430 | 0.816 | goalkeeper-lod1/430 | 216/5997 |
| keeper_dive_high_right | contact / 1.2060 | RightHand | 0.000 | 109.233 | 0.767 | goalkeeper-lod1/723 | 0.767 | goalkeeper-lod1/723 | 216/5997 |
| keeper_dive_high_right | release / 1.4740 | RightHand | 0.000 | 109.324 | 0.676 | goalkeeper-lod1/723 | 0.676 | goalkeeper-lod1/723 | 216/5997 |

Coordinates below permit inspection of the exact cue and nearest points. Every native FK/event-position residual measured here is below 0.000 mm.

| Clip / cue / seconds | Authored point / ball center [m] | Region skin nearest event point [m] / mesh / triangle | Region skin nearest ball center [m] | Whole-body skin nearest ball center [m] |
| --- | --- | --- | --- | --- |
| pass_short / contact / 0.2880 | [-0.20291, 0.10182, 0.39866] / [-0.13924, 0.11000, 0.48799] | [-0.20291, 0.10182, 0.39866] / player-01-lod1_1/95 | [-0.20291, 0.10182, 0.39866] | [-0.20291, 0.10182, 0.39866] |
| pass_short / release / 0.2880 | [-0.20291, 0.10182, 0.39866] / [-0.13924, 0.11000, 0.48799] | [-0.20291, 0.10182, 0.39866] / player-01-lod1_1/95 | [-0.20291, 0.10182, 0.39866] | [-0.20291, 0.10182, 0.39866] |
| pass_long / contact / 0.4680 | [-0.12173, 0.11291, 0.55535] / [-0.12000, 0.11000, 0.66530] | [-0.12173, 0.11291, 0.55535] / player-01-lod1_1/91 | [-0.12173, 0.11291, 0.55535] | [-0.12173, 0.11291, 0.55535] |
| pass_long / release / 0.4680 | [-0.12173, 0.11291, 0.55535] / [-0.12000, 0.11000, 0.66530] | [-0.12173, 0.11291, 0.55535] / player-01-lod1_1/91 | [-0.12173, 0.11291, 0.55535] | [-0.12173, 0.11291, 0.55535] |
| pass_loft / contact / 0.4816 | [-0.04679, 0.09503, 0.53914] / [-0.04767, 0.11000, 0.64811] | [-0.04679, 0.09503, 0.53914] / player-01-lod1_1/130 | [-0.04679, 0.09503, 0.53914] | [-0.04679, 0.09503, 0.53914] |
| pass_loft / release / 0.4816 | [-0.04679, 0.09503, 0.53914] / [-0.04767, 0.11000, 0.64811] | [-0.04679, 0.09503, 0.53914] / player-01-lod1_1/130 | [-0.04679, 0.09503, 0.53914] | [-0.04679, 0.09503, 0.53914] |
| shot / contact / 0.3420 | [-0.12173, 0.11291, 0.57535] / [-0.12000, 0.11000, 0.68530] | [-0.12173, 0.11291, 0.57535] / player-01-lod1_1/91 | [-0.12173, 0.11291, 0.57535] | [-0.12173, 0.11291, 0.57535] |
| shot / release / 0.3420 | [-0.12173, 0.11291, 0.57535] / [-0.12000, 0.11000, 0.68530] | [-0.12173, 0.11291, 0.57535] / player-01-lod1_1/91 | [-0.12173, 0.11291, 0.57535] | [-0.12173, 0.11291, 0.57535] |
| receive_chest / contact / 0.3948 | [0.01718, 1.24903, 0.10430] / [0.00000, 1.30415, 0.19793] | [0.01718, 1.24903, 0.10430] / player-01-lod1_1/1492 | [0.01718, 1.24903, 0.10430] | [0.01718, 1.24903, 0.10430] |
| receive_foot / contact / 0.4368 | [-0.06786, 0.10497, 0.54174] / [-0.08154, 0.12500, 0.64903] | [-0.06786, 0.10497, 0.54174] / player-01-lod1_1/129 | [-0.06786, 0.10497, 0.54174] | [-0.06786, 0.10497, 0.54174] |
| first_touch_moving / contact / 0.4176 | [-0.14173, 0.11791, 0.53535] / [-0.14000, 0.11500, 0.64530] | [-0.14173, 0.11791, 0.53535] / player-01-lod1_1/91 | [-0.14173, 0.11791, 0.53535] | [-0.14173, 0.11791, 0.53535] |
| first_touch_moving / release / 0.4176 | [-0.14173, 0.11791, 0.53535] / [-0.14000, 0.11500, 0.64530] | [-0.14173, 0.11791, 0.53535] / player-01-lod1_1/91 | [-0.14173, 0.11791, 0.53535] | [-0.14173, 0.11791, 0.53535] |
| dribble / contact / 0.2992 | [-0.12173, 0.11573, 0.49312] / [-0.12000, 0.11282, 0.60307] | [-0.12173, 0.11573, 0.49312] / player-01-lod1_1/91 | [-0.12173, 0.11573, 0.49312] | [-0.12173, 0.11573, 0.49312] |
| dribble / contact / 0.7392 | [0.11973, 0.11438, 0.49279] / [0.12000, 0.11282, 0.60277] | [0.11973, 0.11438, 0.49279] / player-01-lod1_1/394 | [0.11973, 0.11438, 0.49279] | [0.11973, 0.11438, 0.49279] |
| turn_with_ball / contact / 0.4515 | [-0.13846, 0.10679, 0.28979] / [-0.04755, 0.11500, 0.35118] | [-0.13846, 0.10679, 0.28979] / player-01-lod1_1/117 | [-0.13846, 0.10679, 0.28979] | [-0.13846, 0.10679, 0.28979] |
| cut / contact / 0.4080 | [-0.25808, 0.09682, 0.46589] / [-0.18476, 0.11500, 0.54586] | [-0.25808, 0.09682, 0.46589] / player-01-lod1_1/95 | [-0.25808, 0.09682, 0.46589] | [-0.25808, 0.09682, 0.46589] |
| cut / release / 0.4080 | [-0.25808, 0.09682, 0.46589] / [-0.18476, 0.11500, 0.54586] | [-0.25808, 0.09682, 0.46589] / player-01-lod1_1/95 | [-0.25808, 0.09682, 0.46589] | [-0.25808, 0.09682, 0.46589] |
| slide / contact / 1.0050 | [-0.06208, 0.09396, 1.21552] / [-0.06000, 0.11000, 1.32433] | [-0.06208, 0.09396, 1.21552] / player-01-lod1_1/124 | [-0.06208, 0.09396, 1.21552] | [-0.06208, 0.09396, 1.21552] |
| slide / release / 1.0050 | [-0.06208, 0.09396, 1.21552] / [-0.06000, 0.11000, 1.32433] | [-0.06208, 0.09396, 1.21552] / player-01-lod1_1/124 | [-0.06208, 0.09396, 1.21552] | [-0.06208, 0.09396, 1.21552] |
| block / contact / 0.5980 | [0.30493, 1.10162, 0.14423] / [0.32844, 1.11019, 0.25135] | [0.30493, 1.10162, 0.14423] / player-01-lod1_1/1574 | [0.30493, 1.10162, 0.14423] | [0.30493, 1.10162, 0.14423] |
| block / release / 0.5980 | [0.30493, 1.10162, 0.14423] / [0.32844, 1.11019, 0.25135] | [0.30493, 1.10162, 0.14423] / player-01-lod1_1/1574 | [0.30493, 1.10162, 0.14423] | [0.30493, 1.10162, 0.14423] |
| keeper_throw / contact / 0.0000 | [0.10419, 1.05866, 0.34474] / [-0.00000, 1.06000, 0.38000] | [0.10419, 1.05866, 0.34474] / goalkeeper-lod1/430 | [0.10376, 1.05787, 0.34445] | [-0.10512, 1.06095, 0.34944] |
| keeper_throw / contact / 0.0000 | [-0.10582, 1.06050, 0.34997] / [-0.00000, 1.06000, 0.38000] | [-0.10582, 1.06050, 0.34997] / goalkeeper-lod1/742 | [-0.10512, 1.06095, 0.34944] | [-0.10512, 1.06095, 0.34944] |
| keeper_throw / release / 1.0800 | [-0.00929, 1.48555, 0.54557] / [-0.04000, 1.49577, 0.65070] | [-0.00929, 1.48555, 0.54557] / goalkeeper-lod1/742 | [-0.00879, 1.48599, 0.54616] | [-0.00879, 1.48599, 0.54616] |
| keeper_dive_low_left / contact / 1.0980 | [1.47056, 0.31106, 0.34973] / [1.58000, 0.30000, 0.35000] | [1.47056, 0.31106, 0.34973] / goalkeeper-lod1/430 | [1.47104, 0.30945, 0.35035] | [1.47104, 0.30945, 0.35035] |
| keeper_dive_low_left / release / 1.3420 | [1.47052, 0.27064, 0.35003] / [1.58000, 0.26000, 0.35000] | [1.47052, 0.27064, 0.35003] / goalkeeper-lod1/430 | [1.47098, 0.26920, 0.35060] | [1.47098, 0.26920, 0.35060] |
| keeper_dive_low_center / contact / 1.0980 | [0.01520, 0.30750, 0.61131] / [0.00000, 0.30000, 0.72000] | [0.01520, 0.30750, 0.61131] / goalkeeper-lod1/431 | [0.01298, 0.30787, 0.61188] | [0.01298, 0.30787, 0.61188] |
| keeper_dive_low_center / release / 1.3420 | [0.01510, 0.26246, 0.63630] / [-0.00000, 0.25500, 0.74500] | [0.01510, 0.26246, 0.63630] / goalkeeper-lod1/431 | [0.01290, 0.26282, 0.63685] | [0.01290, 0.26282, 0.63685] |
| keeper_dive_low_right / contact / 1.0980 | [-1.47067, 0.31104, 0.34498] / [-1.58000, 0.30000, 0.35000] | [-1.47067, 0.31104, 0.34498] / goalkeeper-lod1/742 | [-1.47139, 0.31156, 0.34581] | [-1.47139, 0.31156, 0.34581] |
| keeper_dive_low_right / release / 1.3420 | [-1.47067, 0.27102, 0.34501] / [-1.58000, 0.26000, 0.35000] | [-1.47067, 0.27102, 0.34501] / goalkeeper-lod1/742 | [-1.47138, 0.27153, 0.34584] | [-1.47138, 0.27153, 0.34584] |
| keeper_dive_middle_left / contact / 1.1520 | [1.57053, 1.13942, 0.34806] / [1.68000, 1.15000, 0.35000] | [1.57053, 1.13942, 0.34806] / goalkeeper-lod1/431 | [1.57116, 1.13990, 0.34999] | [1.57116, 1.13990, 0.34999] |
| keeper_dive_middle_left / release / 1.4080 | [1.51053, 0.97033, 0.30883] / [1.62006, 0.98047, 0.30822] | [1.51053, 0.97033, 0.30883] / goalkeeper-lod1/430 | [1.51109, 0.96926, 0.30960] | [1.51109, 0.96926, 0.30960] |
| keeper_dive_middle_center / contact / 1.1520 | [0.00968, 1.14038, 0.97085] / [0.00000, 1.15000, 1.08000] | [0.00968, 1.14038, 0.97085] / goalkeeper-lod1/430 | [0.00934, 1.13992, 0.97107] | [-0.01506, 1.14328, 0.97177] |
| keeper_dive_middle_center / release / 1.4080 | [0.01034, 0.82098, 1.15086] / [0.00000, 0.83000, 1.26000] | [0.01034, 0.82098, 1.15086] / goalkeeper-lod1/430 | [0.00987, 0.82033, 1.15116] | [-0.01536, 0.82341, 1.15183] |
| keeper_dive_middle_right / contact / 1.1520 | [-1.57050, 1.14092, 0.34483] / [-1.68000, 1.15000, 0.35000] | [-1.57050, 1.14092, 0.34483] / goalkeeper-lod1/742 | [-1.57111, 1.14162, 0.34563] | [-1.57111, 1.14162, 0.34563] |
| keeper_dive_middle_right / release / 1.4080 | [-1.51054, 0.97119, 0.30382] / [-1.62006, 0.98047, 0.30822] | [-1.51054, 0.97119, 0.30382] / goalkeeper-lod1/742 | [-1.51108, 0.97179, 0.30458] | [-1.51108, 0.97179, 0.30458] |
| keeper_dive_high_left / contact / 1.2060 | [1.60517, 1.92427, 0.35125] / [1.70000, 1.98000, 0.35000] | [1.60517, 1.92427, 0.35125] / goalkeeper-lod1/431 | [1.60555, 1.92551, 0.35332] | [1.60555, 1.92551, 0.35332] |
| keeper_dive_high_left / release / 1.4740 | [1.51353, 1.47897, 0.27019] / [1.60912, 1.53328, 0.26681] | [1.51353, 1.47897, 0.27019] / goalkeeper-lod1/430 | [1.51491, 1.47798, 0.27162] | [1.51491, 1.47798, 0.27162] |
| keeper_dive_high_center / contact / 1.2060 | [0.03892, 1.89927, 0.43621] / [-0.00000, 1.98000, 0.50000] | [0.03892, 1.89927, 0.43621] / goalkeeper-lod1/431 | [0.03735, 1.90089, 0.43498] | [0.03735, 1.90089, 0.43498] |
| keeper_dive_high_center / release / 1.4740 | [0.04135, 1.82019, 0.40850] / [0.00355, 1.90081, 0.47309] | [0.04135, 1.82019, 0.40850] / goalkeeper-lod1/431 | [0.03987, 1.82156, 0.40735] | [0.03987, 1.82156, 0.40735] |
| keeper_dive_high_right / contact / 1.2060 | [-1.60478, 1.92493, 0.34882] / [-1.70000, 1.98000, 0.35000] | [-1.60478, 1.92493, 0.34882] / goalkeeper-lod1/742 | [-1.60504, 1.92601, 0.34951] | [-1.60504, 1.92601, 0.34951] |
| keeper_dive_high_right / release / 1.4740 | [-1.51393, 1.47816, 0.26644] / [-1.60912, 1.53328, 0.26681] | [-1.51393, 1.47816, 0.26644] / goalkeeper-lod1/742 | [-1.51416, 1.47911, 0.26711] | [-1.51416, 1.47911, 0.26711] |

Input files are hashed before and after the measurement; any mutation aborts the report.

| Runtime file / audit helper | SHA-256 |
| --- | --- |
| LocalDRACOLoader.mjs | `b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a` |
| catalog.mjs | `d2864c54984da04c8deb63c8eac5a08c49790a16ff06e1fd1ec5ebfb340196a2` |
| contact-solver.mjs | `ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8` |
| controller.mjs | `da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0` |
| draco-worker.js | `5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194` |
| keeper.glb | `15af452a5ef3ba7fb80258846dc48d992ad0620181b2aff24c0bf758a9841d6b` |
| player.glb | `a73b10a80b861a9d5169eff398bab5e79ce82f702546f301cfe41934756657af` |
| vendor/BufferGeometryUtils.js | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| vendor/DRACOLoader.js | `e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb` |
| vendor/GLTFLoader.js | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| vendor/LICENSE.three | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |
| vendor/SkeletonUtils.js | `0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d` |
| vendor/draco/LICENSE.draco | `d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4` |
| vendor/draco/draco_decoder.wasm | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| vendor/draco/draco_wasm_wrapper.js | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| vendor/three.module.js | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| verification/audit-ball-contact.mjs | `929f5de11d8818a4f7d0e64f8d7da7d261e220a7d9179b3ee21ab785e83ff8ce` |
| verification/glb-reader.mjs | `d2c79262d3dc2579e887230c8fd69d7ca52289f4c29b19c672cb92cf978ba9a5` |
