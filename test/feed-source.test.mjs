import test from 'node:test';
import assert from 'node:assert/strict';
import { queryLive, buildReport } from '../poc.mjs';

const location = { label:'测试位置（虚构）', lat:30, lng:110, adcode:110101 };
const feed = (key, overrides = {}) => ({ source:1, store_platform:1,
  store:{ id:key, name:`测试饭店（${key}店）` }, promotion_id:key,
  order_money:3000, user_rebate:1300, left_number:5, ...overrides });

test('满返来源：source=2 的美团有效活动进入名单及同名候选，仍排除其他平台、未知来源和售罄', async t => {
  const regular = feed('甲');
  const target = feed('乙', { source:2, status:2, platform_promotion_status:1 });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.headers.methodname === 'FusionService.GetFeedPromotions') return Response.json({ status:{code:0}, feed_items:[
      regular, target,
      feed('其他平台', { source:2, store_platform:2 }),
      feed('其他平台三', { source:2, store_platform:3 }),
      feed('未知来源', { source:99 }),
      feed('比例来源', { source:5 }),
      feed('售罄', { source:2, left_number:0 }),
      feed('无返现', { source:2, user_rebate:0 }),
    ] });
    return Response.json({ status:{code:0}, list:[{ name:target.store.name, wm_poi_id:'mt-乙',
      plan_activity_info_list:[{ ratio:3500, max_commission:1400, inventory:2, plan_activity_type:2 }] }] });
  });
  const data = await queryLive(1, { location, log:()=>{} });
  const report = buildReport(data);
  assert.deepEqual(report.fullStores.map(s=>s.name), [regular.store.name, target.store.name]);
  assert.deepEqual(report.counts, { fullStores:2, ratioStores:1, confirmed:0, candidatePairs:1 });
  const candidate = report.candidates[0];
  assert.equal(candidate.full.name, target.store.name);
  assert.equal(candidate.full.activities[0].minPay, 30);
  assert.equal(candidate.full.activities[0].rebate, 13);
  assert.equal(candidate.full.activities[0].inventory, 5);
  assert.equal(candidate.ratio.activities[0].ratioPercent, 35);
  assert.deepEqual(report.errors, []);
});
