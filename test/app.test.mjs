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
  assert.match(await (await fetch(app.base)).text(),/<option value="5" selected>每类最多 5 页<\/option>/);
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
  assert.equal((await app.post('/api/query',{pages:11})).status,400);
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
test('服务端支持每类十页上限并保留查询上下文', async t => {
  let requestedPages=0;const app=await setup(t,{collect:async pages=>{requestedPages=pages;return data();}});
  await app.post('/api/location',location);
  for(const pages of [0,11,1.5,'10']) assert.equal((await app.post('/api/query',{pages})).status,400);
  assert.equal(requestedPages,0);
  assert.equal((await app.post('/api/query',{pages:10})).status,202);
  const state=await app.done();assert.equal(requestedPages,10);assert.equal(state.report.context.pages,10);assert.equal(state.report.counts.confirmed,1);
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
  assert.equal(requestedPages,5);assert.equal(s.attempt.status,'blocked');assert.equal(s.busy,false);assert.equal(s.report,null);assert.ok(s.nextAllowedAt>Date.now());assert.ok(s.nextAllowedAt<Date.now()+11000);
  assert.equal((await app.post('/api/query')).status,429);
});
test('真实协议边界：WAF 首次即停，不冒充空列表', async t => {
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('腾讯云WAF',{status:403});};
  t.after(()=>{globalThis.fetch=original;});
  const response=await queryLive(3,{location,log:()=>{}});
  assert.equal(calls,1);assert.equal(response.errors[0].code,'UPSTREAM_WAF');assert.equal(response.errors[1].code,'SKIPPED_UPSTREAM_WAF');
});
test('真实协议边界：满返偏移推进且连续重复无新增时停止', async t => {
  const original=globalThis.fetch;let fullCalls=0,ratioCalls=0;const requests=[];
  globalThis.fetch=async(url,opts)=>{
    requests.push(opts);const body=JSON.parse(opts.body);
    if(opts.headers.methodname==='FusionService.GetFeedPromotions'){fullCalls++;assert.equal(body.rebate_type,1);return Response.json({status:{code:0},feed_items:Array.from({length:20},()=>({source:1,store_platform:1,store:{id:'xc',name:'测试门店'},order_money:3000,user_rebate:1000,left_number:2}))});}
    ratioCalls++;return Response.json({status:{code:0},list:ratio});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(10,{location,log:()=>{}});
  assert.deepEqual(requests.filter(r=>r.headers.methodname==='FusionService.GetFeedPromotions').map(r=>JSON.parse(r.body).offset),[0,20,40]);
  assert.equal(fullCalls,3);assert.equal(ratioCalls,1);assert.equal(result.errors.length,0);
  assert.equal(result.coverage.filter(n=>n.includes('内容重复')).length,2);assert.ok(result.coverage.some(n=>n.includes('未提供下一页游标')));assert.equal(requests[0].headers['x-Teemo'],'0');
});
test('比例返缺少数组显示错误而非正常空名单', async t => {
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'?{status:{code:0},feed_items:[]}:{status:{code:0}});
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(1,{location,log:()=>{}});assert.match(result.errors[0].message,/缺少 list/);
});

const feedStore = key => ({source:1,store_platform:1,store:{id:key,name:'测试店'+key},promotion_id:key,order_money:3000,user_rebate:1000,left_number:2});
test('有效分页：同一轮保持会话才能取得满返后续门店，每轮独立会话', async t => {
  const original=globalThis.fetch;const sessions=new Map();const firstSessions=[];
  globalThis.fetch=async(url,opts)=>{
    if(opts.headers.methodname!=='FusionService.GetFeedPromotions')return Response.json({list:[]});
    const session=opts.headers['X-Session-Id'];const body=JSON.parse(opts.body);
    if(body.offset===0)firstSessions.push(session);
    const next=sessions.get(session)??0;sessions.set(session,next+1);
    return Response.json({feed_items:Array.from({length:20},()=>feedStore('店'+next))});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(3,{location,log:()=>{}});
  assert.equal(compare(result.full,result.ratio).counts.fullStores,3,'更换会话会反复返回首批门店');
  await queryLive(1,{location,log:()=>{}});
  assert.notEqual(firstSessions[0],firstSessions[1],'不同查询应有独立会话');
});

test('有效分页：比例返 pv_id 不变但每页新增门店时继续读取', async t => {
  const original=globalThis.fetch;let calls=0;const inputs=[];
  globalThis.fetch=async(url,opts)=>{
    if(opts.headers.methodname==='FusionService.GetFeedPromotions')return Response.json({feed_items:[]});
    inputs.push(JSON.parse(opts.body).pv_id);calls++;
    return Response.json({list:[{...ratio[0],wm_poi_id:'mt-'+calls}],pv_id:'stable-pv',mt_pv_id:'mt-page-'+calls});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(4,{location,log:()=>{}});
  assert.equal(compare(result.full,result.ratio).counts.ratioStores,4,'重复 pv_id 不是末页证据');
  assert.deepEqual(inputs,[null,'stable-pv','stable-pv','stable-pv']);
});

test('有效分页：重复内容仍推进游标，并区分请求、内容、筛选与新增门店', async t => {
  const original=globalThis.fetch;let calls=0;const inputs=[];
  globalThis.fetch=async(url,opts)=>{
    if(opts.headers.methodname!=='FusionService.GetFeedPromotions')return Response.json({list:[]});
    const body=JSON.parse(opts.body);inputs.push(body.page_pv_id);calls++;
    const reachedThird=body.page_pv_id==='cursor-2';
    const items=Array.from({length:17},()=>feedStore(reachedThird?'b':'a'));
    items.push({...feedStore('sold-out'),left_number:0},{...feedStore('bad-money'),order_money:0},{...feedStore('other-platform'),store_platform:2});
    return Response.json({feed_items:items,page_pv_id:calls===1?'cursor-1':calls===2?'cursor-2':null});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(3,{location,log:()=>{}});
  assert.equal(compare(result.full,result.ratio).counts.fullStores,2,'重复内容页携带的新游标不能丢失');
  assert.deepEqual(inputs,[null,'cursor-1','cursor-2']);
  const stats=buildReport(result).pagination.full;
  assert.equal(stats.requests,3);assert.equal(stats.uniquePages,2);assert.equal(stats.duplicatePages,1);
  assert.equal(stats.rawItems,60);assert.equal(stats.classifiedItems,57);assert.equal(stats.eligibleActivities,51);assert.equal(stats.filteredActivities,6);
  assert.equal(stats.stores,2);assert.deepEqual(stats.pages.map(p=>p.newStores),[1,0,1]);
  assert.equal(stats.pages[1].cursorChanged,true);assert.equal(stats.stopReason,'page_limit');
});

test('有效分页：比例返会话不变且连续两次无新增门店时有界停止', async t => {
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{
    if(opts.headers.methodname==='FusionService.GetFeedPromotions')return Response.json({feed_items:[]});
    calls++;
    return Response.json({list:[{...ratio[0],picture:'metadata-'+calls}],pv_id:'stable-pv'});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(5,{location,log:()=>{}});
  assert.equal(calls,3,'内容字段变化不能掩盖连续无新增门店');
  assert.equal(result.pagination.ratio.stopReason,'no_progress');
  assert.deepEqual(result.pagination.ratio.pages.map(p=>p.newStores),[1,0,0]);
  assert.equal(compare(result.full,result.ratio).counts.ratioStores,1);
});

test('有效分页：单条满返缺失金额不丢弃同页合法门店，报告保留不完整状态', async t => {
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{
    if(opts.headers.methodname!=='FusionService.GetFeedPromotions')return Response.json({list:[]});
    calls++;const bad=feedStore('unknown');delete bad.order_money;
    return Response.json({feed_items:calls===1?[bad,...Array.from({length:19},()=>feedStore('valid'))]:[feedStore('later')]});
  };
  t.after(()=>{globalThis.fetch=original;});
  const result=await queryLive(3,{location,log:()=>{}});const report=buildReport(result);
  assert.equal(report.counts.fullStores,2,'异常条目不能让整页合法活动丢失');
  assert.equal(calls,2);assert.equal(report.status,'partial');assert.ok(report.errors.some(e=>e.code==='INVALID_FEED_ITEMS'));
  assert.equal(report.pagination.full.schemaRejectedItems,1);assert.equal(report.pagination.full.pages[0].filteredActivities,1);
  assert.equal(report.pagination.full.stopReason,'short_page');
});

test('有效分页：单条满返缺少 store 时仍保留同页合法活动', async t => {
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'
    ?{feed_items:[{...feedStore('missing'),store:undefined},feedStore('valid')]}
    :{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  assert.equal(report.counts.fullStores,1);assert.equal(report.status,'partial');
  assert.equal(report.pagination.full.schemaRejectedItems,1);
});

const productPromotion = (key, overrides = {}) => {
  const item = { ...feedStore(key), store_product: { name:'测试套餐', product_type:1,
    detail:{jump_product_id:'123456',sku_price:'17.6',full_discount_price:'15.1'} }, ...overrides };
  delete item.order_money;
  return item;
};
test('商品活动：无满返门槛且有完整商品信息的条目单独排除，不误报采集失败', async t => {
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'
    ?{feed_items:[feedStore('valid'),productPromotion('product-a'),productPromotion('product-b')]}
    :{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  assert.deepEqual(report.errors,[],'商品价格不是实付满返门槛，已识别商品活动应按范围排除');
  assert.equal(report.status,'no_overlap_in_sample');assert.equal(report.counts.fullStores,1);
  assert.equal(report.fullStores[0].activities[0].minPay,30,'不能用商品价格补写满返门槛');
  assert.equal(report.pagination.full.excludedProductItems,2);
  assert.equal(report.pagination.full.classifiedItems,1);
  assert.equal(report.pagination.full.schemaRejectedItems,0);
  assert.ok(report.notes.some(n=>n.includes('商品活动')&&n.includes('2')));
});

test('商品活动：商品信息不能掩盖缺门店、缺返现或损坏金额等真实异常', async t => {
  const missingStore=productPromotion('no-store',{store:undefined});
  const missingRebate=productPromotion('no-rebate',{user_rebate:undefined});
  const damagedMoney={...productPromotion('bad-money'),order_money:'not-a-number'};
  const missingProductId=productPromotion('no-product-id');delete missingProductId.store_product.detail.jump_product_id;
  const missingPrice=productPromotion('no-price');delete missingPrice.store_product.detail.sku_price;
  const unknownType=productPromotion('unknown-type');unknownType.store_product.product_type=99;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'
    ?{feed_items:[feedStore('valid'),missingStore,missingRebate,damagedMoney,missingProductId,missingPrice,unknownType]}
    :{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  assert.equal(report.status,'partial');assert.equal(report.counts.fullStores,1);
  assert.equal(report.pagination.full.excludedProductItems,0);
  assert.equal(report.pagination.full.schemaRejectedItems,6);
  assert.equal(report.errors[0].code,'INVALID_FEED_ITEMS');
});
test('商品活动：有明确实付满返门槛时仍保留，商品价不覆盖门槛', async t => {
  const item={...productPromotion('with-threshold'),order_money:3000};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'?{feed_items:[item]}:{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  assert.deepEqual(report.errors,[]);assert.equal(report.counts.fullStores,1);
  assert.equal(report.fullStores[0].activities[0].minPay,30);
  assert.equal(report.pagination.full.excludedProductItems,0);
});

test('商品活动：商品 ID 结构损坏时仍报异常，不能因通用 ID 字符串化而放行', async t => {
  const items=[{},true,'   ',0,-1,Number.MAX_SAFE_INTEGER+1,'not-a-product-id'].map((value,index)=>{
    const p=productPromotion('invalid-id-'+index);p.store_product.detail.jump_product_id=value;return p;
  });
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'?{feed_items:items}:{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  assert.equal(report.pagination.full.excludedProductItems,0);
  assert.equal(report.pagination.full.schemaRejectedItems,7);
  assert.equal(report.status,'blocked');assert.equal(report.errors[0].code,'INVALID_FEED_ITEMS');
});

test('异常明细：报告保留商家名、具体缺失字段及已知返现，不记录原始敏感响应', async t => {
  const missingThreshold={...feedStore('missing-threshold'),store:{id:'private-id',name:'测试湘菜（假日店）',address:'private-address'},user_rebate:600};
  delete missingThreshold.order_money;
  const missingStore={...feedStore('missing-store'),store:undefined};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>Response.json(opts.headers.methodname==='FusionService.GetFeedPromotions'
    ?{feed_items:[feedStore('valid'),missingThreshold,missingStore]}:{list:[]});
  t.after(()=>{globalThis.fetch=original;});
  const report=buildReport(await queryLive(1,{location,log:()=>{}}));
  const error=report.errors.find(e=>e.code==='INVALID_FEED_ITEMS');
  assert.deepEqual(error.items,[
    {storeName:'测试湘菜（假日店）',missingFields:['实付满返门槛'],rebate:6},
    {storeName:'门店名称未返回',missingFields:['门店名称'],rebate:10},
  ]);
  assert.ok(error.message.includes('测试湘菜（假日店）'));assert.ok(error.message.includes('返现 ¥6'));
  assert.equal(report.status,'partial');assert.equal(report.counts.fullStores,1);
  assert.ok(!JSON.stringify(error).includes('private-address'));assert.ok(!JSON.stringify(error).includes('private-id'));
});

test('异常明细：商家名可随结果落盘恢复，报告 HTML 转义名称', async t => {
  const issue={source:'full',code:'INVALID_FEED_ITEMS',items:[{storeName:'<script>测试店</script>',missingFields:['实付满返门槛'],rebate:6}],message:'<script>测试店</script>：缺少实付满返门槛（已知返现 ¥6）'};
  const app=await setup(t,{collect:async()=>({...data(),errors:[issue]})});
  await app.post('/api/location',location);await app.post('/api/query');const state=await app.done();
  assert.equal(state.report.status,'partial');assert.deepEqual(state.attempt.errors[0].items,issue.items);
  const saved=JSON.parse(await fs.readFile(path.join(app.dir,'latest.json'),'utf8'));
  assert.deepEqual(saved.report.errors[0].items,issue.items);
  assert.ok(!htmlReport(saved.report).includes('<script>测试店</script>'));
  assert.ok(htmlReport(saved.report).includes('&lt;script&gt;测试店&lt;/script&gt;'));
});
