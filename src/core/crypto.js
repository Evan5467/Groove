// Web Crypto only. No custom cryptography.
//  passcode --PBKDF2-SHA256 (600k)--> KEK --AES-GCM--> wraps a random 256-bit data key (DEK)
//  DEK --AES-GCM (fresh 96-bit IV, AAD = record key)--> every record and file

const te = new TextEncoder();
export const ITER = 600_000;

export const randBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// non-extractable: JavaScript can use the key but can never read its bytes back
export const importDek = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

export async function seal(key, bytes, aad) {
  const iv = randBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, bytes)
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function open(key, packed, aad) {
  if (!(packed instanceof Uint8Array) || packed.length < 29) throw new Error('bad data');
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.subarray(0, 12), additionalData: te.encode(aad) },
      key,
      packed.subarray(12)
    )
  );
}

const WEAK = new Set(['password', '12345678', '123456789', '11111111', 'qwertyui', 'iloveyou', 'abcdefgh', 'password1']);
export function passIssue(pass) {
  if (typeof pass !== 'string' || pass.length < 8) return 'Use at least 8 characters.';
  if (pass.length > 128) return 'Keep it under 128 characters.';
  if (new Set(pass).size < 4) return 'Mix in more different characters.';
  if (WEAK.has(pass.toLowerCase())) return 'That passcode is too common.';
  return '';
}
