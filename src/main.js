import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { S, bus, vault, clearMemory, restoreUi } from './state.js';
import { appShell, lockView } from './views.js';
import { closeAllSheets, closeTopSheet, revokeUrls } from './dom.js';
import { cleanupBackups } from './backup.js';
import { stopOcr } from './io/ocr.js';
import { syncReminders } from './io/notify.js';

const root = document.getElementById('app');

bus.render = () => {
  const y = window.scrollY;
  root.replaceChildren(S.ready ? appShell() : lockView());
  window.scrollTo(0, y);
  if (S.ready) queueSync();
};

let syncTimer = 0;
function queueSync(force = false) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { if (S.ready) syncReminders(S, { force }).catch(() => {}); }, 800);
}

bus.lock = () => {
  if (!S.ready) return;
  vault.lock();          // the data key is dropped from memory
  clearMemory();         // so is every decrypted record
  S.ready = false;
  closeAllSheets();
  revokeUrls();
  stopOcr().catch(() => {});
  bus.mode = 'unlock';
  bus.render();
};

bus.afterUnlock = () => { cleanupBackups(); armIdle(); queueSync(true); };

/* auto-lock: when the app is backgrounded, and after 5 idle minutes while open */
let hiddenAt = 0;
let idle = 0;
function armIdle() {
  clearTimeout(idle);
  if (S.ready) idle = setTimeout(() => { if (!bus.picking) bus.lock(); }, 5 * 60 * 1000);
}
document.addEventListener('pointerdown', armIdle, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!S.ready) return;
  if (document.hidden) {
    if (bus.picking) return; // the system file picker briefly backgrounds the app
    hiddenAt = Date.now();
    if (S.settings.autoLockSec === 0) bus.lock();
  } else if (hiddenAt && S.settings.autoLockSec > 0 && Date.now() - hiddenAt >= S.settings.autoLockSec * 1000) {
    bus.lock();
  }
  if (!document.hidden) hiddenAt = 0;
});

(async function boot() {
  restoreUi();
  try { await navigator.storage?.persist?.(); } catch {}
  bus.mode = (await vault.isSetUp()) ? 'unlock' : 'setup';
  bus.render();
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      if (closeTopSheet()) return;
      if (S.ready && (S.nav.view !== 'today' || S.nav.materialId)) { S.nav.materialId = null; S.nav.view = 'today'; bus.render(); }
      else App.minimizeApp();
    });
  } catch { /* running in a plain browser */ }
})();
