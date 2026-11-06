# Browser capture 06

Status: captured. Complete clip matrix requested.
Started UTC: 2026-11-06T10:29:37.867Z. Finished UTC: 2026-11-06T10:32:28.662Z. Elapsed: 170.8 s.
Input SHA-256: `79fa56e85308100c9fbe4090bf21b1d37531aaab19f32832652d8ea3f08f5393`.
Viewports: 390×844 and 844×390, deviceScaleFactor=1. Cameras: near and far. Eight actual native viewport captures per sheet.
Clips requested: 25/25. Sheets completed: 100/100.

These are Chromium/SwiftShader measurements on the cloud desktop. Fourfold CPU throttling is a stress probe; it does not establish physical phone GPU performance or 30 fps on a phone.

## Console and loading

Errors/warnings/failed requests: 0.
Application loading/capture observations: 0. Expected context-close aborts: 0. Both counts retain every observed record.
An abort is classified as context-close only when the preview was ready, the context is explicitly closing/closed, and the transport reports ERR_ABORTED. This describes teardown timing; it does not erase the request or claim that every aborted request was useful.

| UTC timestamp | Elapsed ms | Viewport | Phase | Kind | Classification | Request began in | Detail |
| --- | ---: | --- | --- | --- | --- | --- | --- |

Runtime asset and decoder request lifecycle is retained in network.csv, including response status, resource type, start phase, and cancellation timestamps. HTTP failures also retain up to 240 characters of the actual response body.
Local requests use the browser's ordinary transport without Playwright interception. The server sends exact Content-Length headers. A context request observer records and fails every non-local HTTP attempt; the page also carries the existing island CSP. All requestfailed records remain visible regardless of decode success.

## Viewport and controls

| Viewport | Camera | Horizontal overflow | Controls <44 px | Unnamed | Offscreen horizontally | Document height |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 390x844 | near | false | 0 | 0 | 0 | 845 |
| 390x844 | far | false | 0 | 0 | 1 | 845 |
| 844x390 | near | false | 0 | 0 | 0 | 390 |
| 844x390 | far | false | 0 | 0 | 0 | 390 |


## Render stress probe

| Viewport | CPU multiplier | Animation + render CPU p50/p95 ms | rAF interval p50/p95 ms | Approx. rAF fps from p95 |
| --- | ---: | --- | --- | ---: |
| 390x844 | 1 | 0.90/1.20 | 16.70/33.40 | 29.9 |
| 390x844 | 4 | 3.80/8.50 | 16.70/33.40 | 29.9 |
| 844x390 | 1 | 0.90/1.40 | 16.70/33.40 | 29.9 |
| 844x390 | 4 | 4.40/11.50 | 16.70/33.40 | 29.9 |

## Mandatory cue capture proof

Every distinct start/end/contact/release/takeoff/landing time is seeded before filling the largest remaining gaps. A clip with more than eight mandatory times fails explicitly. No mandatory time is replaced by a nearby cue.
cue-times.csv preserves this round's exact imported catalog cue contract, written before the browser starts. Historical rounds are compared with their own cue times even when later authoring changes durations or adds clips.

