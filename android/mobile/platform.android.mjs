// Only APK-owned pages can access this bridge. No arbitrary URLs or file paths.
const native=globalThis.AndroidNative;
const pending=new Map();let sequence=0;
globalThis.__nativeResult=(id,result)=>{const item=pending.get(id);if(!item)return;pending.delete(id);clearTimeout(item.timer);result.ok?item.resolve(result.value):item.reject(new Error(result.error||'手机操作失败，请重试'));};
export function nativeCall(operation,value={}) {
 return new Promise((resolve,reject)=>{const id=String(++sequence);const timer=setTimeout(()=>{pending.delete(id);reject(Error('手机操作超时，请重试'));},operation==='export'?180000:60000);pending.set(id,{resolve,reject,timer});try{native.call(id,operation,JSON.stringify(value));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
}
export const md5=value=>native.md5(String(value));
export const randomUUID=()=>native.uuid();
export const getConfig=key=>JSON.parse(native.config())[key];
export const storage={read:()=>JSON.parse(native.readState()),write:value=>{const error=native.writeState(JSON.stringify(value));if(error)throw Error(error);}};
export async function readLegacyLocation(){throw Error('手机不读取电脑旧配置，请搜索地址或手动设置位置');}
export async function readResourceJson(name){if(!['cities.json','demo-input.json'].includes(name))throw Error('未知资源');const r=await globalThis.fetch('/'+name);if(!r.ok)throw Error('手机内置资源读取失败');return r.json();}
export async function fetchUpstream(url,options={}) {
 if(options.signal?.aborted)throw Error('请求已取消');
 const result=await nativeCall('http',{url:String(url),method:options.method||'GET',headers:options.headers||{},body:options.body||''});
 return {ok:result.status>=200&&result.status<300,status:result.status,text:async()=>result.body,json:async()=>JSON.parse(result.body),headers:{get:name=>result.headers?.[name.toLowerCase()]??null}};
}
export async function createWaimaiClient(location){const session=await nativeCall('wmInit',{location});return cursor=>nativeCall('wmPage',{session,cursor});}
