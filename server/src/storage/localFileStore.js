import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Stores uploaded files on local disk under `baseDir`, which must live outside any
 * publicly served directory. Callers only ever see relative paths.
 */
export function createLocalFileStore(baseDir) {
  const root = path.resolve(baseDir);

  const resolveSafe = (relativePath) => {
    const full = path.resolve(root, relativePath);
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Path escapes upload dir");
    return full;
  };

  return {
    /** Saves `buffer` as a random filename under the user's folder; returns the relative path. */
    async save({ userId, buffer, ext }) {
      // POSIX separators so stored paths are identical on every OS.
      const relative = path.posix.join(userId, `${randomUUID()}.${ext}`);
      const full = resolveSafe(relative);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buffer, { flag: "wx", mode: 0o600 });
      return relative;
    },

    async remove(relativePath) {
      if (!relativePath) return;
      await fs.rm(resolveSafe(relativePath), { force: true });
    },
  };
}
