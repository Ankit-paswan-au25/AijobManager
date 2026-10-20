import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseEncryptionKey } from "../lib/tokenCipher.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Relative paths resolve against server/. Must NOT be inside any directory that is served publicly.
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  // Gmail is optional, but all four must be set together.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GMAIL_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
});

const GMAIL_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GMAIL_TOKEN_ENCRYPTION_KEY"];

export function loadConfig(source = process.env) {
  // `.env.example` ships with empty values; treat empty as "not set" so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    // Log only the names of the invalid keys, never their values.
    const keys = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`Invalid environment configuration: ${keys.join(", ")}`);
  }
  const config = parsed.data;

  const present = GMAIL_KEYS.filter((k) => config[k]);
  let gmail = null;
  if (present.length > 0) {
    const missing = GMAIL_KEYS.filter((k) => !config[k]);
    if (missing.length > 0) throw new Error(`Incomplete Gmail configuration, missing: ${missing.join(", ")}`);
    try {
      gmail = {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        redirectUri: config.GOOGLE_REDIRECT_URI,
        encryptionKey: parseEncryptionKey(config.GMAIL_TOKEN_ENCRYPTION_KEY),
      };
    } catch (err) {
      throw new Error(`Invalid environment configuration: GMAIL_TOKEN_ENCRYPTION_KEY ${err.message}`);
    }
  }

  const {
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GMAIL_TOKEN_ENCRYPTION_KEY, // eslint-disable-line no-unused-vars
    ...rest
  } = config;
  return { ...rest, UPLOAD_DIR: path.resolve(SERVER_ROOT, config.UPLOAD_DIR), gmail };
}
