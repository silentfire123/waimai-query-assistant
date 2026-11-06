package local.waimai.assistant;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

// These legacy algorithms implement the upstream wire protocol only, not local storage.
public final class ProtocolCrypto {
 public static String md5(String value) throws Exception {byte[] d=MessageDigest.getInstance("MD5").digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte v:d)b.append(String.format("%02x",v&255));return b.toString();}
 public static String aes(String value,String key,boolean decrypt) throws Exception {
  byte[] k=key.getBytes(StandardCharsets.UTF_8);if(k.length!=16&&k.length!=24&&k.length!=32)throw new IllegalArgumentException("AES key length");
  Cipher c=Cipher.getInstance("AES/ECB/PKCS5Padding");c.init(decrypt?Cipher.DECRYPT_MODE:Cipher.ENCRYPT_MODE,new SecretKeySpec(k,"AES"));
  byte[] out=c.doFinal(decrypt?Base64.getDecoder().decode(value):value.getBytes(StandardCharsets.UTF_8));return decrypt?new String(out,StandardCharsets.UTF_8):Base64.getEncoder().encodeToString(out);
 }
 private static byte[] der(String text){return Base64.getDecoder().decode(text.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", ""));}
 public static PublicKey publicKey(String value) throws Exception {return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der(value)));}
 public static PrivateKey privateKey(String value) throws Exception {return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der(value)));}
 public static String wrap(String key,PublicKey publicKey) throws Exception {Cipher c=Cipher.getInstance("RSA/ECB/PKCS1Padding");c.init(Cipher.ENCRYPT_MODE,publicKey);return Base64.getEncoder().encodeToString(c.doFinal(Base64.getEncoder().encode(key.getBytes(StandardCharsets.UTF_8))));}
 public static String unwrap(String value,PrivateKey privateKey) throws Exception {Cipher c=Cipher.getInstance("RSA/ECB/PKCS1Padding");c.init(Cipher.DECRYPT_MODE,privateKey);String k=new String(Base64.getDecoder().decode(c.doFinal(Base64.getDecoder().decode(value))),StandardCharsets.UTF_8);if(!k.matches("[ -~]{16}|[ -~]{24}|[ -~]{32}"))throw new IllegalArgumentException("Response key");return k;}
 public static String randomHex(){byte[] bytes=new byte[16];new SecureRandom().nextBytes(bytes);StringBuilder b=new StringBuilder();for(byte v:bytes)b.append(String.format("%02x",v&255));return b.toString();}
}