| Clip | Exact mandatory seconds | Captured views containing every mandatory time |
| --- | --- | ---: |
| idle | 0, 1.8 | 4/4 |
| keeper_ready | 0, 1.6 | 4/4 |
| pass_short | 0, 0.288, 0.72 | 4/4 |
| pass_long | 0, 0.468, 1.04 | 4/4 |
| pass_loft | 0, 0.48160000000000003, 1.12 | 4/4 |
| shot | 0, 0.342, 0.9 | 4/4 |
| receive_chest | 0, 0.3948, 0.94 | 4/4 |
| receive_foot | 0, 0.4368, 1.04 | 4/4 |
| first_touch_moving | 0, 0.41759999999999997, 1.16 | 4/4 |
| dribble | 0, 0.2992, 0.7392, 0.88 | 4/4 |
| turn_with_ball | 0, 0.4515, 1.05 | 4/4 |
| shield | 0, 1.32 | 4/4 |
| cut | 0, 0.40800000000000003, 1.2 | 4/4 |
| slide | 0, 0.5025, 1.005, 1.139, 3.35 | 4/4 |
| keeper_throw | 0, 1.08, 1.8 | 4/4 |
| block | 0, 0.5980000000000001, 1.3 | 4/4 |
| keeper_dive_low_left | 0, 0.39649999999999996, 1.0979999999999999, 1.3419999999999999, 1.6775, 3.05 | 4/4 |
| keeper_dive_low_center | 0, 1.0979999999999999, 1.3419999999999999, 1.7689999999999997, 3.05 | 4/4 |
| keeper_dive_low_right | 0, 0.39649999999999996, 1.0979999999999999, 1.3419999999999999, 1.6775, 3.05 | 4/4 |
| keeper_dive_middle_left | 0, 0.41600000000000004, 1.152, 1.4080000000000001, 1.7600000000000002, 3.2 | 4/4 |
| keeper_dive_middle_center | 0, 0.41600000000000004, 1.152, 1.4080000000000001, 1.8559999999999999, 3.2 | 4/4 |
| keeper_dive_middle_right | 0, 0.41600000000000004, 1.152, 1.4080000000000001, 1.7600000000000002, 3.2 | 4/4 |
| keeper_dive_high_left | 0, 0.43550000000000005, 1.206, 1.474, 1.8425000000000002, 3.35 | 4/4 |
| keeper_dive_high_center | 0, 0.43550000000000005, 1.206, 1.474, 1.8425000000000002, 3.35 | 4/4 |
| keeper_dive_high_right | 0, 0.43550000000000005, 1.206, 1.474, 1.8425000000000002, 3.35 | 4/4 |

## Contact and HUD visibility measurements

Measured contact/release point rows: 332. Rows intersecting HUD rectangles: 0. Rows outside the stage: 0. Non-finite projected disk rows: 0. Distinct measured HUD rectangles: 484.
Only exact contact/release cue frames are included. Ball measurements are listed once per cue type at that instant; contacting hand/foot measurements retain their bone. Disk centres and radii use absolute viewport CSS pixels. occluded_by and outside_stage are the preview's measured values; the capture tool assigns no visual score from them.
overlay-rects.csv preserves each distinct actual HUD rectangle per clip/view/camera, including the first cue time at which it was measured.

| Evidence file | Bytes | SHA-256 |
| --- | ---: | --- |
| contact-visibility.csv | 52504 | 41facdbe8fbab0753f06ee9f5f8931baaac1375edd6336cb1cff2b2d8624bcc8 |
| overlay-rects.csv | 51463 | 5766781e7e497f1672058816a0d5374a6c2b26cff1ece444cfe699b19f2e9d2c |

## Captured clip frames

