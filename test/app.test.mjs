import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp, validateLocation } from '../server.mjs';
import { compare, queryLive, buildReport, demoReport, htmlReport } from '../poc.mjs';

const location = { label:'测试位置（虚构）', lat:30, lng:110, adcode:110101 };
const full = [{ meituan_status:1, store:{name:'测试饭店（甲店）',store_id:'xc-1'}, meituan_poi_id:'mt-1', meituan_order_money:3000, meituan_user_rebate:1200, meituan_left_number:3 }];
const ratio = [{ name:'测试饭店（甲店）', wm_poi_id:'mt-1', plan_activity_info_list:[{ratio:600,max_commission:1000,inventory:2,plan_activity_type:1}] }];
const data = () => ({ source:'live', full, ratio, errors:[], coverage:['测试样本'] });
async function setup(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'waimai-web-test-'));
  if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('waimai-web-test-')) throw Error('unexpected test path');
  const server = await createApp({ dataDir:dir, cooldownMs:0, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); await fs.rm(dir, { recursive:true, force:true }); });
  let state = await (await fetch(base + '/api/state')).json();
  const post = async (route, value = {}, headers = {}) => { if(route === '/api/query' && !Object.hasOwn(value, 'locationKey')) value = {...value, locationKey:(await getState()).locationKey}; return fetch(base + route, {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrfToken,...headers},body:JSON.stringify(value)}); };
  const getState = async () => (await fetch(base + '/api/state')).json();
  async function done() { for(let i=0;i<100;i++) { const s=await getState();if(!s.busy)return s;await new Promise(r=>setTimeout(r,10)); } throw Error('job did not finish'); }
  return { server, dir, base, post, getState, done };
}
test('匹配只接受同平台 ID 或完整同名候选，保留分店边界', () => {
  assert.equal(compare(full,ratio).counts.confirmed,1);
  assert.equal(compare([{...full[0],meituan_poi_id:'other'}],ratio).counts.candidatePairs,0);
  const noId=[{...full[0],meituan_poi_id:undefined}];
  assert.equal(compare(noId,ratio).counts.candidatePairs,1);
  assert.equal(compare(noId,[{...ratio[0],name:'测试饭店（乙店）'}]).counts.candidatePairs,0);
  assert.equal(compare(full,[{...ratio[0],plan_activity_info_list:[{ratio:600,inventory:0}]}]).counts.ratioStores,0);
  assert.equal(compare(full,ratio).ratioStores[0].activities[0].ratioPercent,6);
});
test('报告演示隔离和 HTML 转义', async () => {
  const demo=await demoReport();assert.equal(demo.status,'demo');assert.equal(demo.counts.confirmed,1);
  const report=buildReport({...data(), full:[{...full[0],store:{name:'<script>bad</script>'}}]});
  assert.ok(!htmlReport(report).includes('<script>bad</script>'));
});
test('位置字段必填、范围、名称和行政区划校验', () => {
  assert.equal(validateLocation(location).lat,30);
  for(const value of [{...location,lat:''},{...location,lat:91},{...location,lng:181},{...location,adcode:123},{...location,label:''},{...location,lat:false}]) assert.throws(()=>validateLocation(value));
});
test('初始页面、静态资源、本机边界和配置路径不可访问', async t => {
  const app=await setup(t);
  const state=await app.getState();assert.equal(state.location,null);assert.equal(state.report,null);
  assert.match(await (await fetch(app.base)).text(),/外卖查询助手/);
  assert.equal((await fetch(app.base+'/app.js')).status,200);
  assert.match(await (await fetch(app.base)).text(),/value=\"3\" selected/);
  for(const route of ['/data/settings.json','/poc.mjs','/.git/config']) assert.equal((await fetch(app.base+route)).status,404);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(app.base+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(hostStatus,403);
  assert.equal((await app.post('/api/location',location,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await app.post('/api/location',location,{Origin:'https://evil.example'})).status,403);
  assert.equal((await app.post('/api/query')).status,400);
  assert.equal((await app.post('/api/location', null)).status,400);
  assert.equal((await app.post('/api/location', [])).status,400);
  assert.equal((await app.post('/api/location',{...location,lat:999})).status,400);
});
test('保存位置、任务互斥、输入限制、查询完成与落盘恢复', async t => {
  let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
  const app=await setup(t,{collect:async(pages,opts)=>{calls++;assert.equal(pages,2);assert.equal(opts.location.label,location.label);opts.log('测试采集中');await gate;return data();}});
  assert.equal((await app.post('/api/location',location)).status,200);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(app.dir,'settings.json'),'utf8')).location,location);
  assert.equal((await app.post('/api/query',{pages:4})).status,400);
  assert.equal((await app.post('/api/query',{pages:2})).status,202);
  assert.equal((await app.post('/api/query',{pages:2})).status,409);
  assert.equal((await app.post('/api/location',location)).status,409);
  assert.equal((await app.getState()).busy,true);release();
  const state=await app.done();assert.equal(calls,1);assert.equal(state.report.counts.confirmed,1);assert.equal(state.resultMatchesLocation,true);
  const disk=JSON.parse(await fs.readFile(path.join(app.dir,'latest.json'),'utf8'));assert.equal(disk.report.status,'sample_overlap');
  assert.ok(!JSON.stringify(disk).includes('"lat"'));
  const reloaded=await createApp({dataDir:app.dir});
  await new Promise(resolve=>reloaded.listen(0,'127.0.0.1',resolve));
  const recovered=await (await fetch(`http://127.0.0.1:${reloaded.address().port}/api/state`)).json();
  await new Promise(resolve=>{reloaded.close(resolve);reloaded.closeAllConnections();});
  assert.equal(recovered.report.generatedAt,state.report.generatedAt);
  const staleKey=state.locationKey; await app.post('/api/location',{...location,lat:31});assert.equal((await app.getState()).resultMatchesLocation,false);
  assert.equal((await app.post('/api/query',{locationKey:staleKey})).status,409);
});
test('全部失败保留上次结果，演示不覆盖缓存', async t => {
  let calls=0;const app=await setup(t,{collect:async()=>++calls===1?data():{...data(),full:[],ratio:[],errors:[{source:'full',code:'UPSTREAM_WAF',message:'被 WAF 拦截'}]}});
  await app.post('/api/location',location);await app.post('/api/query');const first=await app.done();
  await app.post('/api/query');const failed=await app.done();
  assert.equal(failed.attempt.status,'blocked');assert.equal(failed.report.generatedAt,first.report.generatedAt);
  assert.equal((await (await fetch(app.base+'/api/demo')).json()).source,'demo');
  assert.equal((await app.getState()).report.generatedAt,first.report.generatedAt);
});
test('冷却时间限制与异常恢复', async t => {
  let requestedPages=0;const app=await setup(t,{cooldownMs:10000,collect:async pages=>{requestedPages=pages;throw Error('测试断网');}});
  await app.post('/api/location',location);await app.post('/api/query');const s=await app.done();
  assert.equal(requestedPages,3);assert.equal(s.attempt.status,'blocked');assert.equal(s.busy,false);assert.equal(s.report,null);assert.ok(s.nextAllowedAt>Date.now());assert.ok(s.nextAllowedAt<Date.now()+11000);
  assert.equal((await app.post('/api/query')).status,429);
});
test('真实协议边界：WAF 首次即停，不冒充空列表', async t => {
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('腾讯云WAF',{status:403});};
  t.after(()=>{globalThis.fetch=original;});
  const response=await queryLive(3,{location,log:()=>{}});
  assert.equal(calls,1);assert.equal(response.errors[0].code,'UPSTREAM_WAF');assert.equal(response.errors[1].code,'SKIPPED_UPSTREAM_WAF');
});
test('真实协议边界：识别新 feed 与比例返，重复页停止', async t => {
  const original=globalThis.fetch;let fullCalls=0,ratioCalls=0;const requests=[];
  globalThis.fetch=async(url,opts)=>{
    requests.push(opts);const body=JSON.parse(opts.body);
    if(opts.headers.methodname==='FusionService.GetFeedPromotions'){fullCalls++;assert.equal(body.rebate_type,1);return Response.json({status:{code:0},feed_items:Array.from({length:20},()=>({source:1,store_platform:1,store:{id:'xc',name:'测试门店'},order_money:3000,user_rebate:1000,left_number:2}))});}
    ratioCalls++;return Response.json({status:{code:0},list:ratio});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(3,{location,log:()=>{}});
  assert.equal(fullCalls,3);assert.equal(ratioCalls,1);assert.equal(result.errors.length,0);
  assert.equal(result.coverage.filter(n=>n.includes('内容重复')).length,2);assert.ok(result.coverage.some(n=>n.includes('未提供下一页游标')));assert.equal(requests[0].headers['x-Teemo'],'0');
});
test('比例返缺少数组显示错误而非正常空名单', async t => {
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'?{status:{code:0},feed_items:[]}:{status:{code:0}});
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(1,{location,log:()=>{}});assert.match(result.errors[0].message,/缺少 list/);
});
