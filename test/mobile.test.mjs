import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMobileApp} from '../android/mobile/api-engine.mjs';
const loc={label:'虚构测试位置',lat:34,lng:108,adcode:610100,city:'西安市'};
const data={source:'live',full:[],ratio:[],errors:[],coverage:[],channelActivities:{full:[{name:'虚构店',meituanPoiId:'fake1',source:'xiaochan',rebate:5,minPay:20}],ratio:[{name:'虚构店',meituanPoiId:'fake1',source:'waimai',ratioPercent:10,maxCashback:5}]}};
function setup(extra={}){let saved={};let calls=0;const storage={read:()=>structuredClone(saved),write:v=>{saved=structuredClone(v);}};const deps={storage,uuid:()=>crypto.randomUUID(),codeVersion:'test',cooldownMs:10,collect:async()=>{calls++;return structuredClone(data);},...extra};return {app:createMobileApp(deps),deps,read:()=>saved,calls:()=>calls};}
async function setLocation(app){return app.request('/api/location',loc);}
async function query(app){const state=await app.request('/api/state');return app.request('/api/query',{pages:10,locationKey:state.locationKey});}
async function done(app){for(let i=0;i<100;i++){if(!(await app.request('/api/state')).busy)return;await new Promise(r=>setTimeout(r,2));}throw Error('query did not finish');}

test('手机：无 Key 定位保存真实 GCJ 坐标而非候选坐标，不自动查询',async()=>{
 let keyword;const f=setup({search:async value=>{keyword=value;return [{...loc,label:'较远候选',lat:39.913,lng:116.404,adcode:110101,city:'北京市'},{...loc,label:'近候选',lat:39.9103,lng:116.4038,adcode:110101,city:'北京市'}];}});
 const result=await f.app.request('/api/location-current',{lat:39.908823,lng:116.39747,address:'北京市测试路'});
 assert.equal(keyword,'北京市测试路');assert.equal(result.location.adcode,110101);assert.equal(result.location.label,'当前位置 · 北京市测试路');
 assert.ok(Math.abs(result.location.lat-39.910226)<0.000002);assert.ok(Math.abs(result.location.lng-116.403714)<0.000002);assert.notEqual(result.location.lat,39.9103);
 assert.deepEqual(f.read().location,result.location);assert.deepEqual((await createMobileApp(f.deps).request('/api/state')).location,result.location);assert.equal(f.calls(),0);
});
test('手机：没有近距离匹配时保留旧位置',async()=>{const f=setup({search:async()=>[{...loc,label:'远处位置',lat:35,lng:108}]});await setLocation(f.app);await assert.rejects(f.app.request('/api/location-current',{lat:34,lng:108,address:'虚构地址'}),/匹配/);assert.deepEqual((await f.app.request('/api/state')).location,loc);});

const gps={lat:39.908823,lng:116.39747,address:'北京市测试路'};
const gpsCandidate={label:'测试候选',lat:39.9103,lng:116.4038,adcode:110101,city:'北京市'};
test('手机：当前位置输入错误、搜索异常及区划冲突均不改变旧位置',async()=>{
 for(const candidates of [[],[{...gpsCandidate,adcode:0}],[{...gpsCandidate,city:''}],[gpsCandidate,{...gpsCandidate,adcode:110102}],[{...gpsCandidate,lat:40.1}]]){
  const f=setup({search:async()=>candidates});await setLocation(f.app);await assert.rejects(f.app.request('/api/location-current',gps));assert.deepEqual(f.read().location,loc);
 }
 for(const value of [{...gps,lat:91},{...gps,lng:NaN},{...gps,address:''},{...gps,address:'x'.repeat(81)}]){
  let calls=0;const f=setup({search:async()=>{calls++;return [gpsCandidate];}});await setLocation(f.app);await assert.rejects(f.app.request('/api/location-current',value));assert.equal(calls,0);assert.deepEqual(f.read().location,loc);
 }
 const f=setup({search:async()=>{throw Error('网络不可用');}});await setLocation(f.app);await assert.rejects(f.app.request('/api/location-current',gps),/网络/);assert.deepEqual(f.read().location,loc);
});
test('手机：当前位置落盘失败原子回滚',async()=>{
 let saved={},fail=false;const f=setup({storage:{read:()=>structuredClone(saved),write:value=>{if(fail)throw Error('full');saved=structuredClone(value);}},search:async()=>[gpsCandidate]});await setLocation(f.app);fail=true;
 await assert.rejects(f.app.request('/api/location-current',gps),/保存失败/);assert.deepEqual((await f.app.request('/api/state')).location,loc);assert.deepEqual(saved.location,loc);
});
test('手机：定位匹配期间不允许启动查询',async()=>{
 let release;const f=setup({search:()=>new Promise(resolve=>{release=()=>resolve([gpsCandidate]);})});await setLocation(f.app);
 const pending=f.app.request('/api/location-current',gps);await assert.rejects(query(f.app),/定位/);release();await pending;assert.equal(f.calls(),0);
});
test('手机：手动保存新位置后，迟到的定位匹配不能覆盖',async()=>{
 let release;const f=setup({search:()=>new Promise(resolve=>{release=()=>resolve([gpsCandidate]);})});await setLocation(f.app);
 const pending=f.app.request('/api/location-current',gps),chosen={...loc,label:'后来手选的位置'};await f.app.request('/api/location',chosen);release();await assert.rejects(pending,/变化/);assert.deepEqual(f.read().location,chosen);
});

