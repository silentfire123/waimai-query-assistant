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
  const post=async(url,body,extra={})=>{const res=await fetchImpl(url,{method:'POST',headers:{...headers(),...extra},body,signal:AbortSignal.timeout(12000)});if(!res.ok)throw Object.assign(Error('歪麦 HTTP '+res.status),{httpStatus:res.status});return res;};
  const configRes=await post('https://fz-gateway.waimaimingtang.com/api/api/v2/index/newServiceConfig',JSON.stringify({json:aes(JSON.stringify({city}),'jnd674751fh6fkgu')}));
  const config=await configRes.json();if(config.code!==1||typeof config.data!=='string')throw Error('歪麦配置失败');
  const keys=JSON.parse(aes(config.data,'jnd674751fh6fkgu',true));
  const publicKey=crypto.createPublicKey(pem(keys.publicKey,'PUBLIC')), privateKey=crypto.createPrivateKey(pem(keys.privateKey,'PRIVATE'));
  let pages=0;
  return async scrollPageData=>{
    if(++pages>(token?20:2))throw Error('歪麦匿名会话最多两页');
    const key=crypto.randomBytes(16).toString('hex');
    const params={userLongitude:String(location.lng),userLatitude:String(location.lat),city,limit:15,sortWay:'comprehensive',categoryId:'',shopName:'',secKillFlag:1,signUpFlag:2,highRebatesFlag:0,noCommentFlag:0,takeawayPlatform:'meituan',userTypes:[1,2,3],packageType:'',scrollPageData,threeKmFlag:'',tabType:'bwc'};
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
