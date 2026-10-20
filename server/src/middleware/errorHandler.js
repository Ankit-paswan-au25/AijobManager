import { AppError, errorBody } from "../lib/errors.js";

export function notFoundHandler(_req, res) {
  res.status(404).json(errorBody("NOT_FOUND", "Route not found"));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json(errorBody(err.code, err.message));
  }
  // body-parser errors (malformed JSON, payload too large)
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json(errorBody("INVALID_JSON", "Request body is not valid JSON"));
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json(errorBody("PAYLOAD_TOO_LARGE", "Request body is too large"));
  }
  // Log only the error name/message; never request bodies (may contain passwords).
  console.error("Unhandled error:", err?.name, err?.message);
  res.status(500).json(errorBody("INTERNAL_ERROR", "Something went wrong"));
}
