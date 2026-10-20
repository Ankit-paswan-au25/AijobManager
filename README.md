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

| `ANTHROPIC_API_KEY` | Optional. Enables AI scoring of jobs. Without it every job still gets its skill-overlap score, flagged `llmFailed`. |
| `ANTHROPIC_MODEL` | Optional. Overrides the default model set in `server/src/config/ai.js`. |

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

### Job matching (require login and a resume)

Each job is scored 0–100 against the user's resume. **There is no auto-apply**: the app never applies for you.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/jobs?status=&min_score=&sort=` | 200 `{ jobs, total, unscored, hiddenBelowMinScore }`. `status` is `new\|saved\|applied\|interview\|rejected\|archived`, `min_score` is 0–100 (**default 80**, so below-threshold jobs are hidden until the user lowers it), `sort` is `score` (default) or `received_at`, both newest/best first. Blank values count as not provided. |
| POST | `/api/jobs/:id/rescore` | 200 `{ jobId, match }`. 404 if the job isn't yours. |

Labels: 90–100 "Top match", 80–89 "Strong match: review skill gaps", below 80 "Below threshold".

How a score is made (`server/src/services/matchService.js`):

1. **Deterministic.** Skills are found with the dictionary in `server/src/config/skills.js` in the resume's skills list (or, for uploaded resumes with no list, in the resume text) and in the job title and snippet. `matched_skills` / `missing_skills` are the overlap; the base score is matched ÷ skills named in the job. A job that names no known skill gets 0.
2. **LLM.** The resume summary and skills, plus the job title, company and snippet, go to the model, which must answer with JSON `{ score, reasoning, skill_gaps }`. The reply is validated with zod; on any failure it is retried once. If it still fails (or no key is configured) the step 1 score is stored with `llm_failed = true`. Contact details and the rest of the resume are never sent.
3. A snippet under 100 characters adds "Note: this match is based on limited job information." to the reasoning.

Scoring runs in the background, never on a timer: after a Gmail sync adds jobs (only unscored jobs), and after the user's resume is saved (all jobs, using the new resume). `POST /rescore` runs it for one job on demand. Scores are stored in `match_scores`, one row per user and job.

AI code lives in `server/src/services/ai/` (`complete(prompt)` interface + Anthropic provider). Only services use it; route handlers never do (a test enforces this). Tests use a scripted fake provider and never need a key.

TODO: Naukri cards have no skills list, so their base score only sees the job title. Pagination for `GET /api/jobs`.

### Document generation (require login and a resume)

Generated **only when the user asks** (never after a sync, scoring or resume save). Needs `ANTHROPIC_API_KEY`; without it generation returns 503 `AI_NOT_CONFIGURED`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/jobs/:id` | 200 `{ job }` with `snippet`, `limitedInfo`, `jobUrl` (null when the email had no clean link) and `match`. 404 if not yours. |
| POST | `/api/jobs/:id/documents` body `{ "type": "resume" \| "cover_note" \| "prep_kit" }` | 201 `{ document }`. A new version every call; older versions stay in the table. |
| GET | `/api/jobs/:id/documents` | 200 `{ documents: { resume, cover_note, prep_kit } }`, the latest version of each (null if never generated). |

A document is `{ id, jobId, type, content, limitedInfo, limitedInfoNote, modelUsed, generatedAt, version }`. `content.text` is the plain text the Copy button uses. `limitedInfo` is true when `raw_snippet` is under 100 characters, and the note is "Based on limited job details. Open the posting for the full description."

- **Tailored resume** is validated before it is stored (`services/documents/resumeValidation.js`). Every skill, employer, job title, date range, year, school, degree and project in the output must appear in the original resume; for form resumes each experience entry must match an original entry. Any new item rejects the reply; it is regenerated once with the problems listed; if it fails again the user gets 422 `DOCUMENT_VALIDATION_FAILED` and nothing is stored.
- **Cover note**: 120–180 words, no `[placeholders]`. **Prep kit**: 10 questions with answer approaches, topics with YouTube *search phrases* (replies containing URLs are rejected), 5 questions to ask.
- Other errors: 502 `DOCUMENT_GENERATION_FAILED` (model unreachable or not JSON), 403 `RESUME_REQUIRED`, 409 `GENERATION_IN_PROGRESS` (same document already being generated).
- Privacy: for form resumes the name and contact details are never sent and are re-attached by the server. For uploaded resumes, emails and phone numbers are masked before sending, so the tailored result has no contact header (`content.contactOmitted`).

Limits: the validator checks names, titles, dates and skills from the dictionary, but **not invented numbers or achievements** (TODO). The cover note and prep kit are constrained by the prompt only, plus the length, placeholder and URL checks.

UI: `/jobs` lists jobs and `/jobs/:id` has the tabs Match, Tailored Resume, Cover Note and Prep Kit, with Regenerate and Copy on each document and an "Open job posting" link. The page states that the user applies on the portal themselves.

## Not built yet

A Gmail connect/sync UI and a sync scheduler. Not in scope yet. Also TODO: telling a user when their portal submission is rejected (and why; the reason is stored, but `GET /api/portals` only returns approved and pending as specified), notifications for admins, an admin audit trail, OCR for scanned resumes, parsing uploaded resumes into structured data, and zip-bomb protection for DOCX uploads. Email verification, password reset and CSRF tokens are also TODO.

## Project rules

This app never asks for job portal passwords, never scrapes portals, and never submits applications on the user's behalf.
