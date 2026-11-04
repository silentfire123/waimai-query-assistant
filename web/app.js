'use strict';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = v => Number.isFinite(v) ? Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '待核对';
const time = v => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' 北京时间' : '未知时间';
let state = null, demo = null, tab = 'overlap', polling = false, localError = '';
async function api(route, value) {
  const response = await fetch(route, value === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json', 'X-CSRF-Token':state?.csrfToken ?? ''}, body:JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后再试');
  return data;
}
function message(text, error = false) {
  $('message').hidden = !text; $('message').textContent = text; $('message').className = error ? 'error' : '';
}
const emptyIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="22" r="12"/><circle cx="29" cy="22" r="12"/><path d="M19 36v6m10-6v6"/></svg>';
function fullActivities(store) {
  return store.activities.map(a => `<li>实付满 <strong>¥${money(a.minPay)}</strong> 返 <strong>¥${money(a.rebate)}</strong> · ${esc(a.condition)}</li>`).join('');
}
function ratioActivities(store) {
  return store.activities.map(a => `<li>接口比例 <strong>${money(a.ratioPercent)}%</strong>${a.maxCashback == null ? '' : ` · 接口封顶 ¥${money(a.maxCashback)}`}${a.userRatioPercent == null ? '' : ` · 用户字段 ${money(a.userRatioPercent)}%`}${a.userMaxCashback == null ? '' : ` · 用户封顶 ¥${money(a.userMaxCashback)}`} · ${esc(a.condition)}</li>`).join('');
}
function row(store, kind, match) {
  return `<article class="store"><div>${match ? `<span class="badge ${match.basis === '相同美团门店 ID' ? '' : 'candidate'}">${match.basis === '相同美团门店 ID' ? '同 ID 重合' : '同名待确认'}</span>` : ''}<h3>${esc(store.name)}</h3><ul class="activities">${match ? fullActivities(match.full) + ratioActivities(match.ratio) : kind === 'full' ? fullActivities(store) : ratioActivities(store)}</ul></div><span class="store-kind">${match ? '两类名单交集' : kind === 'full' ? '实付满返' : '比例返'}</span></article>`;
}
function renderList() {
  const report = demo || state?.report;
  const search = $('search').value.trim().normalize('NFKC').toLowerCase();
  let rows = report ? tab === 'overlap' ? [...report.matches, ...report.candidates].map(m => ({ store:m.full, match:m })) : (tab === 'full' ? report.fullStores : report.ratioStores).map(store => ({ store })) : [];
  rows = rows.filter(({store}) => store.name.normalize('NFKC').toLowerCase().includes(search));
  if (rows.length) { $('result-list').innerHTML = rows.map(({store, match}) => row(store, tab, match)).join(''); return; }
  let title = '从一个位置开始', detail = '设置位置后点击查询，或先查看演示。不会自动调用真实接口。';
  if (report) {
    if (search) { title = '没有找到这个名字'; detail = '试试更短的关键词，或切换到另一份名单。'; }
    else if (tab !== 'overlap') { title = '本次未取得有效名单'; detail = '请检查采集范围和错误信息；空名单不一定代表附近没有活动。'; }
    else if (report.status === 'partial' || report.status === 'blocked') { title = '采集不完整，暂不能判断重合'; detail = '仍可切换查看已取得的名单。请先处理采集错误，再手动查询。'; }
    else { title = '本次样本暂未发现重合'; detail = '不代表附近没有重合商家。可以查看两侧名单；分页覆盖和异名门店仍可能影响结果。'; }
  }
  $('result-list').innerHTML = `<div class="empty">${emptyIcon}<h3>${title}</h3><p>${detail}</p></div>`;
}
function renderQueryControls() {
  const location = state.location;
  const wait = Math.max(0, Math.ceil((state.nextAllowedAt - Date.now()) / 1000));
  $('query').disabled = state.busy || wait > 0 || !location;
  $('query').firstChild.textContent = state.busy ? '正在查询…' : wait ? `${wait} 秒后可查询` : '查询重合商家';
  $('query-hint').textContent = state.busy ? state.progress || '正在获取活动名单…' : wait ? '稍作等待，减少接口压力' : '手动查询 · 不会自动刷新接口';
}
function render() {
  if (!state) return;
  const report = demo || state.report;
  const location = state.location;
  $('location-name').textContent = location?.label || '尚未设置';
  $('location-detail').textContent = location ? `${location.lat}, ${location.lng} · ${location.adcode}` : '位置仅保存在这台电脑';
  $('edit-location').textContent = location ? '修改位置' : '设置位置';
  $('edit-location').disabled = state.busy;
  $('import-location').disabled = state.busy;
  $('location-form').querySelector('button[type=submit]').disabled = state.busy;
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
    const stops = { page_limit: '达到本次上限', empty_page: '返回空页', short_page: '响应不足一页', missing_cursor: '未提供下一页游标', no_progress: '连续两次无新增且游标未推进', waf: '上游拦截', error: '请求失败' };
    const actual = report.pagination ? ['full', 'ratio'].map(kind => {
      const stats = report.pagination[kind];
      return !stats ? `${kind === 'full' ? '满返' : '比例返'}未请求` : `${kind === 'full' ? '满返' : '比例返'}：计划最多 ${stats.plannedPages} 页，实际请求 ${stats.requests} 次，${stats.uniquePages} 个不同内容页，${stats.duplicatePages} 个重复响应，新增 ${stats.stores} 家（${stops[stats.stopReason] || '停止原因未知'}）`;
    }).join('；') + '。' : legacyActual;
    $('scope-note').textContent = [!state.resultMatchesLocation ? '以下为历史结果，不对应当前设置的位置。重新查询后才会更新。' : '', report.status === 'partial' ? '本次只取得部分数据，重合结论不完整。下方可查看具体错误。' : '这是一次有限样本，不保证全量。增加页数不会扩大配送半径；重复内容不会增加商家数。接口比例未核对到账口径，不能据此保证实际返现。', actual].filter(Boolean).join(' ');
  }
  const attempt = state.attempt;
  const errors = !demo && attempt ? attempt.errors || [] : [];
  $('attempt').hidden = !errors.length && !attempt?.persistenceError || !!demo;
  $('attempt').textContent = errors.map(e => `${({full:'实付满返', ratio:'比例返', query:'查询'})[e.source] || e.source}：${e.message}`).join('；') + (attempt?.persistenceError ? '；' + attempt.persistenceError : '') + (errors.length && state.report && attempt?.generatedAt !== state.report.generatedAt ? '。未覆盖上次结果，以下仍为历史名单。' : '');
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
  try { state = await api('/api/state'); if (localError) { message('本地服务已恢复'); localError = ''; } render(); if (state.busy) poll(); }
  catch (e) { localError = e.message; message('无法连接本地服务，请确认启动窗口仍在运行，然后刷新页面。', true); }
}
async function poll() {
  if (polling) return; polling = true;
  try {
    while (state?.busy) { await new Promise(r => setTimeout(r, 800)); state = await api('/api/state'); if (state.busy) renderQueryControls(); else render(); }
    message(state.attempt?.errors?.length ? '本轮查询已结束，请查看采集错误。' : '查询完成，结果已保存在本机。', !!state.attempt?.errors?.length);
  } catch { message('服务连接中断；查询可能仍在运行。刷新页面可恢复查看。', true); }
  finally { polling = false; }
}
$('edit-location').addEventListener('click', () => {
  $('location-form').hidden = !$('location-form').hidden;
  if (!$('location-form').hidden) { for (const key of ['label','lat','lng','adcode']) $('location-form').elements[key].value = state?.location?.[key] ?? ''; $('location-form').elements.label.focus(); }
});
$('cancel-location').onclick = () => { $('location-form').hidden = true; $('edit-location').focus(); };
$('location-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const value = Object.fromEntries(new FormData(form));
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
setInterval(() => { if (state && !state.busy && state.nextAllowedAt > Date.now() - 1500) renderQueryControls(); }, 1000);
refresh();
