export const up = (pgm) => {
  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    // Always stored lower-cased by the service layer.
    email: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm) => {
  pgm.dropTable("users");
};
