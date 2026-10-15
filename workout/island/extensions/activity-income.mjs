export function install(registry,data) {
  if(!data.featureFlags.activityIncome)return;
  for(const [id,rates]of Object.entries(data.config.activityIncome))registry.registerIncomeSource({id:`island-${id}`,calculate({activeBuildings}){
    let money=0;for(const building of activeBuildings)money+=(rates[building.typeId]||0)*building.level;return {money};
  }});
}
