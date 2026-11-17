export const MAX_FILE = 25 * 1024 * 1024;

// Trust the bytes, not the file name or MIME type.
export function sniff(b) {
  if (!(b instanceof Uint8Array) || b.length < 12) return null;
  const at = (i, ...v) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}
