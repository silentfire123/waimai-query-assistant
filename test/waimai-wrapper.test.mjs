import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const exe of ['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe','C:/Program Files/PowerShell/7/pwsh.exe'])test('PowerShell凭证入口：取消输入后恢复原本不存在的环境变量 '+exe,{skip:process.platform!=='win32'},async t=>{
 try{await fs.access(exe);}catch{t.skip('此PowerShell版本未安装');return;}
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waimai-wrapper-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'scripts'));await fs.copyFile(path.join(root,'scripts/waimai-login.ps1'),path.join(dir,'scripts/waimai-login.ps1'));
 const driver=path.join(dir,'driver.ps1');await fs.writeFile(driver,`$keys=@('WM_TOKEN','PORT','DATA_DIR','PUBLIC_ORIGIN','ACCESS_PASSWORD')
 foreach($key in $keys){Remove-Item -LiteralPath ('Env:'+ $key) -ErrorAction SilentlyContinue}
 function global:Read-Host {param([string]$Prompt,[switch]$AsSecureString) if(-not $AsSecureString){exit 92}; throw 'simulated cancellation'}
 & (Join-Path $PSScriptRoot 'scripts/waimai-login.ps1')
 $wrapperCode=$LASTEXITCODE
 foreach($key in $keys){if(Test-Path -LiteralPath ('Env:'+ $key)){Write-Output ('NOT_RESTORED_'+$key);exit 91}}
 if($wrapperCode -ne 1){exit 93}
 Write-Output 'CANCELLED_AND_ENV_RESTORED'
 exit 0`,'utf8');
 let result;try{result=await exec(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',driver],{cwd:dir,env:{...process.env,TEMP:dir,TMP:dir},timeout:15000});}catch(e){assert.fail('凭证入口环境恢复失败: '+e.stdout+' exit='+e.code);}
 assert.match(result.stdout,/CANCELLED_AND_ENV_RESTORED/);
});
