// 只读采集与比对核心（兼容原 PoC CLI）: 小蚕美团比例返 × 小蚕美团实付满返。Node.js 20+，无依赖。
// 协议依据：lyrric/xiaochan main 的 XiaochanHttp.java（2026-11-04 核对）；不使用作者身份。
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '3.21.7.82';
const FEED_METHOD = 'FusionService.GetFeedPromotions';
const RATIO_METHOD = 'FusionService.GetMeiTuanPromotions';
const PAGE_SIZE = 20;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const md5 = value => crypto.createHash('md5').update(value).digest('hex');
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s·・、，,。._/\\|—-]+/g, '');
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const id = value => value == null || value === '' || value === 0 || value === '0' || (typeof value === 'number' && !Number.isSafeInteger(value)) ? null : String(value);
const available = value => number(value) !== 0; // 缺失或 -1 不自行解释为售罄。
const escape = value => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fullRows(items) {
  return items.filter(p => Number(p.meituan_status) === 1 && p.store?.name
    && number(p.meituan_order_money) > 0 && number(p.meituan_user_rebate) > 0
    && available(p.meituan_left_number)).map(p => ({
      name: p.store.name,
      xiaochanStoreId: id(p.store.store_id), // 不能和 wm_poi_id 跨命名空间比较。
      meituanPoiId: id(p.meituan_poi_id ?? p.store.meituan_poi_id ?? p.store.wm_poi_id),
      promotionId: id(p.promotion_id),
      minPay: Number(p.meituan_order_money) / 100,
      rebate: Number(p.meituan_user_rebate) / 100,
      inventory: number(p.meituan_left_number),
      condition: ({ 99: '无需评价', 2: '图文评价' })[p.rebate_condition] ?? `条件码 ${p.rebate_condition ?? '未知'}`,
    }));
}

function ratioRows(items) {
  return items.filter(p => p.name).flatMap(p => (p.plan_activity_info_list ?? [])
    .filter(a => number(a.ratio) > 0 && available(a.inventory))
    .map(a => ({
      name: p.name, meituanPoiId: id(p.wm_poi_id), eventId: id(a.poi_event_id),
      ratioRaw: Number(a.ratio),
      ratioPercent: Number(a.ratio) / 100, // 参考客户端：原值 600 -> 显示 6%，不是 600%。
      userRatioPercent: number(a.user_ratio) == null ? null : Number(a.user_ratio) / 100,
      userMaxCashback: number(a.user_max_commission) == null ? null : Number(a.user_max_commission) / 100,
      maxCashback: number(a.max_commission) == null ? null : Number(a.max_commission) / 100,
      inventory: number(a.inventory),
      condition: ({ 1: '无需评价', 2: '图文评价' })[a.plan_activity_type] ?? `条件码 ${a.plan_activity_type ?? '未知'}`,
    })));
}

function groupStores(rows) {
  const stores = new Map();
  for (const row of rows) {
    const key = row.meituanPoiId ? `mt:${row.meituanPoiId}`
      : row.xiaochanStoreId ? `xc:${row.xiaochanStoreId}` : `name:${normalize(row.name)}`;
    if (!stores.has(key)) stores.set(key, { name: row.name, meituanPoiId: row.meituanPoiId, activities: [] });
    const store = stores.get(key);
    if (!store.activities.some(a => JSON.stringify(a) === JSON.stringify(row))) store.activities.push(row);
  }
  return [...stores.values()];
}

export function compare(fullItems, ratioItems) {
  const fullStores = groupStores(fullRows(fullItems));
  const ratioStores = groupStores(ratioRows(ratioItems));
  const matches = [], candidates = [];
  for (const full of fullStores) {
    const exact = full.meituanPoiId && ratioStores.find(r => r.meituanPoiId === full.meituanPoiId);
    if (exact) { matches.push({ basis: '相同美团门店 ID', full, ratio: exact }); continue; }
    const sameName = ratioStores.filter(r => normalize(r.name) === normalize(full.name)
      && !(full.meituanPoiId && r.meituanPoiId && full.meituanPoiId !== r.meituanPoiId));
    for (const ratio of sameName) candidates.push({ basis: '完整店名相同，待核对门店', full, ratio });
  }
  return {
    counts: { fullStores: fullStores.length, ratioStores: ratioStores.length, confirmed: matches.length, candidatePairs: candidates.length },
    matches, candidates, fullStores, ratioStores,
  };
}

