export const up = (pgm) => {
  // Append-only record of what admins did. The app never updates or deletes rows here.
  pgm.createTable("admin_actions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    // SET NULL so the record survives if the admin's account is ever deleted.
    admin_id: { type: "uuid", references: "users", onDelete: "SET NULL" },
    action: { type: "text", notNull: true },
    target_type: { type: "text", notNull: true },
    // Points at a portal, review or resume depending on target_type (so it has no foreign key).
    target_id: { type: "uuid", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("admin_actions", "admin_actions_action_check", {
    check: "action IN ('approve_portal','reject_portal','hide_review','unhide_review','flag_review','view_resume')",
  });
  pgm.addConstraint("admin_actions", "admin_actions_target_type_check", {
    check: "target_type IN ('portal','review','resume')",
  });
  pgm.createIndex("admin_actions", [{ name: "created_at", sort: "DESC" }]);
  pgm.createIndex("admin_actions", "admin_id");
};

export const down = (pgm) => {
  pgm.dropTable("admin_actions");
};
