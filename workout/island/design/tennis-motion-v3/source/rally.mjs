// SPDX-License-Identifier: CC0-1.0
// Original right-handed choreography. Units are metres, +X left, +Z towards the net.
const left = [.18, .08, .035];
const right = [-.18, .08, -.035];
const upright = [-.12, .98, .15];
// Rotate through the forehand grip during preparation. Both string faces can strike.
const sideFace = [-.90, .15, .10];
const lowFace = [0, -.20, -1];
const underBall = [-.12, -.30, -.91];
const square = [0, 0, 1];
const readyHand = [-.145, 1.035, .29];
const readyLeft = [.23, 1.015, .22];

// The writer places both hand targets relative to the moving player in X/Z.
// Y is an absolute court height, which lets a loaded leg lower the strike zone.
function beat(frame, hips, wrist, shaft, details = {}) {
  const carry = ([x, y, z]) => [hips[0] + x, y, hips[2] + z];
  const { leftHand = readyLeft, ...body } = details;
  return [frame, { hips, rightHand: carry(wrist), shaft, leftHand: carry(leftHand), ...body }];
}

function ready(frame, x = 0, z = 0) {
  return beat(frame, [x, .735, z], readyHand, upright, {
    normal: square, hipYaw: 0, twist: 0, lean: 6, roll: 0,
    head: 0, headYaw: 0, leftOpen: 0, leftElbow: [1, -.48, -.30], rightElbow: [-1, -.48, -.30],
  });
}

const cue = (frame, type, label) => ({ frame, type, label });
const hit = frame => cue(frame, 'contact', 'מגע במרכז המיתרים');

// Each swing describes a single departing foot, its landing anchor and peak clearance.
// The complement of these swings is the actual support schedule, in the same court frame.
function score(def, body, leftSteps = [], rightSteps = []) {
  const byFrame = new Map(body);
  function key(frame, patch) {
    byFrame.set(frame, { ...byFrame.get(frame), ...patch });
  }
  const supports = [];
  for (const [channel, bone, start, swings] of [
    ['leftFoot', 'LeftFoot', left, leftSteps], ['rightFoot', 'RightFoot', right, rightSteps],
  ]) {
    let anchor = start, landed = 0;
    const plant = end => {
      if (end > landed) supports.push({ bone, startFrame: landed, endFrame: end, local: [0, -.08, 0] });
    };
    key(0, { [channel]: anchor });
    for (const [from, to, x, z, lift] of swings) {
      plant(from);
      const next = [x, .08, z];
      key(from, { [channel]: anchor });
      key(Math.round((from + to) / 2), { [channel]: [(x + anchor[0]) / 2, .08 + lift, (z + anchor[2]) / 2] });
      key(to, { [channel]: next });
      anchor = next;
      landed = to;
    }
    plant(def.durationFrames);
    key(def.durationFrames, { [channel]: anchor });
  }
  return { ...def, supports, keys: [...byFrame].sort(([a], [b]) => a - b) };
}

const lowVolley = score({
  id: 'volley_low', label: 'וולי נמוך', category: 'משחק ליד הרשת', durationFrames: 50,
  description: 'צעד אלכסוני לפנים, הורדת האגן וחסימה קצרה של כדור מתחת לגובה הרשת.',
  distinction: 'הברכיים סופגות את הירידה. המחבט נשאר לפני הגוף ופניו פתוחים מעט במגע הנמוך.',
  related: ['volley_forehand'], events: [cue(13, 'plant', 'נחיתה על הרגל הקדמית'), hit(21)],
  ball: { incoming: [.2, -.9, -10.3], outgoing: [-.7, 2.6, 6.6] },
}, [
  ready(0),
  beat(8, [-.025, .67, .035], [-.27, .95, .21], [-.63, .76, .08], { normal: sideFace, twist: -17, lean: 13, leftOpen: 1, leftHand: [.29, .99, .20] }),
  beat(16, [-.07, .575, .085], [-.32, .765, .25], [-.9, .35, .11], { hipYaw: -7, twist: -12, normal: lowFace, leftHand: [.30, .93, .21] }),
  beat(21, [-.065, .57, .12], [-.32, .735, .365], [-.98, .18, .12], { hipYaw: 0, twist: 5, lean: 16, normal: lowFace, leftHand: [.33, .93, .16] }),
  beat(28, [-.035, .60, .145], [-.275, .77, .405], [-.96, .20, .16], { normal: lowFace, twist: 11, leftHand: [.29, .99, .12] }),
  beat(38, [0, .69, .065], [-.20, .93, .315], [-.48, .84, .15], { normal: sideFace, twist: 5, lean: 9, leftOpen: 1 }), ready(50),
], [[3, 13, .125, .265, .075], [34, 48, left[0], left[2], .055]]);

