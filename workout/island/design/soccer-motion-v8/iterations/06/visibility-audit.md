# Actual contact geometry and HUD visibility

Result: **PASS**. 268/268 actual mesh checks clear; 100 clip/view/camera combinations; 25 native clips loaded.

Started: 2026-11-06T10:27:59.793Z. Finished: 2026-11-06T10:28:11.817Z. Chromium 151.0.7922.173.
Inputs unchanged during the run: yes. Input fingerprint: `5ca961cda686501d8b5e91f8ab75c569c732af1371e495b9662d9e1588059a65`.

The audit samples every unique contact/release time at 390×844 and 844×390, near and far. It projects the real merged ball vertices and skinned vertices with at least 0.5 weight on the contacting bone. Chest/head checks use the actual weighted surface within 0.18 m of the cue; hand/foot checks use the whole weighted effector. It compares their projected bounds with the live camera switch, title, index, subtitle, orbit hint and stage label DOM rectangles. Coordinates and clearance are CSS pixels. Ball flight after release is excluded. This is a software-rendered visibility check, not a phone FPS measurement.

Re-run with `node verification/visibility-browser.mjs`; optionally set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`, or pass `--out report.md`.

| Clip | View | Camera | Time s | Cues | Mesh | Vertices | Bounds x0,y0,x1,y1 | HUD clearance px | Result |
| --- | --- | --- | ---: | --- | --- | ---: | --- | ---: | --- |
| pass_short | 390x844 | near | 0.288000 | contact+release | ball | 690 | 177.2, 528.4, 210.4, 562.4 | 8.31 | PASS |
| pass_short | 390x844 | near | 0.288000 | contact+release | RightFoot | 169 | 162.4, 527.7, 190.3, 550.9 | 24.80 | PASS |
| pass_short | 390x844 | far | 0.288000 | contact+release | ball | 690 | 183.0, 500.4, 205.3, 523.2 | 47.47 | PASS |
| pass_short | 390x844 | far | 0.288000 | contact+release | RightFoot | 169 | 173.1, 501.0, 191.8, 515.7 | 56.61 | PASS |
| pass_long | 390x844 | near | 0.468000 | contact+release | ball | 690 | 228.2, 528.5, 261.3, 561.7 | 8.99 | PASS |
| pass_long | 390x844 | near | 0.468000 | contact+release | RightFoot | 169 | 189.5, 530.4, 230.7, 549.6 | 21.07 | PASS |
| pass_long | 390x844 | far | 0.468000 | contact+release | ball | 690 | 218.0, 502.2, 240.9, 525.3 | 45.43 | PASS |
| pass_long | 390x844 | far | 0.468000 | contact+release | RightFoot | 169 | 191.1, 504.3, 219.8, 517.2 | 53.55 | PASS |
| pass_loft | 390x844 | near | 0.481600 | contact+release | ball | 690 | 221.4, 528.6, 255.9, 563.3 | 7.43 | PASS |
| pass_loft | 390x844 | near | 0.481600 | contact+release | RightFoot | 169 | 178.2, 534.4, 223.7, 551.4 | 19.29 | PASS |
| pass_loft | 390x844 | far | 0.481600 | contact+release | ball | 690 | 212.2, 498.9, 234.7, 521.5 | 49.22 | PASS |
| pass_loft | 390x844 | far | 0.481600 | contact+release | RightFoot | 169 | 184.0, 503.2, 213.8, 513.9 | 56.76 | PASS |
| shot | 390x844 | near | 0.342000 | contact+release | ball | 690 | 236.4, 528.5, 269.6, 561.7 | 8.96 | PASS |
| shot | 390x844 | near | 0.342000 | contact+release | RightFoot | 169 | 196.2, 531.1, 238.3, 550.0 | 20.75 | PASS |
| shot | 390x844 | far | 0.342000 | contact+release | ball | 690 | 223.8, 502.4, 246.6, 525.1 | 45.56 | PASS |
| shot | 390x844 | far | 0.342000 | contact+release | RightFoot | 169 | 195.9, 504.8, 225.1, 517.3 | 53.36 | PASS |
| receive_chest | 390x844 | near | 0.394800 | contact | ball | 690 | 186.8, 340.4, 223.3, 376.5 | 80.77 | PASS |
| receive_chest | 390x844 | near | 0.394800 | contact | Chest | 189 | 170.6, 353.8, 209.5, 390.0 | 73.17 | PASS |
| receive_chest | 390x844 | far | 0.394800 | contact | ball | 690 | 189.8, 377.1, 213.2, 400.2 | 102.72 | PASS |
| receive_chest | 390x844 | far | 0.394800 | contact | Chest | 189 | 179.3, 384.8, 204.5, 408.7 | 100.60 | PASS |
| receive_foot | 390x844 | near | 0.436800 | contact | ball | 690 | 214.0, 525.8, 247.4, 560.2 | 10.45 | PASS |
| receive_foot | 390x844 | near | 0.436800 | contact | RightFoot | 169 | 177.3, 529.1, 221.2, 546.8 | 23.89 | PASS |
| receive_foot | 390x844 | far | 0.436800 | contact | ball | 690 | 207.7, 498.8, 230.2, 521.8 | 48.88 | PASS |
| receive_foot | 390x844 | far | 0.436800 | contact | RightFoot | 169 | 183.0, 501.8, 212.7, 513.4 | 57.35 | PASS |
| first_touch_moving | 390x844 | near | 0.417600 | contact+release | ball | 690 | 211.5, 527.2, 244.7, 561.2 | 9.54 | PASS |
| first_touch_moving | 390x844 | near | 0.417600 | contact+release | RightFoot | 169 | 180.0, 525.5, 216.3, 546.3 | 24.38 | PASS |
| first_touch_moving | 390x844 | far | 0.417600 | contact+release | ball | 690 | 206.4, 501.4, 229.5, 524.8 | 45.87 | PASS |
| first_touch_moving | 390x844 | far | 0.417600 | contact+release | RightFoot | 169 | 184.4, 501.2, 209.9, 515.1 | 55.58 | PASS |
| dribble | 390x844 | near | 0.299200 | contact | ball | 690 | 186.0, 511.3, 213.9, 539.2 | 47.75 | PASS |
| dribble | 390x844 | near | 0.299200 | contact | RightFoot | 169 | 168.6, 508.7, 194.0, 526.6 | 71.12 | PASS |
| dribble | 390x844 | near | 0.739200 | contact | ball | 690 | 270.2, 531.7, 300.9, 562.2 | 8.50 | PASS |
| dribble | 390x844 | near | 0.739200 | contact | LeftFoot | 168 | 246.5, 527.8, 276.9, 548.0 | 22.70 | PASS |
| dribble | 390x844 | far | 0.299200 | contact | ball | 690 | 187.6, 499.6, 210.7, 522.7 | 61.95 | PASS |
| dribble | 390x844 | far | 0.299200 | contact | RightFoot | 169 | 172.9, 498.1, 194.2, 512.6 | 80.44 | PASS |
| dribble | 390x844 | far | 0.739200 | contact | ball | 690 | 256.3, 515.1, 281.3, 539.8 | 30.87 | PASS |
| dribble | 390x844 | far | 0.739200 | contact | LeftFoot | 168 | 237.4, 512.8, 262.0, 528.9 | 41.83 | PASS |
| turn_with_ball | 390x844 | near | 0.451500 | contact | ball | 690 | 188.9, 521.7, 223.0, 556.0 | 14.66 | PASS |
| turn_with_ball | 390x844 | near | 0.451500 | contact | RightFoot | 169 | 174.0, 530.9, 193.0, 556.4 | 15.10 | PASS |
| turn_with_ball | 390x844 | far | 0.451500 | contact | ball | 690 | 191.0, 495.0, 213.4, 517.5 | 53.21 | PASS |
| turn_with_ball | 390x844 | far | 0.451500 | contact | RightFoot | 169 | 181.2, 501.2, 193.7, 516.6 | 54.27 | PASS |
| cut | 390x844 | near | 0.408000 | contact+release | ball | 690 | 171.9, 530.5, 204.8, 563.3 | 7.38 | PASS |
| cut | 390x844 | near | 0.408000 | contact+release | RightFoot | 169 | 158.8, 533.2, 174.5, 556.5 | 21.08 | PASS |
| cut | 390x844 | far | 0.408000 | contact+release | ball | 690 | 178.0, 507.4, 202.2, 531.4 | 39.27 | PASS |
| cut | 390x844 | far | 0.408000 | contact+release | RightFoot | 169 | 168.3, 510.2, 179.7, 526.4 | 45.51 | PASS |
| slide | 390x844 | near | 1.005000 | contact+release | ball | 690 | 275.0, 524.1, 307.2, 555.4 | 15.32 | PASS |
| slide | 390x844 | near | 1.005000 | contact+release | RightFoot | 169 | 238.5, 528.2, 277.4, 546.7 | 24.04 | PASS |
| slide | 390x844 | far | 1.005000 | contact+release | ball | 690 | 254.6, 503.4, 278.3, 526.5 | 44.23 | PASS |
| slide | 390x844 | far | 1.005000 | contact+release | RightFoot | 169 | 227.7, 507.2, 256.5, 520.4 | 50.29 | PASS |
| block | 390x844 | near | 0.598000 | contact+release | ball | 690 | 222.4, 365.3, 257.4, 400.8 | 90.28 | PASS |
| block | 390x844 | near | 0.598000 | contact+release | Chest | 131 | 200.7, 364.5, 230.0, 401.9 | 104.16 | PASS |
| block | 390x844 | far | 0.598000 | contact+release | ball | 690 | 212.8, 392.8, 235.5, 415.6 | 125.32 | PASS |
| block | 390x844 | far | 0.598000 | contact+release | Chest | 131 | 198.7, 391.9, 218.0, 416.2 | 119.30 | PASS |
| keeper_throw | 390x844 | near | 0.000000 | contact | ball | 690 | 167.4, 379.9, 204.9, 417.2 | 84.62 | PASS |
| keeper_throw | 390x844 | near | 0.000000 | contact | LeftHand | 86 | 203.3, 388.4, 217.7, 418.1 | 116.50 | PASS |
| keeper_throw | 390x844 | near | 0.000000 | contact | RightHand | 84 | 153.7, 386.5, 174.8, 415.4 | 81.88 | PASS |
| keeper_throw | 390x844 | near | 1.080000 | release | ball | 690 | 142.8, 307.7, 182.5, 347.8 | 30.82 | PASS |
| keeper_throw | 390x844 | near | 1.080000 | release | RightHand | 84 | 167.7, 318.5, 180.2, 349.0 | 55.77 | PASS |
| keeper_throw | 390x844 | far | 0.000000 | contact | ball | 690 | 177.4, 403.7, 201.3, 427.5 | 109.34 | PASS |
| keeper_throw | 390x844 | far | 0.000000 | contact | LeftHand | 86 | 200.3, 409.2, 209.4, 428.1 | 128.38 | PASS |
| keeper_throw | 390x844 | far | 0.000000 | contact | RightHand | 84 | 168.4, 407.7, 182.0, 426.3 | 107.69 | PASS |
| keeper_throw | 390x844 | far | 1.080000 | release | ball | 690 | 162.7, 360.2, 187.3, 384.8 | 67.26 | PASS |
| keeper_throw | 390x844 | far | 1.080000 | release | RightHand | 84 | 177.8, 365.8, 185.8, 384.7 | 82.53 | PASS |
| keeper_dive_low_left | 390x844 | near | 1.098000 | contact | ball | 690 | 290.9, 499.7, 321.9, 530.7 | 40.01 | PASS |
| keeper_dive_low_left | 390x844 | near | 1.098000 | contact | LeftHand | 86 | 281.1, 501.1, 292.5, 524.0 | 46.74 | PASS |
| keeper_dive_low_left | 390x844 | near | 1.342000 | release | ball | 690 | 290.4, 505.2, 321.7, 536.1 | 34.62 | PASS |
| keeper_dive_low_left | 390x844 | near | 1.342000 | release | LeftHand | 86 | 281.0, 506.4, 292.3, 529.1 | 41.59 | PASS |
| keeper_dive_low_left | 390x844 | far | 1.098000 | contact | ball | 690 | 256.2, 480.2, 275.9, 499.9 | 70.82 | PASS |
| keeper_dive_low_left | 390x844 | far | 1.098000 | contact | LeftHand | 86 | 250.5, 481.3, 257.4, 496.0 | 74.74 | PASS |
| keeper_dive_low_left | 390x844 | far | 1.342000 | release | ball | 690 | 255.9, 483.7, 275.6, 503.3 | 67.37 | PASS |
| keeper_dive_low_left | 390x844 | far | 1.342000 | release | LeftHand | 86 | 250.4, 484.7, 257.3, 499.3 | 71.39 | PASS |
| keeper_dive_low_center | 390x844 | near | 1.098000 | contact | ball | 690 | 153.8, 508.0, 191.1, 545.7 | 25.00 | PASS |
| keeper_dive_low_center | 390x844 | near | 1.098000 | contact | LeftHand | 86 | 176.5, 508.5, 198.9, 535.9 | 34.78 | PASS |
| keeper_dive_low_center | 390x844 | near | 1.342000 | release | ball | 690 | 151.3, 516.8, 189.2, 554.5 | 16.25 | PASS |
| keeper_dive_low_center | 390x844 | near | 1.342000 | release | LeftHand | 86 | 175.1, 516.7, 197.5, 544.2 | 26.49 | PASS |
| keeper_dive_low_center | 390x844 | far | 1.098000 | contact | ball | 690 | 168.6, 485.5, 192.5, 509.5 | 61.20 | PASS |
| keeper_dive_low_center | 390x844 | far | 1.098000 | contact | LeftHand | 86 | 183.1, 486.2, 197.5, 504.1 | 66.58 | PASS |
| keeper_dive_low_center | 390x844 | far | 1.342000 | release | ball | 690 | 167.2, 491.0, 191.3, 515.0 | 55.69 | PASS |
| keeper_dive_low_center | 390x844 | far | 1.342000 | release | LeftHand | 86 | 182.1, 491.4, 196.6, 509.4 | 61.31 | PASS |
| keeper_dive_low_right | 390x844 | near | 1.098000 | contact | ball | 690 | 70.3, 476.6, 97.9, 503.9 | 68.96 | PASS |
| keeper_dive_low_right | 390x844 | near | 1.098000 | contact | RightHand | 84 | 94.7, 481.5, 110.3, 501.4 | 69.45 | PASS |
| keeper_dive_low_right | 390x844 | near | 1.342000 | release | ball | 690 | 70.2, 481.5, 97.9, 508.7 | 64.34 | PASS |
| keeper_dive_low_right | 390x844 | near | 1.342000 | release | RightHand | 84 | 94.9, 486.3, 110.4, 506.1 | 64.81 | PASS |
| keeper_dive_low_right | 390x844 | far | 1.098000 | contact | ball | 690 | 112.2, 466.7, 130.4, 484.8 | 85.86 | PASS |
| keeper_dive_low_right | 390x844 | far | 1.098000 | contact | RightHand | 84 | 128.5, 469.9, 138.5, 483.3 | 87.43 | PASS |
| keeper_dive_low_right | 390x844 | far | 1.342000 | release | ball | 690 | 111.9, 470.0, 130.3, 488.0 | 82.67 | PASS |
| keeper_dive_low_right | 390x844 | far | 1.342000 | release | RightHand | 84 | 128.6, 473.2, 138.6, 486.4 | 84.30 | PASS |
| keeper_dive_middle_left | 390x844 | near | 1.152000 | contact | ball | 690 | 291.1, 387.2, 321.6, 417.4 | 91.19 | PASS |
| keeper_dive_middle_left | 390x844 | near | 1.152000 | contact | LeftHand | 86 | 283.0, 392.9, 293.3, 417.0 | 97.94 | PASS |
| keeper_dive_middle_left | 390x844 | near | 1.408000 | release | ball | 690 | 283.3, 408.5, 313.7, 438.2 | 112.55 | PASS |
| keeper_dive_middle_left | 390x844 | near | 1.408000 | release | LeftHand | 86 | 275.9, 414.1, 286.0, 437.3 | 119.99 | PASS |
| keeper_dive_middle_left | 390x844 | far | 1.152000 | contact | ball | 690 | 255.4, 409.0, 274.4, 427.9 | 117.63 | PASS |
| keeper_dive_middle_left | 390x844 | far | 1.152000 | contact | LeftHand | 86 | 250.8, 412.4, 257.1, 427.5 | 126.73 | PASS |
| keeper_dive_middle_left | 390x844 | far | 1.408000 | release | ball | 690 | 250.8, 422.2, 270.0, 440.9 | 129.75 | PASS |
| keeper_dive_middle_left | 390x844 | far | 1.408000 | release | LeftHand | 86 | 246.7, 425.6, 252.9, 440.4 | 130.29 | PASS |
| keeper_dive_middle_center | 390x844 | near | 1.152000 | contact | ball | 690 | 141.5, 367.1, 181.8, 408.0 | 58.95 | PASS |
| keeper_dive_middle_center | 390x844 | near | 1.152000 | contact | LeftHand | 86 | 166.0, 374.8, 189.8, 406.2 | 79.84 | PASS |
| keeper_dive_middle_center | 390x844 | near | 1.408000 | release | ball | 690 | 127.3, 430.4, 170.2, 472.3 | 98.35 | PASS |
| keeper_dive_middle_center | 390x844 | near | 1.408000 | release | LeftHand | 86 | 154.2, 436.4, 178.6, 468.2 | 102.47 | PASS |
| keeper_dive_middle_center | 390x844 | far | 1.152000 | contact | ball | 690 | 161.9, 396.8, 186.9, 422.0 | 95.01 | PASS |
| keeper_dive_middle_center | 390x844 | far | 1.152000 | contact | LeftHand | 86 | 176.9, 401.2, 191.7, 420.7 | 107.05 | PASS |
| keeper_dive_middle_center | 390x844 | far | 1.408000 | release | ball | 690 | 153.5, 435.9, 179.8, 461.6 | 109.14 | PASS |
| keeper_dive_middle_center | 390x844 | far | 1.408000 | release | LeftHand | 86 | 169.6, 439.6, 184.8, 459.4 | 111.34 | PASS |
| keeper_dive_middle_right | 390x844 | near | 1.152000 | contact | ball | 690 | 70.3, 377.1, 97.3, 403.8 | 61.06 | PASS |
| keeper_dive_middle_right | 390x844 | near | 1.152000 | contact | RightHand | 84 | 93.4, 383.9, 108.0, 405.1 | 67.93 | PASS |
| keeper_dive_middle_right | 390x844 | near | 1.408000 | release | ball | 690 | 79.5, 396.8, 106.6, 423.2 | 80.83 | PASS |
| keeper_dive_middle_right | 390x844 | near | 1.408000 | release | RightHand | 84 | 102.9, 403.8, 117.1, 424.4 | 87.83 | PASS |
| keeper_dive_middle_right | 390x844 | far | 1.152000 | contact | ball | 690 | 113.3, 401.0, 130.8, 418.5 | 85.01 | PASS |
| keeper_dive_middle_right | 390x844 | far | 1.152000 | contact | RightHand | 84 | 128.5, 405.5, 137.7, 419.3 | 90.99 | PASS |
| keeper_dive_middle_right | 390x844 | far | 1.408000 | release | ball | 690 | 118.9, 413.8, 136.7, 431.2 | 98.08 | PASS |
| keeper_dive_middle_right | 390x844 | far | 1.408000 | release | RightHand | 84 | 134.4, 418.5, 143.6, 432.0 | 104.89 | PASS |
| keeper_dive_high_left | 390x844 | near | 1.206000 | contact | ball | 690 | 296.9, 303.7, 328.0, 335.4 | 7.69 | PASS |
| keeper_dive_high_left | 390x844 | near | 1.206000 | contact | LeftHand | 86 | 290.2, 320.9, 304.9, 344.4 | 24.99 | PASS |
| keeper_dive_high_left | 390x844 | near | 1.474000 | release | ball | 690 | 284.3, 364.9, 315.2, 394.8 | 68.92 | PASS |
| keeper_dive_high_left | 390x844 | near | 1.474000 | release | LeftHand | 86 | 278.9, 380.5, 292.8, 402.3 | 85.73 | PASS |
| keeper_dive_high_left | 390x844 | far | 1.206000 | contact | ball | 690 | 258.4, 357.6, 277.6, 377.0 | 68.36 | PASS |
| keeper_dive_high_left | 390x844 | far | 1.206000 | contact | LeftHand | 86 | 254.6, 367.6, 263.5, 382.1 | 83.89 | PASS |
| keeper_dive_high_left | 390x844 | far | 1.474000 | release | ball | 690 | 251.4, 394.7, 270.8, 413.5 | 105.24 | PASS |
| keeper_dive_high_left | 390x844 | far | 1.474000 | release | LeftHand | 86 | 248.4, 404.3, 256.9, 418.1 | 119.41 | PASS |
| keeper_dive_high_center | 390x844 | near | 1.206000 | contact | ball | 690 | 169.0, 293.9, 200.2, 325.8 | 57.04 | PASS |
| keeper_dive_high_center | 390x844 | near | 1.206000 | contact | LeftHand | 86 | 183.2, 317.8, 205.1, 339.2 | 71.19 | PASS |
| keeper_dive_high_center | 390x844 | near | 1.474000 | release | ball | 690 | 170.3, 305.5, 201.9, 336.7 | 58.26 | PASS |
| keeper_dive_high_center | 390x844 | near | 1.474000 | release | LeftHand | 86 | 185.0, 328.9, 206.5, 350.0 | 74.13 | PASS |
| keeper_dive_high_center | 390x844 | far | 1.206000 | contact | ball | 690 | 178.6, 349.9, 198.3, 369.9 | 74.76 | PASS |
| keeper_dive_high_center | 390x844 | far | 1.206000 | contact | LeftHand | 86 | 187.5, 364.6, 201.4, 378.2 | 89.76 | PASS |
| keeper_dive_high_center | 390x844 | far | 1.474000 | release | ball | 690 | 179.3, 356.9, 199.4, 376.6 | 78.74 | PASS |
| keeper_dive_high_center | 390x844 | far | 1.474000 | release | LeftHand | 86 | 188.6, 371.4, 202.3, 384.9 | 94.54 | PASS |
| keeper_dive_high_right | 390x844 | near | 1.206000 | contact | ball | 690 | 86.2, 326.4, 109.2, 349.6 | 10.41 | PASS |
| keeper_dive_high_right | 390x844 | near | 1.206000 | contact | RightHand | 84 | 101.9, 339.5, 114.8, 356.6 | 23.50 | PASS |
| keeper_dive_high_right | 390x844 | near | 1.474000 | release | ball | 690 | 99.6, 371.9, 122.3, 394.3 | 55.90 | PASS |
| keeper_dive_high_right | 390x844 | near | 1.474000 | release | RightHand | 84 | 115.4, 384.9, 128.1, 401.0 | 68.98 | PASS |
| keeper_dive_high_right | 390x844 | far | 1.206000 | contact | ball | 690 | 110.7, 353.6, 128.5, 371.4 | 37.56 | PASS |
| keeper_dive_high_right | 390x844 | far | 1.206000 | contact | RightHand | 84 | 122.9, 363.6, 132.9, 376.8 | 48.85 | PASS |
| keeper_dive_high_right | 390x844 | far | 1.474000 | release | ball | 690 | 120.7, 388.5, 138.4, 405.9 | 72.99 | PASS |
| keeper_dive_high_right | 390x844 | far | 1.474000 | release | RightHand | 84 | 133.0, 398.6, 142.9, 411.1 | 85.19 | PASS |
| pass_short | 844x390 | near | 0.288000 | contact+release | ball | 690 | 304.1, 214.0, 324.4, 234.8 | 150.40 | PASS |
| pass_short | 844x390 | near | 0.288000 | contact+release | RightFoot | 169 | 295.0, 213.5, 312.1, 227.8 | 162.67 | PASS |
| pass_short | 844x390 | far | 0.288000 | contact+release | ball | 690 | 307.9, 195.7, 321.1, 209.2 | 154.37 | PASS |
| pass_short | 844x390 | far | 0.288000 | contact+release | RightFoot | 169 | 302.0, 196.0, 313.1, 204.7 | 162.77 | PASS |
| pass_long | 844x390 | near | 0.468000 | contact+release | ball | 690 | 336.1, 216.0, 357.1, 237.1 | 112.86 | PASS |
| pass_long | 844x390 | near | 0.468000 | contact+release | RightFoot | 169 | 311.5, 217.0, 337.7, 229.4 | 132.28 | PASS |
| pass_long | 844x390 | far | 0.468000 | contact+release | ball | 690 | 328.6, 196.7, 342.1, 210.4 | 128.46 | PASS |
| pass_long | 844x390 | far | 0.468000 | contact+release | RightFoot | 169 | 312.7, 198.0, 329.7, 205.6 | 141.37 | PASS |
| pass_loft | 844x390 | near | 0.481600 | contact+release | ball | 690 | 330.6, 212.4, 351.0, 232.8 | 119.85 | PASS |
| pass_loft | 844x390 | near | 0.481600 | contact+release | RightFoot | 169 | 305.1, 215.8, 332.0, 225.8 | 138.91 | PASS |
| pass_loft | 844x390 | far | 0.481600 | contact+release | ball | 690 | 325.2, 194.8, 338.5, 208.1 | 133.30 | PASS |
| pass_loft | 844x390 | far | 0.481600 | contact+release | RightFoot | 169 | 308.5, 197.3, 326.1, 203.7 | 146.10 | PASS |
| shot | 844x390 | near | 0.342000 | contact+release | ball | 690 | 341.3, 216.0, 362.4, 237.1 | 111.88 | PASS |
| shot | 844x390 | near | 0.342000 | contact+release | RightFoot | 169 | 315.8, 217.5, 342.5, 229.6 | 131.76 | PASS |
| shot | 844x390 | far | 0.342000 | contact+release | ball | 690 | 332.0, 196.8, 345.5, 210.3 | 129.35 | PASS |
| shot | 844x390 | far | 0.342000 | contact+release | RightFoot | 169 | 315.5, 198.2, 332.8, 205.7 | 142.52 | PASS |
| receive_chest | 844x390 | near | 0.394800 | contact | ball | 690 | 310.2, 101.0, 331.7, 122.4 | 183.10 | PASS |
| receive_chest | 844x390 | near | 0.394800 | contact | Chest | 189 | 300.6, 108.9, 323.6, 130.4 | 185.84 | PASS |
| receive_chest | 844x390 | far | 0.394800 | contact | ball | 690 | 311.9, 122.7, 325.7, 136.4 | 180.98 | PASS |
| receive_chest | 844x390 | far | 0.394800 | contact | Chest | 189 | 305.7, 127.3, 320.6, 141.4 | 183.20 | PASS |
| receive_foot | 844x390 | near | 0.436800 | contact | ball | 690 | 326.6, 212.4, 347.1, 233.5 | 103.48 | PASS |
| receive_foot | 844x390 | near | 0.436800 | contact | RightFoot | 169 | 304.1, 214.3, 331.0, 225.2 | 119.55 | PASS |
| receive_foot | 844x390 | far | 0.436800 | contact | ball | 690 | 322.5, 194.7, 335.8, 208.3 | 115.72 | PASS |
| receive_foot | 844x390 | far | 0.436800 | contact | RightFoot | 169 | 307.9, 196.5, 325.5, 203.3 | 126.66 | PASS |
| first_touch_moving | 844x390 | near | 0.417600 | contact+release | ball | 690 | 325.5, 215.1, 346.5, 236.7 | 83.64 | PASS |
| first_touch_moving | 844x390 | near | 0.417600 | contact+release | RightFoot | 169 | 305.5, 213.8, 328.5, 227.2 | 101.67 | PASS |
| first_touch_moving | 844x390 | far | 0.417600 | contact+release | ball | 690 | 321.8, 196.3, 335.4, 210.1 | 95.71 | PASS |
| first_touch_moving | 844x390 | far | 0.417600 | contact+release | RightFoot | 169 | 308.8, 196.2, 323.8, 204.4 | 108.08 | PASS |
| dribble | 844x390 | near | 0.299200 | contact | ball | 690 | 308.2, 213.2, 329.3, 234.5 | 174.79 | PASS |
| dribble | 844x390 | near | 0.299200 | contact | RightFoot | 169 | 295.3, 210.5, 314.3, 224.4 | 189.80 | PASS |
| dribble | 844x390 | near | 0.739200 | contact | ball | 690 | 373.2, 230.7, 397.2, 254.7 | 106.88 | PASS |
| dribble | 844x390 | near | 0.739200 | contact | LeftFoot | 168 | 354.2, 226.4, 378.0, 242.8 | 126.05 | PASS |
| dribble | 844x390 | far | 0.299200 | contact | ball | 690 | 310.6, 195.2, 324.3, 208.8 | 180.40 | PASS |
| dribble | 844x390 | far | 0.299200 | contact | RightFoot | 169 | 301.9, 194.3, 314.5, 202.9 | 190.65 | PASS |
| dribble | 844x390 | far | 0.739200 | contact | ball | 690 | 351.3, 204.4, 366.0, 219.0 | 138.10 | PASS |
| dribble | 844x390 | far | 0.739200 | contact | LeftFoot | 168 | 340.1, 203.0, 354.7, 212.5 | 149.81 | PASS |
| turn_with_ball | 844x390 | near | 0.451500 | contact | ball | 690 | 311.4, 208.3, 331.5, 228.6 | 137.60 | PASS |
| turn_with_ball | 844x390 | near | 0.451500 | contact | RightFoot | 169 | 302.6, 213.7, 313.8, 228.8 | 155.33 | PASS |
| turn_with_ball | 844x390 | far | 0.451500 | contact | ball | 690 | 312.6, 192.5, 325.9, 205.8 | 144.32 | PASS |
| turn_with_ball | 844x390 | far | 0.451500 | contact | RightFoot | 169 | 306.8, 196.2, 314.2, 205.2 | 155.96 | PASS |
| cut | 844x390 | near | 0.408000 | contact+release | ball | 690 | 299.1, 221.7, 321.7, 244.3 | 140.99 | PASS |
| cut | 844x390 | near | 0.408000 | contact+release | RightFoot | 169 | 290.2, 223.2, 301.0, 239.8 | 161.67 | PASS |
| cut | 844x390 | far | 0.408000 | contact+release | ball | 690 | 304.9, 199.8, 319.3, 214.0 | 143.73 | PASS |
| cut | 844x390 | far | 0.408000 | contact+release | RightFoot | 169 | 299.2, 201.4, 306.0, 211.0 | 157.20 | PASS |
| slide | 844x390 | near | 1.005000 | contact+release | ball | 690 | 369.7, 217.2, 391.9, 238.7 | 67.03 | PASS |
| slide | 844x390 | near | 1.005000 | contact+release | RightFoot | 169 | 344.6, 219.7, 371.3, 232.5 | 87.64 | PASS |
| slide | 844x390 | far | 1.005000 | contact+release | ball | 690 | 350.3, 197.4, 364.3, 211.1 | 95.43 | PASS |
| slide | 844x390 | far | 1.005000 | contact+release | RightFoot | 169 | 334.3, 199.7, 351.4, 207.5 | 108.69 | PASS |
| block | 844x390 | near | 0.598000 | contact+release | ball | 690 | 331.2, 115.7, 351.9, 136.7 | 146.16 | PASS |
| block | 844x390 | near | 0.598000 | contact+release | Chest | 131 | 318.4, 115.3, 335.7, 137.4 | 159.16 | PASS |
| block | 844x390 | far | 0.598000 | contact+release | ball | 690 | 325.5, 132.0, 339.0, 145.5 | 152.12 | PASS |
| block | 844x390 | far | 0.598000 | contact+release | Chest | 131 | 317.2, 131.5, 328.6, 145.9 | 160.93 | PASS |
| keeper_throw | 844x390 | near | 0.000000 | contact | ball | 690 | 298.5, 122.0, 320.9, 144.4 | 116.82 | PASS |
| keeper_throw | 844x390 | near | 0.000000 | contact | LeftHand | 86 | 320.0, 127.1, 328.6, 144.9 | 110.88 | PASS |
| keeper_throw | 844x390 | near | 0.000000 | contact | RightHand | 84 | 290.2, 125.9, 302.9, 143.3 | 131.36 | PASS |
| keeper_throw | 844x390 | near | 1.080000 | release | ball | 690 | 283.7, 78.6, 307.5, 102.7 | 156.38 | PASS |
| keeper_throw | 844x390 | near | 1.080000 | release | RightHand | 84 | 298.6, 85.1, 306.1, 103.4 | 156.71 | PASS |
| keeper_throw | 844x390 | far | 0.000000 | contact | ball | 690 | 304.4, 136.3, 318.8, 150.6 | 114.37 | PASS |
| keeper_throw | 844x390 | far | 0.000000 | contact | LeftHand | 86 | 318.2, 139.6, 323.7, 150.9 | 110.42 | PASS |
| keeper_throw | 844x390 | far | 0.000000 | contact | RightHand | 84 | 299.0, 138.7, 307.2, 149.9 | 123.99 | PASS |
| keeper_throw | 844x390 | far | 1.080000 | release | ball | 690 | 295.6, 110.2, 310.4, 124.9 | 137.94 | PASS |
| keeper_throw | 844x390 | far | 1.080000 | release | RightHand | 84 | 304.7, 113.5, 309.5, 124.9 | 138.61 | PASS |
| keeper_dive_low_left | 844x390 | near | 1.098000 | contact | ball | 690 | 371.9, 193.6, 390.3, 212.0 | 11.34 | PASS |
| keeper_dive_low_left | 844x390 | near | 1.098000 | contact | LeftHand | 86 | 366.1, 194.4, 372.9, 208.0 | 17.56 | PASS |
| keeper_dive_low_left | 844x390 | near | 1.342000 | release | ball | 690 | 371.6, 196.9, 390.2, 215.2 | 8.14 | PASS |
| keeper_dive_low_left | 844x390 | near | 1.342000 | release | LeftHand | 86 | 366.0, 197.6, 372.8, 211.0 | 15.04 | PASS |
| keeper_dive_low_left | 844x390 | far | 1.098000 | contact | ball | 690 | 360.1, 186.9, 374.6, 201.4 | 22.90 | PASS |
| keeper_dive_low_left | 844x390 | far | 1.098000 | contact | LeftHand | 86 | 355.7, 187.6, 360.9, 198.4 | 32.24 | PASS |
| keeper_dive_low_left | 844x390 | far | 1.342000 | release | ball | 690 | 359.9, 189.5, 374.5, 204.0 | 20.54 | PASS |
| keeper_dive_low_left | 844x390 | far | 1.342000 | release | LeftHand | 86 | 355.7, 190.2, 360.8, 200.9 | 30.45 | PASS |
| keeper_dive_low_center | 844x390 | near | 1.098000 | contact | ball | 690 | 290.2, 199.0, 312.6, 221.6 | 79.17 | PASS |
| keeper_dive_low_center | 844x390 | near | 1.098000 | contact | LeftHand | 86 | 303.9, 199.2, 317.3, 215.7 | 74.86 | PASS |
| keeper_dive_low_center | 844x390 | near | 1.342000 | release | ball | 690 | 288.8, 204.2, 311.5, 226.8 | 80.27 | PASS |
| keeper_dive_low_center | 844x390 | near | 1.342000 | release | LeftHand | 86 | 303.0, 204.1, 316.5, 220.7 | 75.34 | PASS |
| keeper_dive_low_center | 844x390 | far | 1.098000 | contact | ball | 690 | 299.2, 185.4, 313.5, 199.8 | 81.75 | PASS |
| keeper_dive_low_center | 844x390 | far | 1.098000 | contact | LeftHand | 86 | 307.8, 185.8, 316.5, 196.6 | 79.89 | PASS |
| keeper_dive_low_center | 844x390 | far | 1.342000 | release | ball | 690 | 298.3, 188.7, 312.8, 203.1 | 81.55 | PASS |
| keeper_dive_low_center | 844x390 | far | 1.342000 | release | LeftHand | 86 | 307.3, 189.0, 316.0, 199.8 | 79.40 | PASS |
| keeper_dive_low_right | 844x390 | near | 1.098000 | contact | ball | 690 | 224.9, 183.6, 245.0, 203.3 | 139.81 | PASS |
| keeper_dive_low_right | 844x390 | near | 1.098000 | contact | RightHand | 84 | 242.5, 187.1, 253.9, 201.4 | 149.88 | PASS |
| keeper_dive_low_right | 844x390 | near | 1.342000 | release | ball | 690 | 225.0, 187.1, 245.1, 206.7 | 141.84 | PASS |
| keeper_dive_low_right | 844x390 | near | 1.342000 | release | RightHand | 84 | 242.7, 190.6, 254.1, 204.8 | 149.31 | PASS |
| keeper_dive_low_right | 844x390 | far | 1.098000 | contact | ball | 690 | 255.0, 176.6, 268.2, 189.7 | 138.15 | PASS |
| keeper_dive_low_right | 844x390 | far | 1.098000 | contact | RightHand | 84 | 266.8, 178.9, 274.1, 188.6 | 132.72 | PASS |
| keeper_dive_low_right | 844x390 | far | 1.342000 | release | ball | 690 | 254.8, 178.9, 268.2, 192.0 | 137.63 | PASS |
| keeper_dive_low_right | 844x390 | far | 1.342000 | release | RightHand | 84 | 266.8, 181.3, 274.2, 190.8 | 132.10 | PASS |
| keeper_dive_middle_left | 844x390 | near | 1.152000 | contact | ball | 690 | 392.1, 114.7, 416.7, 139.1 | 84.25 | PASS |
| keeper_dive_middle_left | 844x390 | near | 1.152000 | contact | LeftHand | 86 | 385.0, 119.5, 393.6, 138.8 | 84.52 | PASS |
| keeper_dive_middle_left | 844x390 | near | 1.408000 | release | ball | 690 | 385.3, 132.1, 409.9, 155.7 | 67.60 | PASS |
| keeper_dive_middle_left | 844x390 | near | 1.408000 | release | LeftHand | 86 | 378.9, 136.5, 387.2, 155.0 | 68.34 | PASS |
| keeper_dive_middle_left | 844x390 | far | 1.152000 | contact | ball | 690 | 362.9, 132.4, 378.0, 147.4 | 75.90 | PASS |
| keeper_dive_middle_left | 844x390 | far | 1.152000 | contact | LeftHand | 86 | 359.0, 135.2, 364.1, 147.2 | 76.44 | PASS |
| keeper_dive_middle_left | 844x390 | far | 1.408000 | release | ball | 690 | 359.1, 142.9, 374.2, 157.7 | 65.56 | PASS |
| keeper_dive_middle_left | 844x390 | far | 1.408000 | release | LeftHand | 86 | 355.6, 145.7, 360.5, 157.3 | 66.77 | PASS |
| keeper_dive_middle_center | 844x390 | near | 1.152000 | contact | ball | 690 | 282.9, 114.3, 307.1, 138.9 | 112.22 | PASS |
| keeper_dive_middle_center | 844x390 | near | 1.152000 | contact | LeftHand | 86 | 297.6, 118.9, 311.9, 137.8 | 109.96 | PASS |
| keeper_dive_middle_center | 844x390 | near | 1.408000 | release | ball | 690 | 274.3, 152.4, 300.1, 177.5 | 92.94 | PASS |
| keeper_dive_middle_center | 844x390 | near | 1.408000 | release | LeftHand | 86 | 290.5, 155.9, 305.2, 175.0 | 89.88 | PASS |
| keeper_dive_middle_center | 844x390 | far | 1.152000 | contact | ball | 690 | 295.2, 132.2, 310.1, 147.3 | 103.93 | PASS |
| keeper_dive_middle_center | 844x390 | far | 1.152000 | contact | LeftHand | 86 | 304.1, 134.8, 313.0, 146.5 | 102.54 | PASS |
| keeper_dive_middle_center | 844x390 | far | 1.408000 | release | ball | 690 | 290.1, 155.6, 305.9, 171.0 | 91.50 | PASS |
| keeper_dive_middle_center | 844x390 | far | 1.408000 | release | LeftHand | 86 | 299.8, 157.9, 308.9, 169.7 | 89.84 | PASS |
| keeper_dive_middle_right | 844x390 | near | 1.152000 | contact | ball | 690 | 218.6, 108.3, 239.6, 129.0 | 108.71 | PASS |
| keeper_dive_middle_right | 844x390 | near | 1.152000 | contact | RightHand | 84 | 236.4, 113.6, 248.0, 130.0 | 126.78 | PASS |
| keeper_dive_middle_right | 844x390 | near | 1.408000 | release | ball | 690 | 226.1, 123.7, 246.9, 144.0 | 117.78 | PASS |
| keeper_dive_middle_right | 844x390 | near | 1.408000 | release | RightHand | 84 | 243.9, 129.1, 255.2, 144.9 | 136.27 | PASS |
| keeper_dive_middle_right | 844x390 | far | 1.152000 | contact | ball | 690 | 251.8, 126.8, 265.4, 140.3 | 143.58 | PASS |
| keeper_dive_middle_right | 844x390 | far | 1.152000 | contact | RightHand | 84 | 263.5, 130.3, 270.8, 141.0 | 146.05 | PASS |
| keeper_dive_middle_right | 844x390 | far | 1.408000 | release | ball | 690 | 256.3, 136.8, 270.0, 150.2 | 141.73 | PASS |
| keeper_dive_middle_right | 844x390 | far | 1.408000 | release | RightHand | 84 | 268.2, 140.3, 275.4, 150.8 | 136.84 | PASS |
| keeper_dive_high_left | 844x390 | near | 1.206000 | contact | ball | 690 | 379.6, 71.4, 399.4, 91.5 | 131.76 | PASS |
| keeper_dive_high_left | 844x390 | near | 1.206000 | contact | LeftHand | 86 | 375.3, 82.4, 384.7, 97.4 | 125.96 | PASS |
| keeper_dive_high_left | 844x390 | near | 1.474000 | release | ball | 690 | 371.5, 110.4, 391.1, 129.3 | 94.01 | PASS |
| keeper_dive_high_left | 844x390 | near | 1.474000 | release | LeftHand | 86 | 368.0, 120.3, 376.9, 134.1 | 89.32 | PASS |
| keeper_dive_high_left | 844x390 | far | 1.206000 | contact | ball | 690 | 355.1, 105.8, 367.2, 118.1 | 106.06 | PASS |
| keeper_dive_high_left | 844x390 | far | 1.206000 | contact | LeftHand | 86 | 352.7, 112.1, 358.3, 121.3 | 104.34 | PASS |
| keeper_dive_high_left | 844x390 | far | 1.474000 | release | ball | 690 | 350.6, 129.3, 362.9, 141.2 | 83.97 | PASS |
| keeper_dive_high_left | 844x390 | far | 1.474000 | release | LeftHand | 86 | 348.7, 135.4, 354.1, 144.1 | 83.43 | PASS |
| keeper_dive_high_center | 844x390 | near | 1.206000 | contact | ball | 690 | 299.4, 70.3, 318.1, 89.5 | 152.20 | PASS |
| keeper_dive_high_center | 844x390 | near | 1.206000 | contact | LeftHand | 86 | 307.9, 84.7, 321.1, 97.6 | 143.73 | PASS |
| keeper_dive_high_center | 844x390 | near | 1.474000 | release | ball | 690 | 300.1, 77.3, 319.1, 96.1 | 145.99 | PASS |
| keeper_dive_high_center | 844x390 | near | 1.474000 | release | LeftHand | 86 | 309.0, 91.4, 321.9, 104.1 | 137.66 | PASS |
| keeper_dive_high_center | 844x390 | far | 1.206000 | contact | ball | 690 | 305.2, 104.0, 317.0, 116.0 | 130.20 | PASS |
| keeper_dive_high_center | 844x390 | far | 1.206000 | contact | LeftHand | 86 | 310.5, 112.8, 318.9, 121.0 | 125.03 | PASS |
| keeper_dive_high_center | 844x390 | far | 1.474000 | release | ball | 690 | 305.6, 108.2, 317.6, 120.0 | 126.53 | PASS |
| keeper_dive_high_center | 844x390 | far | 1.474000 | release | LeftHand | 86 | 311.2, 116.9, 319.4, 125.0 | 121.44 | PASS |
| keeper_dive_high_right | 844x390 | near | 1.206000 | contact | ball | 690 | 233.5, 72.0, 250.8, 89.5 | 123.47 | PASS |
| keeper_dive_high_right | 844x390 | near | 1.206000 | contact | RightHand | 84 | 245.4, 81.9, 255.0, 94.8 | 135.36 | PASS |
| keeper_dive_high_right | 844x390 | near | 1.474000 | release | ball | 690 | 244.0, 106.4, 260.9, 123.1 | 133.98 | PASS |
| keeper_dive_high_right | 844x390 | near | 1.474000 | release | RightHand | 84 | 255.8, 116.1, 265.2, 128.1 | 146.26 | PASS |
| keeper_dive_high_right | 844x390 | far | 1.206000 | contact | ball | 690 | 261.9, 103.5, 273.2, 114.7 | 151.95 | PASS |
| keeper_dive_high_right | 844x390 | far | 1.206000 | contact | RightHand | 84 | 269.6, 109.8, 275.9, 118.1 | 159.72 | PASS |
| keeper_dive_high_right | 844x390 | far | 1.474000 | release | ball | 690 | 268.3, 125.5, 279.4, 136.5 | 149.53 | PASS |
| keeper_dive_high_right | 844x390 | far | 1.474000 | release | RightHand | 84 | 276.0, 131.8, 282.2, 139.7 | 145.34 | PASS |

## Input SHA-256

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| preview.css | 19757 | `1b0dd2b68e8d0ddb95301c4e6e534e84a18a27a330a1fce6c75e04c79b6642fa` |
| preview.html | 5747 | `0af3599f91c43971b7270e275a15bda142f2408c13b8091cad5e0dff5e949a2e` |
| preview.mjs | 28125 | `8702c90f2fcf51d924a0439ee38d6ba5b72abb3ee196a7ac775602023af9c7f7` |
| runtime/LocalDRACOLoader.mjs | 2778 | `b89f87ec91c25ef60a1196317f9c11f27f5384f8a44f9d7e2fe38ef39a7d836a` |
| runtime/catalog.mjs | 75904 | `d2864c54984da04c8deb63c8eac5a08c49790a16ff06e1fd1ec5ebfb340196a2` |
| runtime/contact-solver.mjs | 12007 | `ce8248fa6583a4ae7a3f73dc1e9c10e3d9e94670216a0afb1b6f94be3208b8d8` |
| runtime/controller.mjs | 15082 | `da4c53291284a1c87106ef34fa79983b6db217f1b3b22ede10ebe05743ab8fc0` |
| runtime/draco-worker.js | 6495 | `5b6bc305d5a07f3708983b2b804fb00fa24e12468b11ff72fa242b5f656a7194` |
| runtime/keeper.glb | 948984 | `15af452a5ef3ba7fb80258846dc48d992ad0620181b2aff24c0bf758a9841d6b` |
| runtime/player.glb | 821376 | `a73b10a80b861a9d5169eff398bab5e79ce82f702546f301cfe41934756657af` |
| runtime/vendor/BufferGeometryUtils.js | 31918 | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| runtime/vendor/DRACOLoader.js | 13640 | `e4348b2c255e7d851df790cafb93bcdd7ac0d2a1a6916038b43580b1e6d6c3fb` |
| runtime/vendor/GLTFLoader.js | 108527 | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| runtime/vendor/LICENSE.three | 1081 | `852e0e8699169bf9f6fdc6bda3e682d078dcbc738b5d33e74df594721bff271d` |
| runtime/vendor/SkeletonUtils.js | 8019 | `0732d130a9366dd7803e5f9b38f60cc8b54e488e1c991d99711fb1d01be3124d` |
| runtime/vendor/draco/LICENSE.draco | 13898 | `d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4` |
| runtime/vendor/draco/draco_decoder.wasm | 192420 | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| runtime/vendor/draco/draco_wasm_wrapper.js | 58456 | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| runtime/vendor/three.module.js | 670681 | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| verification/visibility-browser.mjs | 14644 | `823bdfa2cf8919278c4245344e9cbd0ffebf120d13ddf1a3f5d7bcf3015b590f` |

## Runtime and audit errors

None.
