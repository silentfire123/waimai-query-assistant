import test from 'node:test';
import assert from 'node:assert/strict';
import {compare,buildReport,projectXiaochanReport} from '../core.mjs';
import {collectAll} from '../collector.mjs';
import {createMobileApp} from '../android/mobile/api-engine.mjs';

const full=(time={})=>({meituan_status:1,store:{name:'合成时段店',store_id:'x1',opening_hours:'00:00-23:59'},meituan_poi_id:'mt1',meituan_user_rebate:1000,meituan_order_money:2000,...time});
const ratio=(time={})=>({name:'合成时段店',wm_poi_id:'mt1',plan_activity_info_list:[{ratio:1200,max_commission:800,...time}]});
const location={label:'合成测试点',lat:30,lng:110,adcode:110101};

test('活动时段来自活动字段，规范化时刻并保留跨午夜和24:00',()=>{
  for(const [start,end,overnight] of [['9:00','22:30',false],['22:00','02:00',true],['00:00','24:00',false]]){
    const r=compare([full({start_time_hour:start,end_time_hour:end})],[ratio({start_time_hour:start,end_time_hour:end})]);
    for(const side of ['fullStores','ratioStores'])assert.deepEqual(r[side][0].activities[0].activityTime,{start:start.padStart(5,'0'),end,overnight,timeZone:'Asia/Shanghai'});
  }
});

test('营业时间不冒充活动时间，缺失、非法和歧义时段保持未知',()=>{
  for(const time of [{},{start_time_hour:'10:00'},{start_time_hour:'24:00',end_time_hour:'25:00'},{start_time_hour:'10:60',end_time_hour:'12:00'},{start_time_hour:'00:00',end_time_hour:'00:00'},{start_time_hour:true,end_time_hour:'12:00'},{start_time_hour:'<script>',end_time_hour:'12:00'}]){
    assert.equal(compare([full(time)],[]).fullStores[0].activities[0].activityTime,null);
  }
  assert.equal(compare([], [{...ratio(),start_time_hour:'00:00',end_time_hour:'24:00'}]).ratioStores[0].activities[0].activityTime,null,'比例返不继承门店层时段');
});

test('采集仅请求小蚕两种RPC；传入的旧渠道回调不可触发',async t=>{
  const seen=[];let retiredCalls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,'https://gw.xiaocantech.com/rpc');seen.push(options.headers.methodname);
    return Response.json(options.headers.methodname==='FusionService.GetFeedPromotions'?{feed_items:[]}:{list:[]});
  });
  const r=await collectAll(10,{location,log:()=>{},pause:async()=>{},requestPage:()=>{retiredCalls++;throw Error('retired');}});
  assert.deepEqual(seen,['FusionService.GetFeedPromotions','FusionService.GetMeiTuanPromotions']);
  assert.equal(retiredCalls,0);assert.deepEqual(Object.keys(r.pagination),['full','ratio']);
  assert.equal(r.channelActivities,undefined);assert.equal(r.timings.waimaiMs,undefined);
});

function mixedReport(){
  const x={source:'xiaochan',name:'合成同名店',xiaochanStoreId:'x1',rebate:10,minPay:20};
  const w={source:'waimai',name:'合成同名店',meituanPoiId:'mt1',rebate:30,minPay:40};
  return {source:'live',status:'partial',generatedAt:'2026-11-01T00:00:00Z',context:{locationKey:'old'},errors:[{source:'waimai',message:'retired error'}],pagination:{waimai:{stores:4},full:{stores:1}},...compare([],[],{full:[x,w],ratio:[{...w,ratioPercent:20,maxCashback:20}]})};
}

test('旧混合缓存只投影小蚕并重新匹配，保留原时间和不完整状态且不改源对象',()=>{
  const old=mixedReport(),copy=structuredClone(old),r=projectXiaochanReport(old);
  assert.deepEqual(old,copy);assert.deepEqual(r.counts,{fullStores:1,ratioStores:0,confirmed:0,candidatePairs:0});
  assert.equal(r.status,'partial');assert.equal(r.generatedAt,old.generatedAt);assert.equal(r.context.locationKey,'old');
  assert.equal(r.fullStores[0].activities[0].rebate,10);assert.equal(r.pagination.waimai,undefined);assert.deepEqual(r.errors,[]);
  assert.equal(r.legacyProjection,true);assert.equal(projectXiaochanReport(r),r);
});

test('手机升级读取、失败和重启均仅显示小蚕，失败不丢失原缓存',async()=>{
  let saved={version:1,location,snapshot:{report:mixedReport(),attempt:null}},writes=0;
  const deps={storage:{read:()=>structuredClone(saved),write:v=>{writes++;saved=structuredClone(v);}},uuid:()=> 'test-only',codeVersion:'test',cooldownMs:0,collect:async()=>{throw Error('synthetic failure');}};
  const app=createMobileApp(deps),initial=await app.request('/api/state');assert.equal(writes,0);assert.equal(initial.report.counts.ratioStores,0);
  await app.request('/api/query',{pages:10,locationKey:initial.locationKey});
  for(let i=0;i<30&&(await app.request('/api/state')).busy;i++)await new Promise(r=>setImmediate(r));
  const next=await app.request('/api/state');assert.equal(next.attempt.status,'blocked');assert.deepEqual(next.report,initial.report);
  assert.equal(saved.snapshot.report.fullStores.some(s=>s.activities.some(a=>a.source==='waimai')),true,'原缓存仍在应用私有存储');
  assert.deepEqual((await createMobileApp(deps).request('/api/state')).report,next.report);
});

test('新报告不会因旧渠道错误成为部分失败，也不接纳旧渠道活动或分页',()=>{
  const r=buildReport({source:'live',full:[full()],ratio:[ratio()],errors:[{source:'waimai',message:'retired'}],coverage:['歪麦旧说明'],pagination:{waimai:{stores:2}},channelActivities:{full:[{source:'waimai',name:'旧渠道独占店'}]}});
  assert.equal(r.channel,'xiaochan');assert.equal(r.status,'sample_overlap');assert.equal(r.counts.fullStores,1);assert.deepEqual(r.errors,[]);assert.deepEqual(r.pagination,{});assert.ok(!r.notes.some(n=>n.includes('歪麦')));
});
