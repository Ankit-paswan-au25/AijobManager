// Usage: npm run migrate -- up | down | redo   (optionally: up 1)
import { runner } from "node-pg-migrate";
import { fileURLToPath } from "node:url";
import path from "node:path";

const direction = process.argv[2] ?? "up";
const count = process.argv[3] ? Number(process.argv[3]) : direction === "up" ? Infinity : 1;

if (!["up", "down"].includes(direction)) {
  console.error("Usage: npm run migrate -- <up|down> [count]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

await runner({
  databaseUrl: process.env.DATABASE_URL,
  dir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations"),
  direction,
  count,
  migrationsTable: "pgmigrations",
  log: (msg) => console.log(msg),
});
