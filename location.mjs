import {getConfig,fetchUpstream as fetch} from './platform.mjs';
// 浏览器 Geolocation 返回 WGS84；地址搜索与活动查询使用 GCJ-02。
export function toGcj02(lat,lng) {
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('无效坐标');
 if(lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271)return {lat,lng};
 const x=lng-105,y=lat-35,pi=Math.PI;
 let dLat=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
 dLat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
 dLat+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;
 dLat+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
 let dLng=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
 dLng+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
 dLng+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;
 dLng+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
 const rad=lat*pi/180, magic=1-0.00669342162296594323*Math.sin(rad)**2;
 dLat=dLat*180/(6378245*(1-0.00669342162296594323)/(magic*Math.sqrt(magic))*pi);
 dLng=dLng*180/(6378245/Math.sqrt(magic)*Math.cos(rad)*pi);
 return {lat:lat+dLat,lng:lng+dLng};
}
export async function reverseLocation(input,{fetchImpl=fetch,key=getConfig('AMAP_KEY')}={}) {
 const p=toGcj02(input.lat,input.lng);
 if(!key)throw Object.assign(Error('已获取坐标；自动地址核对需在服务端配置 AMAP_KEY。也可搜索地址选点，查询尚未开始。'),{status:503});
 const url=new URL('https://restapi.amap.com/v3/geocode/regeo');url.search=new URLSearchParams({key,location:p.lng+','+p.lat,extensions:'base',output:'JSON'});
 const res=await fetchImpl(url,{signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('地址解析服务不可用');
 const j=await res.json();if(j.status!=='1'||!j.regeocode?.addressComponent)throw Error('地址解析失败');
 const a=j.regeocode.addressComponent;
 const city=typeof a.city==='string'&&a.city?a.city:a.province;
 if(typeof j.regeocode.formatted_address!=='string'||!j.regeocode.formatted_address.trim()||typeof a.adcode!=='string'||!/^[1-9][0-9]{5}$/.test(a.adcode)||typeof city!=='string'||!city.trim())throw Object.assign(Error('当前位置未取得完整地址，请搜索地址选点纠正'),{status:502});
 return {...p,label:String(j.regeocode.formatted_address).slice(0,60),adcode:Number(a.adcode),city:city.slice(0,40),coordinateSystem:'GCJ-02'};
}
