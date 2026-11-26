package local.waimai.assistant;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;

public final class UpdateProvider extends ContentProvider {
 public static final String AUTHORITY="local.waimai.assistant.update";
 private File file(){return UpdateManager.cachedApk(contextOrThrow());}
 private android.content.Context contextOrThrow(){android.content.Context context=getContext();if(context==null)throw new IllegalStateException("Provider is not attached");return context;}
 private boolean valid(Uri uri){return uri!=null&&AUTHORITY.equals(uri.getAuthority())&&"/apk".equals(uri.getPath());}
 @Override public boolean onCreate(){return true;}
 @Override public String getType(Uri uri){return valid(uri)?"application/vnd.android.package-archive":null;}
 @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws java.io.FileNotFoundException{
  if(!valid(uri)||!"r".equals(mode))throw new java.io.FileNotFoundException("Invalid update URI");
  File apk=file();if(apk==null)throw new java.io.FileNotFoundException("No cached update");return ParcelFileDescriptor.open(apk,ParcelFileDescriptor.MODE_READ_ONLY);
 }
 @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sortOrder){
  if(!valid(uri))return null;File apk=file();if(apk==null)return null;
  MatrixCursor cursor=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});cursor.addRow(new Object[]{apk.getName(),apk.length()});return cursor;
 }
 @Override public int delete(Uri uri,String selection,String[] args){return 0;}
 @Override public int update(Uri uri,ContentValues values,String selection,String[] args){return 0;}
 @Override public Uri insert(Uri uri,ContentValues values){return null;}
}
