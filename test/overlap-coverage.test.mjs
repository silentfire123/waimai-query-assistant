import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {compare,queryLive,buildReport,htmlReport} from '../core.mjs';
import {collectAll} from '../collector.mjs';
import {diagnosticSummary} from '../diagnostic-core.mjs';
const location={label:'虚构验证点',lat:30,lng:110,adcode:110101,city:'北京市'};
const full=(key,quota=0)=>({meituan_status:1,store:{name:'合成门店 '+key,store_id:'xc-'+key},meituan_poi_id:'mt-'+key,meituan_user_rebate:1000,meituan_order_money:null,meituan_left_number:quota});
const ratio=(key,quota=0)=>({name:'合成门店 '+key,wm_poi_id:'mt-'+key,plan_activity_info_list:[{ratio:1200,max_commission:800,inventory:quota}]});
const feed=key=>({source:2,store_platform:1,store:{name:'合成门店 '+key,id:'xc-'+key},promotion_id:'p-'+key,user_rebate:1000,left_number:0});

test('名额为零与未知均进入两类名单及重合；缺金额/比例仍不伪造',()=>{
 const values=[0,'0',null,undefined,-1,false,'bad','',3];
 const report=buildReport({source:'live',full:values.map((v,i)=>({...full(i),meituan_left_number:v})),ratio:values.map((v,i)=>({...ratio(i),plan_activity_info_list:[{ratio:1200,inventory:v}]})),errors:[],coverage:[]});
 assert.equal(report.counts.fullStores,9);assert.equal(report.counts.ratioStores,9);assert.equal(report.counts.confirmed,9);
 for(const side of ['fullStores','ratioStores']){
  assert.deepEqual(report[side].map(s=>s.activities[0].inventory),[0,0,null,null,null,null,null,null,3]);
  assert.deepEqual(report[side].map(s=>s.activities[0].inventoryState),['sold_out','sold_out','unknown','unknown','unknown','unknown','unknown','unknown','reported_remaining']);
 }
 assert.equal(report.fullStores[0].activities[0].minPay,null);
 assert.match(htmlReport(report),/明确无名额（保留比对）/);assert.match(htmlReport(report),/名额未知/);
 assert.equal(compare([{...full('bad'),meituan_user_rebate:null}],[{...ratio('bad'),plan_activity_info_list:[{ratio:false,inventory:0}]}]).counts.fullStores,0);
 assert.equal(compare([],[{...ratio('bad'),plan_activity_info_list:[{ratio:false,inventory:0}]}]).counts.ratioStores,0);
});

test('四种满返×比例来源组合均保留，同一门店只展示一个交集及全部活动',()=>{
 const make=(source,key)=>({source,name:'同一合成门店',meituanPoiId:'mt-evidence',...(source==='waimai'?{waimaiStoreId:'w'}:{xiaochanStoreId:'x'}),promotionId:key,inventory:0});
 const r=compare([],[],{full:[make('xiaochan','f1'),make('waimai','f2')],ratio:[make('xiaochan','r1'),make('waimai','r2')]});
 assert.equal(r.counts.confirmed,1);assert.equal(r.matches[0].full.activities.length,2);assert.equal(r.matches[0].ratio.activities.length,2);
 assert.deepEqual(new Set(r.matches[0].combinations),new Set(['xiaochan×xiaochan','waimai×waimai','xiaochan×waimai','waimai×xiaochan']));
 for(const a of ['xiaochan','waimai'])for(const b of ['xiaochan','waimai'])assert.equal(compare([],[],{full:[make(a,'f')],ratio:[make(b,'r')]}).counts.confirmed,1);
});

test('身份别名仅凭同条活动的共同ID连通，冲突链不得把不同美团分店传递合并',()=>{
 const f={source:'waimai',name:'合成连通店',waimaiStoreId:'w',meituanPoiId:'mt'};
 let r=compare([],[],{full:[f],ratio:[{source:'waimai',name:'合成连通店',waimaiStoreId:'w'},{source:'xiaochan',name:'合成连通店',meituanPoiId:'mt'}]});
 assert.equal(r.counts.confirmed,1);assert.equal(r.ratioStores.length,1);assert.equal(r.matches[0].ratio.activities.length,2);
 r=compare([],[],{full:[f,{...f,meituanPoiId:'other-mt'}],ratio:[{source:'waimai',name:'合成连通店',waimaiStoreId:'w'}]});
 assert.equal(r.counts.fullStores,2);assert.equal(r.counts.confirmed,0);
});

