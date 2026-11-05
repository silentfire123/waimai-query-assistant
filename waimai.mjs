const numeric = v => (typeof v==='number' || (typeof v==='string' && v.trim())) && Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v) : null;
const id = v => (typeof v==='string' && v.trim() && v!=='0') || (Number.isSafeInteger(v) && v>0) ? String(v) : null;
export function normalizeWaimai(items, {verifiedUnits=false}={}) {
  const full=[], ratio=[];
  for(const shop of items) {
    if(!shop?.shopName || ![1,2,3].includes(Number(shop.shopPlatformType))) continue;
    for(const sku of shop.overbearfoodList ?? []) {
      if(sku.takeawayPlatform!=='meituan' || numeric(sku.surplusNumber)===0) continue;
      const row={name:shop.shopName,source:'waimai',waimaiStoreId:id(shop.id),meituanPoiId:null,promotionId:id(sku.id),inventory:numeric(sku.surplusNumber),condition:typeof sku.mealType==='string'?sku.mealType:'条件未提供',referenceGrade:sku.maxGradeRebate ?? null,verification:verifiedUnits?'response-observed':'units-unverified'};
      if([1,3].includes(Number(shop.shopPlatformType))) full.push({...row,rebateType:'fixed',minPay:null,rebate:null,missingFields:['会员返现金额','最低实付门槛']});
      else ratio.push({...row,ratioPercent:verifiedUnits && numeric(sku.meituanVipRatio)!=null?numeric(sku.meituanVipRatio)/100:null,maxCashback:verifiedUnits?numeric(sku.maxReturnMoney):null,memberRatioRaw:numeric(sku.meituanVipRatio),maxCashbackRaw:numeric(sku.maxReturnMoney)});
    }
  }
  return {full,ratio};
}
export async function queryWaimai(pages,{location,requestPage,pause=ms=>new Promise(r=>setTimeout(r,ms)),log=()=>{}}={}) {
  if(!Number.isInteger(pages)||pages<1||pages>20) throw Error('歪麦页数必须为 1–20');
  const result={full:[],ratio:[],pagination:{plannedPages:pages,requests:0,pages:[],stores:0,rawItems:0,eligibleActivities:0,filteredActivities:0,excludedOtherPlatform:0,excludedSoldOut:0,excludedUnknownType:0,stopReason:'page_limit'},errors:[]};
  let cursor=null,stagnant=0;const seen=new Set(),stores=new Set();
  try {
    requestPage ??= await createWaimaiClient(location);
    for(let page=1;page<=pages;page++){
      log('歪麦：查询第 '+page+' 页…');
      const start=Date.now();result.pagination.requests++;
      const json=await requestPage(cursor);
      if(json?.code!==200||!Array.isArray(json.data?.data)) throw Object.assign(Error('歪麦接口业务失败或列表结构不符'),{upstreamCode:Number.isInteger(json?.code)?json.code:undefined});
      if(json.data.data.some(shop=>!shop?.shopName||!Array.isArray(shop.overbearfoodList)))throw Error('歪麦活动结构不符');
      const rows=normalizeWaimai(json.data.data,{verifiedUnits:true});let added=0;
      for(const kind of ['full','ratio']) for(const row of rows[kind]) {const key=JSON.stringify([kind,row]);if(!seen.has(key)){seen.add(key);result[kind].push(row);added++;}}
      const newStoresBefore=stores.size;
      let excludedOtherPlatform=0,excludedSoldOut=0,excludedUnknownType=0;
      for(const shop of json.data.data)for(const sku of shop.overbearfoodList){
        if(![1,2,3].includes(Number(shop.shopPlatformType)))excludedUnknownType++;
        else if(sku.takeawayPlatform!=='meituan')excludedOtherPlatform++;
        else if(numeric(sku.surplusNumber)===0)excludedSoldOut++;
      }
      for(const row of [...rows.full,...rows.ratio])stores.add(row.waimaiStoreId??row.name);
      const pageStats={request:page,rawItems:json.data.data.length,newActivities:added,newStores:stores.size-newStoresBefore,totalStores:stores.size,eligibleActivities:rows.full.length+rows.ratio.length,filteredActivities:excludedOtherPlatform+excludedSoldOut+excludedUnknownType,excludedOtherPlatform,excludedSoldOut,excludedUnknownType,durationMs:Date.now()-start};
      result.pagination.stores=stores.size;
      for(const key of ['rawItems','eligibleActivities','filteredActivities','excludedOtherPlatform','excludedSoldOut','excludedUnknownType'])result.pagination[key]+=pageStats[key];
      const next=json.data.scrollPageData;
      result.pagination.pages.push(pageStats);
      if(json.data.hasMore===false){result.pagination.stopReason='upstream_end';break;}
      if(next==null){result.pagination.stopReason='missing_cursor';break;}
      stagnant=added===0&&JSON.stringify(next)===JSON.stringify(cursor)?stagnant+1:0;
      if(stagnant>=2){result.pagination.stopReason='no_progress';break;}
      cursor=next;if(page<pages) await pause(800);
    }
  } catch(error) {result.pagination.stopReason='error';result.errors.push({source:'waimai',code:'WAIMAI_UNAVAILABLE',...(Number.isInteger(error.upstreamCode)?{upstreamCode:error.upstreamCode}:{}),message:'歪麦请求、解密或鉴权失败，未取得完整名单；不代表无活动。本人凭证仅通过服务端 WM_TOKEN 配置。'});}
  return result;
}

