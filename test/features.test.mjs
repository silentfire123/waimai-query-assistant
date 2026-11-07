import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../poc.mjs';

test('多渠道：共同美团 ID 聚合同店并保留各来源活动', () => {
  const report = buildReport({source:'live', full:[], ratio:[], errors:[], coverage:[], channelActivities:{
    full:[{name:'测试门店',meituanPoiId:'mt-1',source:'waimai',waimaiStoreId:'w1',rebate:15,minPay:30}],
    ratio:[{name:'测试门店',meituanPoiId:'mt-1',source:'xiaochan',ratioPercent:10,maxCashback:5}]
  }});
  assert.equal(report.counts.confirmed, 1);
  assert.equal(report.matches[0].full.activities[0].source, 'waimai');
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

const { normalizeWaimai } = await import('../waimai.mjs');
test('歪麦：类型 3 满返保留来源内部 ID；最大阶梯不冒充最低门槛', () => {
  const result=normalizeWaimai([{id:'123',shopName:'测试店',shopPlatformType:3,overbearfoodList:[{id:'a',takeawayPlatform:'meituan',surplusNumber:1,maxGradeRebate:{fullMoney:50,rebateMoney:25},vipCompensationMoney:5}]}]);
  assert.equal(result.full.length,1);
  assert.equal(result.full[0].meituanPoiId,null);
  assert.equal(result.full[0].waimaiStoreId,'123');
  assert.equal(result.full[0].minPay,null);
  assert.equal(result.full[0].rebate,null);
  assert.equal(result.full[0].referenceGrade.rebateMoney,25);
});

test('歪麦：比例返只取会员字段，不以普通比例补值，未知类型不兜底', () => {
  const result=normalizeWaimai([{id:'w',shopName:'测试店',shopPlatformType:2,overbearfoodList:[{takeawayPlatform:'meituan',meituanRatio:30,maxReturnMoney:10}]}],{verifiedUnits:true});
  assert.equal(result.ratio[0].ratioPercent,null);
  assert.equal(result.ratio[0].maxCashback,10);
  assert.equal(normalizeWaimai([{shopName:'店',shopPlatformType:99,overbearfoodList:[{takeawayPlatform:'meituan'}]}]).ratio.length,0);
});

const { queryWaimai } = await import('../waimai.mjs');
test('歪麦分页：短页仍透传完整游标，错误不可伪装为空名单', async () => {
  const cursors=[];
  const result=await queryWaimai(10,{location:{city:'测试市'},pause:async()=>{},requestPage:async cursor=>{cursors.push(cursor);if(cursors.length===1)return {code:200,data:{data:[{shopName:'其他平台测试',overbearfoodList:[]}],scrollPageData:{opaque:{offset:15},flag:'keep'}}};throw Error('测试上游失败');}});
  assert.deepEqual(cursors,[null,{opaque:{offset:15},flag:'keep'}]);
  assert.equal(result.pagination.stopReason,'error');
  assert.equal(result.errors.length,1);
});

test('歪麦实测单位：会员原值 3100 显示 31%，金额字符串 15.5 为元', () => {
 const r=normalizeWaimai([{shopName:'虚构',shopPlatformType:2,overbearfoodList:[{takeawayPlatform:'meituan',meituanVipRatio:3100,maxReturnMoney:'15.5'}]}],{verifiedUnits:true}).ratio[0];
 assert.equal(r.ratioPercent,31);assert.equal(r.maxCashback,15.5);
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

test('已有同 ID 重合时仍保留其他来源的完整同名候选，内部 ID 不跨域比较',()=>{
 const r=buildReport({source:'live',full:[],ratio:[],errors:[],coverage:[],channelActivities:{
  full:[{name:'测试店甲',meituanPoiId:'123',source:'xiaochan',xiaochanStoreId:'w1',rebate:10,minPay:20}],
  ratio:[{name:'测试店甲',meituanPoiId:'123',source:'xiaochan',ratioPercent:10,maxCashback:5},{name:'测试店甲',meituanPoiId:null,waimaiStoreId:'123',source:'waimai',ratioPercent:20,maxCashback:10}]
 }});assert.equal(r.counts.confirmed,1);assert.equal(r.counts.candidatePairs,1);assert.equal(r.candidates[0].ratio.activities[0].source,'waimai');
});

test('歪麦分页明细缺少活动数组必须报告结构错误，不当空名单',async()=>{
 const r=await queryWaimai(10,{requestPage:async()=>({code:200,data:{data:[{shopName:'店',shopPlatformType:1}],scrollPageData:null}}),pause:async()=>{}});
 assert.equal(r.errors.length,1);assert.equal(r.pagination.stopReason,'error');
});

test('歪麦：hasMore=false 为明确末页；业务错误保留数值代码但不透出原文',async()=>{
 let calls=0;const done=await queryWaimai(20,{requestPage:async()=>{calls++;return {code:200,data:{data:[],hasMore:false,scrollPageData:{opaque:'still-present'}}};},pause:async()=>{}});
 assert.equal(calls,1);assert.equal(done.pagination.stopReason,'upstream_end');
 const failed=await queryWaimai(10,{requestPage:async()=>({code:4000010,msg:'private user details'}),pause:async()=>{}});
 assert.equal(failed.errors[0].upstreamCode,4000010);assert.ok(!JSON.stringify(failed).includes('private user'));
});

test('歪麦产品混合名单最多两次请求，不依赖非空短页，21 页仍拒绝',async()=>{
 let count=0;const r=await queryWaimai(20,{pause:async()=>{},requestPage:async()=>({code:200,data:{data:[{id:'w'+count,shopName:'测试'+count,shopPlatformType:2,overbearfoodList:[{takeawayPlatform:'meituan'}]}],scrollPageData:{page:++count}}})});assert.equal(count,2);assert.equal(r.pagination.stopReason,'page_limit');await assert.rejects(()=>queryWaimai(21));
});

test('地址搜索：解析字符串结果并拒绝空关键词，原始业务失败不泄露',async t=>{
 const {searchLocations}=await import('../poc.mjs');const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let request;
 globalThis.fetch=async(url,o)=>{request=JSON.parse(o.body);return Response.json({status:{code:0},result:JSON.stringify([{title:'测试点',address:'虚构地址',location:{lat:30,lng:110},adcode:110101,city:'北京市'}])});};
 const locations=await searchLocations('测试');assert.equal(locations[0].coordinateSystem,'GCJ-02');assert.equal(locations[0].city,'北京市');assert.equal(request.keyword,'测试');await assert.rejects(()=>searchLocations(''));
});

test('歪麦加解密：动态密钥、会员列表响应和不透明游标端到端回放',async()=>{
 const crypto=await import('node:crypto');const {createWaimaiClient}=await import('../waimai.mjs');
 const aes=(text,key,decrypt=false)=>{const c=decrypt?crypto.createDecipheriv('aes-'+Buffer.byteLength(key)*8+'-ecb',Buffer.from(key),null):crypto.createCipheriv('aes-'+Buffer.byteLength(key)*8+'-ecb',Buffer.from(key),null);return Buffer.concat([c.update(Buffer.from(text,decrypt?'base64':'utf8')),c.final()]).toString(decrypt?'utf8':'base64');};
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:1024});
 const keys={publicKey:pair.publicKey.export({type:'spki',format:'pem'}),privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'})};let count=0;const cursor={opaque:{page:15},flag:'preserve'};
 const request=await createWaimaiClient({city:'测试市',lat:30,lng:110},{token:'fake-local-test-token',fetchImpl:async(url,opts)=>{
  count++;assert.equal(opts.headers.token,'fake-local-test-token');
  if(count===1){assert.match(url,/newServiceConfig/);assert.equal(JSON.parse(aes(JSON.parse(opts.body).json,'jnd674751fh6fkgu',true)).city,'测试市');return Response.json({code:1,data:aes(JSON.stringify(keys),'jnd674751fh6fkgu')});}
  const raw=crypto.privateDecrypt({key:pair.privateKey,padding:crypto.constants.RSA_NO_PADDING},Buffer.from(opts.headers['encrypt-key'],'base64'));const key=Buffer.from(raw.subarray(raw.indexOf(0,2)+1).toString(),'base64').toString();
  const params=JSON.parse(aes(opts.body,key,true));assert.deepEqual(params.scrollPageData,cursor);assert.equal(params.userLatitude,'30');assert.equal(params.city,'测试市');
  const responseKey='0123456789abcdef';const encryptedKey=crypto.publicEncrypt({key:pair.publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(Buffer.from(responseKey).toString('base64'))).toString('base64');
  return new Response(aes(JSON.stringify({code:200,data:{data:[],scrollPageData:null}}),responseKey),{headers:{'encrypt-key':encryptedKey}});
 }});assert.equal((await request(cursor)).code,200);assert.equal(count,2);
});

test('歪麦诊断：逐页门店新增和排除原因可见，来源活动不丢失',async()=>{
 const r=await queryWaimai(10,{pause:async()=>{},requestPage:async()=>({code:200,data:{hasMore:false,data:[{id:'w1',shopName:'虚构店',shopPlatformType:1,overbearfoodList:[{id:'a',takeawayPlatform:'meituan',surplusNumber:2},{id:'b',takeawayPlatform:'eleme',surplusNumber:2},{id:'c',takeawayPlatform:'meituan',surplusNumber:0}]}]}})});
 assert.equal(r.pagination.stores,1);assert.equal(r.pagination.pages[0].newStores,1);assert.equal(r.pagination.filteredActivities,1);assert.equal(r.pagination.excludedOtherPlatform,1);assert.equal(r.pagination.excludedSoldOut,0);assert.equal(r.pagination.retainedSoldOut,1);
});

test('联合采集：小蚕身份配置失败仍尝试歪麦并保留部分结果',async t=>{
 const {collectAll}=await import('../collector.mjs');const oldSilk=process.env.XC_SILK_ID,oldUser=process.env.XC_USER_ID;
 process.env.XC_SILK_ID='bad';delete process.env.XC_USER_ID;t.after(()=>{if(oldSilk===undefined)delete process.env.XC_SILK_ID;else process.env.XC_SILK_ID=oldSilk;if(oldUser===undefined)delete process.env.XC_USER_ID;else process.env.XC_USER_ID=oldUser;});
 const r=await collectAll(10,{location:{lat:30,lng:110,adcode:110101,city:'北京市'},log:()=>{},requestPage:async()=>({code:200,data:{data:[{id:'member-store',shopName:'联合采集测试店',shopPlatformType:3,overbearfoodList:[{id:'activity-1',takeawayPlatform:'meituan',surplusNumber:1}]}],hasMore:false}})});
 assert.equal(r.errors[0].source,'full');assert.ok(r.errors.some(e=>e.source==='ratio'));assert.ok(r.pagination.waimai);assert.equal(r.channelActivities.full.length,1);assert.equal(r.channelActivities.full[0].waimaiStoreId,'member-store');
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

test('旧位置行政代码：咸阳辖区查询使用地级市而非区县名',async t=>{
 const {collectAll}=await import('../collector.mjs');const old=process.env.XC_SILK_ID,original=globalThis.fetch;process.env.XC_SILK_ID='bad';t.after(()=>{globalThis.fetch=original;if(old===undefined)delete process.env.XC_SILK_ID;else process.env.XC_SILK_ID=old;});let city;globalThis.fetch=async(_url,options)=>{city=decodeURIComponent(options.headers.city);throw Error('fixture stops after observing city; no network');};
 await collectAll(10,{location:{lat:34,lng:108,adcode:610402},log:()=>{}});assert.equal(city,'咸阳市');
});

test('小蚕二十页成功路径：两类各20次且第20页门店保留',async t=>{
 const {queryLive,compare}=await import('../poc.mjs'),original=globalThis.fetch,counts={full:0,ratio:0};t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(_url,opts)=>{const kind=opts.headers.methodname==='FusionService.GetFeedPromotions'?'full':'ratio',page=++counts[kind];return Response.json(kind==='full'?{feed_items:Array.from({length:20},()=>({source:1,store_platform:1,store:{id:'f'+page,name:'满返店'+page},promotion_id:'p'+page,order_money:3000,user_rebate:1000,left_number:2}))}:{list:[{name:'比例店'+page,wm_poi_id:'r'+page,plan_activity_info_list:[{ratio:600,max_commission:1000,inventory:2}]}],pv_id:'cursor-'+page});};
 const result=await queryLive(20,{location:{lat:30,lng:110,adcode:110101},log:()=>{}}),report=compare(result.full,result.ratio);assert.deepEqual(counts,{full:20,ratio:20});assert.equal(report.counts.fullStores,20);assert.equal(report.counts.ratioStores,20);assert.ok(report.fullStores.some(s=>s.name==='满返店20'));assert.ok(report.ratioStores.some(s=>s.name==='比例店20'));assert.equal(result.pagination.full.stopReason,'page_limit');assert.equal(result.pagination.ratio.stopReason,'page_limit');
});

test('诊断配置：只导出严格布尔存在性，不导出配置值',()=>{const d=diagnosticSummary({config:{hasWmToken:true,hasAmapKey:false,publicMode:true,wmToken:'must-not-export'}});assert.deepEqual(d.config,{hasWmToken:true,hasAmapKey:false,publicMode:true});assert.ok(!JSON.stringify(d).includes('must-not-export'));assert.deepEqual(diagnosticSummary({config:{hasWmToken:'secret'}}).config,{});});

test('地址反查缺失行政代码：明确提示搜索纠正，不返回伪造位置',async()=>{const {reverseLocation}=await import('../location.mjs');await assert.rejects(()=>reverseLocation({lat:30,lng:110},{key:'fake-key',fetchImpl:async()=>Response.json({status:'1',regeocode:{formatted_address:[],addressComponent:{adcode:[],city:[],province:[]}}})}),/搜索地址/);});

test('歪麦单位未核验：会员原值不能自动进入金额或比例计算',()=>{const result=normalizeWaimai([{id:'w',shopName:'单位未核验店',shopPlatformType:2,overbearfoodList:[{takeawayPlatform:'meituan',meituanVipRatio:3100,maxReturnMoney:15.5}]}]);assert.equal(result.ratio[0].ratioPercent,null);assert.equal(result.ratio[0].maxCashback,null);assert.equal(result.ratio[0].memberRatioRaw,3100);});
