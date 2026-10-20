export const up = (pgm) => {
  // Optional, entered by the user at signup. Free text, shown only to admins in the user list.
  pgm.addColumns("users", {
    country: { type: "text" },
    city: { type: "text" },
  });
  pgm.addConstraint("users", "users_country_max_100", { check: "country IS NULL OR char_length(country) <= 100" });
  pgm.addConstraint("users", "users_city_max_100", { check: "city IS NULL OR char_length(city) <= 100" });
};

export const down = (pgm) => {
  pgm.dropConstraint("users", "users_city_max_100");
  pgm.dropConstraint("users", "users_country_max_100");
  pgm.dropColumns("users", ["country", "city"]);
};
