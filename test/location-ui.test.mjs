import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createMobileApp} from '../android/mobile/api-engine.mjs';
import {calculate,bestCombination} from '../web/calculator.mjs';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const candidate={label:'合成测试点',lat:39.9103,lng:116.4038,adcode:110101,city:'北京市'};
const gps={lat:39.908823,lng:116.39747,address:'合成测试路',city:'北京市'};
async function page({locate=async()=>gps,search=async()=>[candidate],stored={},write=()=>{},collect=async()=>{throw Error('Unexpected query');},desktop=false,initialStateDelay=Promise.resolve()}={}){
 let now=10000,saved=structuredClone(stored),searches=0,queries=0;const timers=[];
 const elements=new Map();
 class Element {
  constructor(id=''){this.id=id;this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.innerHTML='';this.className='';this.children=[];this.events={};this.attributes={};this.dataset={};this.firstChild={textContent:''};this.open=false;}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelector(selector){return element(this.id+':'+selector);}
  replaceChildren(...values){this.children=values;}
  append(...values){this.children.push(...values);}
  focus(){}
  closest(selector){return selector==='button'&&this.type==='button'?this:null;}
  async fire(type,event={}){for(const fn of this.events[type]??[])await fn({target:this,currentTarget:this,preventDefault(){},...event});if(this['on'+type])await this['on'+type]({target:this,currentTarget:this,preventDefault(){},...event});}
  async click(){if(this.disabled)return;await this.fire('click');if(this.parent)await this.parent.fire('click',{target:this});}
 }
 function element(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
 element('pages').value='10';
 const form=element('location-form');form.hidden=true;form.elements=Object.fromEntries(['label','lat','lng','adcode','city','coordinateSystem'].map(k=>[k,new Element(k)]));form.elements.coordinateSystem.value='GCJ-02';
 const save=form.querySelector('button[type=submit]');
 const selectors={'.top':element('top'),'.local':element('local'),'footer span':element('footer-span'),'#location-form .fields':element('fields'),'#location-form button[type=submit]':save};
 const document={getElementById:element,querySelector:s=>selectors[s]??element(s),querySelectorAll:()=>[],createElement:()=>new Element()};
 const append=element('address-results').append.bind(element('address-results'));element('address-results').append=(...children)=>{for(const child of children)child.parent=element('address-results');append(...children);};
 const storage={read:()=>structuredClone(saved),write:v=>{write(v);saved=structuredClone(v);}};
 const engine=options=>createMobileApp({...options,clock:()=>now,search:async keyword=>{searches++;return search(keyword);},collect:async()=>{queries++;return collect();}});
 class FakeDate extends Date {static now(){return now;}}
 const context=vm.createContext({document,createMobileApp:engine,storage,randomUUID:()=> 'synthetic-id',codeVersion:'test',getConfig:()=>false,nativeCall:operation=>operation==='locate'?locate():Promise.reject(Error('Unexpected native operation')),calculate,bestCombination,Date:FakeDate,structuredClone,setInterval:fn=>{timers.push(fn);},setTimeout,clearTimeout,FormData:class {constructor(value){this.value=value;}[Symbol.iterator](){return Object.entries(this.value.elements).map(([k,v])=>[k,v.value])[Symbol.iterator]();}}});
 const source=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
 context.loadPage=()=>vm.runInContext(source.split(String.fromCharCode(10)).filter(line=>!line.startsWith('import ')).join(String.fromCharCode(10)),context);
 const entry=await fs.readFile(new URL('../android/mobile/mobile-entry.mjs',import.meta.url),'utf8');
 let app;
 if(desktop){
  app=engine({storage,uuid:()=> 'synthetic-id',codeVersion:'test'});let first=true;
  context.fetch=async(route,options)=>{if(first&&route==='/api/state'){first=false;await initialStateDelay;}try{return {ok:true,json:async()=>app.request(route,options?.body?JSON.parse(options.body):undefined)};}catch(error){return {ok:false,json:async()=>({error:error.message})};}};
  context.loadPage();
 }else await vm.runInContext('(async()=>{'+entry.split(String.fromCharCode(10)).filter(line=>!line.startsWith('import ')).join(String.fromCharCode(10)).replace("await import('/app.js')",'await loadPage()')+'})()',context);
 app??=context.mobileApp;
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};await flush();
 return {element,save,flush,advance:async ms=>{now+=ms;for(const tick of timers)tick();await flush();},state:()=>app.request('/api/state'),counts:()=>({searches,queries}),submit:()=>form.fire('submit'),snapshot:()=>structuredClone(saved),refresh:async()=>{await element('retry-connect').click();await flush();}};
}

