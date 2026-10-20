import request from "supertest";
import { createApp } from "../src/app.js";
import { createAdminReviewService } from "../src/services/adminReviewService.js";
import { createAdminUserService } from "../src/services/adminUserService.js";
import { createAuditService } from "../src/services/auditService.js";
import { createPortalAdminService } from "../src/services/portalAdminService.js";
import { createPortalService } from "../src/services/portalService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createReviewService } from "../src/services/reviewService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import {
  createInMemoryResumeRepository, createInMemoryUserRepository, createTestAuthService, makeTempDir, TEST_CONFIG, VALID_FORM,
} from "./helpers.js";
import { createInMemoryAdminUserRepository, createInMemoryAuditRepository, createInMemoryReviewRepository } from "./adminFakes.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";

/** The whole app with the admin area wired like src/index.js does it, on in-memory repositories. */
export async function buildAdminApp() {
  const userRepository = createInMemoryUserRepository();
  const portalRepository = createInMemoryPortalRepository({ userRepository });
  const resumeRepository = createInMemoryResumeRepository();
  const resumeService = createResumeService({
    resumeRepository, fileStore: createLocalFileStore(await makeTempDir()), logger: { error() {} },
  });

  // The audit fake reads review rows lazily so it can label review targets with the author's email.
  let reviewRepository;
  const auditRepository = createInMemoryAuditRepository({
    userRepository, portalRepository, resumeRepository, getReviewRows: () => reviewRepository.rows,
  });
  reviewRepository = createInMemoryReviewRepository({ userRepository, portalRepository, auditRepository });

  const app = createApp({
    config: TEST_CONFIG,
    authService: createTestAuthService(userRepository),
    resumeService,
    portalService: createPortalService({ portalRepository }),
    portalAdminService: createPortalAdminService({ portalRepository }),
    auditRepository,
    auditService: createAuditService({ auditRepository }),
    adminUserService: createAdminUserService({
      adminUserRepository: createInMemoryAdminUserRepository({ userRepository, resumeRepository }),
      userRepository, resumeRepository, auditRepository,
    }),
    adminReviewService: createAdminReviewService({ reviewRepository }),
    reviewService: createReviewService({ reviewRepository, portalRepository }),
  });
  return { app, userRepository, portalRepository, resumeRepository, auditRepository, reviewRepository };
}

const PASSWORD = "correct horse battery";

/** Signs a user up (optionally with a resume and/or admin rights). Returns { agent, user }. */
export async function signUpUser(ctx, email, { resume = true, admin = false, country, city, fullName = email.split("@")[0] } = {}) {
  const agent = request.agent(ctx.app);
  const res = await agent.post("/api/auth/signup").send({ email, fullName, password: PASSWORD, country, city });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (resume) await agent.post("/api/resumes/create").send({ ...VALID_FORM, name: fullName }).expect(201);
  if (admin) ctx.userRepository._setAdmin(email);
  return { agent, user: res.body.user };
}
