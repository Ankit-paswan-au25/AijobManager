import { AppError, notFound } from "../lib/errors.js";
import { limitOffset } from "../lib/pagination.js";

const resumeStatus = (u) => u.resumeSource ?? "none"; // "uploaded" | "created" | "none"

const toListItem = (u) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  createdAt: u.createdAt,
  country: u.country ?? null,
  city: u.city ?? null,
  resumeStatus: resumeStatus(u),
  // Where an admin reads it. Opening this is recorded in the audit log.
  resumeUrl: u.resumeId ? `/api/admin/users/${u.id}/resume` : null,
});

export function createAdminUserService({ adminUserRepository, userRepository, resumeRepository, auditRepository }) {
  return {
    /** GET /api/admin/users. Newest signups first. Lists who has a resume; never includes resume text. */
    async list({ page, pageSize }) {
      const { users, total } = await adminUserRepository.list(limitOffset({ page, pageSize }));
      return { users: users.map(toListItem), page, pageSize, total };
    },

    /**
     * GET /api/admin/users/:id/resume. Returns the resume's text (never the stored file or its path).
     * The view is recorded BEFORE the text is returned, and if the audit row can't be written the text
     * is not returned at all: no unlogged views.
     */
    async viewResume(adminId, userId) {
      const user = await userRepository.findById(userId);
      if (!user) throw notFound("User not found");
      const resume = await resumeRepository.findByUserId(userId);
      if (!resume) throw new AppError(404, "RESUME_NOT_FOUND", "This user has no resume");

      await auditRepository.record({ adminId, action: "view_resume", targetType: "resume", targetId: resume.id });

      return {
        user: { id: user.id, fullName: user.fullName, email: user.email },
        resume: { id: resume.id, source: resume.source, text: resume.extractedText, updatedAt: resume.updatedAt },
      };
    },
  };
}
