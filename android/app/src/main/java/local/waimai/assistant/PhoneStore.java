package local.waimai.assistant;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

final class PhoneStore {
 private final Context context;
 PhoneStore(Context context){this.context=context;}
 private byte[] read(String name) throws Exception {AtomicFile f=new AtomicFile(new File(context.getFilesDir(),name));try{return f.readFully();}catch(FileNotFoundException e){return null;}}
 private void write(String name,byte[] bytes) throws Exception {AtomicFile f=new AtomicFile(new File(context.getFilesDir(),name));FileOutputStream stream=null;try{stream=f.startWrite();stream.write(bytes);f.finishWrite(stream);}catch(Exception e){if(stream!=null)f.failWrite(stream);throw e;}}
 synchronized String readState() throws Exception {byte[] bytes=read("state.json");if(bytes==null)return "{}";String text=new String(bytes,StandardCharsets.UTF_8);new JSONObject(text);return text;}
 synchronized void writeState(String text) throws Exception {if(text.getBytes(StandardCharsets.UTF_8).length>12*1024*1024)throw new IOException("State too large");new JSONObject(text);write("state.json",text.getBytes(StandardCharsets.UTF_8));}
 private SecretKey key() throws Exception {KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);String alias="waimai-phone-credentials-v1";if(ks.containsAlias(alias))return (SecretKey)ks.getKey(alias,null);KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return gen.generateKey();}
 synchronized JSONObject secrets() throws Exception {byte[] bytes=read("credentials.bin");if(bytes==null)return new JSONObject();if(bytes.length<29)throw new IOException("Invalid credentials");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,bytes,0,12));return new JSONObject(new String(c.doFinal(bytes,12,bytes.length-12),StandardCharsets.UTF_8));}
 synchronized void saveSecrets(JSONObject value) throws Exception {Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] iv=c.getIV(),body=c.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(iv);out.write(body);write("credentials.bin",out.toByteArray());}
 synchronized JSONObject publicConfig() throws Exception {JSONObject s=secrets(),out=new JSONObject();out.put("XC_SILK_ID",s.optString("XC_SILK_ID","0"));out.put("XC_USER_ID",s.optString("XC_USER_ID","0"));out.put("HAS_WM_TOKEN",!s.optString("WM_TOKEN").isEmpty());out.put("AMAP_KEY",s.optString("AMAP_KEY").isEmpty()?JSONObject.NULL:"phone-key");return out;}
}
