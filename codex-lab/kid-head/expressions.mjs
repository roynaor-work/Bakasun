// All controls are continuous. Values describe this lab's rig, not a measured
// match to a reference image; the source expression sheet is unavailable.
export const PARAMETER_RANGES=Object.freeze({
 eyeOpen:[.10,1.22],wink:[0,1],gazeX:[-1,1],gazeY:[-1,1],
 browRaise:[-.7,1],browTilt:[-1,1],browAsym:[-1,1],
 cheekPuff:[0,1],cheekLift:[0,1],jawOpen:[0,1],chinTight:[0,1],
 mouthOpen:[0,.34],mouthWidth:[.12,.35],smile:[-1,1],mouthShift:[-.055,.055],
 clench:[0,1],tongue:[0,1]
});
export const DEFAULT_PARAMETERS=Object.freeze({
 eyeOpen:.94,wink:0,gazeX:0,gazeY:0,browRaise:0,browTilt:0,browAsym:0,
 cheekPuff:.12,cheekLift:.12,jawOpen:.08,chinTight:0,
 mouthOpen:.025,mouthWidth:.22,smile:.35,mouthShift:0,clench:0,tongue:0
});
const entry=(id,label,description,parameters)=>Object.freeze({id,label,description,parameters:Object.freeze({...DEFAULT_PARAMETERS,...parameters})});
export const EXPRESSION_LIST=Object.freeze([
 entry('happy','שמח','עיניים מאירות, לחיים מורמות וחיוך פתוח עם שיניים ולשון.',
  {eyeOpen:.95,browRaise:.25,cheekPuff:.38,cheekLift:.80,jawOpen:.46,mouthOpen:.21,mouthWidth:.31,smile:.95,tongue:.72}),
 entry('effort','מאמץ','כיווץ עיניים, גבות מתכנסות, לחיים מנופחות ושיניים קפוצות.',
  {eyeOpen:.48,browRaise:-.38,browTilt:.96,cheekPuff:1,cheekLift:.32,jawOpen:.12,chinTight:1,mouthOpen:.105,mouthWidth:.245,smile:-.28,clench:1}),
 entry('surprised','מופתע','עיניים פתוחות, גבות גבוהות ופה עגול עם ירידת לסת.',
  {eyeOpen:1.19,browRaise:.94,browTilt:-.05,cheekPuff:.04,cheekLift:0,jawOpen:1,mouthOpen:.32,mouthWidth:.15,smile:0,tongue:.12}),
 entry('victory','ניצחון','קריצה, גבה מורמת וחיוך רחב ואסימטרי.',
  {eyeOpen:.94,wink:.91,browRaise:.42,browAsym:.65,cheekPuff:.45,cheekLift:1,jawOpen:.45,mouthOpen:.19,mouthWidth:.34,smile:1,mouthShift:.015,tongue:.52}),
 entry('tired','עייף ומרוצה','עפעפיים כבדים, מבט נמוך וחיוך סגור קטן שמביע סיפוק.',
  {eyeOpen:.50,gazeY:-.30,browRaise:-.28,browTilt:-.25,cheekPuff:.18,cheekLift:.30,jawOpen:0,mouthOpen:.008,mouthWidth:.205,smile:.69}),
 entry('thinking','מחשבה','מבט הצידה ולמעלה, גבות לא סימטריות ופה קטן משוך הצידה.',
  {eyeOpen:.78,gazeX:-.65,gazeY:.48,browRaise:.12,browTilt:-.27,browAsym:1,cheekPuff:.34,cheekLift:.08,jawOpen:0,chinTight:.34,mouthOpen:.008,mouthWidth:.15,smile:-.35,mouthShift:.048})
]);
export const EXPRESSIONS=Object.freeze(Object.fromEntries(EXPRESSION_LIST.map(e=>[e.id,e])));

export function resolveExpression(value='happy'){
 if(typeof value==='string'){
  const preset=EXPRESSIONS[value];
  if(!preset)throw new RangeError(`Unknown expression: ${value}`);
  return preset.parameters;
 }
 if(!value||typeof value!=='object')throw new TypeError('Expression must be a preset name or parameter object');
 const source=value.parameters??value,result={...DEFAULT_PARAMETERS};
 for(const key of Object.keys(PARAMETER_RANGES)){
  if(source[key]===undefined)continue;
  const number=Number(source[key]),[min,max]=PARAMETER_RANGES[key];
  if(!Number.isFinite(number))throw new TypeError(`Non-finite expression parameter: ${key}`);
  result[key]=Math.min(max,Math.max(min,number));
 }
 return result;
}
