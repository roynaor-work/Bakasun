// Local adaptation of kid-head/expressions.mjs. The reference sheet was read
// directly: laughter/determination/fatigue/worry inform these requested moods,
// while victory and satisfied fatigue intentionally reinterpret those cells.
export const DEFAULT_PARAMETERS=Object.freeze({
 eyeOpen:.94,wink:0,gazeX:0,gazeY:0,browRaise:0,browTilt:0,browAsym:0,
 cheekPuff:.12,cheekLift:.12,jawOpen:.08,chinTight:0,
 mouthOpen:.012,mouthWidth:.22,smile:.42,mouthShift:0,clench:0,tongue:0
});
const entry=(id,label,description,parameters)=>Object.freeze({id,label,description,parameters:Object.freeze({...DEFAULT_PARAMETERS,...parameters})});
export const EXPRESSION_LIST=Object.freeze([
 entry('happy','שמח','לחיים מורמות וחיוך פתוח עם שיניים ולשון.',
  {eyeOpen:.86,browRaise:.25,cheekPuff:.38,cheekLift:.80,jawOpen:.46,mouthOpen:.21,mouthWidth:.31,smile:.95,tongue:.72}),
 entry('effort','מאמץ','עיניים מכווצות, גבות מתכנסות ושיניים קפוצות.',
  {eyeOpen:.48,browRaise:-.38,browTilt:.96,cheekPuff:1,cheekLift:.32,jawOpen:.12,chinTight:1,mouthOpen:.105,mouthWidth:.245,smile:-.28,clench:1}),
 entry('surprised','מופתע','עיניים רחבות, גבות גבוהות ופה עגול עם ירידת לסת.',
  {eyeOpen:1.19,browRaise:.94,browTilt:-.05,cheekPuff:.04,cheekLift:0,jawOpen:1,mouthOpen:.32,mouthWidth:.15,smile:0,tongue:.12}),
 entry('victory','ניצחון','קריצה, גבה מורמת וחיוך רחב ואסימטרי.',
  {eyeOpen:.94,wink:.91,browRaise:.42,browAsym:.65,cheekPuff:.45,cheekLift:1,jawOpen:.45,mouthOpen:.19,mouthWidth:.34,smile:1,mouthShift:.015,tongue:.52}),
 entry('tired','עייף ומרוצה','עפעפיים כבדים ומבט נמוך עם חיוך קטן של סיפוק.',
  {eyeOpen:.50,gazeY:-.30,browRaise:-.28,browTilt:-.25,cheekPuff:.18,cheekLift:.30,jawOpen:0,mouthOpen:.008,mouthWidth:.205,smile:.69}),
 entry('thinking','מחשבה','מבט הצידה ולמעלה, גבה מורמת ופה משוך הצידה.',
  {eyeOpen:.78,gazeX:-.65,gazeY:.48,browRaise:.12,browTilt:-.27,browAsym:1,cheekPuff:.34,cheekLift:.08,jawOpen:0,chinTight:.34,mouthOpen:.008,mouthWidth:.15,smile:-.35,mouthShift:.048})
]);
export const EXPRESSION_IDS=Object.freeze(EXPRESSION_LIST.map(e=>e.id));
export const EXPRESSIONS=Object.freeze(Object.fromEntries(EXPRESSION_LIST.map(e=>[e.id,e])));
export const POSE_EXPRESSIONS=Object.freeze({stand:'neutral',run:'effort',runOpposite:'effort',kick:'victory'});

export function expressionWeights(value='neutral'){
 const weights=Object.fromEntries(EXPRESSION_IDS.map(id=>[id,0]));
 if(typeof value==='string'){
  if(value!=='neutral'&&!EXPRESSIONS[value])throw new RangeError('Unknown expression: '+value);
  if(value!=='neutral')weights[value]=1;
 }else{
  if(!value||typeof value!=='object')throw new TypeError('Expression weights must be a preset name or an object');
  for(const [id,weight] of Object.entries(value)){
   if(!EXPRESSIONS[id])throw new RangeError('Unknown expression: '+id);
   if(!Number.isFinite(weight)||weight<0)throw new RangeError('Expression weight must be finite and nonnegative: '+id);
   weights[id]=weight;
  }
  const total=Object.values(weights).reduce((sum,v)=>sum+v,0);
  if(total>1)for(const id of EXPRESSION_IDS)weights[id]/=total;
 }
 return weights;
}

// Works on both the source model and an actual GLTFLoader result: no feature
// callbacks or procedural meshes are required after export.
export function attachExpressionController(model,{allowMissing=false}={}){
 const meshes=[];model.root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.morphTargetDictionary)return;
  if(EXPRESSION_IDS.every(id=>mesh.morphTargetDictionary[id]!==undefined))meshes.push(mesh);
 });
 if(!meshes.length&&!allowMissing)throw new Error('Character has no six-expression morph rig');
 model.expressionMeshes=meshes;
 model.expressionWeights=Object.fromEntries(EXPRESSION_IDS.map(id=>[id,meshes[0]?.morphTargetInfluences[meshes[0]?.morphTargetDictionary[id]]||0]));
 model.getExpressionWeights=()=>{
  if(meshes.length)for(const id of EXPRESSION_IDS)model.expressionWeights[id]=meshes[0].morphTargetInfluences[meshes[0].morphTargetDictionary[id]]||0;
  return {...model.expressionWeights};
 };
 model.setExpressionWeights=value=>{
  const weights=expressionWeights(value);
  for(const id of EXPRESSION_IDS)model.expressionWeights[id]=weights[id];
  for(const mesh of meshes)for(const id of EXPRESSION_IDS)mesh.morphTargetInfluences[mesh.morphTargetDictionary[id]]=weights[id];
  return model.expressionWeights;
 };
 model.setExpression=value=>model.setExpressionWeights(value);
 model.setExpressionBlend=(from,to,t)=>{
  if(!Number.isFinite(t))throw new TypeError('Expression blend must be finite');
  const a=expressionWeights(from),b=expressionWeights(to),mix=Math.max(0,Math.min(1,t));
  return model.setExpressionWeights(Object.fromEntries(EXPRESSION_IDS.map(id=>[id,a[id]+(b[id]-a[id])*mix])));
 };
 return model;
}
