package local.waimai.assistant;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

final class Upstream {
 static JSONObject request(String url,String method,JSONObject headers,String body) throws Exception {
  HttpsURLConnection c=(HttpsURLConnection)new URL(url).openConnection();
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(20000);c.setRequestMethod(method);c.setUseCaches(false);
  final long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(35);
  try {
   Iterator<String> names=headers.keys();while(names.hasNext()){String name=names.next(),value=headers.getString(name);if(!name.matches("[A-Za-z0-9-]{1,64}")||value.length()>8192||value.contains("\r")||value.contains("\n")||name.equalsIgnoreCase("host")||name.equalsIgnoreCase("cookie")||name.equalsIgnoreCase("authorization"))throw new SecurityException("Invalid header");c.setRequestProperty(name,value);}
   if(method.equals("POST")){byte[] bytes=body.getBytes(StandardCharsets.UTF_8);if(bytes.length>131072)throw new IOException("Request too large");c.setDoOutput(true);c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}}
   int status=c.getResponseCode();InputStream source=status>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream data=new ByteArrayOutputStream();
   if(source!=null)try(InputStream in=source){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(System.nanoTime()>deadline)throw new IOException("Total request timeout");if(data.size()+n>4*1024*1024)throw new IOException("Response too large");data.write(b,0,n);}}
   JSONObject h=new JSONObject();String encryptKey=c.getHeaderField("encrypt-key");if(encryptKey!=null)h.put("encrypt-key",encryptKey);
   return new JSONObject().put("status",status).put("headers",h).put("body",new String(data.toByteArray(),StandardCharsets.UTF_8));
  } finally {c.disconnect();}
 }
 static JSONObject browserRequest(JSONObject input) throws Exception {
  String url=input.getString("url"),method=input.optString("method","GET");JSONObject headers=input.optJSONObject("headers");if(headers==null)headers=new JSONObject();
  NetworkPolicy.check(url,method,headers.optString("methodname"));
  return request(url,method,headers,input.optString("body",""));
 }
}