| Clip | Viewport | Camera | Seconds | Bytes | Sheet SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| idle | 390x844 | near | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 98990 | 75fa8135354c38c934e710a6f797aaa6c7cac1156258a8075cf87807553c45c8 |
| keeper_ready | 390x844 | near | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 109930 | 724f716a490cc4060532a5c56f508a339ec0cdb72098dcd57a45fa871cb3c003 |
| pass_short | 390x844 | near | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 105432 | 9bf7cb9fb926ca6e4154e14eac980ee36ef19ae4e26593b42ccef884560c07a0 |
| pass_long | 390x844 | near | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 104192 | 7b9a0e5ebfd9fddeec6a8e478901287a964f4370405334f52b19e3de17ae6079 |
| pass_loft | 390x844 | near | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 104804 | 2604debc902af5d8052e73c7137ba5cdb70f33753a2de53fba97f385789f0759 |
| shot | 390x844 | near | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 104076 | 2be26cca68e4ae693e6478691cc4d7df000da0e81d5b1346679eb2044f7684a1 |
| receive_chest | 390x844 | near | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 101172 | fefc608bdb758db64c55c4433a37b89d2e452be7ba08d743d6d2a7beea39e539 |
| receive_foot | 390x844 | near | 0.000, 0.109, 0.218, 0.437, 0.588, 0.738, 0.889, 1.040 | 103194 | 0694974334c42d3b57574bec0cb3893a6f3fa5da60cd2cf7a10009660e00d569 |
| first_touch_moving | 390x844 | near | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 111840 | 665c4112a9d7673bb968def3d08fa1d330c4fa1fd9efa84e0c585248740bae6c |
| dribble | 390x844 | near | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 94178 | 949ed86507295898c0fdb7ca76a379c6aa763056abadc3162fbaf189bb4975dd |
| turn_with_ball | 390x844 | near | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 104442 | 642d63f324b99e6c4cb144e03ddbb5d9992daaf082f8028f57058b111450bb23 |
| shield | 390x844 | near | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 102872 | 7738a8043906f307902963cca47efea590ec3d1426d59fbee337d003957f7f0f |
| cut | 390x844 | near | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 100864 | e27cf1717c44b46ad11d01899f0e03da52b16e82dd9c30ac21c2615f42c6cda3 |
| slide | 390x844 | near | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 100968 | f801515af8f4a1a1b2cfa3bbb86ccf40119bac01003828cc328c6109d361b9de |
| keeper_throw | 390x844 | near | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 122486 | 751232b7ab49f469a34362ee977f7a517436a278480df1bee52aeeb19a46f700 |
| block | 390x844 | near | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 107368 | 1af1c9c42b2d89cf9b733c7c66366b375a6e5cb03e2715024cba7a856ccccd7c |
| keeper_dive_low_left | 390x844 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 126852 | ff97bf08db41c0a4daf2e09519ebca4e02791548d3bbce7e09afea2531b52187 |
| keeper_dive_low_center | 390x844 | near | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 125870 | 4b476dd68dee61186a6fda136ca813ebcd7b4d09930151043a709cc0ccfb2e0a |
| keeper_dive_low_right | 390x844 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 126758 | fd903a0c62c429e58b23c923834b094beb2fbf71fcf594b5a8dae3528d12c5a5 |
| keeper_dive_middle_left | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 129780 | 25161519ea66fd43bc03821c0245e3134455a12bcf71c076ece9da202e97e7b0 |
| keeper_dive_middle_center | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 128632 | 6dcb0614385f3af8049cf3ed99207b61b04bf7a8799e181a28da17c52f7ac226 |
| keeper_dive_middle_right | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 129712 | ce5a5d5dba30ddc01b1b9eb07050ec0d16122d2e2e8add0fcf576d7be48fb343 |
| keeper_dive_high_left | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131418 | 0206683fcf109f161d2fbc7aee9dd231227f2ecdf9aeafccf28b479f1c4514bc |
| keeper_dive_high_center | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131998 | 74485b9cd57b2aa72c51ebf2532d59b4210aaa308f3ef56a90c43f5760f715dd |
| keeper_dive_high_right | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 129984 | dd96d6aac2a59d4d508e87b248d8652d1fa6da2d4637068fe26ab63f01b4a794 |
| idle | 390x844 | far | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 90158 | 7b2c8e432a922ffd056ea8567e0f9f1a6f98c293ac07263fd332b2df512f6201 |
| keeper_ready | 390x844 | far | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 108290 | 6450c8a29a0d07be1b1dfca8c7551648bf75a6fe72a6d8cc32014e48c56ef257 |
| pass_short | 390x844 | far | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 98728 | 39b1d10e7e8123a7ddb612904a3309b038ccb50be3bf777f61bfcc5764423af4 |
| pass_long | 390x844 | far | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 98240 | 149af2036d78cdefee8c409a70825eee2ca4e9f2e6caee8b324a137894364269 |
| pass_loft | 390x844 | far | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 97892 | d8cad8aac4af6fd463b8d3a9c6a7e9b1202ca97e8609bfe3c83408b39a1a65b7 |
| shot | 390x844 | far | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 98260 | 4e0888266b1340a86c09ff53139c00279debe4036859523cf1732dc68fe4ac31 |
| receive_chest | 390x844 | far | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 93882 | e821e82417a435dd2056d22249113b6d541eddd49954ef3f5ca6b41baf480ac7 |
| receive_foot | 390x844 | far | 0.000, 0.109, 0.218, 0.437, 0.588, 0.738, 0.889, 1.040 | 96762 | 97e7b5243e199725face1a0699cb1f23aa0e27763f6b3467f47e4bf85b43371e |
| first_touch_moving | 390x844 | far | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 105792 | 21e891672c0f20b762edbce6eb3d6afa104e00a80bcce2e7e13b4255f664937b |
| dribble | 390x844 | far | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 89566 | 77f9a4815a44b06e6e8cfd780de7c568cb95bbd6800d9ba49d31f1a61d2ff91a |
| turn_with_ball | 390x844 | far | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 96438 | 08f9d02f018524d35bb220f7e005d845713393f32278e0dc31f52068fdef1ecb |
| shield | 390x844 | far | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 94802 | 17ab4afae195b0d9875efe33c5e2815c2776f23903f36d928ea538f41b1f532f |
| cut | 390x844 | far | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 95740 | 94f2aaf56ea1e552accfaddca0253153ab6a5db1fa089e05833b27269964d3c6 |
| slide | 390x844 | far | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 97374 | cd3656e8c83a9053d343f7b59172a0304fbe69aa9dcfeb08760cce0487429994 |
| keeper_throw | 390x844 | far | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 121426 | ebf5b4dfe022048289a7cc90481de67de120d32f231aea539bc05b9f83726f26 |
| block | 390x844 | far | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 98842 | aa05d78eaef0266cc9132e823f3bebe1aa042ac28e64a5924b592a9a4ba0a0f9 |
| keeper_dive_low_left | 390x844 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 124058 | d13bda0a9a4cb30bad30eafa2bfd67049e114f2dd3fa794e7a0f45ce4dedcb24 |
| keeper_dive_low_center | 390x844 | far | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 126128 | 9a6d98644c28f81255364bc88e21159b88e53aaf09513f09f80880b8ac7f5d8e |
| keeper_dive_low_right | 390x844 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 124686 | 293ae3fad63a7e9cf295076f4bba3b7a7796f5a2a5a3cbdf2aa637028c5ca074 |
| keeper_dive_middle_left | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 126526 | a4ae9be637588060579f4179b06f67672b08ca19688aba3950fcc8a6b30aabe9 |
| keeper_dive_middle_center | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 129320 | 3772a14cd8771cf3b917a7b3d372a86106a4b8fb3c25647ff9cd6cf77f293b8a |
| keeper_dive_middle_right | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 125878 | a0472aebe99183e260f250d9f7dbcd8eff57d00e43304ab4b4a78dd812419853 |
| keeper_dive_high_left | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 125198 | 2cd6cf8d4041a7084afb80e0aa12c58c0b267194080252e2c0da3e49f89cdb63 |
| keeper_dive_high_center | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 126758 | f7fc862e49ed2139665bdf3ccdb5fb40e3f84eb7595083705d7ec1c8574fd529 |
| keeper_dive_high_right | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 125248 | 35d40d3e87122c3cf4e8c426ade9e2194c6b82d82170d0860d65aa76d9738311 |
| idle | 844x390 | near | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 104486 | a544c87c3ba18a72786cf2fcc14b17813019d29955cbbea3fbe3e5751246ac27 |
| keeper_ready | 844x390 | near | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 123108 | 195f02f62595485aa9793f7d6878dd76ad9442ca194c96593a62a5313705ae56 |
| pass_short | 844x390 | near | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 113364 | 8dbcebbee3c32f964739691547fe1b5d645cc98f85d8943d56e35494c05d4319 |
| pass_long | 844x390 | near | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 111516 | 091b699f5b102422816e28df52b2a32c8477240349b53dfbac6369926925d048 |
| pass_loft | 844x390 | near | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 110992 | 39acfcd3e8360ebb27d4cdc3294de6d61c203081a390225796c27b86c52ea3bd |
| shot | 844x390 | near | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 107360 | 3e723727e6d357f3ded7cf8d8b6498229de46be7755af9970ea6b58dba20da44 |
| receive_chest | 844x390 | near | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 108098 | b0a25a69fc81b1055e2bac26dc8e31f2288e0750126c0e8da91d04a68a2e7ae1 |
| receive_foot | 844x390 | near | 0.000, 0.109, 0.218, 0.437, 0.588, 0.738, 0.889, 1.040 | 110350 | 194ad94f04aebffe6843af1b2d8a192d0618f053f812cb774c966973445df091 |
| first_touch_moving | 844x390 | near | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 117788 | b97dcedf829099502cb7ff369f2a1678cc17e4a9298c5566d6d58d601cc36d56 |
| dribble | 844x390 | near | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 108988 | d119af006e8d5590c4c62ea817c83b4dd37ad7065937e1055b22302b42a8cca3 |
| turn_with_ball | 844x390 | near | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 110900 | c210e43d683b04de88b4e7e8aa606991f4eb0e5de72d102e1f308dc4dd170f3f |
| shield | 844x390 | near | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 105880 | 24e126624efff474f34e8a020d01ecf9dd1a34879698b76c1a1733b1297e0b9f |
| cut | 844x390 | near | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 109032 | 29174b616ffc999e6157e149b95f4c3392f6f9eee225704793fa658380dba3cc |
| slide | 844x390 | near | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 111356 | 3ffd94983a5d55d68d77a5009de71756c049dc18569ae36d8104575f9461096a |
| keeper_throw | 844x390 | near | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 132732 | 3bde64d44c63395f3f2bf7ee5e476604a860f71e3f165797da98a4c6a7d6abf6 |
| block | 844x390 | near | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 113378 | ab55e24f5e13ce24de0a5bdba4644de64eda0212b004eb4adef2f94a7de416e7 |
| keeper_dive_low_left | 844x390 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 142478 | fbdde12b7b6a4c49222bbca435a03e4707d7d6075f0dee074f88a06f48cfeca9 |
| keeper_dive_low_center | 844x390 | near | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 136898 | 34cab344536cfceef15940b029fb9965c672d271a853eddf653f16a89dc71677 |
| keeper_dive_low_right | 844x390 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 137886 | 1b1a318a677715f3c31c0fc67984f42a33a8077b794eeb032fbfe19e66187516 |
| keeper_dive_middle_left | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 149146 | 651045a9332d8c132cbe06b1c20aa1109ad6abacd93fc78c56fa28575555cc10 |
| keeper_dive_middle_center | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 140496 | 91919906941ed4e18e020e9f1445135078016abca7db961b676f9e7c15e1a911 |
| keeper_dive_middle_right | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 139872 | 7212eb10852943424abb08bff740abb74060797c4867d1ed0880d0c7c8763256 |
| keeper_dive_high_left | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 147064 | c5b89498ebbd58e01a8c62f1680c477f668e791160f4caa368217da2f9dc39bf |
| keeper_dive_high_center | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 146960 | 675c0f4c1e96a2f9e885d2b1534ee3d9219306f02a9944c3101d60d77d366b1b |
| keeper_dive_high_right | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 140746 | da0ed0341ec3e5f7c74f6519c058622cfb4b77fef617020f8ea5faefe877f71d |
| idle | 844x390 | far | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 98796 | bf03b9228f8b69c6d4c8ccb04d42901a7f62200440724312217348e5f31788d4 |
| keeper_ready | 844x390 | far | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 124874 | de8d7b46b6960bee6fa47a63d32c122e2ca170a036e47d680c8409969e255e70 |
| pass_short | 844x390 | far | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 108766 | 66fef32c8415d3035bb684116d5fa467a467d1e14e6e5be74ed3a9d29ce64806 |
| pass_long | 844x390 | far | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 106304 | d2d02f58e4d3481c30ed7169556a0e099bff9b9b719f3bd69a1cf3910e1363ea |
| pass_loft | 844x390 | far | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 106132 | ee4826dff0c414252e57dd31304563faf9d0491a53a1c2dd66d8b797801242e0 |
| shot | 844x390 | far | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 103432 | 5789fe0d35fce118f98d0745e12350964beb97a662b016348e374e9530233140 |
| receive_chest | 844x390 | far | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 102922 | b77f7143fff65a1721ccb89ee7358d0b2ae40b73154cef55d12aa820c9fed3a5 |
| receive_foot | 844x390 | far | 0.000, 0.109, 0.218, 0.437, 0.588, 0.738, 0.889, 1.040 | 106000 | 8c5c352263d0f1b72e85ea9df1fa205b84db8d559caffa1c7cdaa030dacc4d42 |
| first_touch_moving | 844x390 | far | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 113118 | 127323dc9d3bac86434e33cdf3b4f7a66f6eb4465838c44171137046e336b373 |
| dribble | 844x390 | far | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 103436 | 5c24430d120492eb564c01709c0030f91deb89271a677db5dd8df78b31ec0135 |
| turn_with_ball | 844x390 | far | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 106060 | a93686551bcb1056ea93880a5b487e85b5ff10658f4ce39076548c550385d4df |
| shield | 844x390 | far | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 102038 | fd1a8387fbd3e26aede36e722608563a87ae749edc98c27c5c5ff0b06c59f114 |
| cut | 844x390 | far | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 104408 | 63cbdc5d56920919a92db3323f574fdd0d45515c46768e10f2d248b25a07fed5 |
| slide | 844x390 | far | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 107134 | 942eca752d5c5532afccdbebfdeb8203da55ec901a6772bb3dbd3a71fad02ee8 |
| keeper_throw | 844x390 | far | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 133598 | fd3f13899ed1fdac489ca481b37197cd2600f31b5ff6b5012122d335afafe20e |
| block | 844x390 | far | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 107094 | 95484ad6dde0145438f3185503eed3e397ba42044cb70245ae9b48adf5c60d4e |
| keeper_dive_low_left | 844x390 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 138144 | 434165067eeedfe88fb06d61cd53093d91b0b2cea768ff02f8af3512d9d37017 |
| keeper_dive_low_center | 844x390 | far | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 139038 | 063676a41dbce97f7310c7f457183499c7f05763c2ee0985e17d5f5baddc23d2 |
| keeper_dive_low_right | 844x390 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 141220 | 4516b2317efe6c34c10c722f772b49d355a408233efb5d6e8f9251e48937d51f |
| keeper_dive_middle_left | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 140964 | a56051f122a364fce0062b8792be658729ed783396ed460d398635147eb62f96 |
| keeper_dive_middle_center | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 139712 | 4c35f0d521a47454375f3784776469fa3c8897e1346569c741451674e314b9a4 |
| keeper_dive_middle_right | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 143808 | f44b863a18141a149d639c1f3f3c7cc073eb407c00284a71d3b887f54a28f092 |
| keeper_dive_high_left | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131546 | 1ae70c62be7b2036d8fc69c54fce81aa563748b783e563e3a65a3e3faab2e36f |
| keeper_dive_high_center | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 132390 | eb4f9bf2b57b4fbb06749894bafdace46bcd8540f553e934fa8f6344b47cecdf |
| keeper_dive_high_right | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 133584 | 4b9406dd59171af525c865b923490d3ded4fbe2301154698974eacdd0cf55a68 |

