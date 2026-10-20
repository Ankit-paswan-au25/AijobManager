export const up = (pgm) => {
  pgm.createTable("gmail_connections", {
    // One Gmail account per user.
    user_id: { type: "uuid", primaryKey: true, references: "users", onDelete: "CASCADE" },
    // AES-256-GCM ciphertext (see lib/tokenCipher.js). The plaintext token is never stored or logged.
    refresh_token_encrypted: { type: "text", notNull: true },
    scope: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

export const down = (pgm) => {
  pgm.dropTable("gmail_connections");
};
