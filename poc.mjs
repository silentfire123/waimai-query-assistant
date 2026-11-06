// Node CLI. Shared collection and report logic lives in core.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryLive, buildReport, htmlReport, demoReport, searchLocations, compare, validateInput } from './core.mjs';
export { queryLive, buildReport, htmlReport, demoReport, searchLocations, compare };
const root = path.dirname(fileURLToPath(import.meta.url));

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
