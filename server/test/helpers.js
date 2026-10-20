import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { createAuthService } from "../src/services/authService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createPortalService } from "../src/services/portalService.js";
import { createPortalAdminService } from "../src/services/portalAdminService.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { createApp } from "../src/app.js";

export const TEST_CONFIG = {
  NODE_ENV: "test",
  JWT_SECRET: "test-secret-test-secret-test-secret-123456",
  JWT_EXPIRES_IN_DAYS: 7,
};

export function createInMemoryUserRepository() {
  const users = new Map();
  return {
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async create({ email, passwordHash, fullName }) {
      if ([...users.values()].some((u) => u.email === email)) return null;
      const user = { id: randomUUID(), email, passwordHash, fullName, isAdmin: false, createdAt: new Date() };
      users.set(user.id, user);
      return user;
    },
    // test helper: there is deliberately no API for this
    _setAdmin(email, value = true) {
      const user = [...users.values()].find((u) => u.email === email);
      user.isAdmin = value;
    },
  };
}

export function createInMemoryResumeRepository() {
  const byUser = new Map();
  return {
    async findByUserId(userId) {
      return byUser.get(userId) ?? null;
    },
    async upsert({ userId, source, filePath, extractedText, structuredData }) {
      const prev = byUser.get(userId);
      const now = new Date();
      const resume = {
        id: prev?.id ?? randomUUID(),
        userId,
        source,
        filePath: filePath ?? null,
        extractedText,
        structuredData: structuredData ?? null,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      byUser.set(userId, resume);
      return { resume, previousFilePath: prev?.filePath ?? null };
    },
  };
}

export function createTestAuthService(userRepository = createInMemoryUserRepository()) {
  return createAuthService({
    userRepository,
    jwtSecret: TEST_CONFIG.JWT_SECRET,
    jwtExpiresInDays: TEST_CONFIG.JWT_EXPIRES_IN_DAYS,
    bcryptCost: 4, // fast for tests
  });
}

export async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "jobmanager-test-"));
}

/** Full app with in-memory repos and a real file store in a temp dir. */
export async function createTestApp({ resumeRepository = createInMemoryResumeRepository() } = {}) {
  const uploadDir = await makeTempDir();
  const fileStore = createLocalFileStore(uploadDir);
  const resumeService = createResumeService({ resumeRepository, fileStore });
  const userRepository = createInMemoryUserRepository();
  const portalRepository = createInMemoryPortalRepository({ userRepository });
  const app = createApp({
    config: TEST_CONFIG,
    authService: createTestAuthService(userRepository),
    resumeService,
    portalService: createPortalService({ portalRepository }),
    portalAdminService: createPortalAdminService({ portalRepository }),
  });
  return { app, uploadDir, resumeService, resumeRepository, userRepository, portalRepository };
}

/** A minimal but valid single-page PDF containing `text`. */
export function makePdf(text) {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      `4 0 obj<</Length ${Buffer.byteLength(stream)}>>stream`,
      stream,
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "trailer<</Root 1 0 R/Size 6>>",
      "%%EOF",
    ].join("\n"),
  );
}

/** A minimal valid DOCX with one paragraph. */
export async function makeDocx(text) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A valid ZIP that is not a DOCX. */
export async function makePlainZip() {
  const zip = new JSZip();
  zip.file("notes.txt", "hello");
  return zip.generateAsync({ type: "nodebuffer" });
}

export const VALID_FORM = {
  name: "Asha Rai",
  contact: { email: "asha@example.com", phone: "+977 9800000000", location: "Kathmandu", links: ["github.com/asha"] },
  summary: "Backend engineer with 4 years of experience.",
  skills: ["Node.js", "PostgreSQL", "React"],
  experience: [
    { role: "Engineer", company: "Acme", dates: "2021 - 2024", bullets: ["Built APIs", "Cut latency 30%"] },
  ],
  education: [{ institution: "TU", degree: "BSc CSIT", dates: "2016 - 2020" }],
  projects: [{ name: "JobFinder", description: "Job alert organiser" }],
};
