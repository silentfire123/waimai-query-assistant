import { createWaimaiClient } from './platform.mjs';
export { createWaimaiClient };
const numeric = v => (typeof v==='number' || (typeof v==='string' && v.trim())) && Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v) : null;
const id = v => typeof v==='string' ? v.trim() && v.trim()!=='0' ? v.trim() : null : Number.isSafeInteger(v) && v>0 ? String(v) : null;
export function normalizeWaimai(items, {verifiedUnits=false}={}) {
  const full=[], ratio=[];
  for(const shop of items) {
    if(!shop?.shopName || ![1,2,3].includes(Number(shop.shopPlatformType))) continue;
    for(const sku of shop.overbearfoodList ?? []) {
      if(!sku || sku.takeawayPlatform!=='meituan') continue;
      const inventory=numeric(sku.surplusNumber);
      const row={name:shop.shopName,source:'waimai',waimaiStoreId:id(shop.id),meituanPoiId:null,promotionId:id(sku.id),inventory,inventoryState:inventory===0?'sold_out':inventory==null?'unknown':'reported_remaining',condition:typeof sku.mealType==='string'?sku.mealType:'条件未提供',referenceGrade:sku.maxGradeRebate ?? null,verification:verifiedUnits?'response-observed':'units-unverified'};
      if([1,3].includes(Number(shop.shopPlatformType))) full.push({...row,rebateType:'fixed',minPay:null,rebate:null,missingFields:['会员返现金额','最低实付门槛']});
      else ratio.push({...row,ratioPercent:verifiedUnits && numeric(sku.meituanVipRatio)!=null?numeric(sku.meituanVipRatio)/100:null,maxCashback:verifiedUnits?numeric(sku.maxReturnMoney):null,memberRatioRaw:numeric(sku.meituanVipRatio),maxCashbackRaw:numeric(sku.maxReturnMoney)});
    }
  }
  return {full,ratio};
}
// 本轮产品只取一次混合名单，最多两页；凭证复用及后续页留给后续任务。
export async function queryWaimai(pages=2,{location,requestPage,pause=ms=>new Promise(r=>setTimeout(r,ms)),log=()=>{}}={}) {
  if(!Number.isInteger(pages)||pages<1||pages>20) throw Error('歪麦页数必须为 1–20；本轮混合名单最多两页');
  const limit=Math.min(pages,2);
  const result={full:[],ratio:[],pagination:{plannedPages:limit,requests:0,pages:[],stores:0,fullStores:0,ratioStores:0,rawItems:0,eligibleActivities:0,filteredActivities:0,excludedOtherPlatform:0,excludedSoldOut:0,excludedUnknownType:0,retainedSoldOut:0,retainedUnknownInventory:0,stopReason:'page_limit',partial:true,categoryScope:'mixed',ordering:'comprehensive',platformFilter:'meituan'},errors:[]};
  let cursor=null,stagnant=0;const seen=new Set(),stores=new Set(),byKind={full:new Set(),ratio:new Set()};
  try {
    requestPage ??= await createWaimaiClient(location);
    for(let page=1;page<=limit;page++){
      log('歪麦（混合类别，最多两页）：查询第 '+page+' 页…');
      const start=Date.now();result.pagination.requests++;
      const json=await requestPage(cursor);
      if(json?.code!==200||!Array.isArray(json.data?.data)) throw Object.assign(Error('歪麦接口业务失败或列表结构不符'),{upstreamCode:Number.isInteger(json?.code)?json.code:undefined});
      if(json.data.data.some(shop=>!shop?.shopName||!Array.isArray(shop.overbearfoodList)||shop.overbearfoodList.some(sku=>!sku||typeof sku!=='object')))throw Error('歪麦活动结构不符');
      const rows=normalizeWaimai(json.data.data,{verifiedUnits:true});let added=0;
      for(const kind of ['full','ratio']) for(const row of rows[kind]) {const key=JSON.stringify([kind,row]);if(!seen.has(key)){seen.add(key);result[kind].push(row);added++;}byKind[kind].add(row.waimaiStoreId??row.name);}
      const newStoresBefore=stores.size;
      let excludedOtherPlatform=0,excludedUnknownType=0;
      for(const shop of json.data.data)for(const sku of shop.overbearfoodList){
        if(![1,2,3].includes(Number(shop.shopPlatformType)))excludedUnknownType++;
        else if(sku.takeawayPlatform!=='meituan')excludedOtherPlatform++;
      }
      const activities=[...rows.full,...rows.ratio];
      for(const row of activities)stores.add(row.waimaiStoreId??row.name);
      const pageStats={request:page,rawItems:json.data.data.length,newActivities:added,newStores:stores.size-newStoresBefore,totalStores:stores.size,eligibleActivities:activities.length,filteredActivities:excludedOtherPlatform+excludedUnknownType,excludedOtherPlatform,excludedSoldOut:0,excludedUnknownType,retainedSoldOut:activities.filter(r=>r.inventoryState==='sold_out').length,retainedUnknownInventory:activities.filter(r=>r.inventoryState==='unknown').length,durationMs:Date.now()-start};
      result.pagination.stores=stores.size;result.pagination.fullStores=byKind.full.size;result.pagination.ratioStores=byKind.ratio.size;
      for(const key of ['rawItems','eligibleActivities','filteredActivities','excludedOtherPlatform','excludedSoldOut','excludedUnknownType','retainedSoldOut','retainedUnknownInventory'])result.pagination[key]+=pageStats[key];
      const next=json.data.scrollPageData;
      result.pagination.pages.push(pageStats);
      if(json.data.hasMore===false){result.pagination.stopReason='upstream_end';break;}
      if(!json.data.data.length){result.pagination.stopReason='empty_page';break;}
      if(next==null){result.pagination.stopReason='missing_cursor';break;}
      stagnant=added===0?stagnant+1:0;
      if(stagnant>=2){result.pagination.stopReason='no_progress';break;}
      cursor=next;if(page<limit) await pause(800);
    }
  } catch(error) {
    result.pagination.stopReason=error.upstreamCode===4000010||[401,403].includes(error.httpStatus)?'auth_required':'error';
    result.errors.push({source:'waimai',code:'WAIMAI_UNAVAILABLE',...(Number.isInteger(error.upstreamCode)?{upstreamCode:error.upstreamCode}:{}),message:'歪麦请求、解密或鉴权失败，已停止，不代表无活动；仅保留本次已取得的部分名单。登录入口和会话复用留待后续。'});
  }
  result.pagination.partial=!['upstream_end','empty_page'].includes(result.pagination.stopReason);
  return result;
}