## Exact inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| preview.css | 19757 | 1b0dd2b68e8d0ddb95301c4e6e534e84a18a27a330a1fce6c75e04c79b6642fa |
| preview.html | 5747 | 0af3599f91c43971b7270e275a15bda142f2408c13b8091cad5e0dff5e949a2e |
| preview.mjs | 28125 | 8702c90f2fcf51d924a0439ee38d6ba5b72abb3ee196a7ac775602023af9c7f7 |
| runtime/LocalDRACOLoader.mjs | 2778 | b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a |
| runtime/catalog.mjs | 75904 | d2864c54984da04c8deb63c8eac5a08c49790a16ff06e1fd1ec5ebfb340196a2 |
| runtime/contact-solver.mjs | 12007 | ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8 |
| runtime/controller.mjs | 15082 | da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0 |
| runtime/draco-worker.js | 6495 | 5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194 |
| runtime/keeper.glb | 948984 | 15af452a5ef3ba7fb80258846dc48d992ad0620181b2aff24c0bf758a9841d6b |
| runtime/player.glb | 821376 | a73b10a80b861a9d5169eff398bab5e79ce82f702546f301cfe41934756657af |
| runtime/vendor/BufferGeometryUtils.js | 31918 | 3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3 |
| runtime/vendor/DRACOLoader.js | 13640 | e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb |
| runtime/vendor/GLTFLoader.js | 108527 | 1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e |
| runtime/vendor/LICENSE.three | 1081 | 852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d |
| runtime/vendor/SkeletonUtils.js | 8019 | 0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d |
| runtime/vendor/draco/LICENSE.draco | 13898 | d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4 |
| runtime/vendor/draco/draco_decoder.wasm | 192420 | a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac |
| runtime/vendor/draco/draco_wasm_wrapper.js | 58456 | 8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6 |
| runtime/vendor/three.module.js | 670681 | 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6 |
| source/build-assets.mjs | 5308 | de467dd26d474c84010f925718dc63c508b954c52185f11e23712391ffaa919d |
| source/calibrate-contacts.mjs | 6942 | 08d7c84e7f6aa8408a81c30dd3f6a7cd4b07e1a27a86576636017f622b386236 |
| source/compact-glb.mjs | 6135 | 3213b716680c4de6e347cf9cc2a73b08e934be3a567628457cb41c11c404ed70 |
| source/motions.mjs | 41690 | 1f63b6ad558263e818c0804f8b1c66aef4ff2bdf370820707e02634fe4e0e33e |
| source/render-review.mjs | 34859 | 0a4a5194942de4fb35bd7372f6cde983f2fec184de54d8d756f25d215b406062 |

Visual scores and corrective decisions belong in review.md after a human/model has inspected the actual images. This runner does not invent scores or visual verdicts.
