export const up = (pgm) => {
  pgm.createType("user_job_status", ["new", "saved", "applied", "interview", "rejected", "archived"]);

  pgm.createTable("jobs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    source_portal: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    company: { type: "text", notNull: true },
    location: { type: "text", notNull: true, default: "" },
    // Clean, token-free link on the portal's own domain, or NULL (then needs_link = true).
    job_url: { type: "text" },
    posted_age_days: { type: "integer" },
    salary_text: { type: "text" },
    experience_text: { type: "text" },
    received_at: { type: "timestamptz", notNull: true },
    raw_snippet: { type: "text", notNull: true, default: "" },
    needs_link: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("jobs", "jobs_snippet_max_300", { check: "char_length(raw_snippet) <= 300" });
  pgm.addConstraint("jobs", "jobs_needs_link_matches_url", {
    check: "needs_link = (job_url IS NULL)",
  });

  // Dedupe by URL. A plain UNIQUE allows many NULLs, i.e. "unique when not null".
  pgm.addConstraint("jobs", "jobs_job_url_key", { unique: "job_url" });
  // With no URL, dedupe by (portal, title, company, location).
  pgm.createIndex("jobs", ["source_portal", "title", "company", "location"], {
    name: "jobs_no_url_identity_key",
    unique: true,
    where: "job_url IS NULL",
  });

  pgm.createTable("user_jobs", {
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    job_id: { type: "uuid", notNull: true, references: "jobs", onDelete: "CASCADE" },
    status: { type: "user_job_status", notNull: true, default: "new" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("user_jobs", "user_jobs_user_job_key", { unique: ["user_id", "job_id"] });
  pgm.createIndex("user_jobs", "job_id");
};

export const down = (pgm) => {
  pgm.dropTable("user_jobs");
  pgm.dropTable("jobs");
  pgm.dropType("user_job_status");
};
