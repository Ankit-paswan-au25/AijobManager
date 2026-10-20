# AI Job Manager

Job application assistant. Currently implemented: account signup, login, logout and a protected home page.

- `client/` — React + Vite + Tailwind + React Router
- `server/` — Node.js + Express REST API under `/api`, PostgreSQL via `pg`, migrations via `node-pg-migrate`

## Prerequisites

- Node.js 20+ (22 recommended)
- PostgreSQL 14+ (either Docker or a local install)

## 1. Install

```bash
npm install
```

## 2. Database

Using Docker (a PostgreSQL 16 container on host port **5433**, so it won't clash with a local install on 5432):

```bash
npm run db:up
```

Or use your own PostgreSQL and create a database and user for the app.

## 3. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Default matches the Docker container above. |
| `JWT_SECRET` | Required, at least 32 characters. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN_DAYS` | Session lifetime, default 7. |
| `PORT` | API port, default 4000. |
| `CLIENT_ORIGIN` | Default `http://localhost:5173`. |
| `UPLOAD_DIR` | Where uploaded resumes are stored, default `server/uploads` (git-ignored). Never served over HTTP. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY` | Optional. All four or none. See "Gmail setup" below. Without them `/api/gmail/*` answers 503 and the rest of the app works normally. |

For the local Docker database, `DATABASE_URL` is `postgres://jobmanager:jobmanager@localhost:5433/jobmanager`.

`.env` is git-ignored. Never commit real secrets.

## 4. Run migrations

```bash
npm run migrate -- up      # apply
npm run migrate -- down    # roll back one
```

## 5. Start both apps

In two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the API, so the session cookie is same-origin.

## Tests

```bash
npm test
```

## API

All errors have the shape `{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | `{ fullName, email, password }` | 201 `{ user }` + session cookie |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ user }` + session cookie |
| POST | `/api/auth/logout` | — | 204, cookie cleared |
| GET | `/api/auth/me` | — | 200 `{ user }`, or 401 without a valid session |

### Resumes (require login)

Each user has one current resume. Saving a new one replaces the old one (and deletes the old file). After login, a user without a resume is redirected to `/resume-setup` and can't open any other page until one exists.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/api/resumes/me` | — | 200 `{ resume }`, or 404 `RESUME_NOT_FOUND` |
| POST | `/api/resumes/upload` | multipart, field `file` (PDF or DOCX, max 5 MB) | 201 `{ resume }` |
| POST | `/api/resumes/create` | `{ name, contact, summary, skills[], experience[], education[], projects[] }` | 201 `{ resume }` |

The file type is checked from the file's bytes, not its name or Content-Type. Errors: `415 UNSUPPORTED_FILE_TYPE`, `413 FILE_TOO_LARGE`, `422 UNREADABLE_FILE` / `NO_TEXT_FOUND` (e.g. scanned, image-only PDFs).

Backend routes added in later phases should be mounted behind `createRequireResume` (`server/src/middleware/requireResume.js`), which returns `403 RESUME_REQUIRED`.

### Job portals (require login and a resume)

Four portals are seeded as approved: Naukri, LinkedIn, foundit, Indeed. The app only stores a portal's name and website address. It never asks for portal passwords, never scrapes portals and never logs in to them.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/api/portals` | — | 200 `{ portals }`: approved portals plus **your own** pending submissions, each with `selected` |
| PUT | `/api/users/me/portals` | `{ portalIds: [uuid, ...] }` | 200 `{ portals }`. Replaces your whole selection; only approved portals are allowed |
| POST | `/api/portals/submit` | `{ name, baseUrl }` | 201 `{ portal }` (status `pending`), or 409 `DUPLICATE_PORTAL` |

- `baseUrl` is reduced to its origin, and duplicates are detected by registrable domain (`www.naukri.com`, `m.naukri.com` and `in.indeed.com` all match existing portals). Only public `http(s)` addresses are accepted; localhost, IPs and `javascript:` URLs are rejected.
- A pending portal is visible only to its submitter and to admins. A user can have at most 5 portals under review.
- Nothing is ever approved automatically. Users see "Under review, expected within 48 hours"; the admin queue shows how long each portal has been pending and flags those past 48 hours.

### Admin

Admin routes require `users.is_admin`. There is deliberately no API or signup field for it. Grant or revoke it from the command line:

```bash
npm run make-admin -- someone@example.com
npm run make-admin -- someone@example.com --revoke
```

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/api/admin/portals/pending` | — | 200 `{ portals }`, oldest first, with `pendingMinutes` and `overdue` |
| POST | `/api/admin/portals/:id/approve` | — | 200 `{ portal }`, or 409 `NOT_PENDING` |
| POST | `/api/admin/portals/:id/reject` | `{ reason }` (required) | 200 `{ portal }`, or 409 `NOT_PENDING` |

Non-admins get `403 FORBIDDEN`. The admin page is at `/admin` (a link shows in the header for admins).

### Gmail job alerts (require login and a resume)

The app reads **only** job-alert emails from the sender addresses listed in `server/src/config/alertSenders.js` (the single allowlist) and only the last 30 days. It uses the `gmail.readonly` scope and nothing else. It never logs in to a job portal, scrapes one, or applies for you.

| Portal | Sender | Status |
| --- | --- | --- |
| Naukri | `naukrialerts@naukri.com` | enabled, parser tested against `naukri_1.eml` |
| Indeed | `donotreply@jobalert.indeed.com` | enabled, parser tested against `indeed.eml` |
| Shine | `jobs@jobsalert.shine.com` | enabled, parser tested against `shine_1.eml` |
| Glassdoor | `noreply@glassdoor.com` | **disabled**: no sample email yet, no parser |
| Wellfound | `team@hi.wellfound.com` | **disabled**: no sample email yet, no parser |
| foundit | `jobmessenger@monsterindia.com` | **disabled**: no sample email yet, no parser |

To enable a portal: add its real sample `.eml` to `server/fixtures/alerts/`, write its parser in `server/src/services/alerts/parsers/`, register it in `alertParser.js`, add tests, then set `enabled: true`.

**Gmail setup**

1. In Google Cloud Console create an OAuth client of type "Web application", enable the Gmail API, and add the `gmail.readonly` scope on the consent screen (add yourself and friends as test users while the app is unverified).
2. Set the authorized redirect URI to `http://localhost:5173/api/gmail/callback` (goes through the Vite proxy, so the session cookie is sent) and put the same value in `GOOGLE_REDIRECT_URI`.
3. Generate the token encryption key and put it in `GMAIL_TOKEN_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Losing or changing it means users must reconnect.
4. There is no Gmail button in the UI yet. To connect, log in, then open `http://localhost:5173/api/gmail/connect` in the same browser.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/gmail/connect` | 302 to Google's consent screen |
| GET | `/api/gmail/callback` | Google returns here; redirects to `CLIENT_ORIGIN/?gmail=connected\|denied\|error` |
| POST | `/api/gmail/disconnect` | 204. Revokes at Google (best effort) and deletes the stored token |
| POST | `/api/gmail/sync` | 200 `{ sync: { messagesFound, messagesIgnored, emailsParsed, emailsSkipped[], jobsFound, jobsInserted, userJobsCreated, linksNeeded, ... } }`. On demand only, no background job |

How it works:

- Refresh tokens are encrypted at rest (AES-256-GCM). Access tokens are never stored. Tokens, email bodies and message ids are never logged.
- Sender matching uses the full address exactly; display names are ignored. Gmail's search is fuzzy, so the address is verified again from the message headers before a body is fetched. Look-alike domains and other senders are never read.
- Each job card becomes one `jobs` row (shared, deduplicated by `job_url`, else by portal + title + company + location) and one `user_jobs` row per user (status `new`). Syncing twice creates no duplicates.
- Job links are rebuilt from the portal's own domain with all tracking/login parameters removed (Indeed keeps only its public job id). If no clean link exists the URL is stored as null with `needs_link = true`. **Every Shine link is treated as login-tokenized and dropped**, so all Shine jobs currently have `needs_link = true`.
- An email from an allowed sender that yields zero jobs is recorded as skipped (with a reason, in the sync summary and as a content-free log line) and nothing from it is stored.
- Sample emails in `server/fixtures/alerts/` come from real mailboxes and contain personalised tracking values. Redact them before sharing the repo publicly.

TODO: Naukri's "jobs applied by your peers" email is a known non-job email; its skip test is a `test.todo` until that sample file exists. Naukri cards don't show experience or posted age, so those fields are null.

### Auth

Passwords: 10–72 bytes, hashed with bcrypt. Sessions: JWT in an httpOnly, SameSite=Lax cookie (Secure in production).

## Not built yet

Job matching, document generation and other AI features; a Gmail/jobs UI; a sync scheduler. Not in scope yet. Also TODO: telling a user when their portal submission is rejected (and why; the reason is stored, but `GET /api/portals` only returns approved and pending as specified), notifications for admins, an admin audit trail, OCR for scanned resumes, parsing uploaded resumes into structured data, and zip-bomb protection for DOCX uploads. Email verification, password reset and CSRF tokens are also TODO.

## Project rules

This app never asks for job portal passwords, never scrapes portals, and never submits applications on the user's behalf.
