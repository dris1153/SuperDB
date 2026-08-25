/**
 * Client-side vault crypto. Runs in the browser; the server never sees a vault key or a plaintext
 * password. Deliberately not marked `server-only` — and equally, must never be imported by server
 * code, or the whole point is lost.
 *
 * WebCrypto primitives only, no hand-rolled algorithms. Node 18+ exposes the same `crypto.subtle`,
 * which is what lets this be unit tested.
 */

/** OWASP's current figure for PBKDF2-HMAC-SHA256. Re-check it periodically; it has risen before. */
export const DEFAULT_ITERATIONS = 600_000;

/** Encrypted at vault setup so a wrong master password is detectable before any secret exists. */
const CHECK_PLAINTEXT = "superdb-vault-v1";

export type VaultParams = { salt: string; iterations: number };

export class WrongMasterPassword extends Error {
  constructor() {
    super("Wrong master password");
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Returns a view over a plain ArrayBuffer. TypeScript 5.7 made Uint8Array generic over its buffer,
 * and WebCrypto's BufferSource rejects the SharedArrayBuffer-compatible default.
 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Non-extractable on purpose: the key can encrypt and decrypt but cannot be exported back to
 * JavaScript, so it survives in IndexedDB without the raw bytes ever being readable.
 */
export async function deriveVaultKey(
  masterPassword: string,
  { salt, iterations }: VaultParams,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64Url(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Output is `iv.ciphertext`, base64url — the same shape the server-side crypto uses. */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptString(key: CryptoKey, blob: string): Promise<string> {
  const parts = blob.split(".");
  if (parts.length !== 2) throw new Error("Malformed vault blob");

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(parts[0]) },
    key,
    fromBase64Url(parts[1]),
  );
  return decoder.decode(plaintext);
}

export const encryptJson = (key: CryptoKey, value: unknown) =>
  encryptString(key, JSON.stringify(value));

export async function decryptJson<T>(key: CryptoKey, blob: string): Promise<T> {
  return JSON.parse(await decryptString(key, blob)) as T;
}

export async function createVault(
  masterPassword: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<{ params: VaultParams; checkBlob: string; key: CryptoKey }> {
  const params = {
    salt: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    iterations,
  };
  const key = await deriveVaultKey(masterPassword, params);
  return { params, checkBlob: await encryptString(key, CHECK_PLAINTEXT), key };
}

/**
 * Throws WrongMasterPassword rather than a raw decryption failure, so the UI can tell "you typed the
 * wrong password" apart from "this data is damaged".
 */
export async function unlockVault(
  masterPassword: string,
  params: VaultParams,
  checkBlob: string,
): Promise<CryptoKey> {
  const key = await deriveVaultKey(masterPassword, params);
  try {
    if ((await decryptString(key, checkBlob)) !== CHECK_PLAINTEXT) throw new WrongMasterPassword();
  } catch {
    throw new WrongMasterPassword();
  }
  return key;
}