test('手机界面：原生定位等待时禁止搜索，定位成功自动保存且不查询',async()=>{
 const position=deferred();const p=await page({locate:()=>position.promise});
 await p.element('edit-location').click();await p.element('locate-once').click();
 assert.equal(p.element('search-address').disabled,true,'定位等待时搜索必须不可点击');
 await p.element('search-address').click();assert.equal(p.counts().searches,0);
 position.resolve(gps);await p.flush();for(let i=0;i<50&&p.element('locate-once').disabled;i++)await new Promise(resolve=>setTimeout(resolve,2));
 assert.match((await p.state()).location.label,/当前位置/);assert.equal(p.counts().queries,0);
 await p.advance(1600);assert.equal(p.element('search-address').disabled,false);
});

test('手机界面：搜索成功可立即选点并保存，冷却只限制再次搜索或定位',async()=>{
 const p=await page();await p.element('edit-location').click();p.element('address-keyword').value='合成测试点';
 await p.element('search-address').click();
 const option=p.element('address-results').children[0];assert.ok(option);
 assert.equal(option.disabled,false,'选择候选地址不应被接口冷却阻塞');
 await option.click();assert.equal(p.save.disabled,false);
 await p.submit();assert.equal((await p.state()).location.label,candidate.label);assert.equal(p.counts().queries,0);
});

function partialSnapshot(id='synthetic-query'){
 const context={queryId:id,locationLabel:'合成位置',pages:10};
 const attempt={status:'partial',generatedAt:'2026-11-07T00:00:00.000Z',context,errors:[{source:'waimai',message:'合成渠道鉴权失败',upstreamCode:4000010}]};
 const report={source:'live',status:'partial',generatedAt:attempt.generatedAt,context,notes:[],matches:[],candidates:[],fullStores:[],ratioStores:[],counts:{confirmed:0,candidatePairs:0,fullStores:0,ratioStores:0}};
 return {version:1,snapshot:{report,attempt}};
}
test('结果提示：黄色提醒与绿色范围默认收起，摘要保留不完整和历史位置风险',async()=>{
 const p=await page({stored:partialSnapshot()});
 assert.match(p.element('attempt-summary').textContent,/部分.*不完整/);
 assert.equal(p.element('attempt-details').open,false);
 assert.equal(p.element('attempt-details').hidden,false);
 assert.equal(p.element('scope-note').open,false);
 assert.match(p.element('scope-summary').textContent,/历史结果/);
 assert.match(p.element('attempt-detail').textContent,/4000010/);
 assert.match(p.element('scope-detail').textContent,/部分名单/);
});


test('结果提示：新查询完全失败保留旧名单时，绿色范围也重新收起',async()=>{
 const stored=partialSnapshot();stored.location=candidate;
 const p=await page({stored});
 p.element('scope-note').open=true;p.element('attempt-details').open=true;
 await p.element('query').click();await p.flush();await p.refresh();
 assert.equal((await p.state()).attempt.status,'blocked');
 assert.equal(p.element('scope-note').open,false,'每次新查询都应重置范围折叠状态，即使没有新名单');
 assert.equal(p.element('attempt-details').hidden,true);
 assert.equal(p.element('attempt-critical').hidden,false);
 assert.match(p.element('attempt-critical').textContent,/查询失败/);
});


test('手机界面：搜索等待时禁止定位和查询，失败后保留已选地址仍可保存',async()=>{
 let requests=0;const response=deferred();const p=await page({search:()=>++requests===1?[candidate]:response.promise});
 await p.element('edit-location').click();p.element('address-keyword').value='合成地址';
 await p.element('search-address').click();await p.element('address-results').children[0].click();await p.advance(1600);
 const pending=p.element('search-address').click();
 assert.equal(p.element('locate-once').disabled,true);assert.equal(p.element('query').disabled,true);assert.equal(p.save.disabled,true);
 response.reject(Error('合成网络失败'));await pending;
 assert.equal(p.save.disabled,false);assert.match(p.element('location-status').textContent,/重新搜索/);
 await p.submit();assert.equal((await p.state()).location.label,candidate.label);
 const restored=await page({stored:p.snapshot()});assert.equal((await restored.state()).location.label,candidate.label);
});

