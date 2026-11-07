import {calculate,bestCombination} from '/calculator.mjs';
'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = v => Number.isFinite(v) ? Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '待核对';
const time = v => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' 北京时间' : '未知时间';
let state = null, demo = null, tab = 'overlap', polling = false, localError = '', connected = false;
let locationOperation = '', locationReadyAt = 0, locationCandidate = false;
let scopeNoticeKey, attemptNoticeKey;
async function api(route, value) {
  if (globalThis.mobileApp) return globalThis.mobileApp.request(route, value);
  const response = await fetch(route, value === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json', 'X-CSRF-Token':state?.csrfToken ?? ''}, body:JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后再试');
  return data;
}
function message(text, error = false) {
  $('message').hidden = !text; $('message').textContent = text; $('message').className = error ? 'error' : '';
}
const emptyIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="22" r="12"/><circle cx="29" cy="22" r="12"/><path d="M19 36v6m10-6v6"/></svg>';
const sourceName=a=>a.source==='waimai'?'歪麦（会员口径）':'小蚕';
const inventoryText=a=>a.inventory===0?'明确无名额（保留比对）':a.inventory==null || a.inventory<0?'名额未知':`接口余量 ${money(a.inventory)}（资格未核实）`;
const confirmedMatch=m=>m.confirmed===true || m.basis==='相同美团门店 ID';
const combinationText=m=>(m.combinations??[]).map(c=>c.split('×').map(v=>v==='waimai'?'歪麦':'小蚕').join('满返 × ')+'比例返').join('；');
function fullActivities(store) {
  return store.activities.map(a => `<li><strong>${sourceName(a)}</strong> · ${a.rebate == null ? '会员满返金额待填写' : a.rebateType === 'fixed' || a.minPay == null
    ? `固定返 <strong>¥${money(a.rebate)}</strong> · 实付门槛未明确`
    : `实付满 <strong>¥${money(a.minPay)}</strong> 返 <strong>¥${money(a.rebate)}</strong>`}${a.referenceGrade ? ` · 接口最大阶梯参考：满 ${esc(a.referenceGrade.fullMoney)} 返 ${esc(a.referenceGrade.rebateMoney)}（不是最低门槛，会员金额待填写）` : ''}${a.productName ? ` · 指定商品：${esc(a.productName)}` : ''} · ${esc(a.condition)} · <strong>${inventoryText(a)}</strong></li>`).join('');
}
function ratioActivities(store) {
  return store.activities.map(a => `<li><strong>${sourceName(a)}</strong> · 接口比例 <strong>${money(a.ratioPercent)}%</strong>${a.maxCashback == null ? '' : ` · 接口封顶 ¥${money(a.maxCashback)}`}${a.userRatioPercent == null ? '' : ` · 用户字段 ${money(a.userRatioPercent)}%`}${a.userMaxCashback == null ? '' : ` · 用户封顶 ¥${money(a.userMaxCashback)}`} · ${esc(a.condition)} · <strong>${inventoryText(a)}</strong></li>`).join('');
}
function row(store, kind, match, index) {
  return `<article class="store"><div>${match ? `<span class="badge ${confirmedMatch(match) ? '' : 'candidate'}">${confirmedMatch(match) ? '同 ID 重合' : '同名待确认'}</span>` : ''}<h3>${esc(store.name)}</h3>${match?.combinations?.length ? `<p class="form-help">${esc(combinationText(match))} · ${esc(match.basis)}</p>` : ''}<ul class="activities">${match ? fullActivities(match.full) + ratioActivities(match.ratio) : kind === 'full' ? fullActivities(store) : ratioActivities(store)}</ul>${match ? calculatorMarkup(match,index) : ''}</div><span class="store-kind">${match ? '两类名单交集' : kind === 'full' ? '实付满返' : '比例返'}</span></article>`;
}
function renderList() {
  const report = demo || state?.report;
  const search = $('search').value.trim().normalize('NFKC').toLowerCase();
  let rows = report ? tab === 'overlap' ? [...report.matches, ...report.candidates].map(m => ({ store:m.full, match:m })) : (tab === 'full' ? report.fullStores : report.ratioStores).map(store => ({ store })) : [];
  rows = rows.filter(({store}) => store.name.normalize('NFKC').toLowerCase().includes(search));
  if (rows.length) { $('result-list').innerHTML = rows.map(({store, match},index) => row(store, tab, match,index)).join(''); rows.forEach(({match},index)=>{if(match)bindCalculator(match,index);}); return; }
  let title = '从一个位置开始', detail = '设置位置后点击查询，或先查看演示。不会自动调用真实接口。';
  if (report) {
    if (search) { title = '没有找到这个名字'; detail = '试试更短的关键词，或切换到另一份名单。'; }
    else if (tab !== 'overlap') { title = '本次未取得有效名单'; detail = '请检查采集范围和错误信息；空名单不一定代表附近没有活动。'; }
    else if (report.status === 'partial' || report.status === 'blocked') { title = '采集不完整，暂不能判断重合'; detail = '仍可切换查看已取得的名单。上方提醒会说明未取得或未纳入的活动；无需因缺字段而反复查询。'; }
    else { title = '本次样本暂未发现重合'; detail = '不代表附近没有重合商家。可以查看两侧名单；分页覆盖和异名门店仍可能影响结果。'; }
  }
  $('result-list').innerHTML = `<div class="empty">${emptyIcon}<h3>${title}</h3><p>${detail}</p></div>`;
}
function renderQueryControls() {
  const location = state.location;
  const wait = Math.max(0, Math.ceil((state.nextAllowedAt - Date.now()) / 1000));
  $('query').disabled = state.busy || !!locationOperation || wait > 0 || !location;
  $('query').firstChild.textContent = state.busy ? '正在查询…' : wait ? `${wait} 秒后可查询` : '查询重合商家';
  $('query-hint').textContent = state.busy ? state.progress || '正在获取活动名单…' : wait ? '稍作等待，减少接口压力' : '手动查询 · 不会自动刷新接口';
}
function render() {
  if (!state) return;
  const report = demo || state.report;
  const location = state.location;
  $('location-name').textContent = location?.label || '尚未设置';
  $('location-detail').textContent = location ? `${location.lat}, ${location.lng} · ${location.adcode}` : globalThis.mobileApp ? '位置仅保存在这台手机' : '位置仅保存在这台电脑';
  $('edit-location').textContent = location ? '修改位置' : '设置位置';
  $('edit-location').disabled = state.busy;
  $('import-location').disabled = state.busy;
  renderLocationControls();
  $('pages').disabled = state.busy;
  renderQueryControls();
  $('result-meta').textContent = report ? `${report.source === 'demo' ? '虚构演示' : report.source === 'live' ? '真实接口数据' : '导入数据'} · ${time(report.generatedAt)}${report.context ? ' · ' + report.context.locationLabel : ''}` : '还没有查询结果';
  $('demo-banner').hidden = !demo;
  $('scope-note').hidden = !report || !!demo;
  if (report && !demo) {
    const limit = report.context?.pages ?? '未知';
    const fullRead = report.notes.find(n => n.startsWith('full：成功读取'))?.match(/成功读取 (\d+) 页/)?.[1];
    const ratioRead = report.notes.find(n => n.startsWith('ratio：成功读取'))?.match(/成功读取 (\d+) 页/)?.[1];
    const stopReason = kind => {
      const line = report.notes.find(n => n.startsWith(kind + '：') && !n.includes('成功读取'));
      if (!line) return '';
      if (line.includes('重复页面')) return '（重复页停止）';
      if (line.includes('内容重复')) return '（重复页已跳过）';
      if (line.includes('未提供下一页游标')) return '（接口无下一页游标）';
      if (line.includes('返回空页')) return '（接口返回空页）';
      if (line.includes('游标重复')) return '（分页游标重复）';
      if (line.includes('不足 20 条')) return '（响应不足一页，停止）';
      return '';
    };
    const legacyActual = fullRead != null && ratioRead != null ? '本次实际读取：满返 ' + fullRead + '/' + limit + ' 页' + stopReason('full') + '；比例返 ' + ratioRead + '/' + limit + ' 页' + stopReason('ratio') + '。' : '';
    const stops = { upstream_end: '上游明确无下一页', page_limit: '达到本次请求上限，非全部商家', empty_page: '返回空页', short_page: '响应不足一页', missing_cursor: '未提供下一页游标', no_progress: '连续两次无新增门店', waf: '上游拦截', auth_required:'要求登录或身份校验', not_requested:'尚未请求', error: '请求失败' };
    const actual = report.pagination ? ['full', 'ratio', 'waimai'].map(kind => {
      const stats = report.pagination[kind];
      if(kind==='waimai')return stats ? '歪麦混合类别（非每类两页）：计划最多 '+stats.plannedPages+' 页，实际请求 '+stats.requests+' 次，累计新增 '+stats.stores+' 家（满返 '+stats.fullStores+' / 比例返 '+stats.ratioStores+'）；保留无名额 '+(stats.retainedSoldOut??0)+' 条、名额未知 '+(stats.retainedUnknownInventory??0)+' 条（'+(stops[stats.stopReason] || stats.stopReason)+'）' : '歪麦未请求';
      return !stats ? `${kind === 'full' ? '满返' : '比例返'}未请求` : `${kind === 'full' ? '满返' : '比例返'}：计划最多 ${stats.plannedPages} 页，实际请求 ${stats.requests} 次，${stats.uniquePages} 个不同内容页，${stats.duplicatePages} 个重复响应，新增 ${stats.stores} 家；保留无名额 ${stats.retainedSoldOut??0} 条、名额未知 ${stats.retainedUnknownInventory??0} 条（${stops[stats.stopReason] || '停止原因未知'}）`;
    }).join('；') + '。' + (report.pagination.full?.excludedProductItems ? `另有 ${report.pagination.full.excludedProductItems} 条商品活动未提供实付门槛，未纳入满返比对。` : '') : legacyActual;
    const scopeKey = state.attempt?.context?.queryId ?? state.attempt?.generatedAt ?? report.context?.queryId ?? report.generatedAt;
    if (scopeNoticeKey !== scopeKey) { $('scope-note').open = false; scopeNoticeKey = scopeKey; }
    $('scope-summary').textContent = !state.resultMatchesLocation ? '历史结果，与当前位置不同 · 采集范围与统计' : '采集范围与统计 · 有限样本，非全量';
    $('scope-detail').textContent = [!state.resultMatchesLocation ? '以下为历史结果，不对应当前设置的位置。重新查询后才会更新。' : '', report.status === 'partial' ? '本次取得了部分名单，重合结论可能漏项。具体原因见上方提醒。' : '这是一次有限样本，不保证全量。增加页数不会扩大配送半径；重复内容不会增加商家数。接口比例未核对到账口径，不能据此保证实际返现。', actual, report.notes.find(n=>n.startsWith('小蚕上游距离排序')) || '', '歪麦上游按综合排序请求，未证实分类独立分页；只计划采集一次混合名单、最多两页。上游未返回的活动不能恢复。'].filter(Boolean).join(' ');
  }
  const attempt = state.attempt;
  const errors = !demo && attempt ? attempt.errors || [] : [];
  const partialAttempt = attempt?.status === 'partial' && !attempt?.persistenceError;
  $('attempt').className = partialAttempt ? 'notice warning' : 'notice error';
  $('attempt').setAttribute('role', partialAttempt ? 'status' : 'alert');
  $('attempt').hidden = !errors.length && !attempt?.persistenceError || !!demo;
  const attemptStats = attempt?.pagination ? Object.entries(attempt.pagination).map(([kind,s])=>`${({full:'小蚕满返',ratio:'小蚕比例返',waimai:'歪麦混合类别'})[kind] || kind}：计划最多 ${s.plannedPages} 页 / 实际请求 ${s.requests} 次 / 有效门店 ${s.stores} 家 / ${s.partial?'部分样本':'上游已结束'} / 停止：${({waf:'上游拦截',auth_required:'要求登录或身份校验',error:'请求失败',page_limit:'达到上限，非全量',empty_page:'空页',upstream_end:'上游明确结束',no_progress:'无新增',missing_cursor:'缺少游标',short_page:'不足一页'})[s.stopReason] || s.stopReason}`).join('；') : '';
  const attemptText = errors.map(e => `${({full:'小蚕实付满返', ratio:'小蚕比例返', waimai:'歪麦', query:'查询'})[e.source] || e.source}：${e.message}${e.upstreamCode ? `（上游业务码 ${esc(e.upstreamCode)}）` : ''}`).join('；') + (attempt?.persistenceError ? '；' + attempt.persistenceError : '') + (errors.length && state.report && attempt?.generatedAt !== state.report.generatedAt ? '。未覆盖上次结果，以下仍为历史名单。' : '');
  const attemptKey = attempt?.context?.queryId ?? attempt?.generatedAt;
  if (attemptNoticeKey !== attemptKey) { $('attempt-details').open = false; attemptNoticeKey = attemptKey; }
  $('attempt-summary').textContent = '部分渠道失败，名单可能不完整';
  $('attempt-details').hidden = !partialAttempt;
  $('attempt-detail').textContent = partialAttempt ? [attemptText,attemptStats].filter(Boolean).join(' ') : '';
  $('attempt-critical').hidden = !!partialAttempt;
  $('attempt-critical').textContent = partialAttempt ? '' : [attemptText,attemptStats].filter(Boolean).join(' ');
  $('query-id').textContent=state.attempt?.context?.queryId ? '查询编号 '+state.attempt.context.queryId+' · 代码版本 '+(state.codeVersion??'未知') : '代码版本 '+(state.codeVersion??'未知');
  const counts = report?.counts;
  $('count-overlap').textContent = counts ? `${counts.confirmed} 确认 / ${counts.candidatePairs} 待确认` : '0';
  $('count-full').textContent = counts?.fullStores ?? 0;
  $('count-ratio').textContent = counts?.ratioStores ?? 0;
  $('coverage').hidden = !report;
  $('notes').innerHTML = report ? report.notes.map(n => `<li>${esc(n)}</li>`).join('') : '';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  renderList();
}
async function refresh() {
  try { state = await api('/api/state'); $('retry-connect').hidden=true; if(!connected){message('');connected=true;} if (localError) { message(globalThis.mobileApp ? '手机本地数据已恢复' : '本地服务已恢复'); localError = ''; } render(); if (state.busy) poll(); }
  catch (e) { localError = e.message; $('retry-connect').hidden=false; message(globalThis.mobileApp ? '手机本地存储暂不可用，请稍后重试。' : '服务暂未连接，可能正在唤醒。请稍后点击重试；本地使用时请确认启动窗口仍在运行。', true); }
}
async function poll() {
  if (polling) return; polling = true;
  try {
    while (state?.busy) { await new Promise(r => setTimeout(r, 800)); state = await api('/api/state'); if (state.busy) renderQueryControls(); else render(); }
    // 具体原因已显示在结果提醒中，不再叠加第二条通用报错。
    message(state.attempt?.errors?.length || state.attempt?.persistenceError ? '' : '查询完成，结果已保存在本机。');
  } catch { message(globalThis.mobileApp ? '查询状态读取失败，请稍后刷新查看；请保持应用在前台。' : '服务连接中断；查询可能仍在运行。刷新页面可恢复查看。', true); }
  finally { polling = false; }
}
$('edit-location').addEventListener('click', () => {
  $('location-form').hidden = !$('location-form').hidden;
  if (!$('location-form').hidden) { for (const key of ['label','lat','lng','adcode','city']) $('location-form').elements[key].value = state?.location?.[key] ?? ''; locationCandidate = false; $('address-results').replaceChildren(); (globalThis.mobileApp ? $('address-keyword') : $('location-form').elements.label).focus(); renderLocationControls(); }
});
$('cancel-location').onclick = () => { $('location-form').hidden = true; $('edit-location').focus(); };
$('location-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy || locationOperation || (globalThis.mobileApp && !locationCandidate)) return; const form = event.currentTarget; const value = Object.fromEntries(new FormData(form));
  try { state = await api('/api/location', value); form.hidden = true; message('位置已保存，仅用于后续查询。'); render(); $('query').focus(); }
  catch(e) { message(e.message, true); }
});
$('import-location').onclick = async () => {
  try { state = await api('/api/import-location', {}); $('location-form').hidden = true; message('已导入旧 PoC 位置，旧配置未修改。'); render(); }
  catch(e) { message(e.message, true); }
};
$('query').onclick = async () => {
  $('query').disabled = true; demo = null; message('');
  try { state = await api('/api/query', { pages:Number($('pages').value), locationKey:state.locationKey }); render(); poll(); }
  catch(e) { message(e.message, true); await refresh(); }
};
$('demo').onclick = async () => { try { demo = await api('/api/demo'); $('search').value = ''; message(''); render(); } catch(e) { message(e.message, true); } };
$('leave-demo').onclick = () => { demo = null; $('search').value = ''; render(); };
$('search').addEventListener('input', renderList);
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { tab = button.dataset.tab; $('search').value = ''; render(); });
setInterval(() => { if (!state) return; renderLocationControls(); if (!state.busy && state.nextAllowedAt > Date.now() - 1500) renderQueryControls(); }, 250);
refresh();