function identity() {
  const silk = process.env.XC_SILK_ID ?? '0';
  const user = process.env.XC_USER_ID ?? '0';
  for (const [name, value] of [['XC_SILK_ID', silk], ['XC_USER_ID', user]]) {
    if (!/^(0|[1-9][0-9]{0,11})$/.test(value)) throw new Error(`${name} 必须是最多 12 位的本人数字 ID，不能是 token`);
  }
  if ((silk === '0') !== (user === '0')) throw new Error('新版身份字段须同时提供本人的 XC_SILK_ID 与 XC_USER_ID；单个编号不代表完整登录态');
  return { silk, user, mode: silk === '0' ? 'anonymous' : 'own-identifiers-unverified' };
}

function headers(service, method, city, auth, sessionId) {
  const ts = String(Date.now());
  const random = crypto.randomUUID().replaceAll('-', '');
  // 跟随上游：前4位 + 本人 silk ID + 随机片段，总长16；身份为0即匿名。
  const nonce = random.slice(0, 4) + auth.silk + random.slice(4, 16 - auth.silk.length);
  return {
    'x-City': String(city ?? 0), 'X-Garen': ts, 'X-Nami': nonce,
    'X-Ashe': md5(md5(`${service}.${method}`.toLowerCase()) + ts + nonce),
    'X-Platform': 'mini', version: VERSION, 'X-Version': VERSION, 'X-App-Sr': '20',
    'x-Teemo': auth.silk, 'x-Vayne': auth.user, 'X-Session-Id': sessionId,
    'X-Model': 'microsoft microsoft', 'x-Annie': 'XC',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf254173b) XWEB/19027',
    servername: service, methodname: method,
    Referer: 'https://servicewechat.com/wx52ae84595214/965/page-frame.html', 'Content-Type': 'application/json',
  };
}

