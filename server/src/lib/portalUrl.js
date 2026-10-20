import { parse } from "tldts";

/**
 * Normalizes a user-typed website address for a job portal.
 * Returns { baseUrl, domain } or null if it isn't a usable public http(s) address.
 *
 * - baseUrl is the origin only: credentials, path, query and fragment are dropped.
 * - domain is the registrable domain (www.naukri.com, m.naukri.com -> naukri.com),
 *   so subdomain/case variants count as duplicates.
 * - Only http/https are accepted (these values are rendered as links).
 * - IP addresses, localhost and unknown TLDs are rejected.
 */
export function normalizePortalUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 300) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const info = parse(url.hostname, { allowPrivateDomains: true });
  if (info.isIp || !info.domain || !info.publicSuffix || (!info.isIcann && !info.isPrivate)) return null;

  return { baseUrl: url.origin, domain: info.domain.toLowerCase() };
}
