import { limitOffset } from "../lib/pagination.js";

export function createAuditService({ auditRepository }) {
  return {
    /** GET /api/admin/audit-log. Newest first. */
    async list({ page, pageSize }) {
      const { actions, total } = await auditRepository.list(limitOffset({ page, pageSize }));
      return { actions, page, pageSize, total };
    },
  };
}
