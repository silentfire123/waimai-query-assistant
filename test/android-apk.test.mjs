// Runs the actual PowerShell APK validator against ZIP fixtures. These are NOT
// Android execution tests; the previous bad archive passes signature checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['AndroidManifest.xml','classes.dex','assets/www/index.html','assets/www/mobile-entry.mjs','assets/www/platform.mjs','assets/www/api-engine.mjs','assets/www/app.js','assets/www/style.css','assets/www/mobile.css','assets/www/core.mjs','assets/www/collector.mjs','assets/www/waimai.mjs','assets/www/location.mjs','assets/www/diagnostic-core.mjs','assets/www/calculator.mjs','assets/www/cities.json','assets/www/demo-input.json','assets/www/version.mjs'];

test('APK成品检查：拒绝Windows反斜杠路径、缺资源、重复条目和私有数据',{skip:process.platform!=='win32',timeout:60000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waimai-apk-gate-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const create=path.join(dir,'create.ps1');
 await fs.writeFile(create,`param([string]$Fixture,[string]$Apk)\n$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n$items=Get-Content -Raw -LiteralPath $Fixture|ConvertFrom-Json\n$zip=[IO.Compression.ZipFile]::Open($Apk,'Create')\ntry{foreach($item in $items){$entry=$zip.CreateEntry($item.name);$writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false));try{$writer.Write([string]$item.text)}finally{$writer.Dispose()}}}finally{$zip.Dispose()}\n`);
 const baseline=()=>required.map(name=>({name,text:name.endsWith('.html')?'<link href="/style.css"><script type="module" src="/mobile-entry.mjs"></script>':name.endsWith('mobile-entry.mjs')?"import {x} from './platform.mjs';\nimport('/app.js');":'test-content'}));
 const cases=[
  {name:'正斜杠路径及已打包导入可通过',change:items=>items,ok:true},
  {name:'旧版assets/www\\index.html必须拒绝',change:items=>items.map(i=>({...i,name:i.name.replace('assets/www/','assets/www\\')})),error:/non-portable/},
  {name:'缺首页必须拒绝',change:items=>items.filter(i=>i.name!=='assets/www/index.html'),error:/Missing\/empty APK entry/},
  {name:'空模块必须拒绝',change:items=>items.map(i=>i.name==='assets/www/platform.mjs'?{...i,text:''}:i),error:/Missing\/empty APK entry/},
  {name:'同名条目必须拒绝',change:items=>[...items,items[0]],error:/duplicate/},
  {name:'模块静态导入缺失必须拒绝',change:items=>items.map(i=>i.name==='assets/www/app.js'?{...i,text:"import {x} from './missing.mjs';"}:i),error:/Unresolved packaged reference/},
  {name:'副作用导入缺失必须拒绝',change:items=>items.map(i=>i.name==='assets/www/app.js'?{...i,text:"import './missing.mjs';"}:i),error:/Unresolved packaged reference/},
  {name:'单引号相对HTML引用缺失必须拒绝',change:items=>items.map(i=>i.name==='assets/www/index.html'?{...i,text:"<script src='./missing.js'></script>"}:i),error:/Unresolved packaged reference/},
  {name:'动态导入缺失必须拒绝',change:items=>items.map(i=>i.name==='assets/www/app.js'?{...i,text:"import('/missing.mjs');"}:i),error:/Unresolved packaged reference/},
  {name:'HTML引用缺失必须拒绝',change:items=>items.map(i=>i.name==='assets/www/index.html'?{...i,text:'<script src="/missing.js"></script>'}:i),error:/Unresolved packaged reference/},
  {name:'私有凭证文件必须拒绝',change:items=>[...items,{name:'assets/credentials.bin',text:'synthetic-not-a-real-secret'}],error:/Private\/config/},
 ];
 for(let index=0;index<cases.length;index++)await t.test(cases[index].name,async()=>{
  const c=cases[index],fixture=path.join(dir,`${index}.json`),apk=path.join(dir,`${index}.apk`);
  await fs.writeFile(fixture,JSON.stringify(c.change(baseline())));
  await exec('pwsh',['-NoProfile','-File',create,'-Fixture',fixture,'-Apk',apk],{timeout:10000});
  const call=()=>exec('pwsh',['-NoProfile','-File',path.join(root,'scripts/verify-android-apk.ps1'),'-ApkPath',apk],{timeout:10000});
  if(c.ok){assert.match((await call()).stdout,/PASS: final APK paths/);}else{await assert.rejects(call(),error=>{assert.notEqual(error.code,0);assert.match(error.stdout+error.stderr,c.error);return true;});}
 });
});
