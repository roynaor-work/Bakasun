export function install(registry, data) {
  const record = data.extensions.event;
  registry.registerEventType({ ...record, prepare(ctx) { return { warningId: record.warningId, cityId: ctx.state.team.id }; }, apply() { return { ok: true, reason: 'reason.allowed' }; } });
}
