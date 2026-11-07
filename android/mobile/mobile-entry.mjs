import {createMobileApp} from './api-engine.mjs';
import {storage,randomUUID,nativeCall,getConfig} from './platform.mjs';
import {codeVersion} from './version.mjs';
try {
 globalThis.mobileApp=createMobileApp({storage,uuid:randomUUID,codeVersion,config:()=>({hasWmToken:!!getConfig('HAS_WM_TOKEN')})});
 globalThis.mobileApp.locate=()=>nativeCall('locate');
 globalThis.mobileApp.exportDiagnostic=data=>nativeCall('export',{data});
 document.getElementById('import-location').hidden=true;
 const settings=document.createElement('button');settings.className='text-button';settings.textContent='手机设置';settings.type='button';settings.onclick=async()=>{if(globalThis.mobileApp.isBusy()){document.getElementById('message').hidden=false;document.getElementById('message').textContent='正在查询，请结束后修改凭证';return;}try{await nativeCall('settings');}catch(error){document.getElementById('message').hidden=false;document.getElementById('message').textContent=error.message;}};document.querySelector('.top').append(settings);
 document.querySelector('.local').textContent='手机独立版';
 document.getElementById('message').textContent='正在读取手机本地数据…';
 document.querySelector('footer span').textContent='位置与结果仅保存在本机 · 联网查询 · 不自动下单';
 document.querySelector('#location-form .form-help').textContent='一键获取成功即保存；也可搜索附近小区或道路，选中后保存。不需要地图 Key 或手填坐标。';
 document.querySelector('#location-form .fields').hidden=true;
 const saveLocation=document.querySelector('#location-form button[type=submit]');saveLocation.textContent='保存所选地址';saveLocation.disabled=true;
 document.getElementById('address-results').addEventListener('click',event=>{if(event.target.closest('button'))saveLocation.disabled=false;});
 document.getElementById('search-address').addEventListener('click',()=>{saveLocation.disabled=true;});
 await import('/app.js');
} catch(error) {const message=document.getElementById('message');message.hidden=false;message.textContent='手机初始化失败：'+error.message+'。请重新打开应用；若缓存损坏，可在安卓应用设置中清除数据（会删除位置、名单和凭证）。';}
