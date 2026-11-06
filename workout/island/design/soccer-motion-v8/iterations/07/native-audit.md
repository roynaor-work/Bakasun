# Native skin audit

Measured UTC: 2026-11-06T10:40:46.861Z. Actual shipped GLB decoded using local Draco/r160.
All skin vertices at 120 Hz plus event/support endpoints: 36,068,442 vertex samples; elapsed 7.52 s.
Native animation only. No viewer IK, floor lift, metadata substitutions, raster textures or screenshot framing corrections affect these measurements. Optional travel is included when evaluating a declared support anchor.

| Clip | Minimum skin y (mm) | At (s) | Worst mesh/vertex | Support residual (mm) | At (s) | Maximum bone angular speed (rad/s) | Bone / time |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| idle | 5.128 | 0.0500 | player-01-lod1_1/54 | 0.000 | 0.0500 | 0.113 | LeftLeg / 0.8417 |
| pass_short | 4.715 | 0.6768 | player-01-lod1_1/70 | 0.399 | 0.2167 | 11.802 | RightFoot / 0.1917 |
| pass_long | 4.603 | 0.9776 | player-01-lod1_1/70 | 0.731 | 0.3500 | 15.891 | RightFoot / 0.5667 |
| pass_loft | 4.671 | 1.0528 | player-01-lod1_1/70 | 0.616 | 0.3500 | 17.440 | RightLeg / 0.5833 |
| shot | 4.750 | 0.8460 | player-01-lod1_1/70 | 2.040 | 0.2500 | 22.309 | RightFoot / 0.4167 |
| receive_chest | 4.813 | 0.8167 | player-01-lod1_1/54 | 0.315 | 0.8167 | 8.666 | LeftForeArm / 0.5000 |
| receive_foot | 5.086 | 0.8833 | player-01-lod1_1/320 | 0.043 | 0.8833 | 4.982 | RightLeg / 0.6168 |
| first_touch_moving | 4.752 | 0.3500 | player-01-lod1_1/320 | 0.421 | 0.9512 | 9.372 | RightForeArm / 0.6333 |
| dribble | 4.357 | 0.1833 | player-01-lod1_1/304 | 2.230 | 0.5667 | 5.254 | LeftLeg / 0.3417 |
| turn_with_ball | 5.008 | 1.0185 | player-01-lod1_1/70 | 0.172 | 0.9167 | 5.753 | RightLeg / 0.9917 |
| shield | 5.122 | 0.6833 | player-01-lod1_1/304 | 0.008 | 0.6500 | 0.830 | RightForeArm / 0.6083 |
| cut | 4.542 | 0.3500 | player-01-lod1_1/304 | 0.670 | 0.3500 | 26.841 | RightForeArm / 0.3667 |
| slide | 4.631 | 2.3833 | player-01-lod1_1/54 | 0.209 | 0.1167 | 11.791 | LeftForeArm / 0.2750 |
| block | 4.940 | 0.9167 | player-01-lod1_1/54 | 0.282 | 0.9167 | 5.354 | LeftLeg / 0.1583 |
| keeper_ready | 5.128 | 0.7833 | goalkeeper-lod1_1/320 | 0.000 | 0.7833 | 0.086 | LeftLeg / 0.8667 |
| keeper_throw | 4.845 | 1.4833 | goalkeeper-lod1_1/54 | 0.465 | 0.9833 | 35.943 | RightHand / 0.5083 |
| keeper_dive_low_left | 3.344 | 1.7333 | goalkeeper-lod1/233 | 0.102 | 0.1500 | 18.894 | LeftForeArm / 0.5167 |
| keeper_dive_low_center | 4.826 | 2.5833 | goalkeeper-lod1_1/304 | 0.067 | 0.1500 | 12.814 | LeftHand / 2.5083 |
| keeper_dive_low_right | 3.308 | 1.8500 | goalkeeper-lod1/233 | 0.102 | 0.1500 | 20.029 | RightForeArm / 0.5083 |
| keeper_dive_middle_left | 3.324 | 1.8167 | goalkeeper-lod1/233 | 0.094 | 0.1500 | 23.697 | LeftForeArm / 0.6417 |
| keeper_dive_middle_center | 3.143 | 2.1167 | goalkeeper-lod1/233 | 0.062 | 0.1500 | 21.737 | LeftHand / 1.6833 |
| keeper_dive_middle_right | 3.297 | 1.9500 | goalkeeper-lod1/233 | 0.094 | 0.1500 | 23.688 | RightForeArm / 0.6667 |
| keeper_dive_high_left | 3.321 | 2.1500 | goalkeeper-lod1/233 | 0.087 | 0.1500 | 26.091 | LeftForeArm / 1.5833 |
| keeper_dive_high_center | 4.973 | 2.8500 | goalkeeper-lod1_1/54 | 0.056 | 0.1500 | 18.422 | RightForeArm / 1.7333 |
| keeper_dive_high_right | 3.303 | 2.0500 | goalkeeper-lod1/233 | 0.087 | 0.1500 | 26.718 | LeftForeArm / 1.6500 |