const highVolley = score({
  id: 'volley_high', label: 'וולי גבוה', category: 'משחק ליד הרשת', durationFrames: 49,
  description: 'פנייה קצרה מהכתפיים ויירוט של כדור גבוה לפני הגוף, עם סיומת לפנים ולמטה.',
  distinction: 'היד עולה מעל הכתף והראש של המחבט נשאר גבוה במגע. ההמשך יורד בזווית אל תוך המגרש.',
  related: ['volley_forehand', 'smash'], events: [hit(20)],
  ball: { incoming: [.2, .35, -11.2], outgoing: [-1.7, -1.65, 8.3] },
}, [
  ready(0),
  beat(8, [0, .715, .02], [-.255, 1.195, .20], [-.35, .93, -.04], { hipYaw: -7, twist: -16, head: -12, leftOpen: 1, leftHand: [.22, 1.16, .23] }),
  beat(15, [-.02, .75, .055], [-.32, 1.41, .18], [-.48, .87, -.11], { twist: -12, lean: 4, normal: [0, -.14, .99], leftHand: [.26, 1.18, .17] }),
  beat(20, [-.014, .77, .085], [-.33, 1.39, .35], [-.55, .83, .10], { hipYaw: 3, twist: 6, leftHand: [.25, 1.11, .14] }),
  beat(26, [.008, .745, .105], [-.26, 1.275, .405], [-.58, .77, .27], { twist: 15, head: -4, leftHand: [.25, 1.06, .13] }),
  beat(37, [0, .72, .06], [-.20, 1.12, .32], [-.37, .9, .15], { twist: 5, leftOpen: 1 }), ready(49),
], [[4, 14, .155, .215, .07], [32, 46, left[0], left[2], .055]]);

const halfVolley = score({
  id: 'half_volley', label: 'חצי וולי', category: 'משחק ליד הרשת', durationFrames: 53,
  description: 'שקיעה עמוקה אל הניתור ואיסוף הכדור מיד עם עלייתו, בתנופה קצרה לפני הברך.',
  distinction: 'הכדור נוגע במגרש לפני החבטה. המחבט מתחיל סמוך לנעל ועולה עם הכדור מתוך כפיפת ברכיים.',
  related: ['volley_forehand', 'drop_shot'], events: [cue(16, 'bounce', 'ניתור הכדור מהמגרש'), hit(24)],
  ball: { incoming: [.35, 1.3, -7.8], outgoing: [-.25, 3.05, 7.4] },
}, [
  ready(0),
  beat(8, [-.035, .635, .025], [-.26, .875, .20], [-.63, .77, .03], { normal: [.6, -.8, .1], hipYaw: -6, twist: -15, head: 12, lean: 15, leftOpen: 1, leftHand: [.30, .97, .29] }),
  beat(16, [-.07, .49, .055], [-.29, .60, .22], [-.82, -.53, .19], { twist: -13, lean: 22, normal: underBall, leftHand: [.31, .84, .25] }),
  beat(21, [-.08, .475, .075], [-.295, .57, .27], [-.85, -.44, .22], { hipYaw: -4, twist: -6, head: 16, leftHand: [.32, .80, .24] }),
  beat(24, [-.07, .485, .095], [-.295, .605, .32], [-.90, -.34, .22], { hipYaw: 1, twist: 2, normal: underBall, leftHand: [.32, .81, .21] }),
  beat(32, [-.035, .57, .095], [-.24, .765, .38], [-.94, .15, .24], { normal: underBall, twist: 11, lean: 17, leftHand: [.28, .92, .1] }),
  beat(42, [-.005, .68, .05], [-.19, .93, .31], [-.54, .81, .12], { normal: sideFace, twist: 4, head: 2, leftOpen: 1 }), ready(53),
], [[4, 13, .155, .165, .05], [37, 51, left[0], left[2], .045]]);

