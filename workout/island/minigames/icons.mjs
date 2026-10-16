/** Small inline vector illustrations; no text, external requests or fonts. */
const paths={
  cannon:'<circle cx="26" cy="48" r="10" fill="#183c60"/><circle cx="26" cy="48" r="4" fill="#ffd77a"/><path d="M15 39 47 16l10 15-34 19Z" fill="#557c9c" stroke="#e2f8ff" stroke-width="3"/><ellipse cx="51" cy="24" rx="7" ry="10" transform="rotate(-35 51 24)" fill="#17334f"/><path d="m8 21 7 3m23-17 2 7m20 29-7-1" stroke="#ffd77a" stroke-width="4"/>',
  ladder:'<path d="m15 59 16-50m3 53L50 12M20 46l19 6M24 34l19 6M28 22l19 6" stroke="#e5faff" stroke-width="5" fill="none"/><path d="m8 43 9 3m-3 11 3-11" stroke="#6be6b0" stroke-width="4"/>',
  tap:'<path d="M10 28h31v12H28v12H15V39h-5Z" fill="#70c7ed" stroke="#e8faff" stroke-width="3"/><path d="M27 28V17m-12 0h25" stroke="#ffda80" stroke-width="6" stroke-linecap="round"/><path d="M21 52q-11 12 0 12 11 0 0-12" fill="#9beaff"/>',
  pump:'<path d="M14 53h37M22 51V29h21v22M32 29V11m-14 0h29" stroke="#b5edff" stroke-width="6" stroke-linecap="round" fill="none"/><path d="m48 31 7 8-7 8" stroke="#ffdb81" stroke-width="4" fill="none"/>',
  shield:'<path d="m32 6 22 9v17q-3 17-22 26Q13 49 10 32V15Z" fill="#61e6b1" stroke="#dcfff1" stroke-width="3"/><path d="m21 31 8 8 15-18" stroke="#174e5f" stroke-width="5" fill="none"/>',
  laser:'<path d="M27 52V28h10v24Z" fill="#74d2ed" stroke="#e2fbff" stroke-width="3"/><path d="M32 26V4m-13 8 6 9m20-9-6 9" stroke="#dbfaff" stroke-width="4" stroke-linecap="round"/><ellipse cx="32" cy="52" rx="17" ry="6" fill="#387ec1"/>',
  rapid:'<path d="m38 5-25 31h17l-5 24 27-34H35Z" fill="#ffd46f" stroke="#fff7d7" stroke-width="3"/>',
  damage:'<path d="m32 5 7 15 17-3-5 17 10 12-19 1-10 14-9-15-18-1 11-13-5-16 17 4Z" fill="#ff966e" stroke="#ffe7c2" stroke-width="3"/><circle cx="32" cy="33" r="9" fill="#fff6c8"/>',
  wing:'<path d="m32 7 8 16 18 3-13 13 3 19-16-9-17 9 3-19L5 26l19-3Z" fill="#ffcf69" stroke="#fff5ce" stroke-width="3"/><ellipse cx="25" cy="32" rx="3" ry="5" fill="#234b69"/><ellipse cx="39" cy="32" rx="3" ry="5" fill="#234b69"/>',
  nova:'<path d="M26 43Q18 21 40 7q12 22-4 38Z" fill="#b9edff" stroke="#fff" stroke-width="3"/><circle cx="34" cy="24" r="5" fill="#5d87e2"/><path d="m24 38-9 9 13-2m9-7 7 12-12-6" fill="#b2a0ff"/><path d="m28 48-2 13 9-12" fill="#ffba70"/>',
  sound:'<path d="M9 26h12l14-13v38L21 39H9Z" fill="currentColor"/><path d="M42 23q12 9 0 18m7-27q23 18 0 36" stroke="currentColor" stroke-width="4" fill="none"/>',
  muted:'<path d="M9 26h12l14-13v38L21 39H9Z" fill="currentColor"/><path d="m43 25 14 16m0-16L43 41" stroke="currentColor" stroke-width="5"/>',
};
export function gameIcon(id){const node=document.createElementNS('http://www.w3.org/2000/svg','svg');node.setAttribute('viewBox','0 0 64 68');node.setAttribute('aria-hidden','true');node.classList.add('game-icon');node.innerHTML=paths[id]||paths.nova;return node;}
export function upgradeCard(button,id,label,hint){button.dataset.upgrade=id;const copy=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=label;detail.textContent=hint;copy.append(title,detail);button.replaceChildren(gameIcon(id),copy);}