test('小蚕默认两类独立20页；退役渠道不会被调用；请求参数不猜距离或库存过滤',async t=>{
 const counts={full:0,ratio:0,wm:0};const sessions=new Set();
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  sessions.add(options.headers['X-Session-Id']);const body=JSON.parse(options.body);
  assert.ok(!('onlyAvailable' in body));assert.ok(!('inventory' in body));
  if(options.headers.methodname==='FusionService.GetFeedPromotions'){
   assert.equal(body.sort,1);assert.equal(body.rebate_type,1);assert.equal(body.is_show_mt,true);assert.equal(body.offset,counts.full*20);counts.full++;
   return Response.json({feed_items:Array.from({length:20},(_,i)=>feed(counts.full+'-'+i)),page_pv_id:'full-'+counts.full});
  }
  assert.ok(!('sort' in body));counts.ratio++;return Response.json({list:[ratio(counts.ratio)],pv_id:'ratio-'+counts.ratio});
 });
 const data=await collectAll(undefined,{location,pause:async()=>{},log:()=>{},requestPage:async()=>({code:200,data:{data:[wm('w'+(++counts.wm),2)],scrollPageData:{page:counts.wm}}})});
 assert.deepEqual(counts,{full:20,ratio:20,wm:0});assert.equal(sessions.size,1);
 assert.equal(data.pagination.full.plannedPages,20);assert.equal(data.pagination.ratio.plannedPages,20);assert.equal(data.pagination.waimai,undefined);
 assert.equal(data.pagination.full.ordering,'upstream_unverified');assert.equal(data.pagination.full.retainedSoldOut,400);assert.equal(data.pagination.full.filteredActivities,0);
});

test('小蚕选择10/20页分别生效，一类早停不消耗另一类上限',async t=>{
 for(const pages of [10,20]){
  let fullCalls=0,ratioCalls=0;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{if(options.headers.methodname==='FusionService.GetFeedPromotions'){fullCalls++;return Response.json({feed_items:[]});}ratioCalls++;return Response.json({list:[ratio(ratioCalls)],pv_id:String(ratioCalls)});});
  const r=await queryLive(pages,{location,pause:async()=>{},log:()=>{}});assert.equal(fullCalls,1);assert.equal(ratioCalls,pages);assert.equal(r.pagination.full.plannedPages,pages);assert.equal(r.pagination.ratio.plannedPages,pages);t.mock.restoreAll();
 }
});

test('小蚕登录/HTTP403立即停止共享网关，跳过类别仍有计划/零请求统计',async t=>{
 for(const response of [()=>Response.json({status:{code:123,msg:'请先登录 SECRET'}}),()=>new Response('Forbidden',{status:403})]){
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return response();});
  const r=await queryLive(20,{location,pause:async()=>{},log:()=>{}});assert.equal(calls,1);assert.equal(r.pagination.full.stopReason,'auth_required');assert.equal(r.pagination.ratio.plannedPages,20);assert.equal(r.pagination.ratio.requests,0);assert.equal(r.pagination.ratio.stopReason,'auth_required');assert.ok(!JSON.stringify(r).includes('SECRET'));t.mock.restoreAll();
 }
});

test('小蚕连续无新增即停，不因不断变化的游标无限消耗页数',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(_url,options)=>{if(options.headers.methodname!=='FusionService.GetFeedPromotions')return Response.json({list:[]});calls++;return Response.json({feed_items:Array.from({length:20},()=>feed('same')),page_pv_id:String(calls)});});
 const r=await queryLive(20,{location,pause:async()=>{},log:()=>{}});assert.equal(calls,3);assert.equal(r.pagination.full.stopReason,'no_progress');
});

test('共享UI逐份活动显示零/未知名额、四组合与可靠同源ID徽标，不误报候选',async()=>{
 const source=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('const sourceName='),source.indexOf('function renderList()'));
 const m={confirmed:true,basis:'相同来源门店 ID（美团活动）',combinations:['waimai×waimai'],full:{name:'合成店',activities:[{source:'waimai',inventory:0,rebate:null}]},ratio:{name:'合成店',activities:[{source:'waimai',inventory:null,ratioPercent:12}]}};
 const html=vm.runInNewContext(code+';row(m.full,"overlap",m,0)',{m,esc:v=>String(v??''),money:v=>v==null?'待核对':String(v),calculatorMarkup:()=>''});
 assert.match(html,/同 ID 重合/);assert.match(html,/明确无名额（保留比对）/);assert.match(html,/名额未知/);assert.match(html,/返现金额待填写/);assert.ok(!html.includes('歪麦'));assert.match(html,/满返 \/ 固定返/);
});

test('脱敏诊断允许保留名额统计与安全停止，不带店名/位置/原始活动',()=>{
 const d=diagnosticSummary({pagination:{full:{plannedPages:2,requests:1,stores:1,retainedSoldOut:3,retainedUnknownInventory:4,stopReason:'auth_required',shopName:'private',pages:[{retainedSoldOut:3,retainedUnknownInventory:4,secret:'private'}]}},errors:[{source:'full',code:'UPSTREAM_AUTH',message:'private'}]});
 assert.equal(d.pagination.full.retainedSoldOut,3);assert.equal(d.pagination.full.pages[0].retainedUnknownInventory,4);assert.equal(d.pagination.full.stopReason,'auth_required');assert.equal(d.errors[0].code,'UPSTREAM_AUTH');assert.ok(!JSON.stringify(d).includes('private'));
});

test('ID证据接受规范化字符串与安全整数，不接受布尔、对象、0或不安全数字',()=>{
 const row={source:'waimai',name:'同名合成店'};
 const r=compare([],[],{full:[{...row,waimaiStoreId:123}],ratio:[{...row,waimaiStoreId:' 123 '}]});assert.equal(r.counts.confirmed,1);
 for(const bad of [false,true,{},0,'0',' 0 ',Number.MAX_SAFE_INTEGER+1]){
  const report=compare([],[],{full:[{...row,waimaiStoreId:bad}],ratio:[{...row,waimaiStoreId:bad}]});assert.equal(report.counts.confirmed,0);
 }
});