const lob = score({
  id: 'lob', label: 'לוב', category: 'חבטות קו אחורי', durationFrames: 68,
  description: 'הורדת ראש המחבט מתחת לכדור והארכת התנועה כלפי מעלה כדי לעבור מעל שחקן הרשת.',
  distinction: 'פני המחבט פונים מעלה והיד מסיימת בגובה הרקה. המבט עוקב אחר המסלול הגבוה.',
  related: ['forehand', 'drop_shot'], events: [hit(29), cue(44, 'track', 'מעקב אחר הכדור העולה')],
  ball: { incoming: [.4, -.8, -8.3], outgoing: [.5, 10.2, 6.3] },
}, [
  ready(0),
  beat(12, [-.045, .685, -.025], [-.32, .95, .05], [-.78, .53, -.22], { normal: [-.6, -.8, .1], hipYaw: -10, twist: -24, leftOpen: 1, leftHand: [.26, 1.02, .32] }),
  beat(21, [-.055, .625, -.015], [-.33, .77, .13], [-.86, -.32, -.10], { hipYaw: -9, twist: -23, lean: 13, normal: underBall, leftHand: [.26, 1.025, .23] }),
  beat(29, [-.035, .67, .045], [-.30, .90, .34], [-.94, .18, .16], { hipYaw: 1, twist: -1, normal: underBall, leftHand: [.27, 1.04, .16] }),
  beat(37, [0, .745, .095], [-.16, 1.23, .36], [-.55, .81, .18], { normal: underBall, hipYaw: 9, twist: 17, lean: 4, head: -19, leftHand: [.27, 1.08, .12] }),
  beat(44, [.015, .755, .11], [-.04, 1.43, .265], [-.14, .98, .10], { hipYaw: 11, twist: 24, head: -28, leftHand: [.25, 1.10, .13] }),
  beat(55, [0, .72, .055], [-.115, 1.24, .275], [-.15, .96, .14], { normal: sideFace, head: -17, twist: 9, leftOpen: 1 }), ready(68),
], [[9, 22, .17, .19, .07], [48, 65, left[0], left[2], .055]]);

