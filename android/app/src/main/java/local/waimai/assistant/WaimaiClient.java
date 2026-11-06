package local.waimai.assistant;
import org.json.*;
import java.net.URLEncoder;
import java.security.*;

final class WaimaiClient {
 private final JSONObject location;private final String city,token;private final PublicKey publicKey;private final PrivateKey privateKey;private int pages=0;final long created=System.currentTimeMillis();
 WaimaiClient(JSONObject location,String token) throws Exception {
  this.location=new JSONObject(location.toString());city=location.optString("city","").trim();this.token=token;
  if(city.isEmpty()||city.length()>40||!Double.isFinite(location.getDouble("lat"))||Math.abs(location.getDouble("lat"))>90||!Double.isFinite(location.getDouble("lng"))||Math.abs(location.getDouble("lng"))>180)throw new IllegalArgumentException("Invalid location");
  JSONObject response=post("https://fz-gateway.waimaimingtang.com/api/api/v2/index/newServiceConfig",new JSONObject().put("json",ProtocolCrypto.aes(new JSONObject().put("city",city).toString(),"jnd674751fh6fkgu",false)).toString(),new JSONObject());
  JSONObject config=new JSONObject(response.getString("body"));if(config.optInt("code")!=1)throw new IllegalArgumentException("Config failed");
  JSONObject keys=new JSONObject(ProtocolCrypto.aes(config.getString("data"),"jnd674751fh6fkgu",true));publicKey=ProtocolCrypto.publicKey(keys.getString("publicKey"));privateKey=ProtocolCrypto.privateKey(keys.getString("privateKey"));
 }
 private JSONObject post(String url,String body,JSONObject extra) throws Exception {
  NetworkPolicy.checkWaimai(url);String timestamp=String.valueOf(System.currentTimeMillis());byte[] bytes=new byte[16];new SecureRandom().nextBytes(bytes);StringBuilder nonce=new StringBuilder();for(byte b:bytes)nonce.append((b&255)%10);
  JSONObject headers=new JSONObject().put("application","overbear_one").put("appversion","1.1.175").put("city",URLEncoder.encode(city,"UTF-8").replace("+","%20")).put("nonce",nonce.toString()).put("timestamp",timestamp).put("sign",ProtocolCrypto.aes(timestamp+nonce,"asdf545asdf4545d",false)).put("content-type","application/json").put("Referer","https://servicewechat.com/wx5762f23d920ad9e5/346/page-frame.html");
  if(!token.isEmpty())headers.put("token",token);java.util.Iterator<String> names=extra.keys();while(names.hasNext()){String n=names.next();headers.put(n,extra.get(n));}
  JSONObject response=Upstream.request(url,"POST",headers,body);if(response.getInt("status")<200||response.getInt("status")>=300)throw new IllegalArgumentException("HTTP failed");return response;
 }
 synchronized JSONObject page(Object cursor) throws Exception {
  if(++pages>20||System.currentTimeMillis()-created>600000)throw new IllegalStateException("Session expired");
  String key=ProtocolCrypto.randomHex();JSONObject params=new JSONObject().put("userLongitude",String.valueOf(location.getDouble("lng"))).put("userLatitude",String.valueOf(location.getDouble("lat"))).put("city",city).put("limit",15).put("sortWay","comprehensive").put("categoryId","").put("shopName","").put("secKillFlag",1).put("signUpFlag",2).put("highRebatesFlag",0).put("noCommentFlag",0).put("takeawayPlatform","").put("userTypes",new JSONArray("[1,2,3]")).put("packageType","").put("scrollPageData",cursor==null?JSONObject.NULL:cursor).put("threeKmFlag","").put("tabType","bwc");
  JSONObject response=post("https://wmapp-api-v2.waimaimingtang.com/api/bwc/waimaimt-web-bwc/shopIndex/getShopList",ProtocolCrypto.aes(params.toString(),key,false),new JSONObject().put("encrypt-key",ProtocolCrypto.wrap(key,publicKey)));
  String text=response.getString("body"),responseKey=response.getJSONObject("headers").optString("encrypt-key");if(!responseKey.isEmpty())text=ProtocolCrypto.aes(text,ProtocolCrypto.unwrap(responseKey,privateKey),true);return new JSONObject(text);
 }
}