function calculatorMarkup(match,index){
 const best=bestCombination(match.full.activities,match.ratio.activities);
 const options=(items,chosen,kind)=>items.map((a,i)=>`<option value="${i}"${i===chosen?' selected':''}>${i+1}. ${sourceName(a)} · ${kind==='ratio'?(a.ratioPercent==null?'会员比例待填写':money(a.ratioPercent)+'%')+' / 封顶¥'+money(a.maxCashback):'满¥'+money(a.minPay)+'返¥'+money(a.rebate)} · ${esc(a.condition??'条件未提供')} · ${inventoryText(a)}</option>`).join('');
 return `<section class="calculator" id="calc-${index}" aria-label="返后净支出计算器"><label>订单实付（元）<input data-field="pay" type="number" min="0" step="0.01" inputmode="decimal" placeholder="请输入实际支付金额"></label><output class="net" aria-live="polite"></output><details><summary>展开切换活动与来源 / 填写缺失值</summary><label>一份满返<select data-field="full">${options(match.full.activities,best?.fullIndex,'full')}</select></label><label>一份比例返<select data-field="ratio">${options(match.ratio.activities,best?.ratioIndex,'ratio')}</select></label><div class="manual-fields"><label>会员满返金额（元，缺失时填写）<input data-field="rebate" type="number" min="0" step="0.01" inputmode="decimal"></label><label>实付门槛（元，未知可留空）<input data-field="threshold" type="number" min="0" step="0.01" inputmode="decimal"></label><label>会员比例（%，缺失时填写）<input data-field="percent" type="number" min="0" step="0.01" inputmode="decimal"></label><label>封顶（元，缺失时填写）<input data-field="cap" type="number" min="0" step="0.01" inputmode="decimal"></label></div><button type="button" class="text-button" data-reset>恢复自动最优组合</button></details><p class="form-help">每次只算一份满返 + 一份比例返；无名额也参与金额试算，不代表可报名；不判断能否叠加，不保证到账。同名候选未确认是同一门店。</p></section>`;
}
function bindCalculator(match,index){
 const panel=$('calc-'+index),field=k=>panel.querySelector(`[data-field="${k}"]`);
 let automatic=true;const initial=bestCombination(match.full.activities,match.ratio.activities);
 const edits={full:new Map(),ratio:new Map()};
 const keys={full:{rebate:'rebate',threshold:'minPay'},ratio:{percent:'ratioPercent',cap:'maxCashback'}};
 const activity=(kind,i=Number(field(kind).value))=>({...match[kind].activities[i],...edits[kind].get(i)});
 if(initial?.pay!=null)field('pay').value=initial.pay;
 const value=k=>field(k).value.trim()===''?null:Number(field(k).value);
 const refill=(kind)=>{for(const side of kind?[kind]:['full','ratio']){const a=activity(side),raw=match[side].activities[Number(field(side).value)];for(const [k,property] of Object.entries(keys[side])){field(k).value=a[property]??'';field(k).disabled=raw[property]!=null;}}};
 function update(){
  const pay=value('pay');
  if(automatic){const full=match.full.activities.map((_,i)=>activity('full',i)),ratio=match.ratio.activities.map((_,i)=>activity('ratio',i));const best=bestCombination(full,ratio,pay??NaN);if(best){field('full').value=best.fullIndex;field('ratio').value=best.ratioIndex;}refill();}
  const result=calculate(activity('full'),activity('ratio'),pay??NaN);
  panel.querySelector('output').textContent=result.status==='ok'?`返后预计净支出 ¥${money(result.net)} = 实付 ¥${money(result.pay)} − 满返 ¥${money(result.fullRebate)} − 比例返 ¥${money(result.ratioRebate)}`:result.message;
 }
 field('pay').addEventListener('input',update);
 for(const kind of ['full','ratio'])field(kind).addEventListener('change',()=>{automatic=false;refill(kind);update();});
 for(const [kind,properties] of Object.entries(keys))for(const k of Object.keys(properties))field(k).addEventListener('input',()=>{automatic=false;edits[kind].set(Number(field(kind).value),Object.fromEntries(Object.entries(properties).map(([input,property])=>[property,value(input)])));update();});
 panel.querySelector('[data-reset]').onclick=()=>{automatic=true;update();};refill();update();
}