// 满返 feed 的 source=1/2 均有确定金额活动；仍须 store_platform=1，未知来源不猜测。
function feedItems(items, kind, { onInvalid, onExcludedProduct } = {}) {
  if (items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('feed_items 含非对象项，需核对响应结构');
  if (kind === 'ratio') {
    const rows = items.filter(p => Number(p.source) === 5);
    if (rows.some(p => !p.name || !Array.isArray(p.plan_activity_info_list))) throw new Error('比例返 feed 缺少 name 或 plan_activity_info_list，不能当成空名单');
    return rows;
  }
  const selected = items.filter(p => [1, 2].includes(Number(p.source)) && Number(p.store_platform) === 1);
  // 混合 feed 也包含有商品详情却无满返门槛的记录；商品价不能代替实付门槛。
  const productItems = selected.filter(p => {
    const product = p.store_product;
    const productId = product?.detail?.jump_product_id;
    const hasProductId = typeof productId === 'string' ? /^[1-9][0-9]*$/.test(productId)
      : typeof productId === 'number' && Number.isSafeInteger(productId) && productId > 0;
    return p.order_money == null && p.store?.name && number(p.user_rebate) != null
      && Number(product?.product_type) === 1 && typeof product.name === 'string' && product.name.trim()
      && hasProductId && number(product.detail?.sku_price) > 0;
  });
  if (productItems.length) onExcludedProduct?.(productItems.length);
  const products = new Set(productItems);
  const rows = selected.filter(p => !products.has(p));
  const invalid = rows.filter(p => !p.store?.name || number(p.order_money) == null || number(p.user_rebate) == null);
  if (invalid.length) {
    if (!onInvalid) throw new Error('满返 feed 缺少门店或金额字段，不能当成空名单');
    onInvalid(invalid.length, invalid.map(p => ({
      storeName: typeof p.store?.name === 'string' && p.store.name ? p.store.name.slice(0, 160) : '门店名称未返回',
      missingFields: [!p.store?.name ? '门店名称' : null, number(p.order_money) == null ? '实付满返门槛' : null,
        number(p.user_rebate) == null ? '返现金额' : null].filter(Boolean),
      rebate: number(p.user_rebate) == null ? null : Number(p.user_rebate) / 100,
    })));
  }
  return rows.map(p => ({
    ...p, store: { ...p.store, store_id: p.store?.id }, meituan_status: 1,
    meituan_order_money: p.order_money, meituan_user_rebate: p.user_rebate, meituan_left_number: p.left_number,
  }));
}

async function call(service, method, body, city, auth, listKey = 'feed_items', sessionId) {
  const response = await fetch('https://gw.xiaocantech.com/rpc', {
    method: 'POST', headers: headers(service, method, city, auth, sessionId), body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    const wafBlocked = response.status === 403 && /WAF|腾讯云WAF/.test(text);
    const error = new Error(`HTTP ${response.status}${wafBlocked ? '：被上游 WAF 拦截；未获取到活动数据，已停止本轮网关请求' : '：上游请求失败'}`);
    error.code = wafBlocked ? 'UPSTREAM_WAF' : 'UPSTREAM_HTTP';
    error.httpStatus = response.status;
    throw error;
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('上游未返回 JSON；未获取到活动数据'); }
  if (json.status?.code != null && Number(json.status.code) !== 0) throw new Error(`上游业务错误 ${json.status.code}：${String(json.status.msg ?? '').slice(0, 160)}`);
  if (!Array.isArray(json[listKey])) throw new Error(`上游缺少 ${listKey} 数组，响应结构需要重新核对`);
  return json;
}

export async function queryLive(pages, { location, log = console.log } = {}) {
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw new Error('页数必须为 1 到 10 的整数');
  let addr = location;
  if (!addr) {
    const config = JSON.parse(await fs.readFile(path.resolve(root, process.env.XC_CONFIG ?? '../waimai-helper/config.json'), 'utf8'));
    addr = config.addresses?.find(a => a.id === config.activeId);
  }
  if (!addr || !Number.isFinite(Number(addr.lat)) || !Number.isFinite(Number(addr.lng)) || !Number.isFinite(Number(addr.adcode))) throw new Error('旧项目没有有效的已选地址；请先在旧项目选地址，或通过 XC_CONFIG 指定相同格式配置');
  const auth = identity();
  // 满返分页依赖会话上下文；逐请求更换会话会重新返回首批门店。
  const sessionId = crypto.randomUUID();
  log(auth.mode === 'anonymous' ? '新版协议（满返 feed + 比例返专用接口）；匿名验证（不代表已登录），本轮最多各查询 '+pages+' 页。' : '新版协议；仅使用本地提供的本人标识，完整登录态仍未验证。');
  const full = [], ratio = [], errors = [], coverage = [];
  const pagination = {};
  let gatewayBlocked = false;
  for (const kind of ['full', 'ratio']) {
    let pagePvId = null, stopped = false, noProgressPages = 0;
    const seenPages = new Set();
    const output = kind === 'full' ? full : ratio;
    const stats = pagination[kind] = { plannedPages: pages, requests: 0, uniquePages: 0, duplicatePages: 0,
      rawItems: 0, classifiedItems: 0, eligibleActivities: 0, filteredActivities: 0, schemaRejectedItems: 0, excludedProductItems: 0, stores: 0, pages: [], stopReason: 'page_limit' };
    for (let page = 0; page < pages; page++) {
      try {
        log(`${kind === 'full' ? '美团实付满返' : '美团比例返'}：查询第 ${page + 1} 页…`);
        const listKey = kind === 'full' ? 'feed_items' : 'list';
        const method = kind === 'full' ? FEED_METHOD : RATIO_METHOD;
        const body = kind === 'full' ? {
          lat: Number(addr.lat), lon: Number(addr.lng), number: PAGE_SIZE, silk_id: Number(auth.silk),
          sort: 1, offset: page * PAGE_SIZE, app_id: '20', scene: 1, is_show_mt: true,
          page_pv_id: pagePvId, rebate_type: 1,
        } : {
          lat: Number(addr.lat), lon: Number(addr.lng), silk_id: Number(auth.silk),
          pv_id: pagePvId, scene: 1, app_id: 20,
        };
        stats.requests++;
        const json = await call('SilkwormFusion', method, body, kind === 'full' ? Number(addr.adcode) : null, auth, listKey, sessionId);
        const items = json[listKey];
        const pageKey = JSON.stringify(items);
        const duplicateContent = seenPages.has(pageKey);
        let schemaRejectedItems = 0, excludedProductItems = 0;
        const converted = kind === 'full' ? feedItems(items, kind, { onInvalid: (count, items) => {
          schemaRejectedItems = count;
          const detail = items.map(item => `${item.storeName}：缺少${item.missingFields.join('、')}${item.rebate == null ? '' : `（已知返现 ¥${item.rebate}）`}`).join('；');
          errors.push({ source: kind, code: 'INVALID_FEED_ITEMS', items,
            message: `第 ${page + 1} 次响应有 ${count} 条活动信息不全，未纳入比对。${detail}。其余名单仍可查看，重合结论可能漏项。` });
        }, onExcludedProduct: count => { excludedProductItems = count; } }) : items;
        if (kind === 'ratio' && converted.some(p => !p || !p.name || !Array.isArray(p.plan_activity_info_list))) throw new Error('比例返列表缺少 name 或 plan_activity_info_list，不能当成空名单');
        const rows = kind === 'full' ? fullRows(converted) : ratioRows(converted);
        const activityCount = kind === 'full' ? converted.length : converted.reduce((sum, p) => sum + p.plan_activity_info_list.length, 0);
        const previousStores = stats.stores;
        if (duplicateContent) stats.duplicatePages++;
        else {
          seenPages.add(pageKey);
          stats.uniquePages++;
          output.push(...converted);
        }
        stats.stores = groupStores(kind === 'full' ? fullRows(output) : ratioRows(output)).length;
        const next = id(kind === 'full' ? json.page_pv_id : json.pv_id);
        const pageStats = { request: page + 1, rawItems: items.length, classifiedItems: converted.length,
          eligibleActivities: rows.length, filteredActivities: activityCount - rows.length, schemaRejectedItems, excludedProductItems,
          newStores: stats.stores - previousStores, totalStores: stats.stores, duplicateContent,
          cursorPresent: next !== null, cursorChanged: next !== null && next !== pagePvId };
        stats.pages.push(pageStats);
        for (const key of ['rawItems', 'classifiedItems', 'eligibleActivities', 'filteredActivities', 'schemaRejectedItems', 'excludedProductItems']) stats[key] += pageStats[key];
        coverage.push(`${kind} 第${page + 1}次：原始 ${items.length} 条，识别 ${converted.length} 条本类记录，有效活动 ${rows.length} 条，过滤 ${pageStats.filteredActivities} 条；新增 ${pageStats.newStores} 家，累计 ${stats.stores} 家${excludedProductItems ? `；另有 ${excludedProductItems} 条商品活动未提供实付门槛，未纳入满返比对` : ''}${duplicateContent ? '；内容重复，已去重' : ''}`);
        // 内容去重与翻页状态独立；相同列表也可能携带有效的新游标。
        pagePvId = next;
        if (!items.length) {
          stats.stopReason = 'empty_page';
          coverage.push(`${kind}：接口返回空页，停止翻页；不保证全量`); stopped = true; break;
        }
        if (kind === 'full' && items.length < PAGE_SIZE) {
          stats.stopReason = 'short_page';
          coverage.push('full：本页不足 20 条，停止翻页；不保证全量'); stopped = true; break;
        }
        if (kind === 'ratio' && !next) {
          stats.stopReason = 'missing_cursor';
          coverage.push('ratio：接口未提供下一页游标，停止翻页'); stopped = true; break;
        }
        noProgressPages = pageStats.newStores === 0 && !pageStats.cursorChanged ? noProgressPages + 1 : 0;
        if (noProgressPages >= 2) {
          stats.stopReason = 'no_progress';
          coverage.push(`${kind}：连续两次无新增门店且游标未推进，停止本轮；不代表已全量`); stopped = true; break;
        }
      } catch (e) {
        errors.push({ source: kind, message: e.message, ...(e.code ? { code: e.code } : {}), ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}) });
        stats.stopReason = e.code === 'UPSTREAM_WAF' ? 'waf' : 'error';
        gatewayBlocked = e.code === 'UPSTREAM_WAF';
        stopped = true;
        break;
      }
      if (page < pages - 1) await sleep(800);
    }
    coverage.push(`${kind}：计划最多 ${pages} 页，实际请求 ${stats.requests} 次，取得 ${stats.uniquePages} 个不同内容页，${stats.duplicatePages} 个重复响应，累计新增 ${stats.stores} 家${stopped ? '' : '，达到本次页数上限'}；不保证全量`);
    if (gatewayBlocked) {
      if (kind === 'full') {
        errors.push({ source: 'ratio', code: 'SKIPPED_UPSTREAM_WAF', message: '未请求：共享网关已明确返回 WAF 拦截，本轮停止，不代表比例返名单为空' });
        coverage.push('ratio：未请求，因共享网关 WAF 拦截而跳过；重合结论未验证');
      }
      break;
    }
    if (kind === 'full') await sleep(800);
  }
  return { source: 'live', full, ratio, errors, coverage, pagination, protocol: { fullMethod: FEED_METHOD, ratioMethod: RATIO_METHOD, version: VERSION, identityMode: auth.mode } };
}

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('输入必须是包含 full 与 ratio 的对象');
  const get = (kind, legacyKey) => {
    const response = input[kind];
    if (response?.status?.code != null && Number(response.status.code) !== 0) throw new Error(`${kind} 输入是业务失败响应，不能进行有效比对`);
    if (Array.isArray(response?.feed_items)) return feedItems(response.feed_items, kind);
    if (Array.isArray(response?.[legacyKey])) return response[legacyKey];
    throw new Error(`输入 ${kind} 必须有新版 feed_items 或旧版 ${legacyKey} 数组，不能把错误响应当成空名单`);
  };
  return { full: get('full', 'promotion_list'), ratio: get('ratio', 'list') };
}

