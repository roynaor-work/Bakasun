import { both, either, max, min } from './geometry.mjs?v=20261010-camera-1';

const LEGS = ['shoulder', 'hip', 'knee', 'ankle'];
const ARMS = ['shoulder', 'elbow', 'wrist', 'hip'];
const BODY = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
const FEET = [...LEGS, 'heel', 'toe'];
const ALL = [...BODY, 'heel', 'toe'];

const stand = f => f.torsoUp > .65 && f.kneeAngle >= 150;
const upright = f => f.torsoUp > .63;
const squat = f => f.kneeAngle <= 125 && f.torsoUp > .35;
const horizontal = f => f.torsoWide > .60 && Math.abs(f.torsoUp) < .70;
const hipSag = f => {
  const { shoulder, hip, ankle } = f.main;
  const run = f.dx(ankle, shoulder);
  if (Math.abs(run) < .35) return Infinity;
  const proportion = f.dx(hip, shoulder) / run;
  return Math.abs(f.dy(hip, shoulder) - proportion * f.dy(ankle, shoulder));
};
const pushLine = f => f.bodyLine > 146 && f.torsoWide > .56 && Math.abs(f.torsoUp) < .67 && hipSag(f) < .23;
const ankleGround = f => f.footLift <= .115;
const planted = f => f.sides.every(side => Math.abs(side.clearance) < .16);
const footInAir = f => f.sides.every(side => side.clearance > .20);
const air = f => footInAir(f) && f.hipRise > .105;
const lowAir = f => f.sides.every(side => side.clearance > .105) && f.hipRise > .065;
const bothUp = f => f.sides.every(side => side.armUp > .55);
const armsDown = f => f.sides.every(side => side.armUp < -.45);
const feetWide = f => f.feet >= Math.max(.90, f.shoulders * 1.48);
const feetNarrow = f => f.feet <= Math.max(.75, f.shoulders * 1.15);
// The stance before a star jump is a comfortable crouch, a little wider than standing at attention.
const feetComfortable = f => f.feet <= Math.max(.9, f.shoulders * 1.35);
const armsWide = f => f.wristSpread > Math.max(1.40, f.shoulders * 1.7) && f.sides.every(side => side.armUp > -.24);
const chest = f => f.dy(f.hip, f.shoulder);
const reachFloor = f => f.clearance(f.main.wrist?.y) <= .24;
const groundedPlank = f => pushLine(f) && reachFloor(f);
const kneeRaise = (f, minimum, opposite) => f.sides.find(side =>
  side.kneeRise >= minimum && f.sides[1 - side.index].kneeRise < opposite)?.index;
const clearKick = (f, height, gap) => f.sides.find(side => side.clearance > height &&
  side.clearance - f.sides[1 - side.index].clearance > gap)?.index;
const footTogether = f => Math.abs(f.dy(f.left.ankle, f.right.ankle)) < .22;
const kneesWide = f => f.kneeWidth >= .55 * f.feet;
const squattingForm = f => f.shoulders >= .35 && !kneesWide(f) && f.feet > .50;
const xTravel = (f, c) => Math.abs(f.dx(f.hip, c.origin.hip));
const shoulderHeight = f => f.clearance(f.main.shoulder?.y);
const restingHip = f => f.clearance(f.main.hip?.y) < .28;
const armsOverhead = f => Math.abs(f.dx(f.main.wrist, f.main.shoulder)) > .35 &&
  Math.sign(f.dx(f.main.wrist, f.main.shoulder)) === Math.sign(f.dx(f.main.shoulder, f.main.hip));

const standingSide = { view: 'side', setup: 'standing', required: either(...LEGS) };
const standingFront = { view: 'front', setup: 'standing', required: both(...LEGS) };
const jumpSide = { ...standingSide, required: both(...FEET) };
const jumpFront = { ...standingFront, required: both(...ALL) };
const floorSide = { view: 'side', setup: 'floor', required: either(...BODY) };
const floorBoth = { ...floorSide, required: both(...BODY) };

