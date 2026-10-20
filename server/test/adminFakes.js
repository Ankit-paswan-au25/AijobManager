import { randomUUID } from "node:crypto";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../src/config/admin.js";

/** In-memory twin of auditRepository. Append-only, like the table; also enforces the table's CHECKs. */
export function createInMemoryAuditRepository({ userRepository, portalRepository, getReviewRows, resumeRepository }) {
  const rows = [];
  const hooks = { failNext: false };

  const checkRow = ({ action, targetType }) => {
    if (!AUDIT_ACTIONS.includes(action)) throw new Error(`admin_actions_action_check: ${action}`);
    if (!AUDIT_TARGET_TYPES.includes(targetType)) throw new Error(`admin_actions_target_type_check: ${targetType}`);
  };

  async function labelFor(type, id) {
    if (type === "portal") return (await portalRepository.findById(id))?.name ?? null;
    if (type === "review") {
      const review = getReviewRows().find((r) => r.id === id);
      return review ? (await userRepository.findById(review.userId))?.email ?? null : null;
    }
    if (type === "resume") {
      for (const u of userRepository._all()) {
        const resume = await resumeRepository.findByUserId(u.id);
        if (resume?.id === id) return u.email;
      }
    }
    return null;
  }

  return {
    rows,
    hooks,
    /** Same insert the real repository does inside review moderation's transaction. */
    insertRow(entry) {
      checkRow(entry);
      rows.push({ id: randomUUID(), createdAt: new Date(), ...entry });
    },
    async record(entry) {
      if (hooks.failNext) {
        hooks.failNext = false;
        throw new Error("audit insert failed");
      }
      this.insertRow(entry);
    },
    async list({ limit, offset }) {
      const sorted = [...rows].reverse(); // newest first
      const page = sorted.slice(offset, offset + limit);
      const actions = [];
      for (const r of page) {
        actions.push({
          id: r.id,
          adminEmail: r.adminId ? (await userRepository.findById(r.adminId))?.email ?? null : null,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          targetLabel: await labelFor(r.targetType, r.targetId),
          createdAt: r.createdAt,
        });
      }
      return { total: rows.length, actions };
    },
  };
}

export function createInMemoryAdminUserRepository({ userRepository, resumeRepository }) {
  return {
    async list({ limit, offset }) {
      const all = [...userRepository._all()].sort((a, b) => b.createdAt - a.createdAt);
      const users = [];
      for (const u of all.slice(offset, offset + limit)) {
        const resume = await resumeRepository.findByUserId(u.id);
        users.push({
          id: u.id, fullName: u.fullName, email: u.email, createdAt: u.createdAt, country: u.country ?? null, city: u.city ?? null,
          resumeId: resume?.id ?? null, resumeSource: resume?.source ?? null,
        });
      }
      return { total: all.length, users };
    },
  };
}

/** In-memory twin of reviewRepository. Moderation writes its audit row together with the status change, or neither. */
export function createInMemoryReviewRepository({ userRepository, portalRepository, auditRepository }) {
  const rows = []; // { id, userId, portalId, body, status, createdAt }
  const BODY_MAX = 1000;
  const portalRef = async (id) => (id ? { id, name: (await portalRepository.findById(id)).name } : null);

  const toPublic = async (r) => ({ id: r.id, body: r.body, createdAt: r.createdAt, portal: await portalRef(r.portalId) });
  const toAdmin = async (r) => {
    const u = await userRepository.findById(r.userId);
    return {
      id: r.id, body: r.body, status: r.status, createdAt: r.createdAt,
      author: { id: u.id, name: u.fullName, email: u.email }, portal: await portalRef(r.portalId),
    };
  };
  const newestFirst = (a, b) => b.createdAt - a.createdAt;

  return {
    rows,
    async create({ userId, portalId, body }) {
      if (body.length < 1 || body.length > BODY_MAX) throw new Error("reviews_body_length");
      const row = { id: randomUUID(), userId, portalId, body, status: "visible", createdAt: new Date() };
      rows.push(row);
      return toPublic(row);
    },
    async listVisible({ portalId = null, about = null, limit, offset }) {
      const matching = rows
        .filter((r) => r.status === "visible")
        .filter((r) => !portalId || r.portalId === portalId)
        .filter((r) => !about || (about === "app" && r.portalId === null))
        .sort(newestFirst);
      return { total: matching.length, reviews: await Promise.all(matching.slice(offset, offset + limit).map(toPublic)) };
    },
    async listForAdmin({ status = null, limit, offset }) {
      const matching = rows.filter((r) => !status || r.status === status).sort(newestFirst);
      return { total: matching.length, reviews: await Promise.all(matching.slice(offset, offset + limit).map(toAdmin)) };
    },
    async moderate({ id, status, adminId, action }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      const changed = row.status !== status;
      if (changed) {
        const before = row.status;
        row.status = status;
        try {
          auditRepository.insertRow({ adminId, action, targetType: "review", targetId: id });
        } catch (err) {
          row.status = before; // ROLLBACK: the change and its audit row go together
          throw err;
        }
      }
      return { review: await toAdmin(row), changed };
    },
  };
}
