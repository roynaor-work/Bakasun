# Browser capture 07

Status: captured. Complete clip matrix requested.
Started UTC: 2026-11-06T10:49:49.223Z. Finished UTC: 2026-11-06T10:52:30.897Z. Elapsed: 161.7 s.
Input SHA-256: `e6b4c6b37af7cf74fe10a01e63d83be6f9143c763ad5f752e7391110831a319b`.
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
| 390x844 | 1 | 0.80/1.30 | 16.70/33.40 | 29.9 |
| 390x844 | 4 | 4.20/12.80 | 16.70/33.40 | 29.9 |
| 844x390 | 1 | 0.80/1.10 | 16.70/33.40 | 29.9 |
| 844x390 | 4 | 4.30/10.30 | 16.70/33.40 | 29.9 |

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
| receive_foot | 0, 0.4368, 0.6168, 1.04 | 4/4 |
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

Measured contact/release point rows: 340. Rows intersecting HUD rectangles: 0. Rows outside the stage: 0. Non-finite projected disk rows: 0. Distinct measured HUD rectangles: 484.
Only exact contact/release cue frames are included. Ball measurements are listed once per cue type at that instant; contacting hand/foot measurements retain their bone. Disk centres and radii use absolute viewport CSS pixels. occluded_by and outside_stage are the preview's measured values; the capture tool assigns no visual score from them.
overlay-rects.csv preserves each distinct actual HUD rectangle per clip/view/camera, including the first cue time at which it was measured.

