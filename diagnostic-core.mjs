const pickNumbers=(obj,keys)=>Object.fromEntries(keys.filter(k=>Number.isFinite(obj?.[k])).map(k=>[k,obj[k]]));
const statsKeys=['plannedPages','requests','uniquePages','duplicatePages','rawItems','classifiedItems','eligibleActivities','filteredActivities','schemaRejectedItems','excludedProductItems','excludedOtherPlatform','excludedSoldOut','excludedUnknownType','retainedSoldOut','retainedUnknownInventory','fullStores','ratioStores','stores'];
const pageKeys=['request','rawItems','classifiedItems','eligibleActivities','filteredActivities','schemaRejectedItems','excludedProductItems','excludedOtherPlatform','excludedSoldOut','excludedUnknownType','retainedSoldOut','retainedUnknownInventory','newStores','newActivities','totalStores','durationMs'];
const knownSources=new Set(['full','ratio','waimai','query']);
const stops=new Set(['upstream_end','page_limit','empty_page','short_page','missing_cursor','no_progress','waf','error','auth_required','not_requested']);
export function diagnosticSummary(input) {
 return {queryId:input.queryId,codeVersion:input.codeVersion,pages:input.pages,durationMs:input.durationMs,config:Object.fromEntries(['hasWmToken','hasAmapKey','publicMode'].filter(k=>typeof input.config?.[k]==='boolean').map(k=>[k,input.config[k]])),
  timings:pickNumbers(input.timings,['xiaochanMs','waimaiMs','totalMs']),status:input.status,
  pagination:Object.fromEntries(Object.entries(input.pagination??{}).filter(([k])=>knownSources.has(k)).map(([k,s])=>[k,{...pickNumbers(s,statsKeys),...(typeof s.partial==='boolean'?{partial:s.partial}:{}),stopReason:stops.has(s.stopReason)?s.stopReason:'unknown',pages:(Array.isArray(s.pages)?s.pages:[]).slice(0,20).map(p=>pickNumbers(p,pageKeys))}])),
  errors:(input.errors??[]).slice(0,30).map(e=>({source:knownSources.has(e.source)?e.source:'query',...pickNumbers(e,['upstreamCode']),code:['UPSTREAM_HTTP','UPSTREAM_BUSINESS','UPSTREAM_AUTH','SKIPPED_UPSTREAM_AUTH','UPSTREAM_WAF','SKIPPED_UPSTREAM_WAF','INVALID_FEED_ITEMS','WAIMAI_UNAVAILABLE','XIAOCHAN_UNAVAILABLE'].includes(e.code)?e.code:'QUERY_ERROR'}))};
}
