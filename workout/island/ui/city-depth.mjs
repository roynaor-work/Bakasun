const resources = {food: 'מזון', materials: 'חומרים', energy: 'אנרגיה'};
const number = value => value.toLocaleString('he-IL',{maximumFractionDigits:1});
const reasons = {'out-of-range': 'הבית מחוץ לטווח מגדל מים', capacity: 'המגדלים בטווח מלאים', disconnected: 'הבית אינו מחובר לרשת הכבישים', damaged: 'דרוש תיקון', 'max-tier': 'דרגת הייצור הגבוהה ביותר', money: 'אין מספיק מטבעות', 'port-unavailable': 'עדיין אין הזמנות חדשות', 'order-unavailable': 'המשלוח אינו זמין כרגע', 'goal-unavailable': 'היעד עדיין אינו מוכן', invalid: 'הפעולה אינה זמינה'};
const node = (tag, className, text) => {const n = document.createElement(tag); n.className = className; if (text != null) n.textContent = text; return n;};

/** Only report fields determine availability, costs, service and progress. */
export class CityDepthInterface {
  constructor(ui) {this.ui = ui;}
  action(label, action, available, command) {
    const button = node('button', 'secondary-button', label);
    button.type = 'button'; button.dataset.action = action; button.disabled = !available;
    button.onclick = () => {const result = command(); if (!result.ok) this.ui.toast(reasons[result.reason?.replace('city.reason.', '')] ?? result.reason);};
    return button;
  }
  decorate(instance, actions) {
    const {ui} = this, report = ui.engine.city.report(), row = report.buildings.find(row => row.id === instance.id);
    if (!row) return;
    const panel = node('section', 'city-depth'); panel.dataset.cityBuilding = instance.id;
    const status = node('p', 'city-building-status', row.status === 'damaged' ? '⚠ דרוש תיקון' : row.status === 'unserved' ? `♧ ${reasons[row.water.reason]}` : row.water?.served ? '💧 הבית מקבל מים' : 'המבנה פועל');
    status.dataset.cityStatus = row.status; panel.append(status);
    if (instance.typeId !== 'cityHall') {
      const old = actions.querySelector('[data-action=upgrade]');
      if (old) {
        old.hidden = true;
        const offer = row.upgrade;
        let label = offer.nextLevel ? `✦ ${ui.t('app.upgrade')} · ● ${offer.nextLevel.cost}` : ui.t('app.maxLevel');
        if (!offer.ok && offer.nextLevel) label += ` · ${ui.t(offer.reason)}`;
        const upgrade = this.action(label, 'city-upgrade', offer.ok, () => ui.engine.city.upgrade(instance.id));
        upgrade.className = 'primary-button'; old.after(upgrade);
      }
    }
    if (row.status === 'damaged') panel.append(this.action(`תיקון · ● ${row.repair.cost}`, 'city-repair', row.repair.ok, () => ui.engine.city.repair(instance.id)));
    if (row.service) panel.append(node('p', '', `💧 ${number(row.service.used)} מתוך ${number(row.service.capacity)} מקומות בשימוש · טווח ${number(row.service.radius)}`));
    if (row.production) {
      panel.append(node('p', 'city-production-tier', `דרגת ייצור ${row.production.tier}`));
      for (const [resource, amount] of Object.entries(row.production.perMinute)) panel.append(node('p', '', `${resources[resource]}: ${amount.toLocaleString('he-IL')} בדקה`));
      const offer = row.production.investment;
      panel.append(this.action(offer.cost == null ? 'הייצור מפותח במלואו' : `השקעה בייצור · ● ${offer.cost}`, 'city-invest', offer.ok, () => ui.engine.city.invest(instance.id)));
    }
    if (instance.typeId === 'harbor') {
      panel.append(node('h3', '', 'משלוחים מהנמל'));
      for (const slot of report.port.slots.filter(slot => slot.harborId === instance.id)) {
        const order = node('div', 'city-order'); order.dataset.cityOrder = slot.id; order.dataset.state = slot.state;
        order.append(node('p', '', `${resources[slot.resource]} × ${slot.amount} · תמורה ● ${slot.reward}`));
        if (slot.state === 'offered') order.append(this.action('שליחת משלוח', 'city-deliver', slot.deliverable, () => ui.engine.city.deliver(slot.id)), this.action('דילוג', 'city-skip', true, () => ui.engine.city.skip(slot.id)));
        else order.append(node('small', '', slot.state === 'delivered' ? 'המשלוח נשלח' : 'דילגנו על ההזמנה'));
        panel.append(order);
      }
      panel.append(this.action('הזמנות חדשות', 'city-port', report.port.canOffer, () => ui.engine.city.port()));
    }
    if (instance.typeId === 'cityHall') {
      panel.append(node('h3', '', 'יעדי העיר'));
      for (const goal of report.goals) {
        const line = node('div', 'city-goal'); line.dataset.cityGoal = goal.id;
        line.append(node('p', '', `${goal.title} · ${goal.progress}/${goal.target}`), this.action(goal.claimed ? 'הפרס התקבל' : `קבלת פרס · ● ${goal.reward}`, 'city-goal', goal.ready, () => ui.engine.city.goal(goal.id)));
        panel.append(line);
      }
    }
    ui.info.append(panel);
    ui.view.setCityReport?.(report, instance.id);
  }
}
