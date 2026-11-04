import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { queryLive, buildReport, demoReport } from './poc.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const fail = (status, message) => Object.assign(new Error(message), { status });
const round = v => Math.round(v * 1e6) / 1e6;
export function validateLocation(input) {
  if (!input || typeof input !== 'object') throw fail(400, '请填写查询位置');
  const { label, lat, lng, adcode } = input;
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw fail(400, '位置名称需为 1–60 个字符');
  if ([lat, lng, adcode].some(v => !['string', 'number'].includes(typeof v))) throw fail(400, '经纬度和行政区划代码需为数字');
  if ([lat, lng, adcode].some(v => (typeof v === 'string' && !v.trim()) || v == null || typeof v === 'boolean')) throw fail(400, '经纬度和行政区划代码不能为空');
  if (!Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90 || !Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180) throw fail(400, '经纬度超出范围，请检查纬度和经度是否填反');
  if (!/^[1-9]\d{5}$/.test(String(adcode))) throw fail(400, '行政区划代码应为 6 位数字');
  return { label: label.trim(), lat: round(Number(lat)), lng: round(Number(lng)), adcode: Number(adcode) };
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(tmp, file);
}
export async function createApp({ dataDir = path.join(root, 'data'), collect = queryLive, cooldownMs = 10000 } = {}) {
  const configFile = path.join(dataDir, 'settings.json');
  const stateFile = path.join(dataDir, 'latest.json');
  let settings = await readJson(configFile, { location: null });
  let snapshot = await readJson(stateFile, { report: null, attempt: null });
  // 仅展示旧 PoC 缓存，不把未知位置当成当前地址的结果。
  if (!snapshot.report && dataDir === path.join(root, 'data')) {
    const prior = await readJson(path.join(root, 'output/live/result.json'), null);
    if (prior?.source === 'live') snapshot.report = { ...prior, context: { locationLabel: '旧 PoC 已选位置（尚未关联当前设置）', locationKey: null } };
  }
  const token = crypto.randomBytes(24).toString('hex');
  let busy = false, settingsBusy = false, progress = '', nextAllowedAt = 0;
  const keyOf = loc => loc ? crypto.createHash('sha256').update(JSON.stringify([loc.lat, loc.lng, loc.adcode])).digest('hex') : null;
  const state = () => ({ location: settings.location, locationKey: keyOf(settings.location), ...snapshot, busy, progress, nextAllowedAt, csrfToken: token, resultMatchesLocation: !!settings.location && snapshot.report?.context?.locationKey === keyOf(settings.location) });
  async function body(req) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw fail(415, '请求需使用 JSON');
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw fail(413, '请求过大'); }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw fail(400, '请求不是有效的 JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw fail(400, '请求应为 JSON 对象');
    return parsed;
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost) throw fail(403, '请通过本机 127.0.0.1 地址访问');
      const url = new URL(req.url, `http://${expectedHost}`);
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, state());
      if (req.method === 'GET' && url.pathname === '/api/demo') return send(200, await demoReport());
      if (req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== `http://${expectedHost}`) throw fail(403, '不接受其他网页发起的操作');
        if (req.headers['x-csrf-token'] !== token) throw fail(403, '页面会话已更新，请刷新后重试');
        const input = await body(req);
        if (url.pathname === '/api/location') {
          if (busy || settingsBusy) throw fail(409, '正在查询或保存位置，请稍后再修改');
          const location = validateLocation(input);
          settingsBusy = true;
          try { await writeJson(configFile, { location }); settings = { location }; } finally { settingsBusy = false; }
          return send(200, state());
        }
        if (url.pathname === '/api/import-location') {
          if (busy || settingsBusy) throw fail(409, '正在查询或保存位置，请稍后再导入');
          let legacy;
          try { legacy = await readJson(path.join(root, '../waimai-helper/config.json'), null); }
          catch { throw fail(400, '旧项目配置无法读取，请手动填写位置'); }
          const old = legacy?.addresses?.find(a => a.id === legacy.activeId);
          if (!old) throw fail(400, '未找到旧项目已选位置，请手动填写');
          const location = validateLocation({ label: old.title || '旧项目位置', lat: old.lat, lng: old.lng, adcode: old.adcode });
          if (busy || settingsBusy) throw fail(409, '正在查询或保存位置，请稍后再导入');
          settingsBusy = true;
          try { await writeJson(configFile, { location }); settings = { location }; } finally { settingsBusy = false; }
          return send(200, state());
        }
        if (url.pathname === '/api/query') {
          if (busy || settingsBusy) throw fail(409, '查询或位置保存已经在进行中，请等待');
          if (!settings.location) throw fail(400, '请先设置查询位置');
          if (input.locationKey !== keyOf(settings.location)) throw fail(409, '位置已在其他页面修改，请刷新后确认位置再查询');
          const pages = input.pages ?? 5;
          if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw fail(400, '每类页数必须为 1–10 的整数');
          if (Date.now() < nextAllowedAt) throw fail(429, '请稍等片刻再查询，避免频繁请求上游');
          busy = true; progress = '准备查询…'; nextAllowedAt = Date.now() + cooldownMs;
          const location = { ...settings.location };
          const context = { locationLabel: location.label, locationKey: keyOf(location), pages };
          send(202, state());
          void (async () => {
            try {
              const data = await collect(pages, { location, log: message => { progress = message; } });
              const report = { ...buildReport(data), context };
              snapshot.attempt = { status: report.status, generatedAt: report.generatedAt, context, errors: report.errors };
              // 全部失败时保留上次名单，并单独显示失败状态。
              if (report.status !== 'blocked') snapshot.report = report;
            } catch (error) {
              snapshot.attempt = { status: 'blocked', generatedAt: new Date().toISOString(), context, errors: [{ source: 'query', message: error.name === 'TimeoutError' ? '接口请求超时，请稍后重试' : String(error.message).slice(0, 300) }] };
            }
            try { await writeJson(stateFile, snapshot); }
            catch { snapshot.attempt = { ...snapshot.attempt, persistenceError: '结果未能保存到本机，关闭服务后可能丢失' }; }
            finally { busy = false; progress = ''; nextAllowedAt = Date.now() + cooldownMs; }
          })();
          return;
        }
      }
      if (req.method === 'GET') {
        const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
        const asset = assets[url.pathname];
        if (asset) { const content = await fs.readFile(path.join(root, 'web', asset[0])); res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' }); return res.end(content); }
      }
      send(404, { error: '未找到该页面或接口' });
    } catch (error) {
      if (!res.headersSent) send(error.status ?? 500, { error: error.status ? error.message : '本地服务处理失败，请检查配置文件或重启服务' });
      else res.end();
    }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 需为有效端口');
  const app = await createApp();
  app.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请打开现有页面或设置 PORT 使用其他端口。` : error.code === 'EACCES' ? `端口 ${port} 被系统保留或不允许使用，请设置 PORT 换个端口。` : '本地服务启动失败：' + error.message); process.exitCode = 1; });
  app.listen(port, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + port;
    console.log('外卖查询助手已启动：' + url);
    console.log('关闭此进程即可停止。仅本机访问，不自动请求上游。');
    if (process.argv.includes('--open') && process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, error => { if (error) console.error('浏览器未能自动打开，请手动访问上述地址。'); });
  });
}
