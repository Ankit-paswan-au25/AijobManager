export const up = (pgm) => {
  // user_jobs was keyed by (user_id, job_id) only. Status changes and history need a row id.
  // The volatile default is evaluated once per existing row, so current rows get distinct ids.
  pgm.addColumn("user_jobs", {
    id: { type: "uuid", notNull: true, default: pgm.func("gen_random_uuid()") },
    // Entered by the user by hand. Nothing in the app (and nothing from Gmail) ever sets these.
    interview_date: { type: "timestamptz" },
    interview_notes: { type: "text" },
  });
  pgm.addConstraint("user_jobs", "user_jobs_pkey", { primaryKey: "id" });
  pgm.addConstraint("user_jobs", "user_jobs_notes_max_2000", {
    check: "interview_notes IS NULL OR char_length(interview_notes) <= 2000",
  });

  pgm.createTable("status_history", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_job_id: { type: "uuid", notNull: true, references: "user_jobs", onDelete: "CASCADE" },
    from_status: { type: "user_job_status", notNull: true },
    to_status: { type: "user_job_status", notNull: true },
    changed_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  // A history row means the status really changed.
  pgm.addConstraint("status_history", "status_history_changed", { check: "from_status <> to_status" });
  pgm.createIndex("status_history", ["user_job_id", "changed_at"]);
};

export const down = (pgm) => {
  pgm.dropTable("status_history");
  pgm.dropConstraint("user_jobs", "user_jobs_notes_max_2000");
  pgm.dropConstraint("user_jobs", "user_jobs_pkey");
  pgm.dropColumns("user_jobs", ["id", "interview_date", "interview_notes"]);
};
