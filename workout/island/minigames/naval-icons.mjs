/** Naval-only silhouettes: depth charges must not look like a rescue ladder. */
export function navalWeaponIcons(controls){
 const drawings={
  4:'<path d="M10 43 41 17l14 17-33 20Z" fill="#557c9c" stroke="#e2f8ff" stroke-width="3"/><circle cx="47" cy="26" r="12" fill="#17334f" stroke="#e2f8ff" stroke-width="2"/><g fill="#b9e7f4"><circle cx="47" cy="19" r="2.5"/><circle cx="53" cy="23" r="2.5"/><circle cx="53" cy="30" r="2.5"/><circle cx="47" cy="33" r="2.5"/><circle cx="41" cy="30" r="2.5"/><circle cx="41" cy="23" r="2.5"/></g>',
  5:'<path d="M20 17h24v28H20Z" fill="#6cc7e3" stroke="#eaffff" stroke-width="3"/><ellipse cx="32" cy="17" rx="12" ry="5" fill="#b9eff8"/><ellipse cx="32" cy="45" rx="12" ry="5" fill="#2c7e9d" stroke="#eaffff" stroke-width="2"/><path d="M32 2v9m-5-4 5 5 5-5M9 56q6-6 12 0t12 0 12 0 12 0" fill="none" stroke="#c3f7ff" stroke-width="4"/>',
 };
 for(const [index,drawing]of Object.entries(drawings)){const icon=controls.querySelector(`[data-ammo-index="${index}"] .game-icon`);if(icon)icon.innerHTML=drawing;}
}
