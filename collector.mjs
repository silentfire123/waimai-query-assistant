import {queryLive} from './core.mjs';
export async function collectAll(pages=20,options={}) {
  const started=Date.now();
  let xc;
  try {xc=await queryLive(pages,options);}catch{xc={source:'live',full:[],ratio:[],errors:['full','ratio'].map(source=>({source,code:'XIAOCHAN_UNAVAILABLE',message:'小蚕配置或请求失败，请检查位置及本人身份配置'})),coverage:[],pagination:Object.fromEntries(['full','ratio'].map(k=>[k,{plannedPages:pages,requests:0,stores:0,uniquePages:0,duplicatePages:0,pages:[],stopReason:'error',partial:true}]))};}
  const elapsed=Date.now()-started;
  return {...xc,timings:{xiaochanMs:elapsed,totalMs:elapsed}};
}
