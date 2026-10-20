export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code, message) => new AppError(400, code, message);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code, message) => new AppError(409, code, message);

/** Consistent error body: { error: { code, message } } */
export function errorBody(code, message) {
  return { error: { code, message } };
}
