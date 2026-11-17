/** One requirement for the menu, building cards, engine and event launcher. */
export function gameAvailability(state, config, id) {
  const buildingId=config.minigames[id]?.requiresBuilding;
  return !buildingId||state.buildings.some(row=>row.typeId===buildingId)
    ? {ok:true} : {ok:false,reason:`minigame.${id}.locked`,buildingId};
}
