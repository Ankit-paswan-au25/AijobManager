export const up = (pgm) => {
  pgm.createTable("match_scores", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    job_id: { type: "uuid", notNull: true, references: "jobs", onDelete: "CASCADE" },
    score: { type: "smallint", notNull: true },
    matched_skills: { type: "jsonb", notNull: true, default: "[]" },
    missing_skills: { type: "jsonb", notNull: true, default: "[]" },
    reasoning: { type: "text", notNull: true },
    // true when the LLM step failed (or isn't configured) and `score` is the deterministic step-1 score.
    llm_failed: { type: "boolean", notNull: true, default: false },
    scored_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("match_scores", "match_scores_score_range", { check: "score BETWEEN 0 AND 100" });
  pgm.addConstraint("match_scores", "match_scores_user_job_key", { unique: ["user_id", "job_id"] });
  pgm.createIndex("match_scores", "job_id");
};

export const down = (pgm) => {
  pgm.dropTable("match_scores");
};
