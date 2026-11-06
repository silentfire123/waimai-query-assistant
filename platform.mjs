// Node adapter. Android packages platform.android.mjs under this same module name.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export { createWaimaiClient } from './waimai-client.node.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
export const md5 = value => crypto.createHash('md5').update(value).digest('hex');
export const randomUUID = () => crypto.randomUUID();
export const getConfig = key => process.env[key];
export const fetchUpstream = (...args) => globalThis.fetch(...args);
export async function readLegacyLocation() {
  const config=JSON.parse(await fs.readFile(path.resolve(root,process.env.XC_CONFIG ?? '../waimai-helper/config.json'),'utf8'));
  return config.addresses?.find(a=>a.id===config.activeId);
}
export async function readResourceJson(name) {
  if(!['cities.json','demo-input.json'].includes(name)) throw Error('Unsupported resource');
  return JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
}
