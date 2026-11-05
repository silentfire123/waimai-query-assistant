import fs from 'node:fs/promises';
import path from 'node:path';
const pickNumbers=(obj,keys)=>Object.fromEntries(keys.filter(k=>Number.isFinite(obj?.[k])).map(k=>[k,obj[k]]));
const statsKeys=['plannedPages','requests','uniquePages','duplicatePages','rawItems','classifiedItems','eligibleActivities','filteredActivities','schemaRejectedItems','excludedProductItems','excludedOtherPlatform','excludedSoldOut','excludedUnknownType','stores'];
const pageKeys=['request','rawItems','classifiedItems','eligibleActivities','filteredActivities','schemaRejectedItems','excludedProductItems','excludedOtherPlatform','excludedSoldOut','excludedUnknownType','newStores','newActivities','totalStores','durationMs'];
const knownSources=new Set(['full','ratio','waimai','query']);
const stops=new Set(['upstream_end','page_limit','empty_page','short_page','missing_cursor','no_progress','waf','error']);
export function diagnosticSummary(input) {
 return {queryId:input.queryId,codeVersion:input.codeVersion,pages:input.pages,durationMs:input.durationMs,config:Object.fromEntries(['hasWmToken','hasAmapKey','publicMode'].filter(k=>typeof input.config?.[k]==='boolean').map(k=>[k,input.config[k]])),
  timings:pickNumbers(input.timings,['xiaochanMs','waimaiMs','totalMs']),status:input.status,
  pagination:Object.fromEntries(Object.entries(input.pagination??{}).filter(([k])=>knownSources.has(k)).map(([k,s])=>[k,{...pickNumbers(s,statsKeys),stopReason:stops.has(s.stopReason)?s.stopReason:'unknown',pages:(Array.isArray(s.pages)?s.pages:[]).slice(0,20).map(p=>pickNumbers(p,pageKeys))}])),
  errors:(input.errors??[]).slice(0,30).map(e=>({source:knownSources.has(e.source)?e.source:'query',...pickNumbers(e,['upstreamCode']),code:['UPSTREAM_HTTP','UPSTREAM_WAF','SKIPPED_UPSTREAM_WAF','INVALID_FEED_ITEMS','WAIMAI_UNAVAILABLE','XIAOCHAN_UNAVAILABLE'].includes(e.code)?e.code:'QUERY_ERROR'}))};
}
export async function saveDiagnostic(dir,summary) {
 try {
  await fs.mkdir(dir,{recursive:true});
  const filename=Date.now()+'-'+summary.queryId+'.json';
  await fs.writeFile(path.join(dir,filename),JSON.stringify(summary,null,2));
  const names=(await fs.readdir(dir)).filter(n=>n.endsWith('.json')).sort().reverse();
  for(const name of names.slice(20))await fs.unlink(path.join(dir,name));
  return true;
 }catch{return false;}
}