| Evidence file | Bytes | SHA-256 |
| --- | ---: | --- |
| contact-visibility.csv | 53691 | 5c9cac7558fc0674fcdb67845d5c289943252d548b443bd3e6744d77c3727a2f |
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
| receive_chest | 390x844 | near | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 99314 | 046944c18191a849288fee2877aa834f10e74bb406f86a9bc01033440d3a1591 |
| receive_foot | 390x844 | near | 0.000, 0.109, 0.218, 0.328, 0.437, 0.617, 0.828, 1.040 | 106180 | a30b9dcc0eab9e72988afdbf068c119fc5bebdbbe7f3cfe10005273ce78e6f69 |
| first_touch_moving | 390x844 | near | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 109204 | 93e20f8b2bbcc7f344e95be8127a2b575ccbfe75ce7e5450e20e86b063f1badf |
| dribble | 390x844 | near | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 92404 | adbd117642ce91391e9144258e1813f46413c9d379c2d439141f97244a2a1b03 |
| turn_with_ball | 390x844 | near | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 104410 | 024e54f25e318f95435b6f3465f0bff03799d4a282388d9844d09517be2192d2 |
| shield | 390x844 | near | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 102380 | eb34065b63c9f436d8637317d41e635309b7903e3cfc07d0b7c267fb948c7c26 |
| cut | 390x844 | near | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 101234 | f86ae6a9329a72e85997ca5b67c00d5ffb64d8506dcccd49b68dec95f527b153 |
| slide | 390x844 | near | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 100968 | f801515af8f4a1a1b2cfa3bbb86ccf40119bac01003828cc328c6109d361b9de |
| keeper_throw | 390x844 | near | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 121966 | b6667ee28aa9bb28905825aa8626319f7da49d60413b6eea6a8914ffcbc946bf |
| block | 390x844 | near | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 107368 | 1af1c9c42b2d89cf9b733c7c66366b375a6e5cb03e2715024cba7a856ccccd7c |
| keeper_dive_low_left | 390x844 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 125874 | 732488dbd3e2dfd2981f6f90a6e3a1c146b3c888f0ed426591c16709bdff092e |
| keeper_dive_low_center | 390x844 | near | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 125610 | 9b3785e1373abba20f09863fa40228bb9f6e54d869bebeb74189a243e101abc5 |
| keeper_dive_low_right | 390x844 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 126096 | 87b77028c4c3bd3daa0b5277d3d7d77e4f9396cce3f2515d3932f78957bd3de2 |
| keeper_dive_middle_left | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 129452 | cdd710d6559d675afd890b1bd300ede807838b4a41588db581150eaefe7ffde0 |
| keeper_dive_middle_center | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 127662 | bad05b663ff84b7b9b79aa86cb69ea094df9f71649cacb27fa83b6ce17100f74 |
| keeper_dive_middle_right | 390x844 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 129234 | 7ef33988888649e649f67f75bf9c56720192119300efe3129a9d0f6998493764 |
| keeper_dive_high_left | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131458 | df31d3d4a3ad454c7b53908f328debf3fe14e8a32b269d6a1fd739bd4d1ec308 |
| keeper_dive_high_center | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131808 | 41b4f674376da4c601f3929f20a120b59e57783028227db5b74b8f2dfb3832c0 |
| keeper_dive_high_right | 390x844 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 129588 | 9c32c48345fd815d145a398646cf5a7262d11cd740cf8049b6f7bd375eaf5238 |
| idle | 390x844 | far | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 90158 | 7b2c8e432a922ffd056ea8567e0f9f1a6f98c293ac07263fd332b2df512f6201 |
| keeper_ready | 390x844 | far | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 108290 | 6450c8a29a0d07be1b1dfca8c7551648bf75a6fe72a6d8cc32014e48c56ef257 |
| pass_short | 390x844 | far | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 98728 | 39b1d10e7e8123a7ddb612904a3309b038ccb50be3bf777f61bfcc5764423af4 |
| pass_long | 390x844 | far | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 98240 | 149af2036d78cdefee8c409a70825eee2ca4e9f2e6caee8b324a137894364269 |
| pass_loft | 390x844 | far | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 97892 | d8cad8aac4af6fd463b8d3a9c6a7e9b1202ca97e8609bfe3c83408b39a1a65b7 |
| shot | 390x844 | far | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 98260 | 4e0888266b1340a86c09ff53139c00279debe4036859523cf1732dc68fe4ac31 |
| receive_chest | 390x844 | far | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 93462 | b066bb5fd8703a489bfb582c12cb09ed8ab6b7405a2d0f89c332d9a751adcfdf |
| receive_foot | 390x844 | far | 0.000, 0.109, 0.218, 0.328, 0.437, 0.617, 0.828, 1.040 | 99654 | 9cf1e8fd48e52d9ff9b6ea3a0e41da72d9e836eabafc55201fd61e1828708c80 |
| first_touch_moving | 390x844 | far | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 105298 | cc09d6f9ae75006c4b143e1150d1b280c1eebefe3c91bb23fe1a43d714074333 |
| dribble | 390x844 | far | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 90060 | 71b5aa11a39e4102a9f5fca2801019d948ee9409cc6bd1ba8ad66b03a1245ab7 |
| turn_with_ball | 390x844 | far | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 96068 | b91f746f13531dfad0239ae4a49c3798df2c9ce770380c61e69109addcebaa3b |
| shield | 390x844 | far | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 94748 | 3053d45561732e0e0efb323923d8845cec29009545acf1c522ddba3f0cd6c035 |
| cut | 390x844 | far | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 95556 | 7f2252d22a519638e9f3f255f15558edfb97e40a7fab1abd8bd3cb38f86f7090 |
| slide | 390x844 | far | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 97374 | cd3656e8c83a9053d343f7b59172a0304fbe69aa9dcfeb08760cce0487429994 |
| keeper_throw | 390x844 | far | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 121256 | c7b0f858bda61f113bdd148bf7119900b974f32a29f2140870a284e3900d309c |
| block | 390x844 | far | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 98842 | aa05d78eaef0266cc9132e823f3bebe1aa042ac28e64a5924b592a9a4ba0a0f9 |
| keeper_dive_low_left | 390x844 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 123862 | 446cf29d1e9372980ca6bbc3c0e56bcecf5275b8cec8f2bc8d850fbd854a5c89 |
| keeper_dive_low_center | 390x844 | far | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 125498 | 72cca5e0f44a4e7598fd1aaa5d36b8904c866c8b6e03caed8e0b3904ae1e25b8 |
| keeper_dive_low_right | 390x844 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 124536 | 82058f3586017b81de121c184dff28a4b27adf32cd2a1f36fa6b085cbd78ae0c |
| keeper_dive_middle_left | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 125440 | 252456d60c49c3b5c489f9921afdb14254d58cbbd4388ddb0e6bb845acba33cd |
| keeper_dive_middle_center | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 128822 | 43f4ee24123d9c61ddd199951e5f75d606ab055e253e9c07169d4db9e42d481e |
| keeper_dive_middle_right | 390x844 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 125676 | d8871e9f00e0517805804f7b49a60d080be6366437790b088deddac9973726e0 |
| keeper_dive_high_left | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 125314 | c5bbcb480e233f0a831de6b810e5c6a45f55b4f7ea366650f8af51e5c1fb44e9 |
| keeper_dive_high_center | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 126368 | 1e98f68c1a08b4920d5526113d25fa0fde659c114c106f74d7df500e3da9f055 |
| keeper_dive_high_right | 390x844 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 124900 | ebcc59207bb49e066944b04617a6b9429a5f091274c36ce86f0e85d6d00385c8 |
| idle | 844x390 | near | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 104486 | a544c87c3ba18a72786cf2fcc14b17813019d29955cbbea3fbe3e5751246ac27 |
| keeper_ready | 844x390 | near | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 123108 | 195f02f62595485aa9793f7d6878dd76ad9442ca194c96593a62a5313705ae56 |
| pass_short | 844x390 | near | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 113364 | 8dbcebbee3c32f964739691547fe1b5d645cc98f85d8943d56e35494c05d4319 |
| pass_long | 844x390 | near | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 111516 | 091b699f5b102422816e28df52b2a32c8477240349b53dfbac6369926925d048 |
| pass_loft | 844x390 | near | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 110992 | 39acfcd3e8360ebb27d4cdc3294de6d61c203081a390225796c27b86c52ea3bd |
| shot | 844x390 | near | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 107360 | 3e723727e6d357f3ded7cf8d8b6498229de46be7755af9970ea6b58dba20da44 |
| receive_chest | 844x390 | near | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 107270 | 3a9b0dc90d34d0cbf6b517d98f13829fd261e2bc39e79fcd57bcd5594859e77d |
| receive_foot | 844x390 | near | 0.000, 0.109, 0.218, 0.328, 0.437, 0.617, 0.828, 1.040 | 113556 | 289963d9b80b530843cb6eafb50dfbb2ec744e4ac332007eb6e4052f035f436b |
| first_touch_moving | 844x390 | near | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 117494 | c50891458863fadb7368683508b885033a463591d4621904edb3f59fc6268dc5 |
| dribble | 844x390 | near | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 108452 | 8cdf1247668f0a8fb942939cb87efd01d64e6bad3c1456ef9f10d07eea861341 |
| turn_with_ball | 844x390 | near | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 110694 | db63f53b28b497defca458b972c8da47b833409fb3c463e037e50e1714fbc931 |
| shield | 844x390 | near | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 106136 | 0a49de605da23112b4f571ea8c88b6e6f14482a2462a49bb45eeb0b9519f0929 |
| cut | 844x390 | near | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 108756 | 40b10b4eaf96867f2fe7e3909f5dc534cc8c5c1ea3427aba1ef5c1366fdfc7ab |
| slide | 844x390 | near | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 111356 | 3ffd94983a5d55d68d77a5009de71756c049dc18569ae36d8104575f9461096a |
| keeper_throw | 844x390 | near | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 132194 | 02ebe0300968fa73954a6834d9b5c39f16c4dc65068a4fc607ac485f9b13bb66 |
| block | 844x390 | near | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 113378 | ab55e24f5e13ce24de0a5bdba4644de64eda0212b004eb4adef2f94a7de416e7 |
| keeper_dive_low_left | 844x390 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 142392 | 2f0ef38700bd80495c515a356a3698dd99ef7aee2f144996e4e9291f1ec2dea8 |
| keeper_dive_low_center | 844x390 | near | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 136148 | cae5f85380cbae15ee578705366fe406b724fd98d5b15899e3a65ef23a66b7fd |
| keeper_dive_low_right | 844x390 | near | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 137694 | cc59f7a0a0bc01533bb6e484e2f6eed3358fb4ddf2e41eacc11488de7b1f63a1 |
| keeper_dive_middle_left | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 148542 | c4a2e827099c36abd0420c616ebe513eaebdc7430e8b5c589d8e747b16db0ce3 |
| keeper_dive_middle_center | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 139988 | 8691fdf14f8f53a83cf08beb66f569df995fa5f34a04736322594dd1817be55a |
| keeper_dive_middle_right | 844x390 | near | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 139534 | cf6bb601999a663c172d0df7c88f74f904e73a310263a81aad542b275a164573 |
| keeper_dive_high_left | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 146824 | cd123af27161b050bb65b92910d91c52e0d53ef2887ebd530e5004e133985d49 |
| keeper_dive_high_center | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 146732 | 42b8984ff6743aceb850b7215bb94565bd02b0c1aee95a04c73c40d709665aca |
| keeper_dive_high_right | 844x390 | near | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 140500 | ee8e5e3772f5519d9f080b3a7c331bc91f00a3aa407e52812f3b462f777eed7b |
| idle | 844x390 | far | 0.000, 0.225, 0.450, 0.675, 0.900, 1.125, 1.350, 1.800 | 98796 | bf03b9228f8b69c6d4c8ccb04d42901a7f62200440724312217348e5f31788d4 |
| keeper_ready | 844x390 | far | 0.000, 0.200, 0.400, 0.600, 0.800, 1.000, 1.200, 1.600 | 124874 | de8d7b46b6960bee6fa47a63d32c122e2ca170a036e47d680c8409969e255e70 |
| pass_short | 844x390 | far | 0.000, 0.072, 0.144, 0.288, 0.396, 0.504, 0.612, 0.720 | 108766 | 66fef32c8415d3035bb684116d5fa467a467d1e14e6e5be74ed3a9d29ce64806 |
| pass_long | 844x390 | far | 0.000, 0.117, 0.234, 0.468, 0.611, 0.754, 0.897, 1.040 | 106304 | d2d02f58e4d3481c30ed7169556a0e099bff9b9b719f3bd69a1cf3910e1363ea |
| pass_loft | 844x390 | far | 0.000, 0.120, 0.241, 0.482, 0.641, 0.801, 0.960, 1.120 | 106132 | ee4826dff0c414252e57dd31304563faf9d0491a53a1c2dd66d8b797801242e0 |
| shot | 844x390 | far | 0.000, 0.086, 0.171, 0.342, 0.482, 0.621, 0.760, 0.900 | 103432 | 5789fe0d35fce118f98d0745e12350964beb97a662b016348e374e9530233140 |
| receive_chest | 844x390 | far | 0.000, 0.099, 0.197, 0.395, 0.531, 0.667, 0.804, 0.940 | 103308 | 1ca0135e9180efe985ce5e70c3798db14bf0028e8b9fb7d4a0973582b56973ae |
| receive_foot | 844x390 | far | 0.000, 0.109, 0.218, 0.328, 0.437, 0.617, 0.828, 1.040 | 108928 | 136a8c6c5e768a59c16fec4046288b66bfa71c0e1d1b33a59c3ae5bffda0332b |
| first_touch_moving | 844x390 | far | 0.000, 0.104, 0.209, 0.418, 0.603, 0.789, 0.974, 1.160 | 113540 | 4e57c462229168a0b60b7ab66fa28b6a4d464a347aae41a67d3f8452797efd7d |
| dribble | 844x390 | far | 0.000, 0.150, 0.299, 0.409, 0.519, 0.629, 0.739, 0.880 | 103202 | 41598158b9692e6ade68458d01daeb3872248837cd52f006dd62475a1d769c16 |
| turn_with_ball | 844x390 | far | 0.000, 0.113, 0.226, 0.452, 0.601, 0.751, 0.900, 1.050 | 105756 | e4ec5c30a4438597ed07dadf227ae4534b5864c765ad861315d3aab1c23b080a |
| shield | 844x390 | far | 0.000, 0.165, 0.330, 0.495, 0.660, 0.990, 1.155, 1.320 | 102318 | 0e475ad7648effaeebe35baa7e11697c64a773a60aa519a6e7c00907100d74eb |
| cut | 844x390 | far | 0.000, 0.102, 0.204, 0.408, 0.606, 0.804, 1.002, 1.200 | 104692 | a17fd4c5fda97c3140f2459d10fe352a172bcbeba63262028bb5fd632bc36874 |
| slide | 844x390 | far | 0.000, 0.502, 1.005, 1.139, 1.692, 2.244, 2.797, 3.350 | 107134 | 942eca752d5c5532afccdbebfdeb8203da55ec901a6772bb3dbd3a71fad02ee8 |
| keeper_throw | 844x390 | far | 0.000, 0.270, 0.540, 0.810, 1.080, 1.440, 1.620, 1.800 | 133200 | 6977434920aa7075bab87d692fd5cecc05eb37af0150f373506400d137c36a00 |
| block | 844x390 | far | 0.000, 0.150, 0.299, 0.598, 0.774, 0.949, 1.125, 1.300 | 107094 | 95484ad6dde0145438f3185503eed3e397ba42044cb70245ae9b48adf5c60d4e |
| keeper_dive_low_left | 844x390 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 138274 | b278d03a85ed8d7f21030644fdcc255fa303b7f05a87d8c10020b0349768a510 |
| keeper_dive_low_center | 844x390 | far | 0.000, 0.549, 1.098, 1.342, 1.769, 2.409, 2.730, 3.050 | 139156 | c051b2f4263526ee0b6d200aac6779efda9f52f213c6ae05e8e9133902890e55 |
| keeper_dive_low_right | 844x390 | far | 0.000, 0.396, 0.747, 1.098, 1.342, 1.677, 2.364, 3.050 | 141776 | fd0bbfefc12232c0f73f3841b378747fd6093016ca6fb9dc4f222d1a17606494 |
| keeper_dive_middle_left | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 140574 | 5c3152ffbb0977be525874b94b65b185152b364ed3dd909189bf590954c635cf |
| keeper_dive_middle_center | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.856, 2.528, 3.200 | 140022 | 2cb9ea3e78df7f068090132ba3f743a787e0bc960cd089038bf9f17ba39b1f36 |
| keeper_dive_middle_right | 844x390 | far | 0.000, 0.416, 0.784, 1.152, 1.408, 1.760, 2.480, 3.200 | 143850 | b072dc7272229086cb2c55f0506def76b28e5e56ac43697a22a809968e8c75b4 |
| keeper_dive_high_left | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 131448 | cf9881371cf640ef46f373d61abb488d85f94a3b4d9335e6e641b4d87cd66837 |
| keeper_dive_high_center | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 132512 | 1907d776f33f51ea789244ac74b116ffa7c6fa98a19163081f87221a6da94432 |
| keeper_dive_high_right | 844x390 | far | 0.000, 0.436, 0.821, 1.206, 1.474, 1.843, 2.596, 3.350 | 133636 | 7dab3cea873f70986daf2068caa8419b65f0c281b15daaf2220aadbade1a25e1 |

