# Actual-skin transition audit

Measured UTC: 2026-11-06T10:42:34.862Z. Input SHA-256: `9a417571c1ab3f0518357f26f2cf2432dcbf5cb6ee5fe963c4e44d7c7c0230ca`.
80 legal edges × three legal source clocks = 240 cases. Every skinned vertex sampled at 60 Hz, exact handoff and blend end, through blend + 50 ms: 26,191,614 vertex samples; elapsed 17.94 s.
Sources receive a genuine positive update for their final 1/60 s before each request. Infinite loop windows use the earliest legal instant plus the next 0.25 and 0.75 cycle phases. Non-loop windows use near-earliest, middle and near-latest clocks. Controller auto-return is disabled to isolate the chosen edge. Optional reference travel is enabled; the game-owned root stays untouched.
Actual Draco geometry, native tracks, runtime blend, real skinning. No source-pose evaluator, proxy capsules, viewer floor correction or raster textures. Foot drift measures the canonical sole marker from its displayed world anchor only when the same foot is declared planted at source exit and destination entry, while the destination support window remains active. It does not prove skin sole contact.

Edges below −5 mm skin tolerance: 0/80. Handoffs exceeding 1 µm or 1 µrad: 0/80. Non-finite cases: 0.
Shared support drifts above 5 mm before the destination support release: 0/80. Exact support boundaries and ±1 µs neighbours are included.
Velocity maxima are diagnostic, not a universal biomechanical pass threshold. A finite source sampler and a passing static clip audit do not guarantee collision-free blends or fixed support feet.

