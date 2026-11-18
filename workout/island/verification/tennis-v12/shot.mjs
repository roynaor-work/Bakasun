import {createRequire} from 'node:module';const {chromium}=createRequire('/')('playwright');
const b=await chromium.launch(),p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2});
await p.goto('file://'+process.argv[2]);await p.screenshot({path:process.argv[3]});await b.close();
