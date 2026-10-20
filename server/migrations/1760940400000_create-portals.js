// Seeded portals are trusted and already approved. Domains are registrable domains (see lib/portalUrl.js).
const SEEDS = [
  ["Naukri", "https://www.naukri.com", "naukri.com"],
  ["LinkedIn", "https://www.linkedin.com", "linkedin.com"],
  ["foundit", "https://www.foundit.in", "foundit.in"],
  ["Indeed", "https://www.indeed.com", "indeed.com"],
];

export const up = (pgm) => {
  pgm.createType("portal_status", ["approved", "pending", "rejected"]);

  pgm.createTable("portals", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    // Origin only (e.g. https://www.example.com). We only ever link to it; the app never fetches it.
    base_url: { type: "text", notNull: true },
    // Normalized registrable domain, used to detect duplicates.
    domain: { type: "text", notNull: true },
    status: { type: "portal_status", notNull: true, default: "pending" },
    // NULL for seeded portals (or if the submitting user was later deleted).
    submitted_by: { type: "uuid", references: "users", onDelete: "SET NULL" },
    submitted_at: { type: "timestamptz" },
    reviewed_by: { type: "uuid", references: "users", onDelete: "SET NULL" },
    reviewed_at: { type: "timestamptz" },
    rejection_reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("portals", "portals_rejected_has_reason", {
    check: "status <> 'rejected' OR rejection_reason IS NOT NULL",
  });

  // One live (pending or approved) portal per domain. A rejected domain may be submitted again.
  pgm.createIndex("portals", "domain", {
    name: "portals_active_domain_key",
    unique: true,
    where: "status IN ('pending', 'approved')",
  });
  pgm.createIndex("portals", ["submitted_by", "status"]);

  pgm.createTable("user_portals", {
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    portal_id: { type: "uuid", notNull: true, references: "portals", onDelete: "CASCADE" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("user_portals", "user_portals_user_portal_key", {
    unique: ["user_id", "portal_id"],
  });
  pgm.createIndex("user_portals", "portal_id");

  for (const [name, baseUrl, domain] of SEEDS) {
    pgm.sql(
      `INSERT INTO portals (name, base_url, domain, status)
       VALUES ('${name}', '${baseUrl}', '${domain}', 'approved')`,
    );
  }
};

export const down = (pgm) => {
  pgm.dropTable("user_portals");
  pgm.dropTable("portals");
  pgm.dropType("portal_status");
};