Angular speed detects twist and sample discontinuities; it is not a universal biomechanical limit. Event-local FK and sphere surface distances are checked independently below.

| Clip | Cue | Seconds | Native FK vs metadata (mm) | Radius residual (mm) |
| --- | --- | ---: | ---: | ---: |
| pass_short | contact | 0.2880 | 0.0000 | 0.0000 |
| pass_short | release | 0.2880 | 0.0000 | 0.0000 |
| pass_long | contact | 0.4680 | 0.0000 | 0.0000 |
| pass_long | release | 0.4680 | 0.0000 | 0.0000 |
| pass_loft | contact | 0.4816 | 0.0000 | 0.0000 |
| pass_loft | release | 0.4816 | 0.0000 | 0.0000 |
| shot | contact | 0.3420 | 0.0000 | 0.0000 |
| shot | release | 0.3420 | 0.0000 | 0.0000 |
| receive_chest | contact | 0.3948 | 0.0000 | 0.0000 |
| receive_foot | contact | 0.4368 | 0.0000 | 0.0000 |
| receive_foot | release | 0.6168 | 0.0000 | 0.0000 |
| first_touch_moving | contact | 0.4176 | 0.0000 | 0.0000 |
| first_touch_moving | release | 0.4176 | 0.0000 | 0.0000 |
| dribble | contact | 0.2992 | 0.0000 | 0.0000 |
| dribble | contact | 0.7392 | 0.0000 | 0.0000 |
| turn_with_ball | contact | 0.4515 | 0.0000 | 0.0000 |
| cut | contact | 0.4080 | 0.0000 | 0.0000 |
| cut | release | 0.4080 | 0.0000 | 0.0000 |
| slide | contact | 1.0050 | 0.0000 | 0.0000 |
| slide | release | 1.0050 | 0.0000 | 0.0000 |
| block | contact | 0.5980 | 0.0000 | 0.0000 |
| block | release | 0.5980 | 0.0000 | 0.0000 |
| keeper_throw | contact | 0.0000 | 0.0000 | 0.0000 |
| keeper_throw | contact | 0.0000 | 0.0000 | 0.0000 |
| keeper_throw | release | 1.0800 | 0.0001 | 0.0000 |
| keeper_dive_low_left | contact | 1.0980 | 0.0000 | 0.0000 |
| keeper_dive_low_left | release | 1.3420 | 0.0000 | 0.0000 |
| keeper_dive_low_center | contact | 1.0980 | 0.0000 | 0.0000 |
| keeper_dive_low_center | release | 1.3420 | 0.0000 | 0.0000 |
| keeper_dive_low_right | contact | 1.0980 | 0.0000 | 0.0000 |
| keeper_dive_low_right | release | 1.3420 | 0.0000 | 0.0000 |
| keeper_dive_middle_left | contact | 1.1520 | 0.0000 | 0.0000 |
| keeper_dive_middle_left | release | 1.4080 | 0.0000 | 0.0000 |
| keeper_dive_middle_center | contact | 1.1520 | 0.0000 | 0.0000 |
| keeper_dive_middle_center | release | 1.4080 | 0.0000 | 0.0000 |
| keeper_dive_middle_right | contact | 1.1520 | 0.0000 | 0.0000 |
| keeper_dive_middle_right | release | 1.4080 | 0.0000 | 0.0000 |
| keeper_dive_high_left | contact | 1.2060 | 0.0000 | 0.0000 |
| keeper_dive_high_left | release | 1.4740 | 0.0001 | 0.0000 |
| keeper_dive_high_center | contact | 1.2060 | 0.0000 | 0.0000 |
| keeper_dive_high_center | release | 1.4740 | 0.0000 | 0.0000 |
| keeper_dive_high_right | contact | 1.2060 | 0.0000 | 0.0000 |
| keeper_dive_high_right | release | 1.4740 | 0.0001 | 0.0000 |

These finite samples constrain the delivered model and its native interpolation. They do not prove collision-free cloth or physical phone performance.
