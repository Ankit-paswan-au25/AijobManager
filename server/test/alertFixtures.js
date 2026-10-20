import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRawEmail } from "../src/services/alerts/emailReader.js";

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/alerts");

/** The only sample emails that exist. Do not add a portal here until its real sample email is in the folder. */
export const REQUIRED_FIXTURES = ["indeed.eml", "naukri_1.eml", "shine_1.eml"];

/** Reads a fixture as raw bytes. A missing file FAILS LOUDLY, naming the file; tests never skip silently. */
export function loadFixtureRaw(name) {
  const file = path.join(FIXTURE_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing alert fixture: server/fixtures/alerts/${name}\n` +
        `Add the real sample email (.eml) with exactly that name. See server/fixtures/alerts/README.md. ` +
        `Required fixtures: ${REQUIRED_FIXTURES.join(", ")}`,
    );
  }
  return fs.readFileSync(file);
}

/** Parsed email ({ fromAddress, receivedAt, html, text }) from a fixture. */
export async function loadFixtureEmail(name) {
  return readRawEmail(loadFixtureRaw(name));
}
