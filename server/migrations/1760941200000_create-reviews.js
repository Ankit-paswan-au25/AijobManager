export const up = (pgm) => {
  pgm.createType("review_status", ["visible", "hidden", "flagged"]);

  pgm.createTable("reviews", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    // NULL means the review is about the app itself.
    portal_id: { type: "uuid", references: "portals", onDelete: "CASCADE" },
    body: { type: "text", notNull: true },
    status: { type: "review_status", notNull: true, default: "visible" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("reviews", "reviews_body_length", { check: "char_length(body) BETWEEN 1 AND 1000" });
  pgm.createIndex("reviews", ["status", { name: "created_at", sort: "DESC" }]);
  pgm.createIndex("reviews", "portal_id");
  pgm.createIndex("reviews", "user_id");
};

export const down = (pgm) => {
  pgm.dropTable("reviews");
  pgm.dropType("review_status");
};