| Source → destination | Trigger | Worst floor (mm) | Source time / blend time (s) | Mesh / vertex | Shared-foot max drift (mm) | Foot / source / blend time (s) | C0 position (mm) / angle (mrad) | Max joint speed (m/s) / angular speed (rad/s) |
| --- | --- | ---: | --- | --- | ---: | --- | --- | --- |
| idle → dribble | move | 1.500 | 0.0050 / 0.2333 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 7.199 / 12.994 |
| idle → pass_short | play:pass_short | 5.042 | 0.4500 / 0.0667 | player-01-lod1_1/70 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 4.743 / 11.693 |
| idle → pass_long | play:pass_long | 5.128 | 0.0050 / 0.0833 | player-01-lod1_1/70 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 6.638 / 13.329 |
| idle → pass_loft | play:pass_loft | 5.103 | 0.4500 / 0.1000 | player-01-lod1_1/70 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 6.263 / 13.254 |
| idle → shot | play:shot | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 9.353 / 16.492 |
| idle → receive_chest | play:receive_chest | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 3.143 / 9.839 |
| idle → receive_foot | play:receive_foot | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 2.840 / 6.003 |
| idle → first_touch_moving | play:first_touch_moving | 4.969 | 0.4500 / 0.0500 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 2.431 / 6.648 |
| idle → turn_with_ball | play:turn_with_ball | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 3.050 / 7.235 |
| idle → shield | play:shield | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 4.446 / 16.612 |
| idle → cut | play:cut | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 2.896 / 9.598 |
| idle → slide | play:slide | 4.670 | 0.4500 / 0.1000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 2.182 / 7.654 |
| idle → block | play:block | 5.128 | 0.0050 / 0.0000 | player-01-lod1_1/54 | 0.000 | RightFoot / 0.0050 / 0.0000 | 0.000030 / 0.000030 | 2.337 / 13.582 |
| pass_short → idle | finished | 1.500 | 0.6552 / 0.0833 | player-01-lod1_1/70 | 0.000 | LeftFoot / 0.6552 / 0.0000 | 0.000037 / 0.000089 | 2.193 / 5.575 |
| pass_short → dribble | move | 1.500 | 0.6048 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.6048 / 0.0000 | 0.000045 / 0.000052 | 6.152 / 11.880 |
| pass_long → idle | finished | 1.500 | 0.9464 / 0.0667 | player-01-lod1_1/70 | 0.000 | LeftFoot / 0.9464 / 0.0000 | 0.000036 / 0.000099 | 4.686 / 8.269 |
| pass_long → dribble | move | 1.500 | 0.7122 / 0.2333 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.8736 / 0.0000 | 0.000055 / 0.000089 | 6.152 / 12.159 |
| pass_loft → idle | finished | 1.500 | 1.0192 / 0.1167 | player-01-lod1_1/70 | 0.000 | LeftFoot / 1.1200 / 0.0000 | 0.000028 / 0.000060 | 4.768 / 9.866 |
| pass_loft → dribble | move | 1.500 | 0.9408 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 1.1200 / 0.0000 | 0.000070 / 0.000123 | 6.152 / 12.165 |
| shot → idle | finished | 1.500 | 0.8190 / 0.0500 | player-01-lod1_1/70 | 0.000 | RightFoot / 0.9000 / 0.0000 | 0.000054 / 0.000094 | 4.828 / 8.808 |
| shot → dribble | move | 1.500 | 0.6170 / 0.2333 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.9000 / 0.0000 | 0.000064 / 0.000155 | 6.152 / 12.129 |
| receive_chest → idle | finished | 4.888 | 0.8554 / 0.0000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.7758 / 0.0000 | 0.000033 / 0.000084 | 3.586 / 8.787 |
| receive_chest → dribble | move | 2.678 | 0.7896 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.7896 / 0.0000 | 0.000061 / 0.000119 | 7.657 / 14.390 |
| receive_foot → idle | finished | 4.264 | 0.8578 / 0.0833 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.8578 / 0.0000 | 0.000027 / 0.000084 | 1.406 / 4.904 |
| receive_foot → dribble | move | 1.500 | 0.8736 / 0.2333 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.7122 / 0.0000 | 0.000037 / 0.000089 | 7.199 / 12.994 |
| first_touch_moving → idle | finished | 5.093 | 1.0556 / 0.0167 | player-01-lod1_1/70 | 0.000 | LeftFoot / 0.9562 / 0.0000 | 0.000025 / 0.000073 | 1.712 / 6.001 |
| first_touch_moving → dribble | move | 1.500 | 1.1600 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9744 / 0.0000 | 0.000042 / 0.000103 | 7.199 / 12.994 |
| dribble → idle | stop | 1.607 | 0.2200 / 0.0833 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.111 / 6.329 |
| dribble → pass_short | play:pass_short | 1.500 | 0.2200 / 0.0500 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 5.758 / 12.205 |
| dribble → pass_long | play:pass_long | 1.500 | 0.6600 / 0.0667 | player-01-lod1_1/70 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 7.957 / 13.776 |
| dribble → pass_loft | play:pass_loft | 1.500 | 0.6600 / 0.0896 | player-01-lod1_1/70 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 7.235 / 13.577 |
| dribble → shot | play:shot | 1.500 | 0.2200 / 0.0833 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 9.633 / 17.011 |
| dribble → receive_chest | play:receive_chest | 1.500 | 0.2200 / 0.0833 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.567 / 11.065 |
| dribble → receive_foot | play:receive_foot | 1.500 | 0.2200 / 0.0833 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.354 / 7.405 |
| dribble → first_touch_moving | play:first_touch_moving | 1.500 | 0.2200 / 0.0667 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.532 / 9.560 |
| dribble → turn_with_ball | play:turn_with_ball | 2.030 | 0.6600 / 0.0833 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.188 / 6.666 |
| dribble → shield | play:shield | 1.500 | 0.2200 / 0.1167 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 5.118 / 20.965 |
| dribble → cut | play:cut | 1.500 | 0.2200 / 0.0667 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.306 / 9.597 |
| dribble → slide | play:slide | 1.500 | 0.6600 / 0.1333 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 3.112 / 9.273 |
| dribble → block | play:block | 1.500 | 0.2200 / 0.0833 | player-01-lod1_1/320 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000046 / 0.000060 | 4.587 / 16.686 |
| turn_with_ball → idle | finished | 1.590 | 0.9555 / 0.0833 | player-01-lod1_1/50 | 0.000 | LeftFoot / 0.8660 / 0.0000 | 0.000046 / 0.000112 | 3.879 / 9.821 |
| turn_with_ball → dribble | move | 1.500 | 0.8820 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.7190 / 0.0000 | 0.000037 / 0.000112 | 6.204 / 11.469 |
| shield → idle | stop | 5.125 | 0.0050 / 0.0000 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.075 / 15.109 |
| shield → dribble | move | 4.036 | 0.0050 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 7.712 / 16.265 |
| shield → pass_short | play:pass_short | 3.269 | 0.3300 / 0.0833 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.743 / 16.669 |
| shield → pass_long | play:pass_long | 1.961 | 0.3300 / 0.1000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 5.787 / 16.217 |
| shield → pass_loft | play:pass_loft | 3.696 | 0.3300 / 0.1000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 5.284 / 17.935 |
| shield → shot | play:shot | 5.125 | 0.0050 / 0.0000 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 8.218 / 18.570 |
| shield → receive_chest | play:receive_chest | 5.125 | 0.0050 / 0.0000 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.562 / 14.234 |
| shield → receive_foot | play:receive_foot | 1.500 | 0.9900 / 0.0667 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.502 / 16.034 |
| shield → first_touch_moving | play:first_touch_moving | 1.500 | 0.9900 / 0.1000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.833 / 14.103 |
| shield → turn_with_ball | play:turn_with_ball | 1.500 | 0.3300 / 0.1000 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.773 / 19.658 |
| shield → cut | play:cut | 5.122 | 0.3300 / 0.1500 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.535 / 20.213 |
| shield → slide | play:slide | 1.500 | 0.0050 / 0.0833 | player-01-lod1_1/54 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 3.946 / 17.841 |
| shield → block | play:block | 4.526 | 0.3300 / 0.1167 | player-01-lod1_1/304 | 0.000 | LeftFoot / 0.9900 / 0.0000 | 0.000048 / 0.000094 | 4.108 / 25.402 |
| cut → idle | finished | 5.017 | 0.9890 / 0.0167 | player-01-lod1_1/320 | 0.000 | RightFoot / 1.2000 / 0.0000 | 0.000043 / 0.000060 | 1.420 / 6.502 |
| cut → dribble | move | 1.500 | 1.2000 / 0.2333 | player-01-lod1_1/304 | 0.000 | LeftFoot / 1.2000 / 0.0000 | 0.000043 / 0.000089 | 7.603 / 14.440 |
| slide → idle | finished | 1.500 | 3.0485 / 0.0333 | player-01-lod1_1/304 | 0.000 | none / 3.3500 / 0.0000 | 0.000034 / 0.000067 | 1.803 / 5.485 |
| block → idle | finished | 1.500 | 1.1830 / 0.0833 | player-01-lod1_1/54 | 0.000 | LeftFoot / 1.1830 / 0.0000 | 0.000043 / 0.000126 | 1.608 / 12.192 |
| block → dribble | move | 1.500 | 1.0920 / 0.1000 | player-01-lod1_1/304 | 0.000 | LeftFoot / 1.3000 / 0.0000 | 0.000053 / 0.000163 | 7.199 / 12.994 |
| keeper_ready → keeper_throw | play:keeper_throw | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.691 / 13.277 |
| keeper_ready → keeper_dive_low_left | play:keeper_dive_low_left | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.437 / 4.020 |
| keeper_ready → keeper_dive_low_center | play:keeper_dive_low_center | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 0.655 / 2.830 |
| keeper_ready → keeper_dive_low_right | play:keeper_dive_low_right | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.437 / 4.017 |
| keeper_ready → keeper_dive_middle_left | play:keeper_dive_middle_left | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.421 / 3.976 |
| keeper_ready → keeper_dive_middle_center | play:keeper_dive_middle_center | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 0.670 / 2.816 |
| keeper_ready → keeper_dive_middle_right | play:keeper_dive_middle_right | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | RightFoot / 0.4000 / 0.2000 | 0.000023 / 0.000099 | 1.420 / 3.974 |
| keeper_ready → keeper_dive_high_left | play:keeper_dive_high_left | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.406 / 3.937 |
| keeper_ready → keeper_dive_high_center | play:keeper_dive_high_center | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.333 / 3.732 |
| keeper_ready → keeper_dive_high_right | play:keeper_dive_high_right | 5.128 | 0.0050 / 0.0000 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 0.0050 / 0.0000 | 0.000023 / 0.000099 | 1.406 / 3.935 |
| keeper_throw → keeper_ready | finished | 1.500 | 1.6830 / 0.1167 | goalkeeper-lod1_1/304 | 0.000 | LeftFoot / 1.8000 / 0.0000 | 0.000048 / 0.000143 | 2.035 / 6.243 |
| keeper_dive_low_left → keeper_ready | finished | 1.500 | 2.6585 / 0.1333 | goalkeeper-lod1_1/304 | 0.000 | none / 3.0500 / 0.0000 | 0.000064 / 0.000126 | 2.377 / 9.339 |
| keeper_dive_low_center → keeper_ready | finished | 4.964 | 2.6585 / 0.0000 | goalkeeper-lod1_1/54 | 0.000 | none / 3.0500 / 0.0000 | 0.000037 / 0.000126 | 1.794 / 4.630 |
| keeper_dive_low_right → keeper_ready | finished | 1.500 | 2.6585 / 0.1333 | goalkeeper-lod1_1/54 | 0.000 | none / 3.0500 / 0.0000 | 0.000047 / 0.000130 | 2.343 / 8.841 |
| keeper_dive_middle_left → keeper_ready | finished | 1.500 | 2.7890 / 0.1167 | goalkeeper-lod1_1/304 | 0.000 | none / 3.2000 / 0.0000 | 0.000042 / 0.000115 | 2.304 / 9.177 |
| keeper_dive_middle_center → keeper_ready | finished | 3.346 | 2.9920 / 0.0833 | goalkeeper-lod1_1/304 | 0.000 | none / 3.2000 / 0.0000 | 0.000056 / 0.000112 | 1.692 / 4.506 |
| keeper_dive_middle_right → keeper_ready | finished | 1.500 | 2.7890 / 0.1167 | goalkeeper-lod1_1/54 | 0.000 | none / 3.2000 / 0.0000 | 0.000044 / 0.000115 | 2.361 / 8.788 |
| keeper_dive_high_left → keeper_ready | finished | 1.500 | 2.9195 / 0.1167 | goalkeeper-lod1_1/54 | 0.000 | none / 3.3500 / 0.0000 | 0.000060 / 0.000137 | 2.248 / 9.108 |
| keeper_dive_high_center → keeper_ready | finished | 1.500 | 3.1322 / 0.1500 | goalkeeper-lod1_1/54 | 0.000 | none / 3.3500 / 0.0000 | 0.000049 / 0.000099 | 2.191 / 8.834 |
| keeper_dive_high_right → keeper_ready | finished | 1.500 | 2.9195 / 0.1167 | goalkeeper-lod1_1/304 | 0.000 | none / 3.3500 / 0.0000 | 0.000054 / 0.000158 | 2.304 / 8.753 |