test('手机：原生定位等待期间用户已换位置，拒绝保存迟到坐标',async()=>{
 let searched=0;const f=setup({search:async()=>{searched++;return [gpsCandidate];}});await setLocation(f.app);const oldKey=(await f.app.request('/api/state')).locationKey;
 const chosen={...loc,lng:109};await f.app.request('/api/location',chosen);await assert.rejects(f.app.request('/api/location-current',{...gps,expectedLocationKey:oldKey}),/变化/);assert.equal(searched,0);assert.deepEqual(f.read().location,chosen);
});
test('手机：查询中拒绝定位匹配，不调用地址搜索',async()=>{
 let release,searched=0;const f=setup({search:async()=>{searched++;return [gpsCandidate];},collect:()=>new Promise(resolve=>{release=()=>resolve(data);})});await setLocation(f.app);await query(f.app);
 await assert.rejects(f.app.request('/api/location-current',gps),/正在查询/);assert.equal(searched,0);assert.deepEqual(f.read().location,loc);release();await done(f.app);
});

test('手机：自动保存拒绝城市与区划代码矛盾的候选',async()=>{
 for(const candidates of [[{...gpsCandidate,city:'上海市'}],[{...gpsCandidate,city:'上海市'},gpsCandidate]]){
  const f=setup({search:async()=>candidates});await setLocation(f.app);await assert.rejects(f.app.request('/api/location-current',gps),/城市/);assert.deepEqual(f.read().location,loc);
 }
});

