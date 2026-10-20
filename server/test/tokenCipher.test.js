import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTokenCipher, parseEncryptionKey } from "../src/lib/tokenCipher.js";
import { loadConfig } from "../src/config/env.js";

const TOKEN = "1//0g-fake-refresh-token-value";

describe("tokenCipher", () => {
  it("round-trips and never stores the plaintext", () => {
    const cipher = createTokenCipher(randomBytes(32));
    const encrypted = cipher.encrypt(TOKEN);
    expect(encrypted).not.toContain(TOKEN);
    expect(encrypted).toMatch(/^v1\./);
    expect(cipher.decrypt(encrypted)).toBe(TOKEN);
  });

  it("uses a fresh IV each time", () => {
    const cipher = createTokenCipher(randomBytes(32));
    expect(cipher.encrypt(TOKEN)).not.toBe(cipher.encrypt(TOKEN));
  });

  it("fails on tampering, a wrong key, or garbage, without leaking details", () => {
    const encrypted = createTokenCipher(randomBytes(32)).encrypt(TOKEN);
    const other = createTokenCipher(randomBytes(32));
    expect(() => other.decrypt(encrypted)).toThrow("Could not decrypt stored token");

    const cipher = createTokenCipher(randomBytes(32));
    const good = cipher.encrypt(TOKEN);
    const parts = good.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => cipher.decrypt(parts.join("."))).toThrow("Could not decrypt stored token");
    expect(() => cipher.decrypt("garbage")).toThrow("Could not decrypt stored token");
    expect(() => cipher.decrypt("")).toThrow("Could not decrypt stored token");
  });

  it("requires a 32-byte key", () => {
    expect(() => createTokenCipher(randomBytes(16))).toThrow();
    expect(() => createTokenCipher("not a buffer")).toThrow();
    expect(parseEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => parseEncryptionKey("short")).toThrow();
    expect(() => parseEncryptionKey(undefined)).toThrow();
  });
});

describe("loadConfig (Gmail)", () => {
  const base = {
    DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40),
  };
  const gmail = {
    GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: "http://localhost:5173/api/gmail/callback",
    GMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };

  it("Gmail is off when none of its variables are set (and .env.example's empty values count as unset)", () => {
    expect(loadConfig(base).gmail).toBeNull();
    expect(
      loadConfig({ ...base, PORT: "", NODE_ENV: "", GOOGLE_CLIENT_ID: "", GMAIL_TOKEN_ENCRYPTION_KEY: "" }).gmail,
    ).toBeNull();
    expect(loadConfig({ ...base, PORT: "" }).PORT).toBe(4000);
  });

  it("is on when all four are set, with the key decoded to 32 bytes", () => {
    const { gmail: g } = loadConfig({ ...base, ...gmail });
    expect(g).toMatchObject({ clientId: "id", clientSecret: "secret", redirectUri: gmail.GOOGLE_REDIRECT_URI });
    expect(g.encryptionKey).toHaveLength(32);
  });

  it("rejects partial configuration and a bad key, naming only the variables (never values)", () => {
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "id" })).toThrow(/missing: GOOGLE_CLIENT_SECRET/);
    expect(() => loadConfig({ ...base, ...gmail, GMAIL_TOKEN_ENCRYPTION_KEY: "short" })).toThrow(
      /GMAIL_TOKEN_ENCRYPTION_KEY must be base64 of exactly 32 bytes/,
    );
    try {
      loadConfig({ ...base, ...gmail, GMAIL_TOKEN_ENCRYPTION_KEY: "short" });
    } catch (err) {
      expect(err.message).not.toContain("secret");
    }
  });
});
