import { webcrypto as crypto } from 'node:crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 2_000_000;
const FORMAT = 'quizparty-admin-v1';

function base64(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

async function derive(password, salt, iterations = ITERATIONS, usages = ['encrypt']) {
  if (typeof password !== 'string' || !password) throw new Error('Password is required');
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey'
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function encryptEnvelope(plain, password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt, iterations, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(plain)))
  );
  const payload = new Uint8Array(salt.length + iv.length + ciphertext.length);
  payload.set(salt);
  payload.set(iv, salt.length);
  payload.set(ciphertext, salt.length + iv.length);
  return { format: FORMAT, iterations, payload: base64(payload) };
}

export async function decryptEnvelope(envelope, password) {
  if (
    !envelope ||
    envelope.format !== FORMAT ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < 2_000_000 ||
    typeof envelope.payload !== 'string'
  ) {
    throw new Error('Invalid administrator envelope');
  }
  const all = fromBase64(envelope.payload);
  if (all.length <= 32 + 16 + 16) throw new Error('Invalid administrator payload');
  const salt = all.slice(0, 32);
  const iv = all.slice(32, 48);
  const ciphertext = all.slice(48);
  const key = await derive(password, salt, envelope.iterations, ['decrypt']);
  const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(decoder.decode(decoded));
}

export async function generateSigningKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify'
  ]);
  return {
    privateKeyJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicKeyJwk: await crypto.subtle.exportKey('jwk', pair.publicKey)
  };
}

export async function signChallenge(privateKeyJwk, challenge) {
  if (!privateKeyJwk || typeof challenge !== 'string' || !challenge)
    throw new Error('Invalid challenge');
  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(challenge)
  );
  return base64(new Uint8Array(signature));
}

export { FORMAT, ITERATIONS };