test('手机：初始化/演示不调用真实采集；位置、真实结果和诊断分离',async()=>{const f=setup();assert.equal((await f.app.request('/api/state')).report,null);const demo=await f.app.request('/api/demo');assert.equal(demo.source,'demo');assert.equal(f.calls(),0);assert.equal((await f.app.request('/api/state')).report,null);await assert.rejects(f.app.request('/api/diagnostics'),/尚无/);});
test('手机：保存、查询、同 ID 交集、重启持久化与位置不匹配',async()=>{const f=setup();await setLocation(f.app);await query(f.app);await done(f.app);assert.equal(f.calls(),1);const state=await f.app.request('/api/state');assert.equal(state.report.counts.confirmed,1);assert.equal(state.resultMatchesLocation,true);const second=createMobileApp(f.deps);assert.deepEqual((await second.request('/api/state')).report,state.report);await second.request('/api/location',{...loc,lng:109});assert.equal((await second.request('/api/state')).resultMatchesLocation,false);});
test('手机：锁单、查询中禁止改位置、完成后冷却、参数验证',async()=>{let release;const f=setup({collect:()=>new Promise(resolve=>{release=()=>resolve(data);}),cooldownMs:10000});await setLocation(f.app);await query(f.app);await assert.rejects(query(f.app),/进行中/);await assert.rejects(setLocation(f.app),/正在查询/);release();await done(f.app);await assert.rejects(query(f.app),/稍等/);});
test('手机：查询中进程被回收，重启显示中断而非一直忙',async()=>{const f=setup({collect:()=>new Promise(()=>{})});await setLocation(f.app);await query(f.app);const restarted=createMobileApp(f.deps);const state=await restarted.request('/api/state');assert.equal(state.busy,false);assert.equal(state.attempt.status,'blocked');assert.match(state.attempt.errors[0].message,/系统中断/);assert.equal(f.read().snapshot.attempt.status,'blocked');});
test('手机：全部失败保留上次结果；诊断不泄露位置/凭证/原始错误',async()=>{let fail=false;const f=setup({collect:async()=>{if(fail)throw Error('fake-private-secret:'+JSON.stringify(loc));return data;},cooldownMs:0,config:()=>({hasWmToken:true,hasAmapKey:true})});await setLocation(f.app);await query(f.app);await done(f.app);const original=(await f.app.request('/api/state')).report;fail=true;await query(f.app);await done(f.app);const state=await f.app.request('/api/state');assert.deepEqual(state.report,original);assert.equal(state.attempt.status,'blocked');assert.ok(!JSON.stringify(state.attempt).includes('fake-private-secret'));const diag=await f.app.request('/api/diagnostics');assert.equal(diag.config.hasWmToken,true);assert.ok(!JSON.stringify(diag).includes('虚构测试位置'));assert.ok(!JSON.stringify(diag).includes('fake-private-secret'));});
test('手机：磁盘写失败不能先请求上游，也不能悄悄改变已保存位置',async()=>{let broken=false,saved={};let calls=0;const app=createMobileApp({storage:{read:()=>saved,write:v=>{if(broken)throw Error('full');saved=structuredClone(v);}},uuid:()=>crypto.randomUUID(),codeVersion:'x',collect:async()=>{calls++;return data;}});await setLocation(app);broken=true;await assert.rejects(query(app),/尚未请求上游/);assert.equal(calls,0);assert.equal((await app.request('/api/state')).busy,false);await assert.rejects(app.request('/api/location',{...loc,lng:109}));assert.equal((await app.request('/api/state')).location.lng,108);});
test('手机：无位置、陈旧位置、非法坐标/页数不得启动查询',async()=>{const f=setup();await assert.rejects(query(f.app),/先设置/);await assert.rejects(f.app.request('/api/location',{...loc,lat:true}));await assert.rejects(f.app.request('/api/location',{...loc,lat:91}));await assert.rejects(f.app.request('/api/location',{...loc,adcode:'000000'}));const s=await setLocation(f.app);await assert.rejects(f.app.request('/api/query',{pages:10,locationKey:'stale'}),/位置已变化/);await assert.rejects(f.app.request('/api/query',{pages:999,locationKey:s.locationKey}),/10 或 20/);assert.equal(f.calls(),0);});
test('手机：实际文件重启读回位置及结果，模拟适配器不是手机存储验收',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waimai-mobile-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json');const sync=await import('node:fs');const storage={read:()=>sync.existsSync(file)?JSON.parse(sync.readFileSync(file,'utf8')):{},write:value=>sync.writeFileSync(file,JSON.stringify(value))};const f=setup({storage,cooldownMs:0});await setLocation(f.app);await query(f.app);await done(f.app);const second=createMobileApp(f.deps);assert.equal((await second.request('/api/state')).report.counts.confirmed,1);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).location.label,loc.label);});
test('手机：地址搜索仅显式触发并限流；旧地图反查入口拒绝且不读取凭证',async()=>{
 let searched=0,legacyCalls=0;const f=setup({search:async keyword=>{searched++;return [{...loc,label:keyword}];},reverse:async()=>{legacyCalls++;return loc;}});
 assert.equal(searched,0);const result=await f.app.request('/api/location-search',{keyword:'测试城市'});assert.equal(result.locations[0].label,'测试城市');assert.equal(searched,1);
 await assert.rejects(f.app.request('/api/location-search',{keyword:'再次搜索'}),/较频繁/);
 const other=setup({reverse:async()=>{legacyCalls++;return loc;}});await assert.rejects(other.app.request('/api/location-reverse',{lat:34,lng:108}),/未支持/);assert.equal(legacyCalls,0);
});
