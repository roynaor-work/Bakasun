// Local demonstration only; fictional balances, no persistence. CC0-1.0.
import { create } from './offer.mjs';

const feedback = document.querySelector('#demo-feedback');
const samples = [
  { label: '01 / מספיק מטבעות · מרוצים', category: 'מרוצים', name: 'מנוע חזק', icon: 'engine', price: 100, balance: 120 },
  { label: '02 / חסר מעט · טניס', category: 'טניס', name: 'דיוק במחבט', icon: 'accuracy', price: 100, balance: 85, unit: 'points' },
  { label: '03 / נעול · חלליות', category: 'חלליות', name: 'מגן חלל', icon: 'shield', price: 100, balance: 160, locked: true, lockReason: 'נפתח בשלב 3' }
];
let cards = [];
function renderCards() {
  cards.forEach(card => card.destroy());
  document.querySelector('#offers').replaceChildren();
  cards = samples.map(sample => {
    const wrap = document.createElement('div'); wrap.className = 'offer-sample';
    const label = document.createElement('p'); label.className = 'offer-label'; label.textContent = sample.label;
    wrap.append(label); document.querySelector('#offers').append(wrap);
    const card = create(wrap, {
      initial: sample,
      onUpgrade() {
        card.update({ ...sample, balance: sample.balance - sample.price, purchased: true });
        feedback.textContent = 'השדרוג שלך! הסכום השתנה בתצוגה בלבד.';
      },
      onLater() { feedback.textContent = 'אפשר לשדרג גם אחר כך. ממשיכים לשחק!'; }
    });
    return card;
  });
}
renderCards();
document.querySelector('#replay').addEventListener('click', () => {
  feedback.textContent = ''; renderCards();
});

try {
  const response = await fetch(new URL('./icons.json', import.meta.url));
  if (!response.ok) throw new Error('Icon catalog unavailable');
  const icons = await response.json();
  const gallery = document.querySelector('#icon-gallery');
  for (const group of [...new Set(icons.map(icon => icon.group))]) {
    const section = document.createElement('section'); section.className = 'icon-group';
    const heading = document.createElement('h3'); heading.textContent = group; section.append(heading);
    const grid = document.createElement('div'); grid.className = 'icon-grid'; section.append(grid);
    for (const icon of icons.filter(item => item.group === group)) {
      const figure = document.createElement('figure'); figure.className = 'icon-sample';
      const caption = document.createElement('figcaption'); caption.textContent = icon.label;
      const id = document.createElement('span'); id.className = 'icon-id'; id.textContent = icon.id; caption.append(id);
      figure.append(caption);
      for (const mode of ['light', 'dark']) {
        const strip = document.createElement('div'); strip.className = 'uo-kit icon-strip'; strip.dataset.mode = mode;
        strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', mode === 'dark' ? 'רקע כהה' : 'רקע בהיר');
        for (const size of [24, 48, 72]) {
          const img = document.createElement('img'); img.src = new URL(icon.file, import.meta.url).href;
          img.width = img.height = size; img.alt = `${icon.label}, ${size} פיקסלים`; strip.append(img);
        }
        figure.append(strip);
      }
      grid.append(figure);
    }
    gallery.append(section);
  }
} catch {
  document.querySelector('#icon-gallery').textContent = 'לא ניתן לטעון את האייקונים. יש לפתוח דרך שרת מקומי.';
}
