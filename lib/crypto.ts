import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const WRAP_VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must decode to 32 bytes (npm run genkey)");
  return buf;
}

/** AES-256-GCM. Output is `iv.tag.ciphertext`, each part base64url. */
function encryptWith(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

function decryptWith(key: Buffer, payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed ciphertext");
  const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/**
 * Envelope encryption: a fresh data key per secret, itself wrapped by the master key.
 *
 * The point is not extra secrecy — while the master key sits in an env var, losing it still loses
 * everything. It buys key rotation as a rewrap of short data keys instead of a re-encrypt of every
 * stored token, and makes moving the master key into a KMS a one-function change.
 */
export function seal(plain: string): { dekWrapped: string; cipher: string } {
  const dek = randomBytes(32);
  return {
    dekWrapped: `${WRAP_VERSION}.${encryptWith(masterKey(), dek.toString("base64url"))}`,
    cipher: encryptWith(dek, plain),
  };
}

export function open(dekWrapped: string, cipher: string): string {
  const separator = dekWrapped.indexOf(".");
  if (separator < 0) throw new Error("Malformed wrapped key");

  const version = dekWrapped.slice(0, separator);
  if (version !== WRAP_VERSION) throw new Error(`Unsupported key wrapping version: ${version}`);

  const dek = Buffer.from(decryptWith(masterKey(), dekWrapped.slice(separator + 1)), "base64url");
  return decryptWith(dek, cipher);
}
