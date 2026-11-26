package local.waimai.assistant;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;

final class UpdateManager {
 static final String REPOSITORY="silentfire123/waimai-query-assistant";
 private static final String MANIFEST="https://github.com/"+REPOSITORY+"/releases/latest/download/update.json";
 private static final String APK_PREFIX="waimai-assistant-";
 private static final int MAX_METADATA=2*1024*1024;
 private static final int MAX_APK=100*1024*1024;

 interface Callback { void found(UpdateInfo info); void failed(String message); }
 interface DownloadCallback { void completed(File apk); void failed(String message); }

 static final class UpdateInfo {
  final String versionName,title,notes,downloadUrl,sha256,apkName;
  UpdateInfo(String versionName,String title,String notes,String downloadUrl,String sha256,String apkName){
   this.versionName=versionName;this.title=title;this.notes=notes;this.downloadUrl=downloadUrl;this.sha256=sha256;this.apkName=apkName;
  }
 }

 private UpdateManager(){}

 static void check(Context context,Callback callback){
  new Thread(()->{
   try{
    JSONObject manifest=getJson(MANIFEST,"application/json");
    UpdateInfo info=parseManifest(context,manifest);
    if(info==null){callback.failed("没有找到可安装的 APK 更新");return;}
    callback.found(info);
   }catch(Exception e){callback.failed("版本检查失败");}
  },"waimai-update-check").start();
 }

 static void download(Context context,UpdateInfo info,DownloadCallback callback){
  new Thread(()->{
   File part=new File(context.getCacheDir(),"waimai-update.apk.part");
   File target=new File(context.getCacheDir(),"waimai-update.apk");
   try{
    if(part.exists()&&!part.delete())throw new IOException("无法清理临时更新文件");
    String digest=downloadFile(info.downloadUrl,part);
    if(!info.sha256.equalsIgnoreCase(digest))throw new IOException("APK 校验失败");
    if(target.exists()&&!target.delete())throw new IOException("无法替换旧更新文件");
    if(!part.renameTo(target))throw new IOException("无法保存更新文件");
    callback.completed(target);
   }catch(Exception e){if(part.exists())part.delete();callback.failed(e.getMessage()==null?"更新下载失败":e.getMessage());}
  },"waimai-update-download").start();
 }

 static File cachedApk(Context context){
  File file=new File(context.getCacheDir(),"waimai-update.apk");
  return file.isFile()&&file.length()>0?file:null;
 }

 private static UpdateInfo parseManifest(Context context,JSONObject manifest)throws Exception{
  String version=normalizeVersion(manifest.optString("versionName","").trim());
  long remoteCode=manifest.optLong("versionCode",-1);
  if(version==null||remoteCode<1)return null;
  PackageInfo current=context.getPackageManager().getPackageInfo(context.getPackageName(),0);
  long currentCode=Build.VERSION.SDK_INT>=28?current.getLongVersionCode():current.versionCode;
  if(remoteCode<=currentCode||compareVersions(version,current.versionName)<=0)return null;
  String apkName=manifest.optString("apkName",APK_PREFIX+version+".apk").trim();
  if(!apkName.matches("waimai-assistant-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")||!apkName.equals(APK_PREFIX+version+".apk"))return null;
  String sha=normalizeDigest(manifest.optString("sha256",null));
  if(sha==null)return null;
  String url="https://github.com/"+REPOSITORY+"/releases/latest/download/"+apkName;
  String title=manifest.optString("title","").trim();
  if(title.isEmpty())title="版本 "+version;
  String notes=manifest.optString("notes","").trim();
  if(notes.isEmpty())notes="本次发布未提供更新说明。";
  if(notes.length()>8000)notes=notes.substring(0,8000)+"\n…";
  return new UpdateInfo(version,title,notes,url,sha,apkName);
 }

 private static JSONObject getJson(String url,String accept)throws Exception{return new JSONObject(getText(url,accept));}

 private static String getText(String url,String accept)throws Exception{
  HttpsURLConnection connection=open(url,"GET",accept);
  try{return readText(connection,MAX_METADATA);}finally{connection.disconnect();}
 }

 private static HttpsURLConnection open(String url,String method,String accept)throws Exception{
  String current=url;
  for(int attempt=0;attempt<4;attempt++){
    if(!allowedDownloadUrl(current)&&!current.equals(MANIFEST))throw new SecurityException("不受支持的更新地址");
   HttpsURLConnection c=(HttpsURLConnection)new URL(current).openConnection();
   c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(20000);c.setRequestMethod(method);c.setUseCaches(false);
   c.setRequestProperty("Accept",accept);c.setRequestProperty("User-Agent","waimai-query-assistant-update");
   int status=c.getResponseCode();
   if(status>=300&&status<400){String location=c.getHeaderField("Location");c.disconnect();if(location==null)throw new IOException("更新地址重定向无效");current=new URL(new URL(current),location).toString();continue;}
   if(status<200||status>=300){c.disconnect();throw new IOException("更新服务返回 HTTP "+status);}
   return c;
  }
  throw new IOException("更新地址重定向过多");
 }

 private static String readText(HttpsURLConnection c,int max)throws Exception{
  InputStream source=c.getInputStream();ByteArrayOutputStream data=new ByteArrayOutputStream();
  try(InputStream in=source){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(data.size()+n>max)throw new IOException("更新信息过大");data.write(buffer,0,n);}}
  return new String(data.toByteArray(),StandardCharsets.UTF_8);
 }

 private static String downloadFile(String url,File target)throws Exception{
  HttpsURLConnection c=open(url,"GET","application/octet-stream");MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0;
  try(InputStream in=c.getInputStream();OutputStream out=new BufferedOutputStream(new FileOutputStream(target))){
   byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){total+=n;if(total>MAX_APK)throw new IOException("APK 文件过大");digest.update(buffer,0,n);out.write(buffer,0,n);}out.flush();
  }finally{c.disconnect();}
  return hex(digest.digest());
 }

 private static String normalizeDigest(String value){
  if(value==null)return null;String text=value.trim().toLowerCase(Locale.ROOT);if(text.startsWith("sha256:"))text=text.substring(7);return text.matches("[0-9a-f]{64}")?text:null;
 }

 private static String normalizeVersion(String value){
  if(value==null)return null;String text=value.trim();if(text.startsWith("v")||text.startsWith("V"))text=text.substring(1);return text.matches("[0-9]+\\.[0-9]+\\.[0-9]+")?text:null;
 }

 private static int compareVersions(String left,String right){
  String a=normalizeVersion(left),b=normalizeVersion(right);if(a==null||b==null)return 0;String[] x=a.split("\\."),y=b.split("\\.");for(int i=0;i<3;i++){int n=Integer.parseInt(x[i]),m=Integer.parseInt(y[i]);if(n!=m)return n<m?-1:1;}return 0;
 }

 static boolean allowedDownloadUrl(String value){
  try{URL url=new URL(value);String host=url.getHost();boolean cdn=host.equalsIgnoreCase("objects.githubusercontent.com")||host.equalsIgnoreCase("release-assets.githubusercontent.com")||host.equalsIgnoreCase("github-releases.githubusercontent.com");return "https".equalsIgnoreCase(url.getProtocol())&&(host.equalsIgnoreCase("github.com")||cdn)&&url.getUserInfo()==null&&(url.getPort()==-1||url.getPort()==443)&&(cdn||url.getQuery()==null)&&url.getRef()==null;}catch(Exception e){return false;}
 }

 private static String hex(byte[] bytes){StringBuilder out=new StringBuilder(bytes.length*2);for(byte b:bytes)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
}
