export const up = (pgm) => {
  // No API can set this. Use `npm run make-admin -- <email>` (see README).
  pgm.addColumn("users", { is_admin: { type: "boolean", notNull: true, default: false } });
};

export const down = (pgm) => {
  pgm.dropColumn("users", "is_admin");
};
