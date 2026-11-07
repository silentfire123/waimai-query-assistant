import {createWaimaiClient} from '../waimai.mjs';
export async function checkWaimaiSession({token,location,fetchImpl=fetch,pause}={}){
 if(typeof token!=='string'||!token.trim())return {status:'needs_token'};
 token=token.trim();
 if(token.length>4096||[...token].some(c=>c.charCodeAt(0)<33||c.charCodeAt(0)>126))return {status:'invalid_token'};
 if(!location||typeof location.city!=='string'||!location.city.trim()||location.city.length>40||typeof location.lat!=='number'||typeof location.lng!=='number'||!Number.isFinite(location.lat)||!Number.isFinite(location.lng)||Math.abs(location.lat)>90||Math.abs(location.lng)>180)return {status:'needs_location'};
 try{
  const requestPage=await createWaimaiClient(location,{token:token.trim(),fetchImpl});
  // 独立的既有“本人凭证三页验证”工具，不调用产品的两页混合采集器。
  // 必须显式提供凭证；产品 UI/collectAll 即使有凭证也不会因此扩页。
  const cursors=new Set();let cursor=null,requests=0,completedPages=0;
  for(let page=0;page<3;page++){
    const key=JSON.stringify(cursor);
    if(cursors.has(key))return {status:'inconclusive',requests,completedPages};
    cursors.add(key);requests++;
    const json=await requestPage(cursor);
    if(json?.code!==200||!Array.isArray(json.data?.data))return {status:json?.code===4000010?'login_required':'request_failed',requests,completedPages,...(Number.isInteger(json?.code)?{upstreamCode:json.code}:{})};
    if(json.data.data.some(shop=>!shop?.shopName||!Array.isArray(shop.overbearfoodList)||shop.overbearfoodList.some(sku=>!sku||typeof sku!=='object')))return {status:'request_failed',requests,completedPages};
    completedPages++;
    if(completedPages===3)return {status:'third_page_verified',requests,completedPages};
    if(json.data.hasMore===false||json.data.scrollPageData==null)return {status:'inconclusive',requests,completedPages};
    cursor=json.data.scrollPageData;
    await (pause??(ms=>new Promise(r=>setTimeout(r,ms))))(800);
  }
 }catch{return {status:'request_failed'};}
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const descriptions={needs_token:'请通过本机隐藏输入提供本人token，不要写入命令行参数或聊天。',invalid_token:'凭证格式不符；仅粘贴token值，不要粘贴完整请求或请求头。',needs_location:'缺少有效城市或坐标，请先在本地页面保存位置。',login_required:'凭证未被此列表接口接受或已失效；第三页及后续尚未打通。',inconclusive:'上游在第3页前已结束；本次无法验证第三页权限。',request_failed:'请求、配置或解密失败；登录未验证，不自动重试。',third_page_verified:'第1–3页均成功；本次第三页访问已验证，不代表20页或长期有效。'};
async function main(){
 const args=process.argv.slice(2);if(args.includes('--help')){console.log('本机歪麦会话验证：使用 scripts/waimai-login.ps1 隐藏输入；加 -Start 可在验证通过后启动8788。只请求3页，不保存凭证或响应。');return;}
 if(args.some(a=>a!=='--start'))throw Error('invalid arguments');
 const token=process.env.WM_TOKEN??'';if(!token.trim()){console.log(descriptions.needs_token);process.exitCode=2;return;}
 const port=Number(process.env.PORT||8788);if(args.includes('--start')&&(!Number.isInteger(port)||port<1||port>65535))throw Error('invalid port');
 const dataDir=path.resolve(process.env.DATA_DIR||path.join(root,'data'));const settings=JSON.parse(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'));let location=settings.location;
 if(!location?.city){const cities=JSON.parse(await fs.readFile(path.join(root,'cities.json'),'utf8'));location={...location,city:cities[String(location?.adcode)]};}
 const result=await checkWaimaiSession({token,location});
 console.log(JSON.stringify(result));console.log(descriptions[result.status]);
 process.exitCode=result.status==='third_page_verified'?0:result.status==='login_required'?2:result.status==='inconclusive'?3:1;
 if(args.includes('--start')&&result.status==='third_page_verified'){
  try{
  process.env.WM_TOKEN=token.trim();const {createApp}=await import('../server.mjs');const app=await createApp({dataDir,publicOrigin:'',accessPassword:''});
  app.on('error',()=>{console.error('本机服务无法启动；端口可能已占用。凭证未保存到磁盘。');process.exitCode=1;});
  app.listen(port,'127.0.0.1',()=>console.log('已启动本人会话本机服务：http://127.0.0.1:'+port+'；关闭此窗口即可结束，凭证不保存。'));
  }catch{console.error('本次第三页已验证，但本机预览未启动：请检查本地 settings/latest 状态文件、文件权限和运行环境。未打印凭证或原始错误。');process.exitCode=1;}
 }
}
if(process.argv[1]&&await fs.realpath(process.argv[1])===await fs.realpath(fileURLToPath(import.meta.url)))main().catch(()=>{console.error('验证未完成：请检查本机位置配置、运行环境或端口。未打印凭证、地址或原始错误。');process.exitCode=1;});
