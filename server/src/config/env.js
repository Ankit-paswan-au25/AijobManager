import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
});

export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Log only the names of the invalid keys, never their values.
    const keys = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`Invalid environment configuration: ${keys.join(", ")}`);
  }
  const config = parsed.data;
  return { ...config, UPLOAD_DIR: path.resolve(SERVER_ROOT, config.UPLOAD_DIR) };
}
