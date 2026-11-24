// SPDX-License-Identifier: CC0-1.0
// World-space targets in metres. Frame numbers are inclusive at 30 Hz.
const ready = {
  hips: [0, .735, 0], rightHand: [-.145, 1.035, .29], leftHand: [.23, 1.015, .22],
  leftFoot: [.18, .08, .035], rightFoot: [-.18, .08, -.035],
  shaft: [-.12, .98, .15], normal: [0, 0, 1],
  hipYaw: 0, twist: 0, lean: 6, roll: 0, head: 0, headYaw: 0, yaw: 0,
  rightElbow: [-1, -.48, -.30], leftElbow: [1, -.48, -.30],
  leftKnee: [0, 0, 1], rightKnee: [0, 0, 1],
  leftFootPitch: 0, rightFootPitch: 0, leftFootYaw: 0, rightFootYaw: 0, leftOpen: 1, leftPalmDown: 0
};
const translatedReady = (x, z) => Object.fromEntries(Object.entries(ready).map(([channel, value]) =>
  [channel, ['hips', 'rightHand', 'leftHand', 'leftFoot', 'rightFoot'].includes(channel)
    ? [value[0] + x, value[1], value[2] + z] : value]));
const event = (frame, type, label) => ({frame, type, label});
const support = (bone, startFrame, endFrame) => ({bone, startFrame, endFrame});
const both = (start, end) => ['LeftFoot', 'RightFoot'].map(bone => support(bone, start, end));

// Side-seated on the left hip with the free hand braced and racket clear of court.
// Every authored channel has an explicit common value at the fall/rise join.
const seated = {
  ...ready, leftOpen: 1, leftPalmDown: 1, hips: [.38, .165, .10], roll: -64, lean: 16, twist: 3, hipYaw: -7,
  leftFoot: [.37, .08, .36], rightFoot: [-.18, .08, -.035],
  leftHand: [.92, .055, .36], rightHand: [.60, .70, .42],
  shaft: [-.82, .54, .16], head: -20, headYaw: -15,
  leftKnee: [-.12, .73, .93], rightKnee: [.08, .80, .85],
  leftElbow: [.82, .32, -.52], rightElbow: [-.55, -.30, -.89]
};

