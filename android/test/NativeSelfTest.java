import local.waimai.assistant.ProtocolCrypto;
import local.waimai.assistant.NetworkPolicy;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
public class NativeSelfTest {
 static void check(boolean value,String label){if(!value)throw new AssertionError(label);System.out.println("PASS "+label);}
 public static void main(String[] args) throws Exception {
  Properties p=new Properties();try(InputStream in=Files.newInputStream(Paths.get(args[0]))){p.load(in);}
  String text=new String(Base64.getDecoder().decode(p.getProperty("text")),StandardCharsets.UTF_8),key=p.getProperty("key");
  check(ProtocolCrypto.md5("abc").equals("900150983cd24fb0d6963f7d28e17f72"),"MD5 header signature");
  check(ProtocolCrypto.aes(text,key,false).equals(p.getProperty("cipher")),"AES Java encrypt matches Node");
  check(ProtocolCrypto.aes(p.getProperty("cipher"),key,true).equals(text),"AES Java decrypt matches Node");
  check(ProtocolCrypto.unwrap(p.getProperty("wrapped"),ProtocolCrypto.privateKey(p.getProperty("private"))).equals(key),"RSA Java unwraps Node protocol key");
  Files.write(Paths.get(args[1]),ProtocolCrypto.wrap(key,ProtocolCrypto.publicKey(p.getProperty("public"))).getBytes(StandardCharsets.UTF_8));
  NetworkPolicy.check("https://gw.xiaocantech.com/rpc","POST","FusionService.GetFeedPromotions");NetworkPolicy.check("https://gw.xiaocantech.com/rpc","POST","FusionService.GetMeiTuanPromotions");NetworkPolicy.check("https://gw.xiaocantech.com/rpc","POST","SilkwormLbsService.Suggestion");NetworkPolicy.check("https://restapi.amap.com/v3/geocode/regeo?key=test","GET","");
  check(true,"exact read-only upstream paths allowed");
  for(String url:new String[]{"http://gw.xiaocantech.com/rpc","https://gw.xiaocantech.com.evil.test/rpc","https://gw.xiaocantech.com@evil.test/rpc","https://gw.xiaocantech.com:444/rpc","https://gw.xiaocantech.com/rpc/../rpc","https://gw.xiaocantech.com/rpc?x=1","file:///data/data/private","https://127.0.0.1/rpc","https://gw.xiaocantech.com/rpc#fragment"}){boolean blocked=false;try{NetworkPolicy.check(url,"POST","FusionService.GetFeedPromotions");}catch(Exception e){blocked=true;}check(blocked,"blocked URL "+url);}
  boolean blocked=false;try{NetworkPolicy.check("https://gw.xiaocantech.com/rpc","POST","CreateOrder");}catch(Exception e){blocked=true;}check(blocked,"order/other RPC methods blocked");
 }
}
