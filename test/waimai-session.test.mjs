import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {checkWaimaiSession} from '../scripts/waimai-session.mjs';
const location={city:'测试市',lat:30,lng:110};
test('歪麦登录验证：未提供凭证不请求网络',async()=>{let calls=0;const result=await checkWaimaiSession({location,token:'',fetchImpl:async()=>{calls++;throw Error('must not call');}});assert.equal(result.status,'needs_token');assert.equal(calls,0);});

function upstream({rejectThird=false,endEarly=false,fail=false,repeatCursor=false,malformed=false}={}){
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:1024});let requests=0;const seen=[];
 const payload={publicKey:pair.publicKey.export({type:'spki',format:'pem'}),privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'})};const c=crypto.createCipheriv('aes-128-ecb',Buffer.from('jnd674751fh6fkgu'),null);const encrypted=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]).toString('base64');
 return {seen,get requests(){return requests;},fetchImpl:async(url,options)=>{seen.push({url,token:options.headers.token});if(fail)throw Error('PRIVATE_TOKEN_LEAK_ME');if(url.includes('newServiceConfig'))return Response.json({code:1,data:encrypted});requests++;if(rejectThird&&requests===3)return Response.json({code:4000010,msg:'PRIVATE_SERVER_MESSAGE'});return Response.json({code:200,data:{data:malformed?[{shopName:'测试店',overbearfoodList:[null]}]:[],hasMore:!endEarly,scrollPageData:{opaque:repeatCursor?1:requests}}});}};
}
test('歪麦登录验证：同一凭证用于握手与三页，第三页成功才确认且只请求3页',async()=>{const fake=upstream(),token='fake-personal-token';const r=await checkWaimaiSession({location,token,fetchImpl:fake.fetchImpl,pause:async()=>{}});assert.equal(r.status,'third_page_verified');assert.equal(r.completedPages,3);assert.equal(fake.requests,3);assert.equal(fake.seen.length,4);assert.ok(fake.seen.every(s=>s.token===token));assert.ok(!JSON.stringify(r).includes(token));assert.ok(!JSON.stringify(r).includes('opaque'));});

test('歪麦登录验证：第三页请登录不算成功、不重试，原文与凭证不泄漏',async()=>{const fake=upstream({rejectThird:true});const r=await checkWaimaiSession({location,token:'fake-personal-token',fetchImpl:fake.fetchImpl,pause:async()=>{}});assert.equal(r.status,'login_required');assert.equal(r.completedPages,2);assert.equal(r.upstreamCode,4000010);assert.equal(fake.requests,3);assert.ok(!JSON.stringify(r).includes('PRIVATE'));});

test('歪麦登录验证：不足3页结束只能未定，不能冒称已解决第三页登录',async()=>{const fake=upstream({endEarly:true});const r=await checkWaimaiSession({location,token:'fake-personal-token',fetchImpl:fake.fetchImpl,pause:async()=>{}});assert.equal(r.status,'inconclusive');assert.equal(r.completedPages,1);assert.equal(fake.requests,1);});

test('歪麦登录验证：异常只报安全分类，不泄露底层错误',async()=>{const fake=upstream({fail:true});const r=await checkWaimaiSession({location,token:'PRIVATE_TOKEN_LEAK_ME',fetchImpl:fake.fetchImpl});assert.equal(r.status,'request_failed');assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.equal(fake.seen.length,1);});
test('歪麦登录验证：缺城市坐标不向上游发送凭证',async()=>{let calls=0;const r=await checkWaimaiSession({location:{city:'测试市'},token:'fake-personal-token',fetchImpl:async()=>{calls++;throw Error('not called');}});assert.equal(r.status,'needs_location');assert.equal(calls,0);});

test('歪麦登录验证：换行或超长凭证不发送，防止粘贴整个请求',async()=>{for(const token of ['token with spaces','fake'+String.fromCharCode(10)+'injected','x'.repeat(4097)]){let calls=0;const r=await checkWaimaiSession({location,token,fetchImpl:async()=>{calls++;throw Error('not called');}});assert.equal(r.status,'invalid_token');assert.equal(calls,0);}});