function renderLocationControls() {
 const wait = Math.max(0, Math.ceil((locationReadyAt - Date.now()) / 1000));
 const active = !!locationOperation, locked = !state || !!state.busy || active || wait > 0;
 $('search-address').disabled = locked;
 $('locate-once').disabled = locked;
 $('search-address').textContent = locationOperation === 'search' ? '正在搜索…' : '搜索选点';
 $('locate-once').textContent = locationOperation === 'locate' ? '正在定位…' : '获取当前位置（仅一次）';
 $('location-form').querySelector('button[type=submit]').disabled = !state || !!state.busy || active || (!!globalThis.mobileApp && !locationCandidate);
 $('address-results').children && Array.from($('address-results').children).forEach(button => { button.disabled = !!state?.busy || active; });
 $('edit-location').disabled = !!state?.busy || active;
 const hint = $('location-operation');
 hint.hidden = !active && !wait;
 hint.textContent = active ? (locationOperation === 'locate' ? '正在获取并保存当前位置，请等待完成后再搜索。' : '正在搜索地址，请等待完成后再定位。') : wait ? wait + ' 秒后可再次搜索或定位；请选择候选地址后保存。' : '';
}
function beginLocationOperation(kind) {
 if (!state || state.busy || locationOperation || Date.now() < locationReadyAt) return false;
 locationOperation = kind; renderLocationControls(); renderQueryControls(); return true;
}
function finishLocationOperation() {
 locationOperation = '';
 if (globalThis.mobileApp) locationReadyAt = Date.now() + 1500;
 renderLocationControls(); renderQueryControls();
}
function previewLocation(location){
 if (locationOperation || state?.busy) return;
 const form=$('location-form');form.hidden=false;
 for(const key of ['label','lat','lng','adcode','city'])form.elements[key].value=location[key]??'';
 locationCandidate = true; renderLocationControls();
 $('location-status').textContent='请核对地址：'+location.label+'。确认后保存，再手动点击查询。';
}
$('search-address').onclick=async()=>{
 if (!beginLocationOperation('search')) return;
 $('location-status').textContent='正在搜索地址…';
 try{const data=await api('/api/location-search',{keyword:$('address-keyword').value});
  $('address-results').replaceChildren(); locationCandidate = false;
  $('location-status').textContent=data.locations.length?'请选择下方候选地址，再点击保存；不会自动查询活动。':'没有找到地址，请补充城市或附近小区、道路后重新搜索。';
  for(const location of data.locations){const b=document.createElement('button');b.type='button';b.className='address-option';b.textContent=location.label+' · '+(location.address??'');b.onclick=()=>previewLocation(location);$('address-results').append(b);}
 }catch(e){$('location-status').textContent=e.message+'；请稍后重新搜索，或选择已有候选地址后保存。';}
 finally{finishLocationOperation();}
};
$('locate-once').onclick=()=>{
 if (!beginLocationOperation('locate')) return;
 const status=$('location-status'),expectedLocationKey=state?.locationKey??null;
 if(!globalThis.mobileApp && !navigator.geolocation){status.textContent='浏览器不支持定位，请搜索地址选点。';finishLocationOperation();return;}
 status.textContent=globalThis.mobileApp?'等待手机定位授权，仅获取一次；不会自动查询活动。':'等待浏览器定位授权，仅获取一次；不会自动查询活动。';
 const getPosition = globalThis.mobileApp
  ? (success, failure) => globalThis.mobileApp.locate().then(coords=>success({coords}),failure)
  : (success, failure, options) => navigator.geolocation.getCurrentPosition(success, failure, options);
 getPosition(async position=>{
  try{
   if(globalThis.mobileApp){
    const coords=position.coords;await api('/api/location-current',{lat:coords.lat,lng:coords.lng,address:coords.address,city:coords.city,expectedLocationKey});
    locationCandidate = false; $('address-results').replaceChildren();
    await refresh();$('location-form').hidden=true;message('已获取并保存当前位置。');
   }else{const result=await api('/api/location-reverse',{lat:position.coords.latitude,lng:position.coords.longitude});locationOperation='';previewLocation(result.location);}
  }catch(e){if(globalThis.mobileApp){const coords=position.coords;$('address-keyword').value=(coords.address||coords.city||'').slice(0,80);status.textContent=e.message+(e.message.includes('原位置未更改')?'':'；可搜索附近小区或道路，原位置未更改。');}else status.textContent=e.message+' 可搜索地址纠正。';}
  finally{finishLocationOperation();}
 },error=>{status.textContent=(globalThis.mobileApp&&error?.message?error.message:'定位失败或未授权，请搜索地址选点。')+' 原位置未更改。';finishLocationOperation();},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
};

$('retry-connect').onclick=()=>refresh();

$('export-diagnostic').addEventListener('click',async event=>{
 event.preventDefault();
 try{const data=await api('/api/diagnostics');if(globalThis.mobileApp){await globalThis.mobileApp.exportDiagnostic(data);message('诊断已保存到选择的位置。');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 catch(error){message(error.message,true);}
});
