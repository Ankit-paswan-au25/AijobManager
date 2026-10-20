/**
 * Turns a link found in an alert email into a clean, token-free job URL, or null.
 *
 * Rules (all must hold):
 *  - http(s) only, no embedded credentials;
 *  - host is the portal's own domain (or a subdomain of it);
 *  - the portal has an explicit rule for what a job link looks like (positive match);
 *  - the result never contains a query string or fragment, except an allowlisted job-id
 *    parameter rebuilt into a canonical URL (Indeed's `jk`, which is a public job id, not a token).
 *
 * Alert emails carry personalised links (the emails themselves say so). Anything that
 * doesn't match a portal's job-link rule is rejected, and the job is flagged needs_link.
 */

const PORTAL_LINK_RULES = {
  naukri: {
    domains: ["naukri.com"],
    // Card links look like /jd/job-listings-<slug>-<jobid>?xp=..&xid=..&uid=..  (all query params are personal)
    clean(url) {
      return /^\/jd\/job-listings-[a-z0-9-]+$/i.test(url.pathname) ? `https://${url.host}${url.pathname}` : null;
    },
  },
  indeed: {
    domains: ["indeed.com"],
    // Card links look like /rc/clk/dl?jk=<16 hex>&qd=<personal blob>&rd=..&tk=..  Only `jk` (the job id) is kept.
    clean(url) {
      if (!/^\/(rc\/clk(\/dl)?|viewjob)\/?$/.test(url.pathname)) return null;
      const jk = url.searchParams.get("jk");
      return jk && /^[0-9a-f]{16}$/i.test(jk) ? `https://${url.host}/viewjob?jk=${jk.toLowerCase()}` : null;
    },
  },
  shine: {
    domains: ["shine.com"],
    // Shine's emails say their links "allow direct login", and every job link is an opaque tracking
    // redirect whose `ext` parameter decodes to a login token. Treated as tokenized: never stored.
    clean: () => null,
  },
};

const hostMatches = (host, domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));

export function cleanJobUrl(portal, href) {
  const rule = PORTAL_LINK_RULES[portal];
  if (!rule || typeof href !== "string") return null;

  let url;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!hostMatches(url.hostname.toLowerCase(), rule.domains)) return null;

  const cleaned = rule.clean(url);
  if (!cleaned) return null;

  // Final structural guard: the only permitted query string is Indeed's canonical `?jk=<16 hex>`.
  // (No keyword blacklist: legitimate slugs such as "authentication-engineer" must survive.)
  const hasQueryOrFragment = /[?#]/.test(cleaned);
  if (hasQueryOrFragment && !/^https:\/\/[^/?#]+\/viewjob\?jk=[0-9a-f]{16}$/.test(cleaned)) return null;
  return cleaned;
}