## Exact inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| runtime/catalog.mjs | 285494 | fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b |
| runtime/contact-solver.mjs | 12007 | ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8 |
| runtime/controller.mjs | 15082 | da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0 |
| runtime/draco-worker.js | 6495 | 5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194 |
| runtime/keeper.glb | 948984 | 4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42 |
| runtime/LocalDRACOLoader.mjs | 2778 | b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a |
| runtime/player.glb | 821680 | 2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef |
| runtime/vendor/BufferGeometryUtils.js | 31918 | 3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3 |
| runtime/vendor/draco/draco_decoder.wasm | 192420 | a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac |
| runtime/vendor/draco/draco_wasm_wrapper.js | 58456 | 8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6 |
| runtime/vendor/draco/LICENSE.draco | 13898 | d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4 |
| runtime/vendor/DRACOLoader.js | 13640 | e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb |
| runtime/vendor/GLTFLoader.js | 108527 | 1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e |
| runtime/vendor/LICENSE.three | 1081 | 852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d |
| runtime/vendor/SkeletonUtils.js | 8019 | 0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d |
| runtime/vendor/three.module.js | 670681 | 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6 |
| verification/audit-transitions.mjs | 11349 | 7de035bc7b74977b0091b3a0fc53db619832dfb96ad5a69db06b1fde876aad8f |
| verification/glb-reader.mjs | 8293 | d2c79262d3dc2579e887230c8fd69d7ca52289f4c29b19c672cb92cf978ba9a5 |
