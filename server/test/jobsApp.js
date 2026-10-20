import { randomBytes } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createTokenCipher } from "../src/lib/tokenCipher.js";
import { createGmailService } from "../src/services/gmailService.js";
import { createJobService } from "../src/services/jobService.js";
import { createUserJobService } from "../src/services/userJobService.js";
import { createDashboardService } from "../src/services/dashboardService.js";
import { createDocumentService } from "../src/services/documentService.js";
import { createMatchService } from "../src/services/matchService.js";
import { createPortalAdminService } from "../src/services/portalAdminService.js";
import { createPortalService } from "../src/services/portalService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { EXPECTED } from "./alertExpectations.js";
import { loadFixtureRaw } from "./alertFixtures.js";
import {
  createFakeGmailClient, createInMemoryConnectionRepository, createInMemoryJobRepository,
} from "./gmailFakes.js";
import {
  createInMemoryResumeRepository, createInMemoryUserRepository, createTestAuthService, makeTempDir, TEST_CONFIG, VALID_FORM,
} from "./helpers.js";
import { createInMemoryMatchRepository } from "./matchFakes.js";
import { createInMemoryDocumentRepository } from "./documentFakes.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";
import { createInMemoryUserJobRepository } from "./userJobFakes.js";

const CONFIG = { ...TEST_CONFIG, CLIENT_ORIGIN: "http://localhost:5173" };
export const day = (n) => new Date(Date.UTC(2026, 9, 20) - n * 86400000);
const quiet = () => ({ info() {}, warn() {}, error() {} });

export async function buildApp({ provider = null, mailbox = [], now } = {}) {
  const userRepository = createInMemoryUserRepository();
  const portalRepository = createInMemoryPortalRepository({ userRepository });
  const resumeRepository = createInMemoryResumeRepository();
  const matchRepository = createInMemoryMatchRepository();
  const jobRepository = createInMemoryJobRepository({ matchRepository });
  const logger = quiet();

  const matchService = createMatchService({ aiProvider: provider, matchRepository, jobRepository, resumeRepository, logger });
  const jobService = createJobService({ jobRepository });
  const userJobRepository = createInMemoryUserJobRepository({ jobRepository });
  const userJobService = createUserJobService({ userJobRepository });
  const portalService = createPortalService({ portalRepository });
  const dashboardService = createDashboardService({ jobRepository, portalService, ...(now ? { now } : {}) });
  const documentRepository = createInMemoryDocumentRepository();
  const documentService = createDocumentService({ aiProvider: provider, documentRepository, jobRepository, resumeRepository, logger });
  const resumeService = createResumeService({
    resumeRepository, fileStore: createLocalFileStore(await makeTempDir()), logger,
    onResumeSaved: (userId) => matchService.rescoreAllForUser(userId),
  });

  // Scoring started by a sync is captured so tests can wait for it deterministically.
  const scoring = { runs: [] };
  const gmailClient = createFakeGmailClient({ mailbox });
  const gmailService = createGmailService({
    gmailClient, connectionRepository: createInMemoryConnectionRepository(), jobRepository,
    cipher: createTokenCipher(randomBytes(32)), jwtSecret: TEST_CONFIG.JWT_SECRET, logger,
    onJobsSaved: (userId) => {
      const run = matchService.scoreUnscoredForUser(userId);
      scoring.runs.push(run);
      return run;
    },
  });

  const app = createApp({
    config: CONFIG,
    authService: createTestAuthService(userRepository),
    resumeService,
    portalService,
    portalAdminService: createPortalAdminService({ portalRepository }),
    gmailService, jobService, matchService, documentService, userJobService, dashboardService,
  });
  return { app, userRepository, gmailClient, portalRepository, userJobRepository, matchRepository, jobRepository, matchService, documentRepository, scoring, provider };
}

export async function signUp(app, email = "asha@example.com", { resume = true } = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/signup").send({ email, password: "correct-horse-1", fullName: "Asha" });
  if (resume) await agent.post("/api/resumes/create").send(VALID_FORM).expect(201);
  return { agent, userId: res.body.user.id };
}

