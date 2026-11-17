import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../poc.mjs';

test('已移除渠道的活动不会进入新报告或制造交集', () => {
  const report = buildReport({source:'live', full:[], ratio:[], errors:[], coverage:[], channelActivities:{
    full:[{name:'测试门店',meituanPoiId:'mt-1',source:'waimai',waimaiStoreId:'w1',rebate:15,minPay:30}],
    ratio:[{name:'测试门店',meituanPoiId:'mt-1',source:'xiaochan',ratioPercent:10,maxCashback:5}]
  }});
  assert.equal(report.counts.confirmed, 0);
  assert.equal(report.counts.fullStores, 0);
  assert.equal(report.counts.ratioStores, 1);
});

const { calculate, bestCombination } = await import('../web/calculator.mjs');
test('计算器：订单实付减一份满返与一份封顶比例返，保留负数', () => {
  assert.deepEqual(calculate({rebate:25,minPay:20},{ratioPercent:50,maxCashback:8},20),
    {status:'ok',pay:20,fullRebate:25,ratioRebate:8,net:-13});
});

test('计算器：缺金额、会员口径或封顶均待填写，未知门槛不补零', () => {
  assert.equal(calculate({rebate:12,minPay:null},{ratioPercent:10,maxCashback:5}).status,'needs_input');
  assert.equal(calculate({rebate:null,minPay:20},{ratioPercent:10,maxCashback:5},20).status,'needs_input');
  assert.equal(calculate({rebate:12,minPay:20},{ratioPercent:null,maxCashback:5},20).status,'needs_input');
  assert.equal(calculate({rebate:12,minPay:20},{ratioPercent:10,maxCashback:null},20).status,'needs_input');
  assert.equal(calculate({rebate:12,minPay:20},{ratioPercent:10,maxCashback:5},19).status,'below_threshold');
});

test('计算器：枚举来源组合并默认最低预计净支出，不重复累加满返', () => {
  const full=[{rebate:10,minPay:30,source:'xiaochan'},{rebate:18,minPay:30,source:'waimai'}];
  const ratio=[{ratioPercent:10,maxCashback:5},{ratioPercent:20,maxCashback:5}];
  const best=bestCombination(full,ratio);
  assert.equal(best.fullIndex,1); assert.equal(best.ratioIndex,1); assert.equal(best.net,7);
});


test('小蚕核心允许 20 页，仍拒绝 21 页', async () => {
 const {queryLive}=await import('../poc.mjs');
 await assert.rejects(()=>queryLive(21),/1 到 20/);
});

const {toGcj02}=await import('../location.mjs');
test('定位：WGS84 转 GCJ-02，北京已知坐标对误差小于 0.00001 度', () => {
 const p=toGcj02(39.908823,116.39747);assert.ok(Math.abs(p.lat-39.910226)<0.00001);assert.ok(Math.abs(p.lng-116.403714)<0.00001);
 assert.deepEqual(toGcj02(40.7,-74),{lat:40.7,lng:-74});
});

const {diagnosticSummary}=await import('../diagnostics.mjs');
test('诊断导出：仅允许统计字段，不泄露位置、商家、token、游标和原始错误',()=>{
 const d=diagnosticSummary({queryId:'q1',codeVersion:'abc',pages:20,durationMs:100,location:{label:'秘密地址',lat:30},token:'secret-token',pagination:{full:{requests:1,stopReason:'error',pages:[{request:1,newStores:2,rawItems:5,cursor:'secret'}]}},errors:[{source:'full',code:'UPSTREAM_HTTP',message:'secret-token 秘密地址'}]});
 assert.equal(d.queryId,'q1');assert.equal(d.pagination.full.pages[0].newStores,2);assert.ok(!JSON.stringify(d).includes('秘密地址'));assert.ok(!JSON.stringify(d).includes('secret'));
});

test('诊断写入失败不阻断业务；逐页统计保持 20 份上限',async t=>{
 const {saveDiagnostic}=await import('../diagnostics.mjs');const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'waimai-diagnostic-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(let i=0;i<22;i++)await saveDiagnostic(dir,{queryId:String(i),pages:10});
 assert.equal((await fs.readdir(dir)).length,20);
 const file=path.join(dir,'not-a-directory');await fs.writeFile(file,'x');assert.equal(await saveDiagnostic(file,{queryId:'failure'}),false);
});

test('诊断面对无效逐页字段不会抛出异常',()=>{
 assert.doesNotThrow(()=>diagnosticSummary({pagination:{full:{pages:'bad',stopReason:'error'}},errors:null}));
});

test('已有同 ID 重合时仍保留其他记录的完整同名候选，内部 ID 不跨域比较',()=>{
 const r=buildReport({source:'live',full:[],ratio:[],errors:[],coverage:[],channelActivities:{
  full:[{name:'测试店甲',meituanPoiId:'123',source:'xiaochan',xiaochanStoreId:'w1',rebate:10,minPay:20}],
  ratio:[{name:'测试店甲',meituanPoiId:'123',source:'xiaochan',ratioPercent:10,maxCashback:5},{name:'测试店甲',meituanPoiId:null,xiaochanStoreId:'123',source:'xiaochan',ratioPercent:20,maxCashback:10}]
 }});assert.equal(r.counts.confirmed,1);assert.equal(r.counts.candidatePairs,1);assert.equal(r.candidates[0].ratio.activities[0].source,'xiaochan');
});