## Exact inputs

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| preview.css | 19757 | 1b0dd2b68e8d0ddb95301c4e6e534e84a18a27a330a1fce6c75e04c79b6642fa |
| preview.html | 5747 | 0af3599f91c43971b7270e275a15bda142f2408c13b8091cad5e0dff5e949a2e |
| preview.mjs | 31325 | e315e3e64bf18e2a7f8e24c943ad708f9dc4ddde18b4295640aa479b1889aed3 |
| runtime/LocalDRACOLoader.mjs | 2778 | b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a |
| runtime/catalog.mjs | 285494 | fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b |
| runtime/contact-solver.mjs | 12007 | ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8 |
| runtime/controller.mjs | 15082 | da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0 |
| runtime/draco-worker.js | 6495 | 5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194 |
| runtime/keeper.glb | 948984 | 4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42 |
| runtime/player.glb | 821680 | 2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef |
| runtime/vendor/BufferGeometryUtils.js | 31918 | 3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3 |
| runtime/vendor/DRACOLoader.js | 13640 | e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb |
| runtime/vendor/GLTFLoader.js | 108527 | 1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e |
| runtime/vendor/LICENSE.three | 1081 | 852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d |
| runtime/vendor/SkeletonUtils.js | 8019 | 0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d |
| runtime/vendor/draco/LICENSE.draco | 13898 | d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4 |
| runtime/vendor/draco/draco_decoder.wasm | 192420 | a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac |
| runtime/vendor/draco/draco_wasm_wrapper.js | 58456 | 8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6 |
| runtime/vendor/three.module.js | 670681 | 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6 |
| source/bake-held-paths.mjs | 3285 | 732d2c98454fa038e63e85ccc5e7950be643ce0de6b57f199e512aa06808a24f |
| source/build-assets.mjs | 5628 | 9f3b27293f6bac1a3c765510cc906189662dd39a32c8ca850edf854188da12a0 |
| source/calibrate-contacts.mjs | 6942 | 08d7c84e7f6aa8408a81c30dd3f6a7cd4b07e1a27a86576636017f622b386236 |
| source/compact-glb.mjs | 6135 | 3213b716680c4de6e347cf9cc2a73b08e934be3a567628457cb41c11c404ed70 |
| source/motions.mjs | 42857 | 52a8bb5895f0b2a027d394ccfeec4ba4c0cef3cd2cb15d041d359d4102c516d1 |
| source/render-review.mjs | 34859 | 0a4a5194942de4fb35bd7372f6cde983f2fec184de54d8d756f25d215b406062 |

Visual scores and corrective decisions belong in review.md after a human/model has inspected the actual images. This runner does not invent scores or visual verdicts.