const overhead = score({
  id: 'overhead_backward', label: 'סמאש בנסיגה', category: 'התמודדות עם לוב', durationFrames: 82,
  description: 'שני צעדי נסיגה מתחת ללוב, הצבעה ביד החופשית והחלפת רגליים באוויר במכה מעל הראש.',
  distinction: 'האגן נסוג לפני ההמראה. הרגל האחורית עוברת לפנים במהלך המכה והנחיתה בולמת את הנסיגה.',
  related: ['smash', 'serve_whip'], events: [cue(26, 'load', 'טעינה על הרגל האחורית'), cue(34, 'takeoff', 'החלפת רגליים באוויר'), hit(37), cue(41, 'land', 'נחיתה')],
  ball: { incoming: [.25, -6.5, -2.7], outgoing: [-.8, -4.2, 12.8] },
}, [
  ready(0),
  beat(9, [-.02, .70, -.065], [-.265, 1.15, .10], [-.38, .90, -.18], { hipYaw: -11, twist: -16, head: -26, leftOpen: 1, leftHand: [.13, 1.36, .20] }),
  beat(18, [-.045, .70, -.19], [-.315, 1.29, -.03], [-.27, .71, -.65], { hipYaw: -17, twist: -22, lean: -4, head: -31, rightElbow: [-1, -.12, -.34], leftHand: [.12, 1.50, .15] }),
  beat(26, [-.07, .66, -.29], [-.305, 1.34, -.065], [-.26, .36, -.90], { hipYaw: -20, twist: -21, normal: [0, .48, .88], roll: 3, head: -34, leftHand: [.13, 1.51, .12] }),
  beat(33, [-.045, .78, -.345], [-.24, 1.515, -.095], [-.35, .45, -.82], { normal: [0, .48, .88], hipYaw: -9, twist: -13, lean: -4, leftHand: [.18, 1.33, .14] }),
  beat(37, [-.02, .81, -.37], [-.205, 1.66, .135], [-.14, .985, .10], { normal: square, hipYaw: 3, twist: 7, lean: 3, head: -24, leftHand: [.245, 1.15, .17] }),
  beat(42, [0, .735, -.375], [-.115, 1.265, .37], [-.04, -.28, .96], { normal: [.10, -.85, .5], hipYaw: 12, twist: 18, head: -6, leftHand: [.26, 1.05, .16] }),
  beat(49, [.01, .655, -.33], [-.015, .985, .32], [.40, -.28, .87], { normal: [.80, -.40, .40], twist: 23, lean: 15, leftHand: [.26, .98, .12] }),
  beat(62, [0, .70, -.20], [-.16, 1.025, .255], [-.34, .87, .16], { hipYaw: 2, twist: 6, leftOpen: 1 }),
  ready(82),
], [[9, 19, .16, -.225, .09], [31, 41, .16, -.47, .16], [56, 71, left[0], left[2], .1]],
   [[2, 11, -.18, -.25, .08], [16, 26, -.18, -.45, .075], [33, 45, -.16, -.245, .15], [67, 80, right[0], right[2], .075]]);

const driveReturn = score({
  id: 'serve_return_aggressive', label: 'החזר הגשה חזק', category: 'החזרות הגשה', durationFrames: 51,
  description: 'קפיצת הכנה, נחיתה בפיסוק וחבטה עולה אל תוך ההגשה בתנועה קצרה ומהירה.',
  distinction: 'הטיית הגוף לפנים והעברת המשקל מתחילות כבר בנחיתת הפיסוק. ההנפה לאחור קצרה כדי להקדים כדור מהיר.',
  related: ['forehand', 'ready'], events: [cue(8, 'split_land', 'נחיתה בפיסוק'), hit(22)],
  ball: { incoming: [-.7, -.85, -18.6], outgoing: [1.8, 2.3, 15.4] },
}, [
  ready(0),
  beat(4, [0, .771, .012], [-.16, 1.075, .265], [-.22, .96, .14], { leftOpen: .2 }),
  beat(9, [-.035, .655, .045], [-.30, 1.015, .12], [-.76, .55, -.24], { hipYaw: -9, twist: -24, leftOpen: 1, leftHand: [.24, 1.00, .30] }),
  beat(16, [-.06, .65, .075], [-.36, .935, .055], [-.89, .20, -.41], { hipYaw: -11, twist: -27, lean: 13, leftHand: [.30, 1.015, .285] }),
  beat(22, [-.025, .685, .14], [-.33, .985, .375], [-.95, .22, .19], { hipYaw: 5, twist: 7, lean: 12, leftHand: [.32, 1.025, .145] }),
  beat(28, [.015, .725, .175], [-.04, 1.20, .345], [-.40, .60, .10], { hipYaw: 12, twist: 27, leftHand: [.22, 1.085, .08] }),
  beat(36, [.018, .71, .13], [.06, 1.30, .225], [.69, .69, .18], { twist: 30, leftHand: [.24, 1.09, .11], leftOpen: 1 }), ready(51),
], [[1, 8, .24, .115, .065], [11, 20, .175, .285, .075], [37, 50, left[0], left[2], .055]],
   [[1, 8, -.245, -.005, .062], [31, 44, right[0], right[2], .045]]);