const point = (test, dwell = 55) => ({ test, dwell });
const rep = (setup, hint, rest, steps, options = {}) => ({
  ...setup, kind: 'reps', mode: 'cycle', hint, rest, steps, ...options,
});
const activity = (setup, hint, side, options = {}) => ({
  ...setup, kind: 'activity', mode: 'alternating', hint, side, ...options,
});
const hold = (setup, hint, check, options = {}) => ({
  ...setup, kind: 'hold', mode: 'hold', hint, check, ...options,
});
const alternating = (setup, hint, side, options = {}) => ({
  ...setup, kind: 'reps', mode: 'alternating', hint, side, ...options,
});
const hall = (view, hint, condition, options = {}) => ({
  view, setup: 'standing', required: both(...BODY), kind: 'reps', mode: 'hall', verification: 'partial',
  hint, condition, ...options,
});

const HALFWAY = 'כדאי לצלם את כל המסלול ולסיים כל מעבר בעצירה קטנה.';
const SIDE_SWITCH = 'ננסה עכשיו עם הצד השני של הגוף.';
const ankleHint = 'נקרב את כפות הרגליים ונעשה קפיצה קטנה עם נחיתה רכה.';
const sideHopHint = 'נעבור עם שתי כפות הרגליים יחד לצד השני של הקו, ואז נחזור.';
const bentKnees = 'נכופף את הברכיים ונשלח את האגן לאחור, כאילו כיסא מחכה לנו.';
const hipsInLine = 'נקרב את האגן לקו שבין הכתפיים לרגליים.';
const straightenKnees = 'נאריך את הרגליים עד המקום שנוח לברכיים.';
const plankStart = f => groundedPlank(f) && f.elbowAngle >= 145 && f.kneeAngle >= 137 &&
  shoulderHeight(f) > .61 && Math.abs(f.footLift) < .25;

