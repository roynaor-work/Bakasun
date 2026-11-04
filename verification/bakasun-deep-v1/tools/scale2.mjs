import { pathToFileURL } from 'node:url';
const R='/home/user/Bakasun/js/'; const imp=f=>import(pathToFileURL(R+f).href);
const Office=(await imp('logic/office.js')).default; const brief=await imp('logic/brief.js'); const cmd=await imp('logic/commands.js'); const tr=await imp('logic/travel.js'); const con=await imp('logic/contacts.js'); const wg=await imp('logic/workgroup.js'); const q2=await imp('logic/questions2.js'); const mt=await imp('logic/msgTemplates.js'); const mail=await imp('logic/mailImport.js'); const rfq=await imp('logic/rfq.js');
const names=[...Object.keys(brief).filter(k=>typeof brief[k]==='function').map(k=>['brief.'+k,t=>brief[k](t,[],new Date(),[])]),
 ...Object.keys(cmd).filter(k=>/^(parse|interpret|route|detect|take|is|find|split)/i.test(k)&&typeof cmd[k]==='function').map(k=>['commands.'+k,t=>cmd[k](t)]),
 ['Office.parseLead',t=>Office.parseLead(t,[],new Date())],['takeWhen',t=>tr.takeWhen(t,'2026-11-04')],['parseVcf',t=>con.parseVcf(t)],['parseCsv',t=>con.parseContactsCsv(t)],
 ['parseWorkGroup',t=>wg.parseWorkGroup(t,[])],['parseTemplateRequest',t=>mt.parseTemplateRequest(t,[])],['mail.parseMail',t=>mail.parseMail(t,{})],['mail.takeDates',t=>mail.takeDates(t,'2026-11-04')],
 ...Object.keys(rfq).filter(k=>/^parse|^take/.test(k)).map(k=>['rfq.'+k,t=>rfq[k](t)]),
 ...Object.keys(q2).filter(k=>/^parse|^answer|^detect/.test(k)).map(k=>['q2.'+k,t=>q2[k](t)])];
const inputs={'a':'a','1 ':'1 ','ש':'ש','a b':'a b ','/':'1/','.':'1.','@':'a@','-':'1-','\n':'x\n',',':'x,'};
const out=[];
for(const [n,f] of names) for(const [iname,unit] of Object.entries(inputs)){ let prev=0,row=[]; for(const N of [3000,12000]){const t0=performance.now(); try{f(unit.repeat(N))}catch(e){} const ms=performance.now()-t0; row.push(Math.round(ms)); if(ms>2000)break;} if(row[row.length-1]>150) out.push(n+' '+JSON.stringify(iname)+' '+row.join('→')+'ms'); }
console.log(out.length? out.join('\n'):'nothing over 150ms at 12k chars', '\nfunctions tested:',names.length);
