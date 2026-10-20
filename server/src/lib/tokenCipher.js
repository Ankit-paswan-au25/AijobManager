import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/**
 * AES-256-GCM encryption for secrets stored at rest (Gmail refresh tokens).
 * Output: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). Never log inputs or outputs.
 */
export function createTokenCipher(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Encryption key must be exactly 32 bytes");
  }

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
    },

    /** Throws a generic error if the value was tampered with or the key is wrong. */
    decrypt(payload) {
      try {
        const [version, iv, tag, ciphertext] = String(payload).split(".");
        if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("bad format");
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Could not decrypt stored token");
      }
    },
  };
}

/** Parses GMAIL_TOKEN_ENCRYPTION_KEY: base64 (or base64url) of exactly 32 bytes. */
export function parseEncryptionKey(value) {
  const key = Buffer.from(String(value ?? ""), "base64");
  if (key.length !== 32) throw new Error("must be base64 of exactly 32 bytes");
  return key;
}