export const PROFILES = {
  jog: activity({ ...standingSide, required: both(...LEGS) }, 'נרים כל רגל בתורה ונזיז את הידיים בנוחות.',
    // An easy jog lifts the knee far less than a high-knee drill: the thigh about 40 degrees from the standing leg.
    f => upright(f) ? kneeRaise(f, -.66, -.74) : undefined, { cueDwell: 45 }),
  'arm-circles': { ...standingSide, required: either(...ARMS), kind: 'activity', mode: 'circles',
    hint: 'נצייר עיגול גדול עם כף היד סביב הכתף, עם זרוע ארוכה ונינוחה.' },
  'ankle-hops': rep(jumpSide, ankleHint, f => planted(f) && upright(f) && f.kneeAngle > 140,
    [point(f => lowAir(f) && f.feet < .80 && f.kneeAngle > 133, 36)],
    { kind: 'activity', minCycle: 110, form: f => f.kneeAngle < 120 ? ankleHint : null }),
  'jumping-jacks': rep(jumpFront, 'נפתח את הרגליים ונרים את שתי כפות הידיים, ואז נסגור וננחת.',
    f => planted(f) && stand(f) && feetNarrow(f) && armsDown(f),
    [point(f => feetWide(f) && bothUp(f) && lowAir(f), 40),
      point(f => planted(f) && feetWide(f) && bothUp(f), 48),
      point(f => f.sides.every(side => side.clearance > .08) && f.hipRise > .05, 36)], { minCycle: 230 }),
  'squat-jumps': rep(jumpSide, 'נתחיל עם ברכיים כפופות ואגן לאחור, ואז נדחוף את הרצפה עם שתי הרגליים.',
    f => planted(f) && f.torsoUp > .45, [point(squat, 64), point(air, 40)],
    { minCycle: 210, form: f => squattingForm(f) ? 'נכוון את הברכיים לכיוון האצבעות בכפות הרגליים.' : null }),
  'high-knees': activity({ ...standingSide, required: both(...LEGS) }, 'נרים ברך אחת לכיוון הבטן ואז נחליף רגל.',
    f => upright(f) ? kneeRaise(f, -.25, -.63) : undefined, { cueDwell: 48 }),
  'tuck-jumps': rep(jumpSide, 'באוויר נקרב את שתי הברכיים לכיוון הבטן, ונרד לנחיתה רכה.',
    f => planted(f) && f.torsoUp > .43,
    [point(f => air(f) && f.sides.every(side => side.kneeRise > -.48 && side.kneeAngle < 135), 40)], { minCycle: 170 }),
  'side-hops': rep(jumpFront, sideHopHint, f => planted(f) && f.torsoUp > .58,
    [point(f => lowAir(f) && footTogether(f), 38)],
    { kind: 'activity', finish: (f, c) => planted(f) && footTogether(f) && xTravel(f, c) > .66,
      cycleSide: (f, c) => f.dx(f.hip, c.origin.hip) < 0 ? 0 : 1, alternate: true, minCycle: 150, maxCycle: 1300 }),
  'jump-rope': rep(jumpFront, 'נקרב מרפקים לגוף, נסובב בעדינות את כפות הידיים ונקפוץ קפיצה קטנה.',
    f => planted(f) && upright(f),
    [point((f, c) => lowAir(f) && footTogether(f) && f.feet < .85 && f.sides.every(side => {
      const start = c.origin.sides[side.index];
      const wristMotion = Math.hypot(f.dx(side.wrist, side.elbow) - f.dx(start.wrist, start.elbow),
        f.dy(side.wrist, side.elbow) - f.dy(start.wrist, start.elbow));
      return side.elbowAngle > 65 && side.elbowAngle < 162 && Math.abs(f.dx(side.elbow, side.shoulder)) < .52 && wristMotion > .075;
    }), 36)],
    { kind: 'activity', minCycle: 110, verification: 'partial' }),
  burpees: rep({ ...jumpSide, required: both(...ALL) }, 'נביא את כפות הידיים לרצפה, נאריך את הרגליים לקרש, נחזור לכפיפה ונקפוץ.',
    f => stand(f) && planted(f), [point(f => reachFloor(f) && f.kneeAngle < 130), point(groundedPlank, 94),
      point(f => reachFloor(f) && f.kneeAngle < 130), point(f => air(f) && bothUp(f), 38)],
    { minCycle: 620, maxCycle: 14000 }),
  'star-jumps': rep(jumpFront, 'נכופף ברכיים, ובקפיצה נפתח ידיים ורגליים לצורת כוכב.',
    f => planted(f) && f.torsoUp > .45 && feetComfortable(f),
    [point(f => f.kneeAngle < 136, 55), point(f => air(f) && feetWide(f) && armsWide(f), 40)], { minCycle: 220 }),
  'broad-jump': rep(jumpSide, 'ניקח את האגן לאחור, נקפוץ קדימה וננחת עם שתי רגליים יחד.',
    f => planted(f) && f.torsoUp > .38, [point(f => f.kneeAngle < 135), point(air, 40)],
    { finish: (f, c) => planted(f) && footTogether(f) && xTravel(f, c) > .93, minCycle: 210, waitFirst: true }),
  'single-leg-hops': rep(jumpSide, 'נשאיר רגל אחת באוויר ונעשה קפיצה קטנה על הרגל השנייה.',
    f => upright(f) && clearKick(f, .38, .40) != null && ankleGround(f),
    [point((f, c) => air(f) && clearKick(f, .38, .28) === c.startSide, 40)],
    { finish: (f, c) => ankleGround(f) && clearKick(f, .38, .30) === c.startSide, minCycle: 155, waitFirst: true,
      startSide: f => clearKick(f, .38, .40), cycleSide: (f, c) => 1 - c.startSide, twoSides: true }),
  'step-jumps': rep(jumpSide, 'נעלה בקפיצה עם שתי רגליים ונעמוד יציב לרגע. נרד בהליכה וננסה שוב.',
    f => planted(f) && f.torsoUp > .50, [point(f => air(f) && f.footLift > .34, 48)],
    { finish: (f, c) => stand(f) && f.footLift > .28 && footTogether(f) && xTravel(f, c) > .48 && c.peakFoot - f.footLift > .21,
      finishDwell: 190, maxCycle: 8500, verification: 'partial', stillFinish: true, rearm: false }),
  'hall-sprint': hall('side', HALFWAY, h => h.strides >= 2),
  'run-jump': hall('side', 'נרוץ כמה צעדים, נקפוץ קדימה וננחת יחד על שתי הרגליים.',
    (h, f) => h.strides >= 2 && h.forwardJump && footTogether(f)),
  'run-vertical': hall('side', 'אחרי כמה צעדים, נדחוף את הרצפה ונמתח יד אחת למעלה בקפיצה.',
    (h, f) => h.strides >= 2 && h.reachJump && footTogether(f)),
  bounding: hall('side', 'נאריך את הצעד עם ניתור קטן ונחליף רגל בכל נחיתה.', h => h.strides >= 2 && h.flights >= 2),
  'shuttle-run': hall('side', 'נגיע עד סוף המסלול ונושיט כף יד לכיוון הקיר.', h => h.strides >= 2 && h.reached),
  'reaction-sprint': hall('side', 'נעמוד מוכנים ונצא רק אחרי הצפצוף.', h => h.strides >= 2, { signal: true }),
  'side-shuffle': hall('front', 'נכופף מעט ברכיים ונזוז הצידה בלי להצליב את כפות הרגליים.',
    h => h.strides >= 2 && h.crosses === 0 && h.bent > 0),
  carioca: hall('front', 'נצליב רגל לפנים, נפתח, ואז נצליב שוב בכיוון השני.', h => h.crosses >= 2),
  skipping: hall('side', 'נרים ברך ויד נגדית יחד, עם ניתור קטן בכל דילוג.', h => h.skips >= 2 && h.flights >= 2),
  'floor-wall-run': hall('side', 'ניגע נמוך עם כף יד, ואז בקצה השני ננתר ונושיט יד למעלה.',
    h => h.strides >= 2 && h.lowStart && h.reachJump),
  'back-run': hall('side', 'ניקח צעדים קטנים לאחור כשהחזה פונה לכיוון שממנו יצאנו.',
    h => h.strides >= 2 && h.backwards >= 2 && h.away === 0, { required: [0, ...both(...BODY)] }),
  crunches: rep(floorSide, 'נרים את הכתפיים מעט מעל הרצפה ונוריד אותן לאט. כפות הידיים ליד הראש.',
    f => restingHip(f) && shoulderHeight(f) < .36 && f.kneeAngle < 155,
    [point(f => restingHip(f) && shoulderHeight(f) > .43 && chest(f) > .36 && f.kneeAngle < 155, 84)]),
  bicycle: alternating(floorBoth, 'נקרב מרפק לברך הנגדית ונאריך את הרגל השנייה, ואז נחליף צד.', f => {
    if (!restingHip(f) || chest(f) < .23) return;
    return f.sides.find(side => side.kneeAngle < 124 && f.sides[1 - side.index].kneeAngle > 145 &&
      f.dist(side.knee, f.sides[1 - side.index].elbow) < .88)?.index;
  }),
  'leg-raises': rep(floorBoth, 'נשאיר כתפיים למטה ונרים את שתי הרגליים יחד, ישרות עד איפה שנוח.',
    f => restingHip(f) && horizontal(f) && max(f.sides.map(side => side.clearance)) < .47,
    [point(f => restingHip(f) && horizontal(f) && f.sides.every(side => side.clearance > .83 && side.kneeAngle > 146), 78)],
    { form: f => min(f.sides.map(side => side.kneeAngle)) < 120 ? straightenKnees : null }),
  'v-ups': rep(floorSide, 'נרים כתפיים ורגליים יחד ונקרב את כפות הידיים לכפות הרגליים.',
    f => restingHip(f) && shoulderHeight(f) < .39 && f.footLift < .39,
    [point(f => restingHip(f) && shoulderHeight(f) > .68 && chest(f) > .58 && f.footLift > .67 &&
      f.dist(f.main.wrist, f.main.ankle) < .73, 74)]),
  plank: hold(floorSide, hipsInLine, f => plankStart(f)),
  'side-plank': hold({ ...floorBoth, view: 'diagonal' }, 'נמקם מרפק מתחת לכתף ונרים את האגן בקו עם הגוף.', f => {
    if (!horizontal(f) || max(f.sides.map(side => side.line)) < 145) return;
    const low = f.sides.find(side => f.dy(side.elbow, f.sides[1 - side.index].elbow) > .33);
    return low && f.clearance(low.elbow?.y) < .29 && Math.abs(f.dx(low.elbow, low.shoulder)) < .48 &&
      f.clearance(f.hip.y) > .23 ? low.index : undefined;
  }, { twoSides: true }),
  'hollow-hold': hold(floorBoth, 'נרים כתפיים וכפות רגליים קצת, ונאריך את הידיים ליד האוזניים.',
    f => restingHip(f) && shoulderHeight(f) > .20 && chest(f) > .14 && chest(f) < .58 &&
      f.footLift > .15 && f.footLift < .74 && armsOverhead(f) && f.sides.every(side => side.kneeAngle > 145)),
  'flutter-kicks': activity(floorBoth, 'נאריך את שתי הרגליים מעל הרצפה ונרים אותן קצת, אחת אחרי השנייה.', f => {
    if (!restingHip(f) || !horizontal(f) || f.footLift < .055 || f.sides.some(side => side.kneeAngle < 140)) return;
    return clearKick(f, .25, .20);
  }, { cueDwell: 44 }),
  'russian-twists': alternating({ ...floorBoth, view: 'front' }, 'נפנה את החזה יחד עם הידיים, מצד אחד לצד השני.', f => {
    const shift = f.sides.map(side => f.dx(side.wrist, f.hip));
    const turn = f.dx(f.shoulder, f.hip);
    if (!restingHip(f) || chest(f) < .46 || f.footLift < .14 || f.sides.some(side => side.kneeAngle > 150) ||
      f.wristSpread > .68 || Math.abs(turn) < .065) return;
    if (shift.every(x => x > .43) && turn > 0) return 0;
    if (shift.every(x => x < -.43) && turn < 0) return 1;
  }),
  superman: rep(floorSide, 'נאריך ידיים קדימה ונרים כתפיים ורגליים יחד, רק עד איפה שנוח.',
    f => restingHip(f) && horizontal(f) && shoulderHeight(f) < .29 && f.footLift < .17 && armsOverhead(f),
    [point(f => restingHip(f) && horizontal(f) && shoulderHeight(f) > .30 && f.footLift > .22 &&
      f.clearance(f.main.wrist?.y) > .45 && armsOverhead(f), 110)]),
  'plank-jacks': rep({ ...floorBoth, view: 'diagonal' }, 'נשמור את האגן בקו הקרש ונפתח ונסגור את הרגליים יחד.',
    f => plankStart(f) && f.feet < .72, [point(f => groundedPlank(f) && f.feet > .86 && footTogether(f) && f.footLift > .145, 48),
      point(f => groundedPlank(f) && f.feet > .86 && ankleGround(f), 48),
      point(f => groundedPlank(f) && f.feet < .72 && footTogether(f) && f.footLift > .145, 48)],
    { form: f => f.bodyLine < 132 ? hipsInLine : null }),
  'crab-kicks': alternating(floorBoth, 'נדחוף את הרצפה בכפות הידיים, נרים את האגן ונבעט עם רגל אחת בכל פעם.', f => {
    if (f.clearance(f.hip.y) < .35 || !reachFloor(f) || f.elbowAngle < 140 || f.torsoUp < .17) return;
    return f.sides.find(side => side.kneeAngle > 150 && side.clearance > .48 &&
      f.sides[1 - side.index].clearance < .22)?.index;
  }, { neutral: f => planted(f) }),
  'mountain-climbers': activity(floorBoth, 'נביא ברך אחת לכיוון החזה, נחזיר ונחליף רגל. האגן נשאר נמוך.', f => {
    if (!horizontal(f) || !reachFloor(f) || f.elbowAngle < 141 || f.torsoUp > .48) return;
    return f.sides.find(side => side.legAngle < 116 && side.kneeAngle < 127 &&
      f.sides[1 - side.index].line > 141)?.index;
  }, { cueDwell: 50 }),
  squats: rep({ ...standingSide, view: 'diagonal' }, bentKnees, stand,
    [point(f => squat(f) && f.hipRise < -.19, 88)],
    { minCycle: 250, form: f => squattingForm(f) ? 'נכוון את הברכיים לכיוון האצבעות בכפות הרגליים.' : null }),
  lunges: rep({ ...standingSide, required: both(...LEGS) }, 'ניקח צעד רחב ונקרב את הברך האחורית לרצפה, ואז נעלה ונחליף רגל.',
    f => f.kneeAngle >= 151 && upright(f),
    [point((f, c) => {
      const side = f.sides.find(side => side.kneeAngle < 116 && f.sides[1 - side.index].kneeAngle < 148 &&
        Math.abs(f.dx(side.knee, f.hip)) > .45 && Math.abs(f.dx(side.ankle, side.knee)) < .36 &&
        f.clearance(f.sides[1 - side.index].knee?.y) < .52);
      if (!side || f.feet < .89 || f.torsoUp < .56) return false;
      c.side = side.index;
      return true;
    }, 88)], { alternate: true, minCycle: 230 }),
  'calf-raises': rep({ ...standingSide, required: either(...FEET) }, 'נעלה על קצות אצבעות הרגליים ונוריד את העקבים בעדינות.',
    f => stand(f) && f.main.heelRise < .12,
    [point(f => stand(f) && f.main.heelRise > .16 && f.hipRise > .07 && f.clearance(f.main.toe?.y) < .14, 80)],
    { minCycle: 230 }),
  'glute-bridge': rep(floorSide, 'נרים את האגן עד שהוא בקו עם הכתפיים והברכיים, ואז נרד בנחת.',
    f => horizontal(f) && restingHip(f) && f.kneeAngle < 150 && shoulderHeight(f) < .43,
    [point(f => f.torsoWide > .55 && f.kneeLine > 150 && f.clearance(f.hip.y) > .44 && f.kneeAngle < 150 &&
      shoulderHeight(f) < .48, 92)], { minCycle: 250 }),
  'wall-sit': hold(standingSide, 'נמקם את הכתפיים מעל האגן ונכופף את הברכיים כאילו יושבים על כיסא.',
    f => f.torsoUp > .85 && f.kneeAngle > 62 && f.kneeAngle < 120 &&
      Math.abs(f.dy(f.main.knee, f.main.hip)) < .38, { verification: 'partial' }),
  'push-ups': rep(floorSide, 'נכופף את המרפקים כדי לקרב את החזה לרצפה. האגן יורד ועולה יחד עם הכתפיים.',
    plankStart, [point((f, c) => groundedPlank(f) && f.elbowAngle < 110 &&
      shoulderHeight(c.origin) - shoulderHeight(f) > .39, 85)],
    { form: f => hipSag(f) > .25 ? hipsInLine : null, minCycle: 250 }),
  'knee-push-ups': rep(floorSide, 'נשאיר ברכיים על הרצפה ואגן בקו עם הכתפיים, ונכופף את המרפקים.',
    f => f.kneeLine > 146 && reachFloor(f) && f.clearance(f.main.knee?.y) < .21 && f.elbowAngle > 145,
    [point(f => f.kneeLine > 142 && reachFloor(f) && f.clearance(f.main.knee?.y) < .21 &&
      f.elbowAngle < 110 && shoulderHeight(f) < .55, 81)],
    { form: f => f.kneeLine < 132 ? 'ניישר את הקו מהכתפיים עד הברכיים, עם האגן באמצע.' : null, minCycle: 250 }),
  'chair-dips': rep({ ...floorSide, setup: 'standing' }, 'נשאיר את כפות הידיים על המושב ונכופף את המרפקים בעדינות לאחור.',
    f => upright(f) && f.elbowAngle > 148 && f.kneeAngle > 105 && f.clearance(f.main.wrist?.y) > .39,
    [point((f, c) => f.elbowAngle < 116 && f.dy(f.hip, c.origin.hip) > .25 &&
      f.dist(f.main.wrist, c.origin.main.wrist) < .23 && f.clearance(f.main.wrist?.y) > .39, 83)],
    { minCycle: 245, verification: 'partial' }),
  'pike-push-ups': rep(floorSide, 'נרים את האגן לצורת אוהל ונכופף מרפקים כדי לקרב את הראש לרצפה.',
    f => f.torsoUp < -.18 && f.bodyLine < 145 && reachFloor(f) && f.elbowAngle > 145,
    [point(f => f.torsoUp < -.18 && f.bodyLine < 148 && reachFloor(f) && f.elbowAngle < 120 &&
      f.clearance(f.nose?.y ?? f.main.shoulder?.y) < .44, 76)], { minCycle: 220 }),
  'quad-stretch': hold({ ...standingSide, required: both(...BODY) }, 'נקרב את העקב לאגן עם כף היד, ונשמור את ברכי הרגליים קרובות.', f => {
    if (!upright(f)) return;
    return f.sides.find(side => side.kneeAngle < 88 && f.sides[1 - side.index].kneeAngle > 145 &&
      f.dist(side.ankle, side.hip) < .99 && f.dist(side.wrist, side.ankle) < .45)?.index;
  }, { twoSides: true }),
  'hamstring-stretch': hold(standingSide, 'נאריך את הרגליים ונוריד את כפות הידיים עד מקום שנוח להישאר בו.',
    f => f.kneeAngle > 147 && f.torsoUp < .33 && f.dy(f.main.wrist, f.hip) > .29,
    { required: either(...LEGS, 'wrist') }),
  'calf-stretch': hold({ ...jumpSide, required: both(...ALL) }, 'נשלח רגל אחת לאחור ונשאיר את העקב שלה קרוב לרצפה.', f => {
    if (f.feet < .81 || !upright(f) || !planted(f) || !f.sides.some(side =>
      Math.abs(f.dx(side.wrist, side.shoulder)) > .48 && side.elbowAngle > 100)) return;
    return f.sides.find(side => side.kneeAngle > 155 && f.sides[1 - side.index].kneeAngle < 147 &&
      side.heelRise < .14 && Math.abs(f.dx(side.ankle, f.hip)) > .42)?.index;
  }, { twoSides: true, verification: 'partial' }),
};

// Only these policy fields are part of the UI contract.
export const CAMERA_EXERCISES = Object.freeze(Object.fromEntries(Object.entries(PROFILES).map(([id, p]) => [id,
  Object.freeze({ view: p.view, setup: p.setup, required: p.required, kind: p.kind,
    verification: p.verification || 'pose', hint: p.hint, twoSides: !!p.twoSides, signal: !!p.signal })])));
export const FORM_HINTS = { SIDE_SWITCH };
