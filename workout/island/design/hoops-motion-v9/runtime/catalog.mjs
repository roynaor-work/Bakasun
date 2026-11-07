import {CANONICAL_BONE_NAMES} from './skeleton.mjs';
export {CANONICAL_BONE_NAMES};
const rows=[];
const add=(id,label,labelHe,group,kind,durationSeconds,loop=false,options={})=>rows.push({id,label,labelHe,group,kind,durationSeconds,loop,...options});
for(const [variant,he] of [['relaxed','נינוחה'],['weight_shift','העברת משקל'],['ready','מוכנות']]) {
  add(`idle_${variant}`,`Idle · ${variant}`,`עמידה ${he}`,'locomotion','idle',2.4,true,{variant,ball:false});
  add(`idle_${variant}_ball`,`Ball idle · ${variant}`,`עמידה ${he} עם כדור`,'locomotion','idle',2.4,true,{variant,ball:true});
}
// Fixed independent gait targets, steps/second. Two steps per loop.
for(const [kind,speed,cadence,he] of [['walk',1.35,1.8,'הליכה'],['jog',2.7,2.5,'ג׳וג'],['run',4.6,3.0,'ריצה'],['sprint',6.8,3.6,'ספרינט']])for(const ball of [false,true])
  add(`${kind}${ball?'_ball':''}`,`${kind}${ball?' · ball':''}`,`${he}${ball?' עם כדור':''}`,'locomotion','gait',Math.round(2/cadence*15)/15,true,{gait:kind,speed,cadence,ball});
for(const ball of [false,true])add(`brake${ball?'_ball':''}`,`Run to brake${ball?' · ball':''}`,`ריצה לבלימה${ball?' עם כדור':''}`,'locomotion','brake',1.8,false,{ball,speed:3.2});
for(const angle of [45,90,135,180])for(const side of ['left','right'])for(const ball of [false,true])
  add(`cut_${angle}_${side}${ball?'_ball':''}`,`${angle}° ${side} cut${ball?' · ball':''}`,`חיתוך ${angle}° ${side==='left'?'שמאלה':'ימינה'}${ball?' עם כדור':''}`,'locomotion','cut',1.6,false,{angle,side,ball,speed:1.6});
for(const side of ['left','right'])add(`pivot_reverse_${side}`,`Protected reverse pivot · ${side}`,`ציר אחורי מוגן ${side==='left'?'שמאל':'ימין'}`,'locomotion','pivot',1.6,false,{side,ball:true});
for(const side of ['left','right'])add(`dribble_walk_${side}`,`Walking dribble · ${side}`,`הליכת כדרור ${side==='left'?'שמאל':'ימין'}`,'locomotion','gait',1.2,true,{gait:'walk',speed:1.2,cadence:1.667,ball:true,side});
for(const [direction,x,z] of [['forward',0,1],['backward',0,-1],['left',1,0],['right',-1,0],['forward_left',.7071,.7071],['forward_right',-.7071,.7071],['backward_left',.7071,-.7071],['backward_right',-.7071,-.7071]])
  add(`dribble_${direction}`,`Directional dribble · ${direction}`,`כדרור ${{forward:'קדימה',backward:'לאחור',left:'שמאלה',right:'ימינה',forward_left:'קדימה ושמאלה',forward_right:'קדימה וימינה',backward_left:'לאחור ושמאלה',backward_right:'לאחור וימינה'}[direction]}`,'locomotion','gait',1.2,true,{gait:'walk',speed:1.05,cadence:1.667,ball:true,direction:[x,z],side:x>0?'left':'right'});
