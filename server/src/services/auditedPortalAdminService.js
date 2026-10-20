/**
 * Wraps portalAdminService so every successful approve/reject is written to the audit log,
 * without changing the portal admin code itself.
 *
 * The portal change is already saved by the time the row is written. If the audit write fails we do NOT
 * report the approve/reject as failed (it happened, and retrying would answer "already reviewed"); we log
 * the failure loudly instead. TODO: make this atomic by writing the audit row inside the portal review's
 * own transaction.
 */
export function createAuditedPortalAdminService({ portalAdminService, auditRepository, logger = console }) {
  async function audited(action, adminId, run) {
    const portal = await run();
    try {
      await auditRepository.record({ adminId, action, targetType: "portal", targetId: portal.id });
    } catch (err) {
      logger.error(`[audit] could not record ${action} for portal ${portal.id}: ${err?.name ?? "Error"}`);
    }
    return portal;
  }

  return {
    listPending: (...args) => portalAdminService.listPending(...args),
    approve: ({ id, adminId }) => audited("approve_portal", adminId, () => portalAdminService.approve({ id, adminId })),
    reject: ({ id, adminId, reason }) =>
      audited("reject_portal", adminId, () => portalAdminService.reject({ id, adminId, reason })),
  };
}
