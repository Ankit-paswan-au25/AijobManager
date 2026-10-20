export const up = (pgm) => {
  pgm.addColumn("users", {
    // Default only backfills any pre-existing rows; it is dropped right after.
    full_name: { type: "text", notNull: true, default: "" },
  });
  pgm.alterColumn("users", "full_name", { default: null });
};

export const down = (pgm) => {
  pgm.dropColumn("users", "full_name");
};