const defensiveSlice = score({
  id: 'defensive_slice', label: 'חיתוך מגן', category: 'משחק הגנה', durationFrames: 66,
  description: 'צעד רחב לצד הבקהנד, הושטת יד אחת וחיתוך פתוח שמחזיר כדור עמוק ומאפשר התאוששות.',
  distinction: 'הרגל החיצונית בולמת את התנועה הצדה והיד החופשית נפתחת לאחור. מסלול המיתרים יורד ונמשך קדימה.',
  related: ['slice', 'backhand_one_handed'], events: [cue(19, 'plant', 'בלימה ברגל החיצונית'), hit(29)],
  ball: { incoming: [2.4, -.7, -11.3], outgoing: [-1.2, 2.75, 8.9] },
}, [
  ready(0),
  beat(9, [.07, .70, -.015], [.075, 1.02, .27], [.67, .73, -.06], { rightElbow: [-.6, -.7, -.4], hipYaw: 7, twist: 19, leftOpen: 1, leftHand: [.18, 1.13, .17] }),
  beat(19, [.225, .61, -.035], [.135, 1.105, .19], [.72, .65, -.23], { leftElbow: [.6, -.9, -.8], hipYaw: 10, twist: 25, lean: 13, roll: -6, normal: [0, .35, .94], leftHand: [.37, 1.035, .03] }),
  beat(25, [.275, .60, -.03], [.15, .97, .24], [.88, .35, -.30], { hipYaw: 6, twist: 15, leftHand: [.38, 1.00, -.04] }),
  beat(29, [.285, .595, -.02], [.15, .905, .295], [.95, .12, -.22], { hipYaw: -1, twist: 4, normal: [0, .52, .85], leftHand: [.33, 1.03, -.06] }),
  beat(37, [.255, .61, .005], [.145, .875, .335], [.96, .04, -.18], { hipYaw: -5, twist: -9, leftHand: [.34, 1.04, -.09] }),
  beat(48, [.155, .685, .005], [.065, .975, .295], [.68, .65, .15], { leftElbow: [.6, -.9, -.8], twist: -6, lean: 8, leftOpen: 1, leftHand: [.33, 1.015, .08] }), ready(66),
], [[3, 19, .51, .035, .095], [44, 62, left[0], left[2], .075]],
   [[17, 27, .025, -.13, .065], [36, 49, right[0], right[2], .07]]);

const crossover = score({
  id: 'lateral_crossover_run', label: 'ריצת הצלבה לצד', category: 'עבודת רגליים', durationFrames: 69,
  description: 'מרדף לצד שמאל בסדרת צעדי הצלבה. הרגל הימנית חוצה מלפנים והחזה ממשיך לפנות אל המגרש.',
  distinction: 'במהלך ההצלבה הנעל הימנית עוברת שמאלה מעבר לנעל השמאלית. הריצה מסתיימת בעמדת היכון במרחק של מטר מנקודת היציאה.',
  related: ['run_side'], events: [cue(18, 'crossover', 'הרגל הימנית חוצה מלפנים'), cue(39, 'crossover', 'הצלבה שנייה'), cue(61, 'settle', 'חזרה לפיסוק')],
}, [
  ready(0),
  beat(8, [.09, .69, .01], [-.18, 1.01, .24], [-.31, .93, .14], { hipYaw: 9, twist: -3, roll: -6, leftOpen: .85, leftHand: [.23, 1.055, .24] }),
  beat(15, [.25, .735, .035], [-.22, .99, .13], [-.41, .89, .12], { hipYaw: 20, twist: -10, lean: 10, leftOpen: 1, leftHand: [.16, 1.09, .31] }),
  beat(21, [.415, .67, .06], [-.18, .975, .22], [-.34, .92, .16], { hipYaw: 12, twist: -4, roll: -4, leftHand: [.22, 1.015, .18] }),
  beat(27, [.545, .725, .025], [-.14, 1.055, .315], [-.21, .96, .16], { hipYaw: -2, twist: 4, leftHand: [.27, .98, .09] }),
  beat(32, [.64, .68, .025], [-.18, 1.005, .24], [-.31, .93, .16], { hipYaw: 9, twist: -3, leftHand: [.24, 1.035, .22] }),
  beat(38, [.74, .735, .045], [-.21, 1.005, .145], [-.41, .90, .12], { hipYaw: 19, twist: -9, leftHand: [.16, 1.085, .30] }),
  beat(43, [.85, .68, .06], [-.17, .98, .235], [-.31, .93, .17], { hipYaw: 10, twist: -3, roll: -4, leftHand: [.22, 1.02, .18] }),
  beat(50, [.97, .71, .03], [-.14, 1.05, .30], [-.21, .96, .16], { hipYaw: -1, twist: 5, leftHand: [.27, .99, .12] }),
  beat(58, [1.035, .695, .005], [-.17, 1.015, .26], [-.24, .95, .16], { hipYaw: 5, twist: -2, roll: -1, leftOpen: .6 }), ready(69, 1.05),
], [[1, 9, .36, .005, .10], [20, 31, .76, -.005, .115], [42, 52, 1.23, .035, .10]],
   [[9, 20, .405, .19, .145], [31, 42, .805, .19, .14], [52, 61, .87, -.035, .08]]);

