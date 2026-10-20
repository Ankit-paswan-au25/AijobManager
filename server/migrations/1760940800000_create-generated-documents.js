export const up = (pgm) => {
  pgm.createTable("generated_documents", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    job_id: { type: "uuid", notNull: true, references: "jobs", onDelete: "CASCADE" },
    type: { type: "text", notNull: true },
    // Everything the UI needs to show and copy the document (always includes a plain `text` version).
    content: { type: "jsonb", notNull: true },
    // true when the job's raw_snippet was under 100 characters.
    limited_info: { type: "boolean", notNull: true },
    model_used: { type: "text", notNull: true },
    generated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    version: { type: "integer", notNull: true },
  });
  pgm.addConstraint("generated_documents", "generated_documents_type_check", {
    check: "type IN ('resume', 'cover_note', 'prep_kit')",
  });
  pgm.addConstraint("generated_documents", "generated_documents_version_positive", { check: "version >= 1" });
  // Older versions are kept: each regeneration is a new (higher) version of the same (user, job, type).
  pgm.addConstraint("generated_documents", "generated_documents_version_key", {
    unique: ["user_id", "job_id", "type", "version"],
  });
  pgm.createIndex("generated_documents", "job_id");
};

export const down = (pgm) => {
  pgm.dropTable("generated_documents");
};
