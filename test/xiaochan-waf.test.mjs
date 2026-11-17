import test from 'node:test';
import assert from 'node:assert/strict';
import {queryLive, buildReport, validateInput} from '../core.mjs';

const location={lat:30,lng:110,adcode:110101,label:'虚构回归点'};
const retiredReferer='https://servicewechat.com/wx52ae84595214/965/page-frame.html';
const fullItem={source:2,store_platform:1,store:{id:'xc-a',name:'合成满返店'},user_rebate:1000,left_number:0};
const ratioItem=key=>({name:'合成比例店'+key,wm_poi_id:'mt-'+key,plan_activity_info_list:[{ratio:1200,max_commission:800,inventory:null}]});

test('匿名查询更新Referer后取得满返及专用比例返分页，status-only feed不能冒充比例列表',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  requests.push(options);const body=JSON.parse(options.body);
  if(options.headers.Referer===retiredReferer)return new Response('腾讯云WAF',{status:403});
  if(options.headers.methodname==='FusionService.GetFeedPromotions') {
   return Response.json(body.rebate_type===1?{status:{code:0},feed_items:[fullItem]}:{status:{code:0}});
  }
  if(options.headers.methodname==='FusionService.GetMeiTuanPromotions') {
   return Response.json({status:{code:0},list:[ratioItem(body.pv_id?'b':'a')],pv_id:body.pv_id?null:'next'});
  }
  throw Error('unexpected request method');
 });
 const result=await queryLive(2,{location,log:()=>{},pause:async()=>{}});
 const report=buildReport(result);
 assert.deepEqual(result.errors,[]);
 assert.equal(report.counts.fullStores,1);
 assert.equal(report.counts.ratioStores,2);
 assert.equal(report.fullStores[0].activities[0].inventoryState,'sold_out');
 assert.equal(report.ratioStores[0].activities[0].inventoryState,'unknown');
 assert.deepEqual(requests.map(r=>r.headers.methodname),['FusionService.GetFeedPromotions','FusionService.GetMeiTuanPromotions','FusionService.GetMeiTuanPromotions']);
 assert.deepEqual(requests.slice(1).map(r=>JSON.parse(r.body).pv_id),[null,'next']);
 assert.equal(new Set(requests.map(r=>r.headers['X-Session-Id'])).size,1);
 assert.equal(new Set(requests.map(r=>r.headers.Referer)).size,3);
 for(const request of requests){
  assert.match(request.headers.Referer,/^https:\/\/servicewechat\.com\/wx52ae[0-9a-f]{8}\/965\/page-frame\.html$/);
  assert.equal(request.headers['x-Teemo'],'0');assert.equal(request.headers['x-Vayne'],'0');
  assert.equal(JSON.parse(request.body).silk_id,0);
 }
});

test('Referer适配不绕过WAF停止机制，首次拦截仍只请求一次',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('腾讯云WAF',{status:403});});
 const r=await queryLive(20,{location,log:()=>{},pause:async()=>{}});
 assert.equal(calls,1);assert.equal(r.errors[0].code,'UPSTREAM_WAF');assert.equal(r.pagination.ratio.requests,0);
});

test('旧比例返list与新版feed导入都保持兼容',()=>{
 const item=ratioItem('import');
 assert.equal(validateInput({full:{promotion_list:[]},ratio:{list:[item]}}).ratio.length,1);
 assert.equal(validateInput({full:{feed_items:[]},ratio:{feed_items:[{...item,source:5}]}}).ratio.length,1);
});
