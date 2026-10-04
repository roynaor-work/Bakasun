/* אייקוני SVG בקו אחיד (stroke 1.7, currentColor). במקום אימוג'י, לפי כללי העיצוב. */
const P = {
  truck: '<path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8"/><path d="M12 8v12"/><path d="M12 8c-2.2 0-4.5-1-4.5-3s3.2-2.2 4.5 3c1.3-5.2 4.5-5 4.5-3S14.2 8 12 8z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5l4 4L7 21H3v-4z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  cake: '<path d="M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16c2 1.5 4-1.5 6 0s4-1.5 6 0 4 0 4 0"/><path d="M9 12V9M12 12V8M15 12V9"/><path d="M12 4.5v3"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.5 2.5c0 5.7-7.5 10.3-7.5 10.3z"/>',
  sparkling: '<path d="M10 2h4v4l2 3.5V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.5L10 6z"/><path d="M8 13h8"/><path d="M19 3l.6 1.6L21 5l-1.4.5L19 7l-.6-1.5L17 5l1.4-.4z"/>',
  cheers: '<path d="M3.5 3h6l-.8 6.2A2.4 2.4 0 0 1 6.3 11h-.1a2.4 2.4 0 0 1-2.4-1.8z"/><path d="M6.3 11v8M3.5 19h5.6"/><path d="M14.5 3h6l-.8 6.2a2.4 2.4 0 0 1-2.4 1.8h-.1a2.4 2.4 0 0 1-2.4-1.8z"/><path d="M17.3 11v8M14.5 19h5.6"/>',
  home: '<path d="M3 11l9-7.5L21 11"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>',
  wine: '<path d="M8 3h8l-.8 7a3.2 3.2 0 0 1-6.4 0z"/><path d="M12 13.5V20M8.5 20h7"/>',
  cocktail: '<path d="M3 4h18l-9 9.5z"/><path d="M12 13.5V20M8 20h8"/><path d="M15 4l2-2"/>',
  rocks: '<path d="M5 4h14l-1.2 15.2A1 1 0 0 1 16.8 20H7.2a1 1 0 0 1-1-.8z"/><path d="M6 12h12"/><path d="M9 7l6 8"/>',
  bottle: '<path d="M10 2h4v5l2 2.2V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.2L10 7z"/><path d="M8 13h8"/>',
  liqueur: '<path d="M10 2h4v3l3 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l3-3z"/><path d="M7 12h10"/>',
  flask: '<path d="M9 2h6v3H9z"/><path d="M7 5h10a1 1 0 0 1 1 1v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z"/><path d="M9 10h6"/>',
  shaker: '<path d="M9.5 2h5l.8 4H8.7z"/><path d="M8.5 6h7v2.5h-7z"/><path d="M8.5 8.5h7L14.6 22H9.4z"/>',
  jigger: '<path d="M12 2v20"/><path d="M8 2h8l-2.2 6h-3.6z"/><path d="M8 22h8l-2.2-6h-3.6z"/>',
  citrus: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  bubbles: '<circle cx="8" cy="15" r="4"/><circle cx="16" cy="9" r="3"/><circle cx="15.5" cy="17.5" r="2"/>',
  chocolate: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>',
  honey: '<path d="M8 3h8v3H8z"/><path d="M7 6h10v12a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z"/><path d="M7 11h10"/>',
  nuts: '<path d="M12 3c5 0 8 4 8 9s-3 9-8 9-8-4-8-9 3-9 8-9z"/><path d="M12 3c-2.5 3-2.5 15 0 18M12 3c2.5 3 2.5 15 0 18"/>',
  candle: '<rect x="8" y="9" width="8" height="12" rx="1"/><path d="M12 9V6.5"/><path d="M12 2c1.2 1.4 1.2 2.8 0 4.2-1.2-1.4-1.2-2.8 0-4.2z"/>',
  soap: '<rect x="4" y="9" width="16" height="10" rx="3.5"/><circle cx="16.5" cy="5" r="1.6"/><circle cx="20" cy="8.5" r="1"/>',
  leaf: '<path d="M4 20C4 11 10 6 20 4c-2 10-7 16-16 16z"/><path d="M4 20c4-6 8-9 12-11"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  box: '<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  crate: '<rect x="3" y="9" width="18" height="12"/><path d="M3 9l2-4h14l2 4"/><path d="M12 5v16M3 15h18"/>',
  check: '<path d="M5 12.5l4.5 4.5L20 6.5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  store: '<path d="M4 10l1.2-5h13.6L20 10"/><path d="M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 10"/><path d="M5.5 12.5V21h13v-8.5"/><path d="M10 21v-5h4v5"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
  pin: '<path d="M12 22s7-7.2 7-12.3A7 7 0 0 0 5 9.7C5 14.8 12 22 12 22z"/><circle cx="12" cy="9.7" r="2.5"/>',
  hands: '<path d="M7 11.5V5.5a1.8 1.8 0 0 1 3.6 0v5.5"/><path d="M10.6 10.5V4a1.8 1.8 0 0 1 3.6 0v6.5"/><path d="M14.2 11V6a1.8 1.8 0 0 1 3.6 0v8.5a7 7 0 0 1-7 7h-.6a7 7 0 0 1-7-7v-2.8a1.8 1.8 0 0 1 3.6 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 2l8 3.5v6c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4"/>',
};
export function icon(name, cls = '') {
  const d = P[name] || P.gift;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
export const ICON_NAMES = Object.keys(P);
/* הלוגו: כוכב הצפון ורוח, בזהב. */
export function logo(size = 34) {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29.5" fill="none" stroke="#c8a45a" stroke-width="2"/><path d="M32 9l3.6 19.4L55 32l-19.4 3.6L32 55l-3.6-19.4L9 32l19.4-3.6z" fill="#e8cf94"/><circle cx="32" cy="32" r="3.2" fill="#0c0a09"/><path d="M12 46c3 0 3-2.6 6-2.6s3 2.6 6 2.6M16 51c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2" fill="none" stroke="#c8a45a" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}
export const LOGO_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0c0a09"/><circle cx="32" cy="32" r="28" fill="none" stroke="#c8a45a" stroke-width="2.5"/><path d="M32 9l3.6 19.4L55 32l-19.4 3.6L32 55l-3.6-19.4L9 32l19.4-3.6z" fill="#e8cf94"/><circle cx="32" cy="32" r="3.2" fill="#0c0a09"/></svg>`);