test('手机界面：定位未授权保留旧位置，等待后搜索选点可恢复保存',async()=>{
 const old={...candidate,label:'合成原有地址'};const p=await page({stored:{version:1,location:old},locate:async()=>{throw Error('合成定位未授权');}});
 await p.element('edit-location').click();await p.element('locate-once').click();await p.flush();
 assert.equal((await p.state()).location.label,old.label);assert.match(p.element('location-status').textContent,/未授权/);
 await p.advance(1600);p.element('address-keyword').value='合成附近小区';await p.element('search-address').click();
 await p.element('address-results').children[0].click();await p.submit();assert.equal((await p.state()).location.label,candidate.label);
});

test('手机界面：空搜索或零结果不允许保存，重试成功可立即选点保存',async()=>{
 let results=[];const p=await page({search:async()=>results});await p.element('edit-location').click();
 await p.element('search-address').click();assert.equal(p.save.disabled,true);await p.submit();assert.equal((await p.state()).location,null);
 await p.advance(1600);p.element('address-keyword').value='合成不存在地址';await p.element('search-address').click();
 assert.equal(p.save.disabled,true);assert.match(p.element('location-status').textContent,/没有找到/);
 await p.advance(1600);results=[candidate];await p.element('search-address').click();await p.element('address-results').children[0].click();
 await p.submit();assert.equal((await p.state()).location.label,candidate.label);
});

test('手机界面：保存失败直接显示错误，保留旧位置且可以再次保存',async()=>{
 let fail=true;const old={...candidate,label:'合成原有位置'};const p=await page({stored:{version:1,location:old},write:()=>{if(fail)throw Error('合成磁盘已满');}});
 await p.element('edit-location').click();p.element('address-keyword').value='合成地址';await p.element('search-address').click();
 await p.element('address-results').children[0].click();await p.submit();assert.equal((await p.state()).location.label,old.label);
 assert.match(p.element('message').textContent,/磁盘已满/);assert.equal(p.element('message').hidden,false);assert.equal(p.save.disabled,false);
 fail=false;await p.submit();assert.equal((await p.state()).location.label,candidate.label);
});

test('结果提示：同次查询刷新保留黄色和绿色展开状态',async()=>{
 const p=await page({stored:partialSnapshot()});p.element('attempt-details').open=true;p.element('scope-note').open=true;
 await p.refresh();assert.equal(p.element('attempt-details').open,true);assert.equal(p.element('scope-note').open,true);
});


test('手机界面：操作进度不能替换搜索和自动保存的使用说明',async()=>{
 const p=await page();await p.element('edit-location').click();
 assert.match(p.element('location-help').textContent,/一键获取成功即保存/);
 assert.equal(p.element('location-operation').hidden,true);
});


test('电脑版界面：首次状态读取前不能启动位置操作，连接成功后可搜索',async()=>{
 const gate=deferred();const p=await page({desktop:true,initialStateDelay:gate.promise});
 await p.element('edit-location').click();p.element('address-keyword').value='合成地址';
 await p.element('search-address').click();assert.equal(p.counts().searches,0);
 gate.resolve();await p.flush();await p.element('search-address').click();assert.equal(p.counts().searches,1);
 assert.equal(p.element('locate-once').disabled,false);assert.equal(p.element('edit-location').disabled,false);
});

test('结果提示：新查询进行中展开绿色提示，完成后同次查询继续保持展开',async()=>{
 const stored=partialSnapshot();stored.location=candidate;const collected=deferred();const p=await page({stored,collect:()=>collected.promise});
 p.element('scope-note').open=true;await p.element('query').click();assert.equal(p.element('scope-note').open,false);
 p.element('scope-note').open=true;collected.resolve({source:'live',full:[],ratio:[],coverage:[],errors:[{source:'waimai',message:'合成网络错误'}],channelActivities:{full:[{name:'合成饭店',meituanPoiId:'synthetic-1',source:'xiaochan',rebate:5,minPay:20}],ratio:[]}});
 await p.flush();await p.refresh();assert.equal((await p.state()).attempt.status,'partial');
 assert.equal(p.element('scope-note').open,true,'同次查询完成不能再次重置用户已展开的提示');
});
