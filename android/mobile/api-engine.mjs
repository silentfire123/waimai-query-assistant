import {collectAll} from '../../collector.mjs';
import {buildReport,demoReport,searchLocations} from '../../core.mjs';
import {reverseLocation,toGcj02} from '../../location.mjs';
import {readResourceJson} from '../../platform.mjs';
import {diagnosticSummary} from '../../diagnostic-core.mjs';

// Same caller-facing routes as the desktop UI, but no HTTP server, port, or cloud.
export function createMobileApp({storage,uuid,codeVersion,config=()=>({}),collect=collectAll,search=searchLocations,reverse=reverseLocation,clock=Date.now,cooldownMs=10000}) {
 let saved=storage.read()??{};
 if(saved.version!=null&&saved.version!==1)throw Error('手机缓存版本不兼容，请先备份或清除应用数据');
 let location=saved.location??null,snapshot=saved.snapshot??{report:null,attempt:null},diagnostic=saved.diagnostic??null;
 let locating=false,busy=false,progress='',nextAllowedAt=Number(saved.nextAllowedAt)||0,locationNextAt=0;
 const keyOf=loc=>loc?JSON.stringify([loc.lat,loc.lng,loc.adcode]):null;
 const persist=()=>storage.write({version:1,location,snapshot,diagnostic,nextAllowedAt});
 if(snapshot.attempt?.status==='running'){snapshot={...snapshot,attempt:{...snapshot.attempt,status:'blocked',errors:[{source:'query',message:'上次查询被系统中断，请在前台手动重试；已保存的结果保留'}]}};nextAllowedAt=clock()+cooldownMs;persist();}
 const state=()=>structuredClone({codeVersion,location,locationKey:keyOf(location),...snapshot,busy,progress,nextAllowedAt,csrfToken:'phone-local',resultMatchesLocation:!!location&&snapshot.report?.context?.locationKey===keyOf(location)});
 function validate(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('请填写查询位置');
  if(typeof value.label!=='string'||!value.label.trim()||value.label.trim().length>60)throw Error('位置名称需为 1–60 个字符');
  for(const name of ['lat','lng','adcode'])if(!['number','string'].includes(typeof value[name])||String(value[name]).trim()==='')throw Error('坐标和行政区划代码不能为空');
  const lat=Number(value.lat),lng=Number(value.lng);if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)throw Error('经纬度超出有效范围');
  if(!/^[1-9]\d{5}$/.test(String(value.adcode)))throw Error('行政区划代码应为 6 位数字');
  const result={label:value.label.trim(),lat:Math.round(lat*1e6)/1e6,lng:Math.round(lng*1e6)/1e6,adcode:Number(value.adcode)};
  if(typeof value.city==='string'&&value.city.trim()&&value.city.trim().length<=40)result.city=value.city.trim();return result;
 }
 async function run(pages,context,chosen){
  const started=clock();let data={};
  try{data=await collect(pages,{location:chosen,log:message=>{progress=message;}});const report={...buildReport(data),context};snapshot.attempt={status:report.status,generatedAt:report.generatedAt,context,errors:report.errors};if(report.status!=='blocked')snapshot.report=report;}
  catch{snapshot.attempt={status:'blocked',generatedAt:new Date(clock()).toISOString(),context,errors:[{source:'query',message:'本轮查询失败，请检查网络、位置或手机凭证设置；上次名单保留'}]};}
  finally{
   diagnostic=diagnosticSummary({...data,config:{hasWmToken:!!config().hasWmToken,hasAmapKey:!!config().hasAmapKey,publicMode:false},queryId:context.queryId,codeVersion,pages,durationMs:clock()-started,status:snapshot.attempt.status,errors:snapshot.attempt.errors});
   busy=false;progress='';nextAllowedAt=clock()+cooldownMs;
   try{persist();}catch{snapshot.attempt.persistenceError='结果未能保存到手机，退出应用后可能丢失，请检查剩余空间';}
  }
 }
 return {isBusy:()=>busy||locating,async request(route,value){
  if(route==='/api/state')return state();
  if(route==='/api/demo')return demoReport();
  if(route==='/api/diagnostics'){if(!diagnostic)throw Error('尚无查询诊断，请先手动完成一次查询');return structuredClone(diagnostic);}
  if(route==='/api/import-location')throw Error('手机不读取电脑旧配置，请搜索地址选点');
  if(route==='/api/location'){
   if(busy)throw Error('正在查询，请稍后再修改位置');const next=validate(value),old=location;location=next;try{persist();}catch(error){location=old;throw error;}return state();
  }
  if(route==='/api/location-search'||route==='/api/location-reverse'||route==='/api/location-current'){
   if(clock()<locationNextAt)throw Error('位置操作较频繁，请稍后重试');locationNextAt=clock()+1500;
   if(route==='/api/location-search')return {locations:await search(value?.keyword)};
   if(route==='/api/location-current'){
    if(busy||locating)throw Error('正在查询或定位，请稍后重试');
    const point=toGcj02(value?.lat,value?.lng),previous=location;
    if(value.expectedLocationKey!==undefined&&value.expectedLocationKey!==keyOf(location))throw Error('查询位置已变化，本次定位未保存，请重试');
    if(typeof value.address!=='string'||value.address.trim().length<2||value.address.trim().length>80)throw Error('手机未能识别当前位置地址，请搜索附近地址');
    locating=true;
    try{
     const candidates=await search(value.address.trim());
     const distance=candidate=>{const rad=Math.PI/180,lat1=point.lat*rad,lat2=candidate.lat*rad,dLat=(candidate.lat-point.lat)*rad,dLng=(candidate.lng-point.lng)*rad;const a=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));};
     const nearby=candidates.filter(candidate=>candidate&&Number.isFinite(candidate.lat)&&Math.abs(candidate.lat)<=90&&Number.isFinite(candidate.lng)&&Math.abs(candidate.lng)<=180&&/^[1-9]\d{5}$/.test(String(candidate.adcode))&&typeof candidate.city==='string'&&candidate.city.trim()).map(candidate=>({candidate,meters:distance(candidate)})).filter(item=>item.meters<=500).sort((a,b)=>a.meters-b.meters);
     if(!nearby.length||nearby.some(item=>Number(item.candidate.adcode)!==Number(nearby[0].candidate.adcode)))throw Error('附近没有匹配到明确的行政区划，请搜索附近小区或道路；原位置未更改');
     const cities=await readResourceJson('cities.json'),city=cities[String(nearby[0].candidate.adcode)];
     if(!city||nearby.some(item=>item.candidate.city.trim()!==city))throw Error('当前位置城市与行政区划不一致，请搜索附近地址；原位置未更改');
     if(busy||location!==previous)throw Error('位置或查询状态已变化，本次定位未保存，请重试');
     const next=validate({...nearby[0].candidate,...point,city,label:('当前位置 · '+value.address).slice(0,60)});location=next;
     try{persist();}catch(error){location=previous;throw Error('当前位置保存失败，原位置未更改');}
     return {location:structuredClone(location),state:state()};
    }finally{locating=false;}
   }
   if(!value||!Number.isFinite(value.lat)||!Number.isFinite(value.lng))throw Error('无效定位坐标');
   try{return {location:await reverse(value)};}catch(error){throw Error(error.message.replace('服务端配置 AMAP_KEY','手机凭证设置中配置高德 Key'));}
  }
  if(route==='/api/query'){
   if(locating)throw Error('正在定位，请等待定位保存后再查询');
   if(busy)throw Error('查询已在进行中，请等待');if(!location)throw Error('请先设置查询位置');
   if(value?.locationKey!==keyOf(location))throw Error('查询位置已变化，请确认位置后重试');
   const pages=value?.pages??10;if(![10,20].includes(pages))throw Error('每类页数只可选 10 或 20');
   if(clock()<nextAllowedAt)throw Error('请稍等片刻再查询，避免频繁请求上游');
   const context={queryId:uuid(),codeVersion,locationLabel:location.label,locationKey:keyOf(location),pages};const prior=snapshot;
   snapshot={...snapshot,attempt:{status:'running',context,generatedAt:new Date(clock()).toISOString(),errors:[]}};busy=true;progress='准备查询…';nextAllowedAt=clock()+cooldownMs;
   try{persist();}catch(error){snapshot=prior;busy=false;progress='';throw Error('无法保存手机查询状态，尚未请求上游，请检查剩余空间');}
   const response=state();void run(pages,context,{...location});return response;
  }
  throw Error('未支持的手机本地操作');
 }};
}
