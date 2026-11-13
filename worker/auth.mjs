const encoder = new TextEncoder();
export function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function unbase64url(text) {
  if (typeof text !== 'string' || text.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(text))
    throw new Error('INVALID_TOKEN');
  if (text.length % 4 === 1) throw new Error('INVALID_TOKEN');
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const decoded = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  if (base64url(decoded) !== text) throw new Error('INVALID_TOKEN');
  return decoded;
}
export const randomId = () => crypto.randomUUID();
export async function digest(text) {
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}
export async function adminKeyId(value) {
  const key = typeof value === 'string' ? JSON.parse(value) : value;
  return digest(JSON.stringify([key.kty, key.crv, key.x, key.y]));
}
async function key(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SERVICE_NOT_CONFIGURED');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
export async function signToken(secret, claims, seconds, now = Date.now()) {
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ ...claims, iat: now, exp: now + seconds * 1000, jti: randomId() })
    )
  );
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  return payload + '.' + base64url(signature);
}
export async function verifyToken(secret, token, type, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        unbase64url(parts[1]),
        encoder.encode(parts[0])
      ))
    )
      return null;
    const claims = JSON.parse(new TextDecoder().decode(unbase64url(parts[0])));
    if (
      claims.typ !== type ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      claims.iat > now + 5000 ||
      typeof claims.sub !== 'string'
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}
export function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}
export async function verifyAdminProof(publicJwk, message, signature) {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      typeof publicJwk === 'string' ? JSON.parse(publicJwk) : publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      unbase64url(signature),
      encoder.encode(message)
    );
  } catch {
    return false;
  }
}
export function error(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}
export async function readJson(request, max = 16384) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > max) throw error('MESSAGE_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) throw error('INVALID_REQUEST');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw error('MESSAGE_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw 0;
    return value;
  } catch {
    throw error('INVALID_REQUEST');
  }
}
