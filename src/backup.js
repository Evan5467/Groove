// Hands the encrypted backup to the system share sheet (Drive, WhatsApp, Files...).
// The file contains ciphertext only, but it is still removed from app cache on the next unlock.
import { Capacitor } from '@capacitor/core';
import { todayISO } from './core/util.js';

const PREFIX = 'tempo-backup-';

export async function shareBackup(json) {
  const name = `${PREFIX}${todayISO()}.json`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: 'Tempo backup', url: uri });
  } else {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.href = url; // eslint-disable-line -- local blob URL we just made, not user input
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export async function cleanupBackups() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    for (const f of files) if (String(f.name).startsWith(PREFIX)) await Filesystem.deleteFile({ path: f.name, directory: Directory.Cache });
  } catch { /* nothing to clean */ }
}
