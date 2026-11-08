import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const b=await chromium.launch(),p=await (await b.newContext({viewport:{width:844,height:200},deviceScaleFactor:2})).newPage();
await p.goto(process.argv[2]);await p.waitForFunction(()=>window.ready);await p.screenshot({path:process.argv[3]});await b.close();