export function htmlReport(report) {
  const displayTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(new Date(report.generatedAt)) + '（北京时间）';
  const ratioText = a => `接口比例 ${escape(a.ratioPercent)}% / 封顶 ${escape(a.maxCashback)} 元（${escape(a.condition)}）${a.userRatioPercent == null ? '' : '<br>用户比例字段 '+escape(a.userRatioPercent)+'% / 用户封顶字段 '+escape(a.userMaxCashback)+' 元'}`;
  const listTable = (stores, kind) => `<details><summary>查看本次${kind === 'full' ? '满返' : '比例返'}名单（${stores.length} 家）</summary><table border="1" cellpadding="8"><thead><tr><th>完整店名</th><th>美团门店 ID</th><th>活动</th></tr></thead><tbody>${stores.map(s => '<tr><td>'+escape(s.name)+'</td><td>'+escape(s.meituanPoiId)+'</td><td>'+s.activities.map(a => kind === 'full' ? '满 '+escape(a.minPay)+' 返 '+escape(a.rebate)+' 元（'+escape(a.condition)+'）' : ratioText(a)).join('<br>')+'</td></tr>').join('') || '<tr><td colspan="3">本次无可展示数据，请先检查采集状态。</td></tr>'}</tbody></table></details>`;
  const pairRows = rows => rows.map(({ basis, full, ratio }) => `<tr><td>${escape(full.name)}</td><td>${full.activities.map(a => `满 ${escape(a.minPay)} 返 ${escape(a.rebate)} 元（${escape(a.condition)}）`).join('<br>')}</td><td>${escape(ratio.name)}<br>门店 ID：${escape(ratio.meituanPoiId)}</td><td>${ratio.activities.map(ratioText).join('<br>')}</td><td>${escape(basis)}</td></tr>`).join('');
  const table = rows => `<table border="1" cellpadding="8"><thead><tr><th>满返店名</th><th>实付满返</th><th>比例返店名</th><th>比例返活动</th><th>匹配依据</th></tr></thead><tbody>${pairRows(rows) || '<tr><td colspan="5">本次没有结果；请结合采集状态判断，不代表附近没有重合商家。</td></tr>'}</tbody></table>`;
  const state = ({ blocked: '采集失败，真实重合结论未验证', partial: '采集不完整，只能查看部分样本', sample_overlap: '本次样本存在同 ID 重合', candidates_only: '只有同名候选，尚无同 ID 证明', no_overlap_in_sample: '本次样本未发现重合', demo: '演示数据：仅验证脚本逻辑，不是真实店铺' })[report.status];
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小蚕重合验证 PoC</title><body><h1>小蚕比例返 × 美团实付满返</h1><p><strong>${escape(state)}</strong></p><p>来源：${escape(report.source)}；生成时间：${escape(displayTime)}</p><p>满返 ${report.counts.fullStores} 家；比例返 ${report.counts.ratioStores} 家；同 ID 重合 ${report.counts.confirmed} 家；同名候选 ${report.counts.candidatePairs} 对。</p>${report.errors.map(e => `<p><strong>${escape(e.source)}：${escape(e.message)}</strong></p>`).join('')}<h2>同一美团门店 ID</h2>${table(report.matches)}<h2>仅店名相同，需要人工核对</h2>${table(report.candidates)}<h2>本次采集名单</h2>${listTable(report.fullStores, 'full')}${listTable(report.ratioStores, 'ratio')}<h2>验证边界</h2><ul>${report.notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul><p>详细两侧名单及活动字段见同目录 JSON。此 PoC 不下单、不报名、不证明返现可叠加。</p></body></html>`;
}

export function buildReport(data) {
  const result = compare(data.full, data.ratio);
  const status = data.source === 'demo' ? 'demo' : data.errors.length ? (result.counts.fullStores || result.counts.ratioStores ? 'partial' : 'blocked')
    : result.matches.length ? 'sample_overlap' : result.candidates.length ? 'candidates_only' : 'no_overlap_in_sample';
  const report = {
    source: data.source, status, generatedAt: new Date().toISOString(), ...(data.pagination ? { pagination: data.pagination } : {}), ...(data.protocol ? { protocol: data.protocol } : {}), ...result, errors: data.errors,
    notes: [
      '同 ID 重合只证明两类名单存在同一门店，不代表可同时报名、叠加到账或当前时段可用。',
      '同名候选保留完整分店名称，只统一空白、标点及全半角；不做品牌模糊匹配。已知美团 ID 不同不匹配。',
      '小蚕 store_id 与美团 wm_poi_id 是不同命名空间，不能比较数值是否相等。超出安全整数范围的数字 ID 不作为证据，导入时应使用字符串。',
      '接口比例单位沿用参考客户端：ratio / 100 为百分数，金额 / 100 为元；另保留 user_ratio 与 user_max_commission（若返回）。接口比例不等于已核实的本人到账比例，尚需与小程序页面核对。',
      '仅排除明确余量为 0 的活动，保留未知余量；活动时段和叠加规则未验证。', ...(data.protocol ? ['满返方法：'+data.protocol.fullMethod+'；比例返方法：'+data.protocol.ratioMethod+'；版本：'+data.protocol.version+'；身份模式：'+data.protocol.identityMode+'，标识不代表完整登录态。'] : []), ...data.coverage,
    ],
  };
  return report;
}

export async function demoReport() {
  const input = JSON.parse(await fs.readFile(path.join(root, 'demo-input.json'), 'utf8'));
  return buildReport({ ...validateInput(input), source: 'demo', errors: [], coverage: ['演示数据完全虚构，不请求真实接口，也不替换真实查询缓存。'] });
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => { const i = args.indexOf(flag); if (i === -1) return null; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${flag} 缺少参数`); return args[i + 1]; };
  if (args.includes('--help')) { console.log('node poc.mjs [--pages 1..10] [--demo | --input combined.json] [--out directory]'); return; }
  for (let i = 0; i < args.length; i++) {
    if (['--pages', '--input', '--out'].includes(args[i])) { value(args[i]); i++; }
    else if (!['--demo', '--live'].includes(args[i])) throw new Error(`未知参数：${args[i]}`);
  }
  if ([args.includes('--demo'), args.includes('--live'), args.includes('--input')].filter(Boolean).length > 1) throw new Error('--demo、--live、--input 只能选择一种');
  const pages = Number(value('--pages') ?? 5);
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw new Error('--pages 必须为 1 到 10 的整数');
  let demo = args.includes('--demo');
  const inputFile = value('--input');
  let data;
  if (demo || inputFile) {
    const json = JSON.parse(await fs.readFile(demo ? path.join(root, 'demo-input.json') : path.resolve(inputFile), 'utf8'));
    demo = demo || json._demo === true;
    data = { ...validateInput(json), source: demo ? 'demo' : 'imported-unverified', errors: [], coverage: ['导入内容的完整性、位置、时间及真实性需要自行确认'] };
  } else data = await queryLive(pages);
  const report = buildReport(data);
  const output = value('--out') ? path.resolve(value('--out')) : path.join(root, 'output', demo ? 'demo' : inputFile ? 'imported' : 'live');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'result.html'), htmlReport(report));
  console.log(JSON.stringify({ source: report.source, status: report.status, ...report.counts, errors: data.errors }, null, 2));
  console.log(`结果页面：${path.join(output, 'result.html')}`);
  if (data.errors.length) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`PoC 失败：${error.message}`); process.exitCode = 1; });
