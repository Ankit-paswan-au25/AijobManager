import { AppError } from "../lib/errors.js";

/** Validates req.params against a zod schema. */
export function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return next(new AppError(400, "VALIDATION_ERROR", message));
    }
    next();
  };
}

/** Validates req.query against a zod schema (defaults applied). Blank values like `?status=` count as not provided. */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const provided = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ""));
    const result = schema.safeParse(provided);
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return next(new AppError(400, "VALIDATION_ERROR", message));
    }
    req.query = result.data;
    next();
  };
}

/** Validates req.body against a zod schema and replaces it with the parsed value. */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return next(new AppError(400, "VALIDATION_ERROR", message));
    }
    req.body = result.data;
    next();
  };
}