const cut = score({
  id: 'change_direction', label: 'בלימה ושינוי כיוון', category: 'עבודת רגליים', durationFrames: 67,
  description: 'שני צעדי התקרבות לצד שמאל, עצירה בשוליים החיצוניים של הבסיס ודחיפה חזרה לצד ימין.',
  distinction: 'הרגל השמאלית נשארת נטועה בזמן שהאגן עובר ממהירות שמאלה לימינה. הצעד הראשון בחזרה יוצא מעמידה נמוכה.',
  related: ['run_side', 'recover'], events: [cue(26, 'outside_plant', 'נטיעת רגל שמאל לבלימה'), cue(30, 'reverse', 'היפוך כיוון האגן'), cue(38, 'push_off', 'יציאה חזרה ימינה')],
}, [
  ready(0),
  beat(8, [.09, .69, .01], [-.185, 1.01, .25], [-.29, .94, .15], { hipYaw: 6, twist: -4, roll: -6, leftOpen: .75, leftHand: [.23, 1.055, .23] }),
  beat(16, [.24, .72, .015], [-.21, .99, .165], [-.40, .90, .13], { hipYaw: 12, twist: -8, lean: 10, leftOpen: 1, leftHand: [.18, 1.07, .285] }),
  beat(23, [.39, .66, .015], [-.17, .975, .26], [-.29, .93, .16], { hipYaw: 5, twist: -2, leftHand: [.23, .995, .18] }),
  beat(26, [.435, .605, .01], [-.17, .93, .28], [-.23, .96, .14], { lean: 15, roll: 5, leftHand: [.27, .92, .12] }),
  beat(30, [.455, .585, .005], [-.18, .915, .265], [-.25, .95, .14], { hipYaw: -7, twist: 8, roll: 10, headYaw: -14, leftHand: [.31, .90, .08] }),
  beat(38, [.315, .665, .015], [-.14, 1.015, .31], [-.19, .97, .16], { hipYaw: -15, twist: 9, lean: 12, roll: 9, leftHand: [.30, .945, .10] }),
  beat(45, [.17, .705, .005], [-.16, 1.055, .30], [-.23, .96, .15], { hipYaw: -5, twist: 7, headYaw: -9, leftHand: [.265, .985, .16] }),
  beat(52, [.035, .67, .01], [-.215, .975, .17], [-.37, .92, .13], { hipYaw: 0, twist: -5, roll: 3, leftHand: [.18, 1.05, .285] }),
  beat(59, [-.08, .705, .005], [-.17, 1.015, .26], [-.26, .95, .15], { hipYaw: -3, twist: 3, leftOpen: .55 }), ready(67, -.12),
], [[1, 9, .39, .025, .095], [17, 26, .665, .03, .10], [38, 48, .27, .03, .10], [55, 65, .06, .035, .075]],
   [[9, 17, .09, -.055, .09], [27, 37, .08, -.065, .075], [47, 56, -.30, -.035, .105]]);

export default [lowVolley, highVolley, halfVolley, lob, overhead, driveReturn, defensiveSlice, crossover, cut];
