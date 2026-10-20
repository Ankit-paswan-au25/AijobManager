export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Thin fetch wrapper. Server errors have the shape { error: { code, message } }.
 * `body` may be a plain object (sent as JSON) or a FormData (sent as multipart).
 */
export async function api(path, { method = "GET", body } = {}) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Unexpected error",
    );
  }
  return data;
}
