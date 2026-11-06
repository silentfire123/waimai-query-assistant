import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'android/build/assets/www');await fs.mkdir(out,{recursive:true});
const files={'core.mjs':'core.mjs','collector.mjs':'collector.mjs','waimai.mjs':'waimai.mjs','location.mjs':'location.mjs','diagnostic-core.mjs':'diagnostic-core.mjs','cities.json':'cities.json','demo-input.json':'demo-input.json','app.js':'web/app.js','calculator.mjs':'web/calculator.mjs','style.css':'web/style.css','mobile.css':'android/mobile/mobile.css','api-engine.mjs':'android/mobile/api-engine.mjs','platform.mjs':'android/mobile/platform.android.mjs','mobile-entry.mjs':'android/mobile/mobile-entry.mjs'};
const hash=crypto.createHash('sha256');
for(const [target,source] of Object.entries(files)){let data=await fs.readFile(path.join(root,source));if(target==='api-engine.mjs')data=Buffer.from(data.toString().replaceAll("from '../../","from './"));if(source.endsWith('.mjs')&&/from ['"]node:|process\.env|Buffer\./.test(data.toString()))throw Error('Node-only code in APK: '+source);await fs.writeFile(path.join(out,target),data);hash.update(data);}
let html=await fs.readFile(path.join(root,'web/index.html'),'utf8');html=html.replace('src="/app.js"','src="/mobile-entry.mjs"').replace('</head>','<link rel="stylesheet" href="/mobile.css"></head>');hash.update(html);await fs.writeFile(path.join(out,'index.html'),html);
const version=hash.digest('hex').slice(0,12);await fs.writeFile(path.join(out,'version.mjs'),'export const codeVersion='+JSON.stringify(version)+';\n');
console.log('Android public-only assets ready; codeVersion='+version);