export default [
  {
    id: 'slide_to_ball', label: 'החלקה אל כדור רחב', category: 'תנועה במגרש',
    description: 'דחיפה מרגל שמאל, החלקת סוליות הצידה וחבטה נמוכה מתוך פישוק. הבלימה מסתיימת בעמידת מוצא במקום החדש.',
    distinction: 'ההחלקה עוברת הצידה ונגמרת בעמדה החדשה. הרגל האחורית נאספת רק אחרי העצירה.',
    related: ['clay_slide'], durationFrames: 72,
    events: [event(10,'push_off','דחיפה מרגל שמאל'),event(17,'skid_begin','תחילת ההחלקה'),event(30,'contact','חבטה נמוכה תוך כדי החלקה'),event(41,'brake','בלימת הסוליה המובילה'),event(56,'recover_step','איסוף הרגל האחורית')],
    supports: [support('LeftFoot',0,13),support('RightFoot',0,6),support('RightFoot',41,72),support('LeftFoot',62,72)],
    groundContacts: [{kind:'intentional-clay-skid',startFrame:17,endFrame:41,footBones:['RightFoot','LeftFoot']}],
    ball: {incoming:[1.2,-.55,-5.9],outgoing:[.9,2.6,8.5]},
    keys: [
      [0,ready],
      [6,{rightFoot:ready.rightFoot}],[7,{hips:[-.02,.68,-.01],hipYaw:-12,twist:-17,lean:14,roll:-4,rightHand:[-.31,.96,.13],leftHand:[.26,1.07,.21],shaft:[-.54,.78,.09]}],
      [13,{hips:[-.16,.685,.005],leftFoot:ready.leftFoot,rightFoot:[-.40,.14,.03],rightHand:[-.54,.93,.15],leftHand:[.19,1.09,.14],roll:7}],
      [17,{hips:[-.29,.625,.01],leftFoot:[.135,.08,.045],rightFoot:[-.61,.08,.10],rightHand:[-.65,.82,.20],leftHand:[.12,1.06,.05],shaft:[-.89,.28,-.09],lean:18,twist:-28}],
      [26,{hips:[-.49,.575,.03],leftFoot:[-.075,.08,.07],rightFoot:[-.84,.08,.12],rightHand:[-.88,.70,.285],leftHand:[-.13,1.06,.00],shaft:[-.95,.08,.15],hipYaw:-12,twist:-14,roll:9}],
      [30,{hips:[-.58,.565,.05],leftFoot:[-.16,.08,.08],rightFoot:[-.93,.08,.13],rightHand:[-.98,.715,.34],leftHand:[-.22,1.06,.04],shaft:[-.90,.19,.37],hipYaw:-3,twist:2}],
      [35,{hips:[-.67,.575,.065],leftFoot:[-.24,.08,.082],rightFoot:[-1.012,.08,.14],rightHand:[-.86,.90,.47],leftHand:[-.32,1.04,.10],shaft:[-.62,.44,.64],twist:21}],
      [41,{hips:[-.75,.61,.08],leftFoot:[-.32,.08,.085],rightFoot:[-1.06,.08,.14],rightHand:[-.74,1.04,.46],leftHand:[-.43,1.09,.17],shaft:[-.22,.78,.57],hipYaw:6,twist:27,roll:-6}],
      [48,{hips:[-.81,.65,.08],leftFoot:[-.35,.08,.085],rightHand:[-.81,1.08,.40],leftHand:[-.52,1.08,.22],twist:13}],
      [56,{hips:[-.85,.708,.13],leftFoot:[-.54,.155,.19],lean:10,roll:-3}],
      [62,{leftFoot:[-.70,.08,.21]}],
      [72,translatedReady(-.88,.175)]
    ]
  },
  {
    id:'court_fall', label:'נפילה על הצד', category:'תנועה במגרש',
    description:'הרגל השמאלית מועדת. הברכיים מתכופפות, כף היד החופשית נשלחת לקרקע, והמשקל יורד לישיבה על צד שמאל.',
    distinction:'הנפילה מסתיימת על הקרקע ויוצרת תנוחת פתיחה לקימה.',related:['dive'],durationFrames:48,
    events:[event(8,'stumble','מעידה ברגל שמאל'),event(19,'brace','היד נשלחת לתמיכה'),event(27,'palm_plant','כף יד שמאל על המגרש'),event(35,'hip_down','התיישבות על הצד')],
    supports:[support('RightFoot',0,48),support('LeftFoot',0,7),support('LeftFoot',21,48)],
    keys:[
      [0,ready],
      [8,{hips:[.045,.73,.025],leftFoot:ready.leftFoot,lean:9,roll:-5,headYaw:-8,leftHand:[.29,1.05,.23]}],
      [14,{leftPalmDown:.4,hips:[.13,.65,.05],leftFoot:[.25,.115,.16],rightHand:[-.01,1.11,.28],leftHand:[.47,.91,.26],roll:-16,lean:18,hipYaw:-8,twist:-5}],
      [20,{hips:[.24,.48,.07],leftFoot:[.37,.08,.36],rightHand:[.22,.98,.37],leftHand:[.69,.54,.34],shaft:[-.55,.81,.10],roll:-35,lean:23,head:-14,leftKnee:[0,.50,1],rightKnee:[0,.50,1]}],
      [24,{leftPalmDown:1,hips:[.30,.36,.08],leftHand:[.85,.19,.36],rightHand:[.41,.83,.39],roll:-51,leftElbow:[.85,.1,-.53]}],
      [27,{hips:[.34,.27,.09],leftHand:seated.leftHand,roll:-58,head:-20,leftKnee:seated.leftKnee,rightKnee:seated.rightKnee}],
      [35,{...seated,hips:[.39,.168,.102],roll:-66,head:-16}],
      [43,seated],[48,seated]
    ]
  },
  {
    id:'court_get_up',label:'קימה מהמגרש',category:'תנועה במגרש',
    description:'מישיבה על הצד השחקן נשען על יד שמאל, מביא רגל מתחת לגוף, מעביר אליה משקל ומתרומם לעמידת קבלה.',
    distinction:'הקימה מתחילה בדיוק בתנוחת הסיום של הנפילה. סדר התמיכות כולל כף יד, כריעה ודחיפה דרך רגל שמאל.',
    related:['recover','dive'],durationFrames:76,
    events:[event(10,'palm_push','דחיפה בכף היד'),event(27,'foot_under','רגל שמאל נכנסת מתחת לגוף'),event(38,'palm_lift','שחרור כף היד'),event(53,'rise','התרוממות מעל הרגל הקדמית'),event(69,'ready','התייצבות')],
    supports:[support('RightFoot',0,42),support('RightFoot',59,76),support('LeftFoot',0,13),support('LeftFoot',27,76)],
    keys:[
      [0,seated],[6,seated],
      [13,{hips:[.38,.23,.095],roll:-57,lean:23,leftHand:seated.leftHand,leftFoot:seated.leftFoot,rightHand:[.53,.75,.41],head:-10}],
      [21,{hips:[.41,.32,.08],roll:-45,lean:31,leftFoot:[.49,.17,.20],rightHand:[.42,.79,.43],twist:-6}],
      [27,{hips:[.43,.38,.06],roll:-35,lean:35,leftFoot:[.58,.08,.11],rightHand:[.36,.80,.45],shaft:[-.72,.62,.19],leftKnee:[.10,.26,1],rightKnee:[-.2,.38,1]}],
      [33,{hips:[.435,.435,.06],roll:-28,lean:39,leftHand:[.88,.31,.39],rightHand:[.35,.86,.46]}],
      [38,{leftPalmDown:.3,hips:[.42,.46,.055],roll:-22,lean:36,leftHand:[.78,.55,.37],rightHand:[.34,.87,.45],head:-12,headYaw:-4}],
      [43,{hips:[.40,.505,.06],roll:-15,lean:31,leftHand:[.74,.67,.38],rightHand:[.28,.90,.39],rightFoot:seated.rightFoot}],
      [51,{leftPalmDown:0,hips:[.43,.64,.06],roll:-8,lean:22,leftHand:[.70,.89,.32],rightHand:[.23,.98,.34],rightFoot:[.0,.155,.02],hipYaw:0,twist:-2,leftKnee:[0,0,1],rightKnee:[0,0,1]}],
      [59,{hips:[.405,.72,.075],rightFoot:[.22,.08,.04],roll:-3,lean:11,shaft:[-.29,.93,.19],leftHand:[.65,1.01,.29]}],
      [69,translatedReady(.40,.075)],[76,translatedReady(.40,.075)]
    ]
  },
  {
    id:'point_win',label:'ניצחון בנקודה',category:'תגובות',
    description:'רגע של הכרה בניצחון, אגרוף שמאל עולה אל הלחי ונמשך מטה בתנועה אחת. הרגליים נשארות על המגרש.',
    distinction:'משיכת אגרוף יחידה אל החזה, עם הכנה והדגשה קצרות על רגל שמאל.',related:['celebrate'],durationFrames:61,
    events:[event(11,'recognition','מבט אל הכדור שסיים את הנקודה'),event(22,'fist_raise','הרמת האגרוף'),event(30,'fist_pump','משיכה אל החזה'),event(45,'exhale','נשיפה ושחרור')],
    supports:both(0,61),
    keys:[
      [0,{...ready,handOpenness:1}],[8,{handOpenness:.65,hips:[-.012,.745,.01],lean:1,head:-6,headYaw:-10,rightHand:[-.22,1.0,.24],leftHand:[.25,1.05,.20]}],
      [14,{handOpenness:.22,hips:[.005,.725,0],hipYaw:-4,twist:-9,roll:-3,leftHand:[.30,1.13,.25],rightHand:[-.27,.94,.18],shaft:[-.51,.83,.18],leftElbow:[.79,-.57,-.15]}],
      [22,{handOpenness:0,hips:[.055,.775,.025],leftHand:[.285,1.44,.19],rightHand:[-.25,.97,.14],lean:-3,head:-9,twist:-15,roll:4}],
      [25,{hips:[.06,.78,.02],leftHand:[.28,1.445,.18],rightHand:[-.26,.96,.14]}],
      [30,{hips:[.06,.735,.025],leftHand:[.255,1.17,.236],rightHand:[-.30,.94,.14],hipYaw:5,twist:13,roll:-5,lean:12,head:4}],
      [35,{handOpenness:0,hips:[.06,.73,.025],leftHand:[.25,1.13,.219],twist:16,head:6}],
      [45,{handOpenness:.70,hips:[.035,.76,.01],leftHand:[.27,1.14,.16],rightHand:[-.27,.97,.17],twist:7,roll:-2,lean:3,head:-2,headYaw:-2}],
      [61,{...ready,handOpenness:1}]
    ]
  },
  {
    id:'childlike_joy',label:'שמחה ילדותית',category:'תגובות',
    description:'שתי קפיצות קטנות בגבהים שונים, ראש מוטה הצידה ויד חופשית שנפתחת כלפי מעלה. כל נחיתה נספגת בברכיים.',
    distinction:'שתי קפיצות עם שלבי מעוף ותמיכה נפרדים ופתיחת יד רחבה מעל הראש.',related:['celebrate'],durationFrames:74,
    events:[event(13,'takeoff','ניתור ראשון'),event(25,'land','נחיתה ראשונה'),event(38,'takeoff','ניתור שני'),event(53,'land','נחיתה שנייה'),event(66,'settle','הירגעות')],
    supports:[...both(0,13),...both(25,38),...both(53,74)],
    keys:[
      [0,ready],
      [8,{leftElbow:[0.4,-0.12,-1],rightElbow:[-0.4,-0.85,-1],hips:[.02,.635,0],rightHand:[-.32,.90,.07],leftHand:[.35,.92,.07],lean:16,roll:-4,shaft:[-.34,.91,.19]}],
      [13,{hips:[.02,.83,.01],rightHand:[-.34,1.18,.12],leftHand:[.40,1.28,.10],leftFoot:ready.leftFoot,rightFoot:ready.rightFoot,lean:0,head:-8}],
      [19,{leftElbow:[0.4,-0.12,-1],rightElbow:[-0.4,-0.85,-1],hips:[.035,.98,.02],leftFoot:[.225,.29,.055],rightFoot:[-.13,.25,-.10],rightHand:[-.39,1.54,.12],leftHand:[.36,1.78,.14],roll:5,twist:-8,shaft:[-.62,.76,.13],head:-15}],
      [25,{hips:[.055,.81,.04],leftFoot:[.22,.08,.08],rightFoot:[-.12,.08,-.015],leftHand:[.42,1.40,.15],rightHand:[-.37,1.25,.10],roll:2,lean:6}],
      [29,{hips:[.06,.64,.035],rightHand:[-.35,1.0,.12],leftHand:[.46,1.14,.15],lean:18,roll:-5,head:0}],
      [38,{hips:[.055,.83,.035],leftFoot:[.22,.08,.08],rightFoot:[-.12,.08,-.015],rightHand:[-.27,1.35,.15],leftHand:[.47,1.40,.12],lean:-2,head:-10}],
      [45,{hips:[.03,1.015,.015],leftFoot:[.24,.27,.025],rightFoot:[-.19,.335,-.075],rightHand:[-.34,1.67,.135],leftHand:[.50,1.66,.12],roll:-6,twist:12,shaft:[-.48,.86,.18],head:-15}],
      [53,{hips:[0,.81,0],leftFoot:ready.leftFoot,rightFoot:ready.rightFoot,rightHand:[-.35,1.28,.12],leftHand:[.45,1.43,.15],roll:-3,lean:6}],
      [58,{hips:[-.015,.65,0],rightHand:[-.32,.99,.14],leftHand:[.39,1.16,.16],lean:16,head:4}],
      [66,{hips:[0,.754,0],rightHand:[-.23,1.06,.22],leftHand:[.30,1.14,.20],lean:3,twist:3,roll:2,head:-5}],
      [74,ready]
    ]
  },
  {
    id:'point_disappointment',label:'אכזבה אחרי הנקודה',category:'תגובות',
    description:'המבט נשאר על מקום ההחטאה, המחבט שוקע לצד הירך, הסנטר יורד והיד החופשית נחה על המותן. אחרי נשיפה המבט חוזר למגרש.',
    distinction:'המבט נעצר, המחבט פונה כלפי מטה והיד נחה על המותן לפני האיפוס.',related:['disappointed'],durationFrames:90,
    events:[event(10,'look','מבט אל מקום ההחטאה'),event(32,'racket_lower','הורדת המחבט'),event(47,'exhale','נשיפה והורדת הראש'),event(71,'reset','הרמת המבט')],
    supports:both(0,90),
    keys:[
      [0,ready],[10,{hips:[-.025,.745,.015],rightHand:[-.18,1.02,.29],leftHand:[.23,1.04,.24],headYaw:21,head:-4,lean:2,twist:7}],
      [18,{hips:[-.026,.744,.016],rightHand:[-.19,1.018,.28],leftHand:[.24,1.035,.22],headYaw:22}],
      [32,{hips:[-.055,.73,-.005],rightHand:[-.34,.78,.12],leftHand:[.19,.90,.11],shaft:[-.68,-.56,.43],normal:[.15,.28,.94],lean:15,roll:3,twist:2,head:16,headYaw:8}],
      [47,{hips:[-.072,.715,-.012],rightHand:[-.36,.775,.135],leftHand:[.145,.842,.06],shaft:[-.55,-.74,.34],lean:21,roll:5,hipYaw:-5,head:28,headYaw:0,leftElbow:[1,-.1,-.35]}],
      [62,{hips:[-.073,.72,-.009],rightHand:[-.365,.78,.13],leftHand:[.15,.846,.06],shaft:[-.57,-.73,.34],lean:20,head:24}],
      [71,{hips:[-.05,.74,0],rightHand:[-.33,.84,.15],leftHand:[.17,.88,.09],shaft:[-.74,-.46,.48],lean:12,head:-4,headYaw:-6}],
      [82,{hips:[-.02,.74,.005],rightHand:[-.24,.98,.21],leftHand:[.22,.97,.17],shaft:[-.63,.55,.48],lean:7,head:-3}],
      [90,ready]
    ]
  },
  {
    id:'match_handshake',label:'לחיצת ידיים בסיום',category:'תגובות',
    description:'השחקנים מתקדמים לרשת, משאירים את המחבט לצד הירך, מושיטים יד שמאל זה לזה, לוחצים ומרפים.',
    distinction:'שני שחקנים זה מול זה נוגעים באותה נקודה מעל הרשת ושומרים מגע לאורך הלחיצה.',
    related:['handshake'],durationFrames:86,
    partner:{animation:'match_handshake',translation:[.169397,0,1.072568],rotationY:Math.PI,scale:1},
    events:[event(15,'step_in','צעד אל הרשת'),event(35,'clasp','מפגש כפות הידיים'),event(48,'shake','לחיצת יד'),event(58,'release_hand','שחרור הידיים'),event(72,'step_back','צעד לאחור')],
    supports:[support('RightFoot',0,86),support('LeftFoot',0,9),support('LeftFoot',21,61),support('LeftFoot',77,86)],
    keys:[
      [0,{...ready,leftHandAngles:[-25,0,-12],handOpenness:1}],
      [9,{rightElbow:[-0.4,-0.12,-1],hips:[-.035,.75,.03],leftFoot:ready.leftFoot,head:-3,headYaw:5,rightHand:[-.28,.93,.13],shaft:[-.52,.73,.34]}],
      [15,{hips:[-.01,.74,.095],leftFoot:[.185,.16,.14],leftHand:[.22,1.085,.28],rightHand:[-.30,.87,.11],lean:7}],
      [21,{rightElbow:[-0.4,-0.12,-1],hips:[.01,.745,.145],leftFoot:[.18,.08,.25],leftHand:[.18,1.09,.35],rightHand:[-.30,.87,.13],shaft:[-.68,-.42,.50],leftHandAngles:[-63,-32,5]}],
      [29,{handOpenness:1,hips:[.02,.75,.175],hipYaw:-3,twist:-12,leftHand:[.12,1.10,.45],rightHand:[-.31,.88,.16],lean:11,head:4,leftHandAngles:[-77,-61,10]}],
      [35,{handOpenness:.56,leftHand:[.10,1.105,.48],leftHandAngles:[-75,-74,15],head:3}],
      [41,{leftHand:[.10,1.135,.48],hips:[.025,.758,.177],lean:9}],
      [48,{leftHand:[.10,1.074,.48],hips:[.02,.741,.173],lean:13,head:9}],
      [54,{leftHand:[.10,1.12,.48],hips:[.02,.754,.176],head:3}],
      [58,{leftHandAngles:[-75,-74,15],handOpenness:.56,leftHand:[.10,1.10,.48],lean:8}],
      [61,{handOpenness:1,leftFoot:[.18,.08,.25],leftHand:[.13,1.09,.42]}],
      [68,{hips:[-.015,.74,.105],leftFoot:[.185,.13,.19],rightHand:[-.27,.91,.12],leftHand:[.21,1.05,.30],shaft:[-.74,.26,.50],leftHandAngles:[-55,-31,7],head:-3}],
      [77,{leftFoot:ready.leftFoot,hips:[-.025,.74,.035],rightHand:[-.23,.97,.20],shaft:[-.48,.77,.34]}],
      [86,{...ready,leftHandAngles:[-25,0,-12],handOpenness:1}]
    ]
  },
  {
    id:'coach_serve_demo',label:'המאמן מדגים הגשה',category:'הדרכה',
    description:'המאמן פונה לילד, מציג את עמידת המוצא ועוצר כדי להראות את מסלול המחבט. אחר כך הוא מטיל כדור, מגיש ומפנה לילד את התור.',
    distinction:'המאמן מסמן ועוצר להדגמה, מבצע הגשה שלמה ואז פונה להתבונן בחזרה של הילד.',
    related:['serve_prepare_2','serve_toss','serve_whip','serve_land'],durationFrames:222,
    partner:{animation:'child_serve_rehearsal',translation:[1.0,0,.04],rotationY:-.24,scale:.78},
    events:[event(19,'invite','הפניית תשומת הלב של הילד'),event(42,'racket_path','הצגת מסלול המחבט'),event(57,'set','התכוננות להטלה'),event(68,'release','שחרור הכדור מיד שמאל'),event(89,'contact','מפגש המחבט והכדור'),event(122,'your_turn','סימון לילד לנסות'),event(176,'watch','התבוננות בחזרה של הילד'),event(201,'nod','הנהון')],
    supports:[support('LeftFoot',0,15),support('LeftFoot',30,202),support('LeftFoot',211,222),support('RightFoot',0,88),support('RightFoot',111,208),support('RightFoot',217,222)],
    ball:{toss:true,outgoing:[.65,-1.0,8.8]},
    keys:[
      [0,ready],
      [15,{hips:[-.025,.76,0],leftFoot:ready.leftFoot,rightHand:[-.25,1.02,.20],leftHand:[.31,1.13,.24],shaft:[-.28,.93,.20],hipYaw:9,twist:14,headYaw:23,head:3}],
      [22,{hips:[-.035,.74,0],leftFoot:[.185,.145,.105],leftHand:[.31,1.16,.20],headYaw:23}],
      [30,{hips:[-.005,.754,.025],leftFoot:[.17,.08,.16],rightHand:[-.29,1.12,.10],leftHand:[.21,1.13,.26],shaft:[-.53,.81,-.20],hipYaw:-13,twist:-18,headYaw:9}],
      [39,{rightElbow:[-0.4,-0.85,-0.06],hips:[-.035,.748,.0],rightHand:[-.37,1.34,-.07],leftHand:[.205,1.25,.28],shaft:[-.46,.55,-.69],headYaw:24,head:-4}],
      [46,{hips:[-.035,.748,0],rightHand:[-.37,1.34,-.07],leftHand:[.205,1.25,.28],shaft:[-.46,.55,-.69],headYaw:24}],
      [57,{rightElbow:[-0.4,-0.85,-0.06],hips:[-.05,.715,-.025],rightHand:[-.31,1.05,-.10],leftHand:[.14,.985,.19],shaft:[-.62,.71,-.27],hipYaw:-19,twist:-23,headYaw:13,head:2,lean:7}],
      [62,{hips:[-.047,.704,-.017],rightHand:[-.36,1.13,-.12],leftHand:[.14,1.10,.24],shaft:[-.57,.67,-.43],head:-10}],
      [68,{normal:[0,.78,.58],rightElbow:[-0.4,-0.85,-0.06],hips:[-.036,.715,-.002],rightHand:[-.355,1.36,-.12],leftHand:[.12,1.49,.22],shaft:[-.44,.47,-.75],hipYaw:-16,twist:-25,lean:-5,roll:4,head:-16}],
      [76,{normal:[0,.78,-.60],hips:[-.025,.713,.012],rightHand:[-.265,1.38,-.125],leftHand:[.13,1.60,.19],shaft:[-.28,-.61,-.74],head:-19,twist:-22,roll:7}],
      [82,{normal:[0,.66,.56],hips:[-.012,.751,.035],rightHand:[-.245,1.52,-.035],leftHand:[.20,1.43,.21],shaft:[-.31,.51,-.79],hipYaw:-7,twist:-10,roll:5}],
      [89,{normal:[0,-.08,.99],hips:[.005,.79,.058],rightHand:[-.18,1.66,.18],leftHand:[.23,1.18,.23],shaft:[-.13,.987,.08],hipYaw:3,twist:5,lean:3,roll:1,head:-13}],
      [91,{rightFoot:ready.rightFoot}],
      [96,{normal:[0,-1,.06],hips:[.024,.757,.085],rightHand:[-.065,1.27,.49],leftHand:[.26,1.07,.18],shaft:[.28,.05,.95],hipYaw:10,twist:21,lean:15,head:-3}],
      [102,{normal:[0,-.66,-.75],hips:[.02,.715,.109],rightFoot:[-.18,.16,.02],rightHand:[.065,.995,.36],leftHand:[.25,1.055,.15],shaft:[.44,-.7,.56],hipYaw:14,twist:26,lean:19,head:2}],
      [111,{normal:[0,-.89,.58],hips:[.015,.74,.085],rightFoot:[-.18,.08,.065],rightHand:[-.13,1.0,.25],leftHand:[.25,1.07,.19],shaft:[-.47,.56,.62],hipYaw:7,twist:11,lean:7}],
      [122,{normal:[0,-.31,.94],hips:[.035,.755,.065],rightHand:[-.26,.95,.16],leftHand:[.38,1.16,.25],shaft:[-.48,.84,.20],hipYaw:14,twist:19,headYaw:27,head:6}],
      [139,{hips:[.027,.755,.06],rightHand:[-.26,.95,.15],leftHand:[.32,1.065,.18],hipYaw:12,twist:16,headYaw:29,head:2}],
      [164,{hips:[.020,.745,.062],rightHand:[-.275,.942,.15],leftHand:[.27,1.005,.16],headYaw:30,head:6}],
      [182,{hips:[.025,.753,.066],leftHand:[.275,1.03,.165],headYaw:25,head:-4}],
      [195,{hips:[.031,.754,.064],headYaw:27,head:-1,leftHand:[.31,1.13,.20]}],
      [201,{hips:[.031,.746,.062],headYaw:25,head:12,leftHand:[.32,1.14,.20]}],
      [202,{leftFoot:[.17,.08,.16],rightFoot:[-.18,.08,.065]}],
      [208,{hips:[.005,.735,.046],leftFoot:[.177,.125,.105],rightFoot:[-.18,.08,.065],leftHand:[.26,1.07,.20],head:0}],
      [211,{hips:[.005,.735,.03],leftFoot:ready.leftFoot,rightFoot:[-.18,.105,.045]}],
      [217,{leftFoot:ready.leftFoot,rightFoot:ready.rightFoot}],
      [222,ready]
    ]
  },
  {
    id:'child_serve_rehearsal',label:'הילד מתרגל הגשה',category:'הדרכה',
    description:'הילד עוקב במבט אחר ההדגמה, נענה לסימן של המאמן ומתרגל הגשה ללא כדור. הוא בודק את ההנפה בפעם הראשונה ומשלים אותה בפעם השנייה.',
    distinction:'חזרה לימודית עם מבט למאמן, ניסיון הכנה קצר והגשת צל של הילד בקצב משלו.',
    related:['serve_prepare_2','serve_whip'],durationFrames:222,
    events:[event(23,'watch','מבט אל המאמן'),event(72,'track_toss','מעקב אחר ההטלה'),event(118,'take_turn','קבלת התור'),event(147,'check_pose','בדיקת העמדה מול המאמן'),event(163,'shadow_toss','תרגול הטלה ללא כדור'),event(179,'shadow_reach','הנפה לעבר נקודת מגע דמיונית'),event(198,'look_back','פנייה למאמן')],
    supports:[support('LeftFoot',0,118),support('LeftFoot',136,197),support('LeftFoot',212,222),support('RightFoot',0,222)],
    keys:[
      [0,ready],[14,{hips:[-.03,.74,0],headYaw:-26,head:1,hipYaw:-6,twist:-8,rightHand:[-.22,.97,.23],leftHand:[.195,.995,.17]}],
      [32,{hips:[-.047,.755,.005],rightHand:[-.23,.98,.22],leftHand:[.19,.99,.165],headYaw:-31,head:-6,roll:2,shaft:[-.36,.90,.19]}],
      [51,{hips:[-.042,.751,.007],headYaw:-29,head:3,leftHand:[.205,.99,.16]}],
      [71,{hips:[-.055,.748,.012],headYaw:-24,head:-4,rightHand:[-.22,1.00,.237]}],
      [84,{hips:[-.045,.762,.01],headYaw:-20,head:-17,leftHand:[.21,1.025,.17]}],
      [95,{hips:[-.04,.75,.014],headYaw:-10,head:-8,twist:-2}],
      [110,{hips:[-.025,.728,.015],headYaw:-28,head:1,rightHand:[-.22,.995,.245],leftHand:[.23,1.04,.21]}],
      [118,{hips:[-.04,.716,.005],head:9,leftFoot:ready.leftFoot,hipYaw:-7,twist:-12}],
      [128,{hips:[-.05,.73,-.005],leftFoot:[.19,.155,.10],rightHand:[-.32,1.01,.145],leftHand:[.20,1.095,.22],headYaw:-8,head:10}],
      [136,{hips:[-.025,.731,.017],leftFoot:[.16,.08,.15],rightHand:[-.36,1.18,-.045],leftHand:[.17,1.18,.24],shaft:[-.51,.75,-.36],hipYaw:-13,twist:-20,headYaw:-9,head:-1}],
      [147,{hips:[-.036,.727,.003],rightHand:[-.36,1.30,-.07],leftHand:[.15,1.30,.24],shaft:[-.42,.66,-.58],headYaw:-23,head:-5,rightElbow:[-.96,-.10,-.42]}],
      [153,{hips:[-.044,.705,-.012],rightHand:[-.32,1.11,-.07],leftHand:[.16,1.04,.22],shaft:[-.60,.72,-.22],headYaw:8,head:1}],
      [163,{normal:[0,.85,.54],hips:[-.04,.695,.005],rightHand:[-.34,1.31,-.13],leftHand:[.12,1.475,.20],shaft:[-.41,.40,-.78],hipYaw:-18,twist:-21,lean:-4,head:-15,roll:3}],
      [169,{normal:[0,.88,-.42],hips:[-.025,.711,.021],rightHand:[-.255,1.396,-.09],leftHand:[.14,1.49,.20],shaft:[-.38,-.42,-.78],head:-18,twist:-16}],
      [174,{normal:[0,.74,.58],shaft:[-.29,.48,-.82]}],
      [179,{normal:[0,-.15,.98],hips:[.009,.778,.050],rightHand:[-.20,1.605,.19],leftHand:[.265,1.20,.205],shaft:[-.12,.97,.19],head:-11,roll:2,hipYaw:0,twist:9,lean:2}],
      [190,{normal:[0,-.95,-.29],hips:[.023,.721,.072],rightHand:[.03,1.10,.425],leftHand:[.28,1.05,.17],shaft:[.44,-.34,.80],hipYaw:10,twist:22,lean:15,head:0}],
      [197,{normal:[0,-.57,.82],hips:[.003,.733,.057],leftFoot:[.16,.08,.15],rightHand:[-.185,.99,.255],leftHand:[.22,1.03,.20],shaft:[-.35,.82,.46],hipYaw:-3,twist:-5,headYaw:-28,head:3}],
      [204,{hips:[-.037,.74,.026],leftFoot:[.18,.146,.11],headYaw:-29,head:-3}],
      [212,{hips:[-.011,.747,.008],leftFoot:ready.leftFoot,rightHand:[-.19,1.045,.255],headYaw:-14,head:3}],
      [222,ready]
    ]
  }
];