import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function cliFixture(t,{token='fake-session-secret',mode='ok',args=[],port,latestText,onStarted}={}){
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'waimai-login-qa-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 await fsp.writeFile(path.join(dir,'settings.json'),JSON.stringify({location}));
 const preload=path.join(dir,'preload.mjs');await fsp.writeFile(preload,`import crypto from 'node:crypto';
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:1024});const keys={publicKey:pair.publicKey.export({type:'spki',format:'pem'}),privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'})};const c=crypto.createCipheriv('aes-128-ecb',Buffer.from('jnd674751fh6fkgu'),null);const encrypted=Buffer.concat([c.update(JSON.stringify(keys)),c.final()]).toString('base64');let count=0;
 globalThis.fetch=async(url,options)=>{if(!['fz-gateway.waimaimingtang.com','wmapp-api-v2.waimaimingtang.com'].includes(new URL(url).hostname))throw Error('Unexpected network boundary');if(options.headers.token!=='fake-session-secret')throw Error('Credential mismatch');if(url.includes('newServiceConfig'))return Response.json({code:1,data:encrypted});count++;if(process.env.QA_MODE==='rejected'&&count===3)return Response.json({code:4000010,msg:'private raw detail'});if(count>3)throw Error('Unbounded verification');return Response.json({code:200,data:{data:[],hasMore:true,scrollPageData:{page:count}}});};
 `);
 if(latestText!==undefined)await fsp.writeFile(path.join(dir,'latest.json'),latestText);
 const env={...process.env,DATA_DIR:dir,WM_TOKEN:token,QA_MODE:mode,PORT:String(port??8788)};delete env.NODE_OPTIONS;
 if(onStarted)return new Promise((resolve,reject)=>{let started=false,output='';const child=execFile(process.execPath,['--import',pathToFileURL(preload).href,path.join(root,'scripts/waimai-session.mjs'),...args],{cwd:root,env,timeout:15000},(e,stdout,stderr)=>{if(!started)resolve({code:e?.code??0,stdout,stderr});});const closed=new Promise(done=>child.once('close',done));child.stdout.on('data',chunk=>{output+=chunk;if(!started&&output.includes('已启动本人会话本机服务：')){started=true;Promise.resolve().then(()=>onStarted({port,dir})).then(async()=>{child.kill();await closed;resolve({code:0,stdout:output,stderr:''});},async error=>{child.kill();await closed;reject(error);});}});});
 try{const r=await exec(process.execPath,['--import',pathToFileURL(preload).href,path.join(root,'scripts/waimai-session.mjs'),...args],{cwd:root,env,timeout:15000});return {...r,code:0};}catch(e){return {code:e.code,stdout:e.stdout,stderr:e.stderr};}
}
test('会话CLI：缺凭证退出2，不把登录失败当成功',async t=>{const r=await cliFixture(t,{token:''});assert.equal(r.code,2);assert.match(r.stdout,/隐藏输入/);assert.equal(r.stderr,'');});
test('会话CLI：模拟握手与第3页成功，输出脱敏验证结论',async t=>{const r=await cliFixture(t);assert.equal(r.code,0);assert.match(r.stdout,/third_page_verified/);assert.ok(!r.stdout.includes('fake-session-secret'));assert.equal(r.stderr,'');});
test('会话CLI：模拟第3页登录拒绝退出2，保持未完成，不输出上游原文',async t=>{const r=await cliFixture(t,{mode:'rejected'});assert.equal(r.code,2);assert.match(r.stdout,/login_required/);assert.ok(!r.stdout.includes('private raw detail'));assert.ok(!r.stdout.includes('fake-session-secret'));assert.equal(r.stderr,'');});

test('歪麦登录验证：重复第二页游标不得声称第三页成功，也不重复发送',async()=>{const fake=upstream({repeatCursor:true});const r=await checkWaimaiSession({location,token:'fake-personal-token',fetchImpl:fake.fetchImpl,pause:async()=>{}});assert.equal(r.status,'inconclusive');assert.equal(fake.requests,2);assert.equal(r.requests,2);assert.equal(r.completedPages,2);});

test('会话CLI：通过目录链接启动仍执行入口，不以静默退出0冒称成功',async t=>{const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'waimai-entry-test-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));const target=path.join(dir,'target'),link=path.join(dir,'link');await fsp.mkdir(path.join(target,'scripts'),{recursive:true});for(const file of ['package.json','waimai.mjs','platform.mjs','waimai-client.node.mjs','scripts/waimai-session.mjs'])await fsp.copyFile(path.join(root,file),path.join(target,file));await fsp.symlink(target,link,process.platform==='win32'?'junction':'dir');const env={...process.env,WM_TOKEN:''};delete env.NODE_OPTIONS;const r=await exec(process.execPath,[path.join(link,'scripts/waimai-session.mjs'),'--help'],{env,timeout:10000});assert.match(r.stdout,/本机歪麦会话验证/);assert.equal(r.stderr,'');});

import net from 'node:net';
async function listen(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server;}
test('会话CLI：--start成功后本机页面可访问，不需要全局公网认证配置',async t=>{const held=await listen(),port=held.address().port;await new Promise(r=>held.close(r));let observed=false;const r=await cliFixture(t,{args:['--start'],port,onStarted:async()=>{const response=await fetch('http://127.0.0.1:'+port+'/api/state');assert.equal(response.status,200);assert.deepEqual((await response.json()).location,location);observed=true;}});assert.equal(r.code,0);assert.equal(observed,true);assert.match(r.stdout,/third_page_verified/);assert.ok(!r.stdout.includes('fake-session-secret'));});
test('会话CLI：登录拒绝不启动服务',async t=>{const r=await cliFixture(t,{args:['--start'],mode:'rejected'});assert.equal(r.code,2);assert.ok(!r.stdout.includes('已启动本人会话本机服务'));});
test('会话CLI：启动端口占用不关闭已有监听、不泄漏凭证',async t=>{const held=await listen();t.after(()=>new Promise(r=>held.close(r)));const r=await cliFixture(t,{args:['--start'],port:held.address().port});assert.equal(r.code,1);assert.equal(held.listening,true);assert.match(r.stderr,/本机服务无法启动/);assert.ok(!r.stderr.includes('fake-session-secret'));});
test('会话CLI：三页成功但本地状态损坏，应区分预览启动失败和验证结论',async t=>{const r=await cliFixture(t,{args:['--start'],latestText:'{broken'});assert.equal(r.code,1);assert.match(r.stdout,/third_page_verified/);assert.match(r.stderr,/第三页已验证，但本机预览未启动/);assert.ok(!r.stderr.includes('fake-session-secret'));});

test('歪麦登录验证：畸形活动结构立即停止，不把响应200当第三页通过',async()=>{const fake=upstream({malformed:true});const r=await checkWaimaiSession({location,token:'fake-personal-token',fetchImpl:fake.fetchImpl,pause:async()=>{}});assert.equal(r.status,'request_failed');assert.equal(r.requests,1);assert.equal(r.completedPages,0);assert.equal(fake.requests,1);});
