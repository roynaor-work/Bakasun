/** A certificate contains the three observed achievements of one completed run. */
export function fireCertificate({won,time,seconds,rescued,wasted,used},config){const fast=Boolean(won&&time<=seconds*config.quickFraction),rescue=Boolean(rescued),careful=Boolean(won&&wasted<=Math.max(1,used)*config.wasteFraction);return {fast,rescue,careful,stars:Number(fast)+Number(rescue)+Number(careful)};}
export function validCertificate(c){return c&&Object.keys(c).length===4&&['fast','rescue','careful'].every(k=>typeof c[k]==='boolean')&&Number.isInteger(c.stars)&&c.stars===Number(c.fast)+Number(c.rescue)+Number(c.careful);}
export function initialFireCertificates(data){return Array(data.config.minigames.fireRescue.levels.length).fill(null);}
export function validFireCertificates(list,data){return Array.isArray(list)&&list.length===data.config.minigames.fireRescue.levels.length&&list.every(c=>c===null||validCertificate(c));}
export function recordFireCertificate(list,stage,c){if(!Number.isInteger(stage)||stage<1||stage>list.length||!validCertificate(c))return false;if(!list[stage-1]||c.stars>list[stage-1].stars)list[stage-1]={...c};return true;}
