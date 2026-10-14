export function install(registry, data) {
  registry.registerMetric({ ...data.extensions.metric, calculate({ score }) { return score; } });
}
