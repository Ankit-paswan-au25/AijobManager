export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const MAX_PAGES = 5; // 5 x 100 = at most 500 candidate messages per sync
const MAX_MESSAGE_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

/** Errors never contain tokens, codes or message content. `kind`: "invalid_grant" | "http" | "network". */
export class GmailApiError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = "GmailApiError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Minimal Google OAuth + Gmail REST client (plain fetch; `fetchImpl` is injectable for tests).
 * Only the gmail.readonly scope is ever requested. Callers must never log arguments or results.
 */
export function createGmailClient({ clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  async function request(url, init = {}) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new GmailApiError("network", "Could not reach Google");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (body?.error === "invalid_grant") throw new GmailApiError("invalid_grant", "Google rejected the refresh token", res.status);
      throw new GmailApiError("http", `Google API returned ${res.status}`, res.status);
    }
    return body;
  }

  const form = (params) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const authed = (accessToken) => ({ headers: { Authorization: `Bearer ${accessToken}` } });

  return {
    buildAuthUrl(state) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GMAIL_READONLY_SCOPE, // the only scope we ever ask for
        access_type: "offline",
        prompt: "consent", // makes Google return a refresh token
        state,
      });
      return `${AUTH_URL}?${params}`;
    },

    /** Returns { refreshToken, scopes: string[] }. */
    async exchangeCode(code) {
      const body = await request(
        TOKEN_URL,
        form({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
      );
      return {
        refreshToken: body.refresh_token ?? null,
        accessToken: body.access_token ?? null,
        scopes: String(body.scope ?? "").split(/\s+/).filter(Boolean),
      };
    },

    /** Returns a short-lived access token (never stored). */
    async refreshAccessToken(refreshToken) {
      const body = await request(
        TOKEN_URL,
        form({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
      );
      if (!body?.access_token) throw new GmailApiError("http", "No access token returned");
      return body.access_token;
    },

    /** Best effort: asks Google to invalidate the token. Never throws. */
    async revoke(token) {
      try {
        await fetchImpl(REVOKE_URL, { ...form({ token }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        /* ignore */
      }
    },

    /** Message ids matching a Gmail search query (ids only; no content is read here). */
    async searchMessageIds(accessToken, query) {
      const ids = [];
      let pageToken;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ q: query, maxResults: "100" });
        if (pageToken) params.set("pageToken", pageToken);
        const body = await request(`${API}/messages?${params}`, authed(accessToken));
        ids.push(...(body.messages ?? []).map((m) => m.id));
        pageToken = body.nextPageToken;
        if (!pageToken) break;
      }
      return ids;
    },

    /** Only the From header, receive time and size. Used to verify the sender BEFORE reading anything else. */
    async getMessageHeaders(accessToken, id) {
      const params = new URLSearchParams({ format: "metadata", metadataHeaders: "From" });
      const body = await request(`${API}/messages/${encodeURIComponent(id)}?${params}`, authed(accessToken));
      const from = body.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? null;
      return {
        from,
        receivedAt: body.internalDate ? new Date(Number(body.internalDate)) : null,
        sizeBytes: Number(body.sizeEstimate ?? 0),
      };
    },

    /** The full raw message. Call only for messages whose sender passed the allowlist. */
    async getRawMessage(accessToken, id) {
      const body = await request(`${API}/messages/${encodeURIComponent(id)}?format=raw`, authed(accessToken));
      return Buffer.from(String(body.raw ?? ""), "base64url");
    },
  };
}

export { MAX_MESSAGE_BYTES };
