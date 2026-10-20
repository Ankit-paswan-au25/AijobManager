export const up = (pgm) => {
  pgm.createType("resume_source", ["uploaded", "created"]);
  pgm.createTable("resumes", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    // One current resume per user. Saving a new one replaces the old one.
    user_id: {
      type: "uuid",
      notNull: true,
      unique: true,
      references: "users",
      onDelete: "CASCADE",
    },
    source: { type: "resume_source", notNull: true },
    // Path relative to the uploads directory. NULL for resumes created in the form.
    file_path: { type: "text" },
    extracted_text: { type: "text", notNull: true },
    // Form data for "created" resumes. NULL for uploads (structured parsing is a later phase).
    structured_data: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm) => {
  pgm.dropTable("resumes");
  pgm.dropType("resume_source");
};
