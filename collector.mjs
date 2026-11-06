import {queryLive} from './core.mjs';
import {queryWaimai} from './waimai.mjs';
import {readResourceJson} from './platform.mjs';
export async function collectAll(pages,options={}) {
  const started=Date.now();
  let xc;
  try {xc=await queryLive(pages,options);}catch{xc={source:'live',full:[],ratio:[],errors:['full','ratio'].map(source=>({source,code:'XIAOCHAN_UNAVAILABLE',message:'小蚕配置或请求失败，歪麦仍会继续；请检查服务端本人身份配置'})),coverage:[],pagination:{}};}
  let location=options.location;
  if(!location?.city){
    const cities=await readResourceJson('cities.json');
    location={...location,city:cities[String(location?.adcode)]};
  }
  const xcMs=Date.now()-started;
  const wm=await queryWaimai(pages,{...options,location});
  return {...xc,channelActivities:{full:wm.full,ratio:wm.ratio},errors:[...xc.errors,...wm.errors],
    pagination:{...xc.pagination,waimai:wm.pagination},timings:{xiaochanMs:xcMs,waimaiMs:Date.now()-started-xcMs,totalMs:Date.now()-started},
    coverage:[...xc.coverage,'歪麦：实际请求 '+wm.pagination.requests+' 页，停止原因 '+wm.pagination.stopReason+'；来源活动独立保留，不保证全量。']};
}
