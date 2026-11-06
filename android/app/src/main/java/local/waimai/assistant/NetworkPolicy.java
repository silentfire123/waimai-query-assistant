package local.waimai.assistant;
import java.net.URI;
public final class NetworkPolicy {
 public static void check(String value,String method,String rpc) {
  URI u=URI.create(value);
  if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443)||u.getFragment()!=null)throw new SecurityException("Only exact HTTPS upstreams");
  String host=u.getHost(),p=u.getRawPath();
  if("gw.xiaocantech.com".equals(host)&&"/rpc".equals(p)&&u.getRawQuery()==null&&"POST".equals(method)&&("FusionService.GetFeedPromotions".equals(rpc)||"FusionService.GetMeiTuanPromotions".equals(rpc)||"SilkwormLbsService.Suggestion".equals(rpc)))return;
  if("restapi.amap.com".equals(host)&&"/v3/geocode/regeo".equals(p)&&"GET".equals(method))return;
  throw new SecurityException("Unsupported upstream operation");
 }
 public static void checkWaimai(String value){if(!value.equals("https://fz-gateway.waimaimingtang.com/api/api/v2/index/newServiceConfig")&&!value.equals("https://wmapp-api-v2.waimaimingtang.com/api/bwc/waimaimt-web-bwc/shopIndex/getShopList"))throw new SecurityException("Unsupported waimai operation");}
}
