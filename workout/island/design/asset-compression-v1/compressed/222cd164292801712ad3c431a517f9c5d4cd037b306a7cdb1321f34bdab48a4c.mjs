/** The supplied ship noses point +X. Correct the alien battle presentation
 * relative to the existing bake specs, without altering shared asset metadata. */
export function alienModelSpecs(balance){
 const turn=spec=>({...spec,rotationY:(spec.rotationY+balance.render.facingCorrectionDegrees+360)%360});
 return {player:turn(balance.models.player),enemies:balance.models.enemies.map(turn)};
}

/** Every row, quality level and distance uses the same authored visual per role. */
export function alienAppearance(balance,kind){
 return {kind,path:balance.models.enemies[kind].path,color:balance.enemyTypes[kind].color};
}
export function alienBakeSettings(balance){
 const r=balance.render;
 return {...balance,models:alienModelSpecs(balance),modelArt:{...balance.modelArt,camera:[r.camera[0]-r.lookAt[0],r.camera[1]-r.lookAt[1],r.camera[2]-r.lookAt[2]]}};
}
