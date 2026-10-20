import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseEncryptionKey } from "../lib/tokenCipher.js";
import { AI_PROVIDERS, DEFAULT_ANTHROPIC_MODEL, DEFAULT_OLLAMA_BASE_URL, OLLAMA_REQUEST_TIMEOUT_MS } from "./ai.js";

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
  // AI scoring is optional. Without a key, jobs still get the deterministic score and are flagged llm_failed.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(), // default lives in config/ai.js
  // Which provider to use. Unset = Anthropic if ANTHROPIC_API_KEY is set, otherwise AI is off.
  AI_PROVIDER: z.enum(AI_PROVIDERS).optional(),
  // Local models for testing (AI_PROVIDER=ollama). The model must already be pulled: ollama pull <model>.
  OLLAMA_MODEL: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().optional(), // default lives in config/ai.js
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1000).optional(), // default lives in config/ai.js
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

  // An explicit AI_PROVIDER that is missing what it needs is an error, not a silent "AI off".
  const aiProvider = config.AI_PROVIDER ?? (config.ANTHROPIC_API_KEY ? "anthropic" : null);
  if (aiProvider === "anthropic" && !config.ANTHROPIC_API_KEY) {
    throw new Error("Incomplete AI configuration: AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY");
  }
  if (aiProvider === "ollama" && !config.OLLAMA_MODEL) {
    throw new Error("Incomplete AI configuration: AI_PROVIDER=ollama needs OLLAMA_MODEL");
  }

  const anthropic =
    aiProvider === "anthropic"
      ? { apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL }
      : null;
  const ollama =
    aiProvider === "ollama"
      ? {
          model: config.OLLAMA_MODEL,
          baseUrl: config.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
          timeoutMs: config.OLLAMA_TIMEOUT_MS ?? OLLAMA_REQUEST_TIMEOUT_MS,
        }
      : null;

  const {
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GMAIL_TOKEN_ENCRYPTION_KEY, // eslint-disable-line no-unused-vars
    ANTHROPIC_API_KEY, ANTHROPIC_MODEL, AI_PROVIDER, OLLAMA_MODEL, OLLAMA_BASE_URL, OLLAMA_TIMEOUT_MS, // eslint-disable-line no-unused-vars
    ...rest
  } = config;
  return { ...rest, UPLOAD_DIR: path.resolve(SERVER_ROOT, config.UPLOAD_DIR), gmail, anthropic, ollama, aiProvider };
}
