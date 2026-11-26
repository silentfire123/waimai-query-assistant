import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFile(path.join(root,relative),'utf8');

test('安卓更新入口：启动检查、双按钮弹窗、安装权限和安全 APK URI 均存在',async()=>{
 const [manifest,activity,manager,provider]=await Promise.all([
  read('android/app/src/main/AndroidManifest.xml'),
  read('android/app/src/main/java/local/waimai/assistant/MainActivity.java'),
  read('android/app/src/main/java/local/waimai/assistant/UpdateManager.java'),
  read('android/app/src/main/java/local/waimai/assistant/UpdateProvider.java'),
 ]);
 assert.match(activity,/web\.loadUrl\(ORIGIN\+"\/"\);checkForUpdate\(\)/);
 assert.match(activity,/setNegativeButton\("暂不更新"/);
 assert.match(activity,/setPositiveButton\("立即更新"/);
 assert.match(activity,/Intent\.ACTION_INSTALL_PACKAGE/);
 assert.match(manifest,/REQUEST_INSTALL_PACKAGES/);
 assert.match(manifest,/android:name="\.UpdateProvider"/);
 assert.match(manager,/releases\/latest\/download\/update\.json/);
 assert.match(manager,/versionCode/);
 assert.match(manager,/MessageDigest\.getInstance\("SHA-256"\)/);
 assert.match(manager,/APK 校验失败/);
 assert.match(manager,/release-assets\.githubusercontent\.com/);
 assert.match(provider,/openFile\(Uri uri/);
});