for(const kind of ['crossover','between_legs','hesitation'])for(const side of ['left','right'])add(`dribble_${kind}_${side}`,`${kind} · ${side}`,`${{crossover:'קרוס אובר',between_legs:'בין הרגליים',hesitation:'היסוס'}[kind]} ${side==='left'?'שמאל':'ימין'}`,'attack',kind,1.4,false,{side,ball:true});
for(const kind of ['euro','layup'])for(const side of ['left','right'])add(`${kind}_${side}`,`${kind} · ${side}`,`${kind==='euro'?'יורו סטפ':'לייאפ'} ${side==='left'?'שמאל':'ימין'}`,'attack',kind,2.4,false,{side,ball:true});
for(const [kind,he,d] of [['floater','פלוטר',2],['jump_shot','זריקת קפיצה',2],['free_throw','זריקת עונשין',2.4],['three_point','שלוש נקודות',2.2],['dunk_one_hand','הטבעה ביד אחת',2.4],['dunk_two_hands','הטבעה בשתי ידיים',2.4]])add(kind,kind.replaceAll('_',' '),he,'attack',kind,d,false,{ball:true});
add('screen_set','Set screen','מסך','actions','screen',2.4,true,{ball:false});
for(const side of ['left','right'])add(`basket_cut_${side}`,`Basket cut · ${side}`,`חיתוך לסל ${side==='left'?'משמאל':'מימין'}`,'locomotion','basket_cut',1.8,false,{side,speed:2.2,ball:false});
add('defensive_stance','Defensive stance','עמידת הגנה','actions','defensive_stance',2.4,true,{ball:false});
for(const side of ['left','right'])add(`defensive_slide_${side}`,`Defensive slide · ${side}`,`החלקת הגנה ${side==='left'?'שמאל':'ימין'}`,'locomotion','slide',1.4,true,{side,speed:.55,cadence:1.429,ball:false});
for(const [id,kind,he,d] of [['closeout','closeout','סגירה',1.8],['block_two_hands','block','חסימה בשתי ידיים',1.8],['steal_poke','steal','נגיעה לחטיפה',1.6],['pass_deflect_left','deflect','הפרעה למסירה שמאלה',1.6],['pass_deflect_right','deflect','הפרעה למסירה ימינה',1.6],['rebound_jump','rebound','קפיצה לריבאונד',1.8],['rebound_land','rebound_land','נחיתה עם הכדור',1.4],['loose_ball_dive_left','dive','צלילה שמאלה',2.4],['loose_ball_dive_right','dive','צלילה ימינה',2.4],['get_up_front','get_up','קימה מלפנים',2.8],['get_up_back','get_up','קימה מהגב',2.8]])add(id,id.replaceAll('_',' '),he,'actions',kind,d,false,{side:id.endsWith('left')?'left':'right',ball:['rebound','rebound_land','dive'].includes(kind)});
for(const [variant,he] of [['fist','אגרוף ניצחון'],['jump','קפיצת שמחה'],['chest','טפיחה על החזה'],['point','הצבעה לקהל']])add(`celebrate_${variant}`,`Celebrate · ${variant}`,he,'actions','celebrate',2.4,false,{variant,ball:false});
add('disappointed','Disappointed','שחקן מאוכזב','actions','disappointed',2.8,false,{ball:false});
add('hands_on_hips','Hands on hips','ידיים על המותניים','actions','hands_on_hips',2.4,true,{ball:false});
function poseStates(c){
  if(c.kind==='brake')return[c.ball?'running_dribble':'moving_empty',c.ball?'held_stopped':'ready_empty'];
  if(c.kind==='pivot')return['held_stopped','held_pivoted'];
  if(['gait','cut','basket_cut'].includes(c.kind))return[c.ball?'running_dribble':'moving_empty',c.ball?'running_dribble':'moving_empty'];
  if(['crossover','between_legs','hesitation'].includes(c.kind))return['dribbling',`dribbling_${c.side}`];
  if(['euro','layup','floater','jump_shot','free_throw','three_point','dunk_one_hand','dunk_two_hands'].includes(c.kind))return[['euro','layup'].includes(c.kind)?'moving_held':'held_ready','shot_released'];
  if(['defensive_stance','slide','closeout','block','steal','deflect'].includes(c.kind))return['defensive_ready','defensive_ready'];
  if(c.kind==='rebound')return['defensive_ready','held_ready'];
  if(c.kind==='rebound_land')return['airborne_held','held_ready'];
  if(c.kind==='dive')return['loose_ball','grounded_held'];
  if(c.kind==='get_up')return['grounded_empty','ready_empty'];
  return[c.ball?'held_ready':'ready_empty',c.ball?'held_ready':'ready_empty'];
}
export const CATALOG=Object.freeze(rows.map(row=>{const[startState,endState]=poseStates(row);return Object.freeze({...row,startState,endState,glb:`runtime/clips/${row.id}.glb`,json:`runtime/keyframes/${row.id}.json.gz`});}));
export const CLIP_IDS=Object.freeze(CATALOG.map(c=>c.id));
export const CLIPS=Object.freeze(Object.fromEntries(CATALOG.map(c=>[c.id,c])));
