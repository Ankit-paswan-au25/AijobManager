import { randomUUID } from "node:crypto";

export const SEED_PORTALS = [
  ["Naukri", "https://www.naukri.com", "naukri.com"],
  ["LinkedIn", "https://www.linkedin.com", "linkedin.com"],
  ["foundit", "https://www.foundit.in", "foundit.in"],
  ["Indeed", "https://www.indeed.com", "indeed.com"],
];

/** In-memory twin of portalRepository, mirroring the SQL rules (live-domain uniqueness, pending-only review). */
export function createInMemoryPortalRepository({ userRepository, seed = true } = {}) {
  const portals = new Map();
  const selections = new Map(); // userId -> Set(portalId)
  const nowFn = { current: () => new Date() };

  if (seed) {
    for (const [name, baseUrl, domain] of SEED_PORTALS) {
      const id = randomUUID();
      portals.set(id, {
        id, name, baseUrl, domain, status: "approved", submittedBy: null, submittedAt: null,
        reviewedBy: null, reviewedAt: null, rejectionReason: null, createdAt: new Date(),
      });
    }
  }

  const live = (p) => p.status === "pending" || p.status === "approved";

  return {
    // --- test helpers ---
    _all: () => [...portals.values()],
    _byName: (name) => [...portals.values()].find((p) => p.name === name),
    _backdate(id, minutes) {
      portals.get(id).submittedAt = new Date(Date.now() - minutes * 60000);
    },

    // --- repository contract ---
    async listVisibleToUser(userId) {
      const mine = selections.get(userId) ?? new Set();
      return [...portals.values()]
        .filter((p) => p.status === "approved" || (p.status === "pending" && p.submittedBy === userId))
        .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "approved" ? -1 : 1))
        .map((p) => ({ ...p, selected: mine.has(p.id) }));
    },
    async listPendingBySubmitter(userId) {
      return [...portals.values()]
        .filter((p) => p.status === "pending" && p.submittedBy === userId)
        .sort((a, b) => a.submittedAt - b.submittedAt);
    },
    async findById(id) {
      return portals.get(id) ?? null;
    },
    async findLiveByDomain(domain) {
      return [...portals.values()].find((p) => p.domain === domain && live(p)) ?? null;
    },
    async countPendingBySubmitter(userId) {
      return [...portals.values()].filter((p) => p.status === "pending" && p.submittedBy === userId).length;
    },
    async createPending({ name, baseUrl, domain, submittedBy }) {
      if ([...portals.values()].some((p) => p.domain === domain && live(p))) return null;
      const portal = {
        id: randomUUID(), name, baseUrl, domain, status: "pending", submittedBy, submittedAt: nowFn.current(),
        reviewedBy: null, reviewedAt: null, rejectionReason: null, createdAt: new Date(),
      };
      portals.set(portal.id, portal);
      return portal;
    },
    async findApprovedIds(ids) {
      return ids.filter((id) => portals.get(id)?.status === "approved");
    },
    async replaceUserPortals(userId, portalIds) {
      selections.set(userId, new Set(portalIds));
    },
    async listPending() {
      const out = [];
      for (const p of portals.values()) {
        if (p.status !== "pending") continue;
        const submitter = p.submittedBy && userRepository ? await userRepository.findById(p.submittedBy) : null;
        out.push({ ...p, submitterEmail: submitter?.email ?? null });
      }
      return out.sort((a, b) => a.submittedAt - b.submittedAt);
    },
    async review({ id, status, reviewerId, rejectionReason = null }) {
      const p = portals.get(id);
      if (!p || p.status !== "pending") return null;
      Object.assign(p, { status, reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason });
      return p;
    },
  };
}
