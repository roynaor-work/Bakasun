/** Soccer look v24.9 (22/11/2026): Roy: "השחקנים נראים מוזר ורע". Measured on the body the match wears (assets/soccer-v24/body/models/soccer.glb,
 * the Codex athlete body on the canonical 18-bone rig, 1.73 m, 5,080 triangles):
 *   - shoulder joints 0.32 m apart, 0.42 m across with the arms (an adult footballer: about 0.40 and 0.47): narrow, sloping shoulders;
 *   - arm 0.51 m from shoulder to wrist (about 0.57 at this height) and thin as a tube; the hand is a small mitten;
 *   - head 0.174 x 0.237 m under a hair cap (about 0.155 x 0.20): 5.4 "heads" tall, a child's or a doll's proportion on an adult body;
 *   - boots 0.30 m long on thin shins;
 *   - the sun stands behind the players for the broadcast camera of the first half, so faces and shirt fronts are in shadow.
 * What code can do without a new mesh is scale joints of the rest pose: the clips of this project hold only rotations plus the hips' and
 * root's positions, so a joint's scale stays as set. Uniform scales only below a joint that bends (no shear when an elbow or an ankle
 * turns); the chest alone is widened along its own axes and the neck undoes that for the head.
 * What code cannot do: add the missing joints (clavicles, fingers, toes, twist bones), sculpt a face, shoulders or calves, or put cloth
 * folds, a collar or a crest on the shirt. That needs a new asset on the same canonical joints (same names, parents and rest directions, so
 * every clip keeps playing) plus helper joints (clavicles, arm / forearm / thigh twist, toe base, three finger groups), a sculpted head,
 * a kit with UVs and colour masks, 8-12K triangles with two coarser levels. Evidence: verification/soccer-v249/players-before.jpg / -after.jpg,
 * measured with tools/soccer-v249-body-measure.mjs.
 * `?soccerLook=0` (or `?soccerV249=0`) = the v24.8 bodies and light. Pure: no three.js and no DOM. */
export const SOCCER_LOOK249=Object.freeze({
  // [x, y, z] of the Chest joint (x across the shoulders, z front to back); Neck gets the inverse so the head keeps its shape
  chest:Object.freeze([1.1,1,1.07]),
  head:.92,     // uniform: 5.4 -> about 5.8 heads tall
  arm:1.14,     // uniform on LeftArm / RightArm: 14% longer and thicker, hands with them
  foot:.94,     // uniform on the feet: smaller boots (the sole rises 4 mm)
  fill:1.25,    // the camera-side fill light (was 0.5): faces and shirt fronts out of the shadow
  fillColor:'#dfe9f7',
});
/** Sets the joints' rest scales on one player. `bones` = {name: {scale:{set(x,y,z)}}} (three.js bones of the canonical rig). Returns how many were set. */
export function applySoccerLook249(bones,L=SOCCER_LOOK249){
  if(!bones)return 0;let n=0;const set=(name,x,y,z)=>{const b=bones[name];if(b?.scale?.set){b.scale.set(x,y,z);n++;}};
  set('Chest',L.chest[0],L.chest[1],L.chest[2]);set('Neck',1/L.chest[0],1/L.chest[1],1/L.chest[2]);
  set('Head',L.head,L.head,L.head);
  for(const side of ['Left','Right']){
    set(side+'Arm',L.arm,L.arm,L.arm);
    set(side+'Foot',L.foot,L.foot,L.foot);
  }
  return n;
}
/** The proportions after the scales, from the measured rest pose (for the report and the test). */
export function soccerLook249Proportions(L=SOCCER_LOOK249){
  const base={shoulderJoints:.32,acrossArms:.424,arm:.51,headWidth:.174,headDepth:.237,height:1.731,headHeight:.271};
  const headHeight=base.headHeight*L.head,height=base.height-(base.headHeight-headHeight);
  return {before:{...base,headsTall:+(base.height/(base.headHeight*1.18)).toFixed(2)},
    after:{shoulderJoints:+(base.shoulderJoints*L.chest[0]).toFixed(3),acrossArms:+(base.shoulderJoints*L.chest[0]+(base.acrossArms-base.shoulderJoints)*L.arm).toFixed(3),arm:+(base.arm*L.arm).toFixed(3),headWidth:+(base.headWidth*L.head).toFixed(3),headDepth:+(base.headDepth*L.head).toFixed(3),height:+height.toFixed(3),headsTall:+(height/(headHeight*1.18)).toFixed(2)}};
}
