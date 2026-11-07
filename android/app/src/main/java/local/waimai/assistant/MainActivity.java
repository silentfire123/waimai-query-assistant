package local.waimai.assistant;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private WebView web;private PhoneStore store;private final Handler main=new Handler(Looper.getMainLooper());
 private final ExecutorService worker=Executors.newSingleThreadExecutor();private WaimaiClient wm;private String wmSession;
 private boolean resolvingLocation;private String locationRequest,exportRequest,exportText;private LocationListener locationListener;private final Map<String,Boolean> inFlight=new ConcurrentHashMap<>();
 @Override public void onCreate(Bundle state){super.onCreate(state);store=new PhoneStore(this);
  if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
  if(WebView.getCurrentWebViewPackage()==null){showFatal("未检测到 Android System WebView，请先在系统中安装或启用它。");return;}
  try{int major=Integer.parseInt(WebView.getCurrentWebViewPackage().versionName.split("\\.")[0]);if(major<105){showFatal("请先更新 Android System WebView 或 Chrome 至 105 或更新版本，再打开应用。");return;}}catch(Exception ignored){}
  web=new WebView(this);web.setBackgroundColor(Color.rgb(247,248,244));setContentView(web);
  web.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);}else{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());}return insets;});
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setTextZoom(Math.round(100*getResources().getConfiguration().fontScale));s.setDomStorageEnabled(false);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setGeolocationEnabled(false);s.setSaveFormData(false);s.setCacheMode(WebSettings.LOAD_NO_CACHE);
  CookieManager.getInstance().setAcceptCookie(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);web.addJavascriptInterface(new Bridge(),"AndroidNative");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !trusted(request.getUrl())||!request.getUrl().getPath().equals("/");}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return asset(request.getUrl(),request.getMethod());}
   @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())runOnUiThread(()->showFatal("内置页面加载失败，请重新打开应用或更新 Android System WebView。"));}
  });web.setWebChromeClient(new WebChromeClient(){@Override public void onPermissionRequest(PermissionRequest request){request.deny();}});
  web.loadUrl(ORIGIN+"/");
 }
 private boolean trusted(Uri u){return "https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443);}
 private WebResourceResponse asset(Uri uri,String method){try{
  String name=uri.getPath();if(!trusted(uri)||!"GET".equals(method)||uri.getQuery()!=null||name==null||!name.matches("/[a-zA-Z0-9._-]*")||name.contains(".."))return denied();
  if(name.equals("/"))name="/index.html";String file=name.substring(1),mime=file.endsWith(".html")?"text/html":file.endsWith(".css")?"text/css":file.endsWith(".json")?"application/json":"text/javascript";
  InputStream data=getAssets().open("www/"+file);Map<String,String> headers=new HashMap<>();headers.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","no-store");return new WebResourceResponse(mime,"utf-8",200,"OK",headers,data);
 }catch(Exception e){return denied();}}
 private WebResourceResponse denied(){return new WebResourceResponse("text/plain","utf-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private void showFatal(String message){TextView text=new TextView(this);text.setText(message);text.setTextSize(18);text.setPadding(32,64,32,32);setContentView(text);}
 private void reply(String id,Object value,String error){inFlight.remove(id);main.post(()->{if(web==null||isFinishing())return;try{JSONObject result=new JSONObject().put("ok",error==null);if(error==null)result.put("value",value==null?JSONObject.NULL:value);else result.put("error",error);String js="window.__nativeResult&&window.__nativeResult("+JSONObject.quote(id)+","+result.toString()+");";web.evaluateJavascript(js.replace("\u2028","\\u2028").replace("\u2029","\\u2029"),null);}catch(Exception ignored){}});}
 public final class Bridge {
  @JavascriptInterface public String md5(String value){try{if(value.length()>8192)return "";return ProtocolCrypto.md5(value);}catch(Exception e){return "";}}
  @JavascriptInterface public String uuid(){return UUID.randomUUID().toString();}
  @JavascriptInterface public String config(){try{return store.publicConfig().toString();}catch(Exception e){return "{}";}}
  @JavascriptInterface public String readState(){try{return store.readState();}catch(Exception e){return "{\"version\":-1}";}}
  @JavascriptInterface public String writeState(String text){try{store.writeState(text);return "";}catch(Exception e){return "无法保存手机数据，请检查剩余空间";}}
  @JavascriptInterface public void call(String id,String operation,String json){
   if(id==null||!id.matches("[0-9]{1,12}")||json==null||json.length()>262144||inFlight.size()>=4||inFlight.putIfAbsent(id,true)!=null){return;}
   main.post(()->{if(web==null||!Objects.equals(web.getUrl(),ORIGIN+"/")){reply(id,null,"页面来源不受信任");return;}
    try{JSONObject input=new JSONObject(json);
     if(operation.equals("settings")){settings(id);return;}
     if(operation.equals("locate")){locate(id);return;}
     if(operation.equals("export")){export(id,input.getJSONObject("data"));return;}
     if(!operation.equals("http")&&!operation.equals("wmInit")&&!operation.equals("wmPage")){reply(id,null,"未支持的手机操作");return;}
     worker.execute(()->{try{
      Object value;
      if(operation.equals("http")){value=Upstream.browserRequest(input);}
      else if(operation.equals("wmInit")){wm=null;wmSession=null;WaimaiClient next=new WaimaiClient(input.getJSONObject("location"),store.secrets().optString("WM_TOKEN"));wm=next;wmSession=UUID.randomUUID().toString();value=wmSession;}
      else{if(wm==null||!Objects.equals(wmSession,input.getString("session")))throw new SecurityException();value=wm.page(input.opt("cursor"));}
      reply(id,value,null);
     }catch(Exception error){reply(id,null,"手机联网、解密或鉴权失败，请检查网络及手机凭证设置；不会自动重试");}});
    }catch(Exception error){reply(id,null,"手机操作参数无效");}
   });
  }
 }
 private EditText field(LinearLayout layout,String label,String value,boolean password){TextView title=new TextView(this);title.setText(label);layout.addView(title);EditText edit=new EditText(this);edit.setSingleLine(true);edit.setText(value);edit.setInputType(password?android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD:android.text.InputType.TYPE_CLASS_TEXT);edit.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);layout.addView(edit);return edit;}
 private void settings(String id){
  final JSONObject saved;try{saved=store.secrets();}catch(Exception error){new AlertDialog.Builder(this).setTitle("凭证无法解密").setMessage("手机密钥不可用。可清除应用数据后重新配置；这会删除已保存位置、名单和凭证。").setPositiveButton("知道了",(d,w)->reply(id,null,"凭证未修改")).setOnCancelListener(d->reply(id,null,"已取消")).show();return;}
  ScrollView scroll=new ScrollView(this);LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);int pad=(int)(20*getResources().getDisplayMetrics().density);layout.setPadding(pad,pad,pad,pad);scroll.addView(layout);
  TextView note=new TextView(this);note.setText("可留空使用匿名查询。仅填写本人合法持有的凭证，不会读取微信或电脑配置。凭证使用手机密钥加密保存，不随诊断导出。空白保留旧值，勾选下方可删除全部。\n查询请保持应用在前台，退出或被系统回收可能中断。首次运行建议更新 Android System WebView。");layout.addView(note);
  EditText silk=field(layout,"小蚕 Silk ID（成对填写）",saved.optString("XC_SILK_ID",""),false),user=field(layout,"小蚕 User ID",saved.optString("XC_USER_ID",""),false),token=field(layout,"歪麦 Token"+(saved.optString("WM_TOKEN").isEmpty()?"（未设置）":"（已保存，空白保留）"),"",true);
  CheckBox clear=new CheckBox(this);clear.setText("删除全部已保存凭证，恢复匿名模式");layout.addView(clear);
  AlertDialog dialog=new AlertDialog.Builder(this).setTitle("手机凭证设置").setView(scroll).setPositiveButton("保存",null).setNegativeButton("取消",(d,w)->reply(id,null,"已取消，凭证未修改")).setOnCancelListener(d->reply(id,null,"已取消，凭证未修改")).create();dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{
   JSONObject next=new JSONObject();if(!clear.isChecked()){
    String a=silk.getText().toString().trim(),b=user.getText().toString().trim();if(a.isEmpty())a="0";if(b.isEmpty())b="0";
    if(!a.matches("0|[1-9][0-9]{0,11}")||!b.matches("0|[1-9][0-9]{0,11}")||a.equals("0")!=b.equals("0"))throw new IllegalArgumentException("小蚕 ID 须为成对的最多 12 位数字；留空即匿名");
    String t=token.getText().toString().trim();if(t.isEmpty())t=saved.optString("WM_TOKEN");
    if(!t.isEmpty()&&!t.matches("[!-~]{1,4096}"))throw new IllegalArgumentException("凭证格式无效，请只填写凭证值，不要粘贴完整请求");
    next.put("XC_SILK_ID",a).put("XC_USER_ID",b).put("WM_TOKEN",t);
   }store.saveSecrets(next);wm=null;wmSession=null;token.setText("");dialog.dismiss();Toast.makeText(this,"已保存到手机，下次查询生效",Toast.LENGTH_LONG).show();reply(id,true,null);
  }catch(IllegalArgumentException error){Toast.makeText(this,error.getMessage(),Toast.LENGTH_LONG).show();}catch(Exception error){Toast.makeText(this,"保存失败，请检查手机剩余空间",Toast.LENGTH_LONG).show();}}));dialog.show();
 }
 private void locate(String id){if(locationRequest!=null){reply(id,null,"定位已经在进行中");return;}locationRequest=id;
  if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},11);return;}startLocation();}
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==11){if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)startLocation();else finishLocation(null,"定位未授权，请搜索地址选点");}}
 private void startLocation(){
  final String requestedId=locationRequest;LocationManager manager=(LocationManager)getSystemService(LOCATION_SERVICE);
  try{
   resolvingLocation=false;
   locationListener=new LocationListener(){
    @Override public void onLocationChanged(Location location){
     if(!Objects.equals(locationRequest,requestedId)||resolvingLocation)return;
     // Ignore stale/coarse fixes: a nearby address must not replace the actual current point.
     if(!location.hasAccuracy()||location.getAccuracy()>100||SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos()>TimeUnit.SECONDS.toNanos(30))return;
     resolvingLocation=true;stopLocationUpdates();resolveAddress(requestedId,location);
    }
    @Override public void onProviderDisabled(String p){}
    @Override public void onProviderEnabled(String p){}
    @Override public void onStatusChanged(String p,int status,Bundle b){}
   };
   boolean requested=false;
   for(String provider:new String[]{LocationManager.NETWORK_PROVIDER,LocationManager.GPS_PROVIDER}){
    if(provider.equals(LocationManager.GPS_PROVIDER)&&checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)continue;
    if(manager.isProviderEnabled(provider)){manager.requestLocationUpdates(provider,0,0,locationListener,Looper.getMainLooper());requested=true;}
   }
   if(!requested){finishLocation(null,"请开启系统位置服务，或搜索地址选点");return;}
   main.postDelayed(()->{if(Objects.equals(locationRequest,requestedId))finishLocation(null,"定位或地址识别超时，请检查精确定位权限，或搜索附近地址");},30000);
  }catch(Exception e){finishLocation(null,"定位不可用，请搜索地址选点");}
 }
 private void resolveAddress(String requestId,Location location){
  if(!Geocoder.isPresent()){completeAddress(requestId,null,"手机系统没有可用的地址识别服务，请搜索附近地址");return;}
  Geocoder geocoder=new Geocoder(this,Locale.SIMPLIFIED_CHINESE);
  if(Build.VERSION.SDK_INT>=33){
   try{geocoder.getFromLocation(location.getLatitude(),location.getLongitude(),1,new Geocoder.GeocodeListener(){
    @Override public void onGeocode(List<Address> results){addressResult(requestId,location,results);}
    @Override public void onError(String error){completeAddress(requestId,null,"当前位置地址识别失败，请搜索附近地址");}
   });}catch(Exception e){completeAddress(requestId,null,"当前位置地址识别失败，请搜索附近地址");}
  }else{
   worker.execute(()->{try{addressResult(requestId,location,geocoder.getFromLocation(location.getLatitude(),location.getLongitude(),1));}catch(Exception e){completeAddress(requestId,null,"当前位置地址识别失败，请搜索附近地址");}});
  }
 }
 private void addressResult(String requestId,Location location,List<Address> results){
  try{
   if(results==null||results.isEmpty())throw new IOException();
   Address address=results.get(0);String line=address.getMaxAddressLineIndex()>=0?address.getAddressLine(0):null;
   String city=address.getLocality();if(city==null||city.trim().isEmpty())city=address.getSubAdminArea();
   if(city==null||city.trim().isEmpty())city=address.getAdminArea();
   String text=line==null?"":line.trim();
   if(text.isEmpty()){
    LinkedHashSet<String> parts=new LinkedHashSet<>();
    for(String part:new String[]{address.getAdminArea(),city,address.getSubLocality(),address.getThoroughfare(),address.getFeatureName()})if(part!=null&&!part.trim().isEmpty())parts.add(part.trim());
    text=String.join(" ",parts);
   }else if(city!=null&&!text.contains(city))text=city+" "+text;
   if(text.length()<2)throw new IOException();
   if(text.length()>80)text=text.substring(0,80);
   completeAddress(requestId,new JSONObject().put("lat",location.getLatitude()).put("lng",location.getLongitude()).put("address",text).put("city",city==null?"":city),null);
  }catch(Exception e){completeAddress(requestId,null,"手机系统未能识别当前位置地址，请搜索附近地址");}
 }
 private void completeAddress(String requestId,JSONObject value,String error){main.post(()->{if(Objects.equals(locationRequest,requestId))finishLocation(value,error);});}
 private void stopLocationUpdates(){if(locationListener!=null){try{((LocationManager)getSystemService(LOCATION_SERVICE)).removeUpdates(locationListener);}catch(Exception ignored){}locationListener=null;}}
 private void finishLocation(JSONObject value,String error){String id=locationRequest;locationRequest=null;resolvingLocation=false;stopLocationUpdates();if(id!=null)reply(id,value,error);}
 private void export(String id,JSONObject data){if(exportRequest!=null){reply(id,null,"文件保存已在进行中");return;}exportRequest=id;exportText=data.toString();Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");intent.putExtra(Intent.EXTRA_TITLE,"waimai-diagnostic.json");try{startActivityForResult(intent,12);}catch(Exception e){exportRequest=null;exportText=null;reply(id,null,"系统没有可用的文件保存程序");}}
 @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);if(request==12&&exportRequest!=null){String id=exportRequest,text=exportText;exportRequest=null;exportText=null;if(result!=RESULT_OK||intent==null||intent.getData()==null){reply(id,null,"已取消保存");return;}Uri uri=intent.getData();worker.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));reply(id,true,null);}catch(Exception e){reply(id,null,"文件保存失败，请重新选择位置");}});}}
 @Override public void onBackPressed(){handleBack();}
 private void handleBack(){if(web==null){moveTaskToBack(true);return;}web.evaluateJavascript("(()=>{const f=document.getElementById('location-form');if(f&&!f.hidden){f.hidden=true;return true;}return false;})()",closed->{if("true".equals(closed))return;new AlertDialog.Builder(this).setMessage("返回桌面？进行中的查询可能被系统中断，已保存的结果保留。").setPositiveButton("返回桌面",(d,w)->moveTaskToBack(true)).setNegativeButton("留在应用",null).show();});}
 @Override protected void onDestroy(){finishLocation(null,"应用已关闭");worker.shutdownNow();if(web!=null){web.removeJavascriptInterface("AndroidNative");web.destroy();web=null;}super.onDestroy();}
}
