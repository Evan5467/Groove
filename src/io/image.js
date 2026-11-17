// Decode, downscale and re-encode as JPEG. Re-encoding also strips metadata (location, camera info).
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const hgt = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hgt);
  ctx.drawImage(bmp, 0, 0, w, hgt);
  bmp.close?.();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('image');
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