test('地址搜索：解析字符串结果并拒绝空关键词，原始业务失败不泄露',async t=>{
 const {searchLocations}=await import('../poc.mjs');const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let request;
 globalThis.fetch=async(url,o)=>{request=JSON.parse(o.body);return Response.json({status:{code:0},result:JSON.stringify([{title:'测试点',address:'虚构地址',location:{lat:30,lng:110},adcode:110101,city:'北京市'}])});};
 const locations=await searchLocations('测试');assert.equal(locations[0].coordinateSystem,'GCJ-02');assert.equal(locations[0].city,'北京市');assert.equal(request.keyword,'测试');await assert.rejects(()=>searchLocations(''));
});

test('小蚕身份配置失败时安全停止，不尝试退役渠道',async t=>{
 const {collectAll}=await import('../collector.mjs');const oldSilk=process.env.XC_SILK_ID,oldUser=process.env.XC_USER_ID;
 process.env.XC_SILK_ID='bad';delete process.env.XC_USER_ID;t.after(()=>{if(oldSilk===undefined)delete process.env.XC_SILK_ID;else process.env.XC_SILK_ID=oldSilk;if(oldUser===undefined)delete process.env.XC_USER_ID;else process.env.XC_USER_ID=oldUser;});
 const r=await collectAll(10,{location:{lat:30,lng:110,adcode:110101,city:'北京市'},log:()=>{},requestPage:async()=>({code:200,data:{data:[{id:'member-store',shopName:'联合采集测试店',shopPlatformType:3,overbearfoodList:[{id:'activity-1',takeawayPlatform:'meituan',surplusNumber:1}]}],hasMore:false}})});
 assert.equal(r.errors[0].source,'full');assert.ok(r.errors.some(e=>e.source==='ratio'));assert.equal(r.pagination.waimai,undefined);assert.equal(r.channelActivities,undefined);
});

test('计算器：非有限及超安全精度金额不生成错误净支出，空活动返回 null',()=>{
 assert.equal(calculate({rebate:1,minPay:1},{ratioPercent:10,maxCashback:10},1e308).status,'needs_input');assert.equal(bestCombination([],[]),null);
});

test('地址反查：只把 WGS84 转换后的 GCJ-02 发给高德并返回核对地址',async()=>{
 const {reverseLocation}=await import('../location.mjs');let url;
 const loc=await reverseLocation({lat:39.908823,lng:116.39747},{key:'fake-test-key',fetchImpl:async u=>{url=new URL(u);return Response.json({status:'1',regeocode:{formatted_address:'虚构地址',addressComponent:{adcode:'110101',city:'',province:'北京市'}}});}});
 assert.ok(Number(url.searchParams.get('location').split(',')[0])>116.40);assert.equal(loc.city,'北京市');assert.equal(loc.coordinateSystem,'GCJ-02');await assert.rejects(()=>reverseLocation({lat:30,lng:110},{key:''}),/AMAP_KEY/);
});

test('同名但双方美团 ID 不同，即使歪麦内部 ID 相同也不匹配',()=>{
 const report=buildReport({source:'live',full:[],ratio:[],errors:[],coverage:[],channelActivities:{full:[{name:'店',meituanPoiId:'1',source:'xiaochan',rebate:10}],ratio:[{name:'店',meituanPoiId:'2',waimaiStoreId:'1',source:'waimai',ratioPercent:10}]}});assert.equal(report.counts.confirmed,0);assert.equal(report.counts.candidatePairs,0);
});


test('小蚕二十页成功路径：两类各20次且第20页门店保留',async t=>{
 const {queryLive,compare}=await import('../poc.mjs'),original=globalThis.fetch,counts={full:0,ratio:0};t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(_url,opts)=>{const kind=opts.headers.methodname==='FusionService.GetFeedPromotions'?'full':'ratio',page=++counts[kind];return Response.json(kind==='full'?{feed_items:Array.from({length:20},()=>({source:1,store_platform:1,store:{id:'f'+page,name:'满返店'+page},promotion_id:'p'+page,order_money:3000,user_rebate:1000,left_number:2}))}:{list:[{name:'比例店'+page,wm_poi_id:'r'+page,plan_activity_info_list:[{ratio:600,max_commission:1000,inventory:2}]}],pv_id:'cursor-'+page});};
 const result=await queryLive(20,{location:{lat:30,lng:110,adcode:110101},log:()=>{}}),report=compare(result.full,result.ratio);assert.deepEqual(counts,{full:20,ratio:20});assert.equal(report.counts.fullStores,20);assert.equal(report.counts.ratioStores,20);assert.ok(report.fullStores.some(s=>s.name==='满返店20'));assert.ok(report.ratioStores.some(s=>s.name==='比例店20'));assert.equal(result.pagination.full.stopReason,'page_limit');assert.equal(result.pagination.ratio.stopReason,'page_limit');
});

test('诊断配置：只导出严格布尔存在性，不导出配置值',()=>{const d=diagnosticSummary({config:{hasWmToken:true,hasAmapKey:false,publicMode:true,wmToken:'must-not-export'}});assert.deepEqual(d.config,{hasAmapKey:false,publicMode:true});assert.ok(!JSON.stringify(d).includes('must-not-export'));assert.deepEqual(diagnosticSummary({config:{hasWmToken:'secret'}}).config,{});});

test('地址反查缺失行政代码：明确提示搜索纠正，不返回伪造位置',async()=>{const {reverseLocation}=await import('../location.mjs');await assert.rejects(()=>reverseLocation({lat:30,lng:110},{key:'fake-key',fetchImpl:async()=>Response.json({status:'1',regeocode:{formatted_address:[],addressComponent:{adcode:[],city:[],province:[]}}})}),/搜索地址/);});
