import test from 'node:test';
import assert from 'node:assert/strict';
import {queryLive, buildReport, validateInput} from '../core.mjs';

const location = {lat:30, lng:110, adcode:110101, label:'虚构协议验证点'};
const ratioFeed = (key, cursor, inventory=0) => ({
  source:5, name:'合成比例店'+key, wm_poi_id:'mt-'+key, page_pv_id:cursor, mt_pv_id:'mt-page-'+key,
  plan_activity_info_list:[{ratio:1200, max_commission:800, inventory, plan_activity_type:1}],
});

test('统一feed协议：比例返按类别、平台和条目游标获取后续名单，保留零及未知库存', async t => {
  const requests=[];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body=JSON.parse(options.body);
    requests.push({url, headers:options.headers, body});
    if(options.headers.methodname!=='FusionService.GetFeedPromotions') {
      return Response.json({status:{code:404,msg:'method retired in fixture'}});
    }
    if(body.rebate_type===1) return Response.json({status:{code:0},feed_items:[]});
    if(body.offset===0) return Response.json({status:{code:0},feed_items:[
      ratioFeed('a','cursor-a'), ratioFeed('b','cursor-b',null),
      {source:99,page_pv_id:'wrong-source-cursor'},
    ],pv_id:'obsolete-top-level'});
    if(body.offset===20 && body.page_pv_id==='cursor-b') return Response.json({
      status:{code:0},feed_items:[ratioFeed('c','cursor-c')],has_more:false,
    });
    return Response.json({status:{code:0},feed_items:[]});
  });
  const result=await queryLive(3,{location,log:()=>{},pause:async()=>{}});
  const report=buildReport(result);
  assert.deepEqual(result.errors,[]);
  assert.equal(report.counts.ratioStores,3);
  assert.deepEqual(requests.map(r=>r.body.rebate_type),[1,2,2]);
  assert.deepEqual(requests.map(r=>r.body.page_pv_id),[null,null,'cursor-b']);
  assert.deepEqual(requests.map(r=>r.body.offset),[0,0,20]);
  assert.equal(new Set(requests.map(r=>r.headers['X-Session-Id'])).size,1);
  for(const {url,headers,body} of requests) {
    assert.equal(url,'https://gw.xiaocantech.com/rpc');
    assert.equal(headers.servername,'SilkwormFusion');
    assert.equal(headers['x-City'],'110101');
    assert.deepEqual(body.store_platforms,[1]);
    assert.equal(body.number,20);
    assert.ok(!Object.hasOwn(body,'pv_id'));
  }
  assert.equal(result.pagination.ratio.stopReason,'upstream_end');
  assert.equal(result.pagination.ratio.retainedSoldOut,2);
  assert.equal(result.pagination.ratio.retainedUnknownInventory,1);
  assert.equal(report.ratioStores[0].activities[0].ratioPercent,12);
});

test('比例返末尾无活动条目不能覆盖最后一条活动的分页游标', async t => {
  const seen=[];
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.rebate_type===1)return Response.json({feed_items:[]});
    seen.push(body.page_pv_id);
    return Response.json(body.offset===0?{feed_items:[ratioFeed('first','valid-next'),
      {...ratioFeed('empty','wrong-next'),plan_activity_info_list:[]},
    ]}:{feed_items:[ratioFeed('second',null)],has_more:false});
  });
  const result=await queryLive(2,{location,log:()=>{},pause:async()=>{}});
  assert.deepEqual(seen,[null,'valid-next']);
  assert.equal(buildReport(result).counts.ratioStores,2);
});

test('比例返翻页遭WAF保留首批活动且不重试，不把失败报告为空名单', async t => {
  let ratioRequests=0;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    if(JSON.parse(options.body).rebate_type===1)return Response.json({feed_items:[]});
    if(++ratioRequests===1)return Response.json({feed_items:[ratioFeed('saved','next')]});
    return new Response('腾讯云WAF',{status:403});
  });
  const result=await queryLive(20,{location,log:()=>{},pause:async()=>{}});
  assert.equal(ratioRequests,2);
  assert.equal(result.errors[0].code,'UPSTREAM_WAF');
  assert.equal(result.pagination.ratio.stopReason,'waf');
  assert.equal(buildReport(result).counts.ratioStores,1);
  assert.equal(buildReport(result).status,'partial');
});

test('比例返feed畸形不冒充空结果；旧导入格式与新feed导入继续兼容', async t => {
  t.mock.method(globalThis,'fetch',async (_url,options)=>Response.json({feed_items:
    JSON.parse(options.body).rebate_type===1?[]:[{source:5,name:'损坏活动',plan_activity_info_list:null}],
  }));
  const result=await queryLive(1,{location,log:()=>{},pause:async()=>{}});
  assert.equal(buildReport(result).status,'blocked');
  assert.match(result.errors[0].message,/plan_activity_info_list/);
  const item=ratioFeed('import',null);
  assert.equal(validateInput({full:{promotion_list:[]},ratio:{list:[item]}}).ratio.length,1);
  assert.equal(validateInput({full:{feed_items:[]},ratio:{feed_items:[item]}}).ratio.length,1);
});
