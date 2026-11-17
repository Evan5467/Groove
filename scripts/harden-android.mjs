// Run after `npx cap add android`. Tightens the generated Android project:
//  - no Android cloud/adb backups of app data
//  - no cleartext (http) traffic
//  - FLAG_SECURE: blocks screenshots, screen recording and the recents-screen thumbnail
//    (set SECURE_WINDOW=false to allow screenshots of your own plan)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(manifestPath)) { console.error('Run "npx cap add android" first.'); process.exit(1); }

let xml = readFileSync(manifestPath, 'utf8');
const setAttr = (name, value) => {
  const re = new RegExp(`android:${name}="[^"]*"`);
  xml = re.test(xml) ? xml.replace(re, `android:${name}="${value}"`) : xml.replace('<application', `<application\n        android:${name}="${value}"`);
};
setAttr('allowBackup', 'false');
setAttr('usesCleartextTraffic', 'false');
setAttr('fullBackupContent', 'false');
for (const perm of ['android.permission.POST_NOTIFICATIONS']) {
  if (!xml.includes(perm)) xml = xml.replace('</manifest>', `    <uses-permission android:name="${perm}" />\n</manifest>`);
}
writeFileSync(manifestPath, xml);

if (process.env.SECURE_WINDOW !== 'false') {
  const walk = d => readdirSync(d).flatMap(e => { const p = join(d, e); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const file = walk('android/app/src/main/java').find(p => p.endsWith('MainActivity.java'));
  if (!file) { console.error('MainActivity.java not found'); process.exit(1); }
  const pkg = /^package\s+([\w.]+);/m.exec(readFileSync(file, 'utf8'))[1];
  writeFileSync(file, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
`);
}
console.log('Android project hardened.');