// 协议字段依据 lyrric/xiaochan 7e2db82（2026-11-06 核对）；非官方契约。
import crypto from 'node:crypto';
const aes = (text,key,decrypt=false) => {
  const codec=decrypt?crypto.createDecipheriv(`aes-${Buffer.byteLength(key)*8}-ecb`,Buffer.from(key),null):crypto.createCipheriv(`aes-${Buffer.byteLength(key)*8}-ecb`,Buffer.from(key),null);
  return Buffer.concat([codec.update(Buffer.from(text,decrypt?'base64':'utf8')),codec.final()]).toString(decrypt?'utf8':'base64');
};
const pem = (value,type) => value.includes('-----BEGIN') ? value : `-----BEGIN ${type} KEY-----
${value}
-----END ${type} KEY-----`;
export async function createWaimaiClient(location,{fetchImpl=fetch,token=process.env.WM_TOKEN ?? ''}={}) {
  const city=location?.city;
  if(typeof city!=='string'||!city.trim()) throw Error('歪麦需要城市名称，请通过地址搜索重新选点');
  const headers=()=>{const timestamp=String(Date.now()),nonce=Array.from(crypto.randomBytes(16),v=>v%10).join('');return {application:'overbear_one',appversion:'1.1.175',city:encodeURIComponent(city),nonce,timestamp,sign:aes(timestamp+nonce,'asdf545asdf4545d'),'content-type':'application/json',Referer:'https://servicewechat.com/wx5762f23d920ad9e5/346/page-frame.html',...(token?{token}:{})};};
  const post=async(url,body,extra={})=>{const res=await fetchImpl(url,{method:'POST',headers:{...headers(),...extra},body,signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('歪麦 HTTP '+res.status);return res;};
  const configRes=await post('https://fz-gateway.waimaimingtang.com/api/api/v2/index/newServiceConfig',JSON.stringify({json:aes(JSON.stringify({city}),'jnd674751fh6fkgu')}));
  const config=await configRes.json();if(config.code!==1||typeof config.data!=='string')throw Error('歪麦配置失败');
  const keys=JSON.parse(aes(config.data,'jnd674751fh6fkgu',true));
  const publicKey=crypto.createPublicKey(pem(keys.publicKey,'PUBLIC')), privateKey=crypto.createPrivateKey(pem(keys.privateKey,'PRIVATE'));
  return async scrollPageData=>{
    const key=crypto.randomBytes(16).toString('hex');
    const params={userLongitude:String(location.lng),userLatitude:String(location.lat),city,limit:15,sortWay:'comprehensive',categoryId:'',shopName:'',secKillFlag:1,signUpFlag:2,highRebatesFlag:0,noCommentFlag:0,takeawayPlatform:'',userTypes:[1,2,3],packageType:'',scrollPageData,threeKmFlag:'',tabType:'bwc'};
    const encryptKey=crypto.publicEncrypt({key:publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(Buffer.from(key).toString('base64'))).toString('base64');
    const res=await post('https://wmapp-api-v2.waimaimingtang.com/api/bwc/waimaimt-web-bwc/shopIndex/getShopList',aes(JSON.stringify(params),key),{'encrypt-key':encryptKey});
    let text=await res.text();const responseKey=res.headers.get('encrypt-key');
    if(responseKey){
      // Node 22 不支持旧式 PKCS1 privateDecrypt；只解包此第三方固定协议的响应密钥。
      const block=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_NO_PADDING},Buffer.from(responseKey,'base64'));
      const end=block.indexOf(0,2);if(block[0]!==0||block[1]!==2||end<10)throw Error('响应密钥填充无效');
      const responseAes=Buffer.from(block.subarray(end+1).toString(),'base64').toString();
      if(![16,24,32].includes(Buffer.byteLength(responseAes)))throw Error('响应密钥长度无效');
      text=aes(text,responseAes,true);
    }
    return JSON.parse(text);
  };
}
