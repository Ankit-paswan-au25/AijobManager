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

| `AI_PROVIDER` | Optional: `anthropic` or `ollama`. If unset: Anthropic when `ANTHROPIC_API_KEY` is set, otherwise AI is off. See "Local AI with Ollama" below. |
| `ANTHROPIC_API_KEY` | Optional. Enables AI scoring of jobs. Without any AI provider every job still gets its skill-overlap score, flagged `llmFailed`. |
| `ANTHROPIC_MODEL` | Optional. Overrides the default model set in `server/src/config/ai.js`. |
| `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_TIMEOUT_MS` | Only used with `AI_PROVIDER=ollama`. Model is required; URL defaults to `http://localhost:11434`; timeout to 10 minutes. |

### Local AI with Ollama

Run the same features against a local model instead of a hosted API (no key, no cost, nothing leaves your machine).

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull qwen2.5:7b-instruct`
2. In `server/.env` set `AI_PROVIDER=ollama` and `OLLAMA_MODEL=qwen2.5:7b-instruct`, then restart the API.

Things to know:

- **Explicit provider, strict startup.** `AI_PROVIDER=ollama` without `OLLAMA_MODEL` (or `anthropic` without a key) stops the server with an error naming the setting. `OLLAMA_*` values alone never switch the provider on. Set `AI_PROVIDER=anthropic` (or just leave it and keep the key) to go back.
- **Pick an instruct model, not a coder model.** The documents have strict checks (cover note 120-180 words, valid JSON shapes). A coder model such as `qwen2.5-coder:7b` writes JSON fine but ignores word counts, so cover notes are often rejected with `DOCUMENT_VALIDATION_FAILED`.
- **Expect it to be slow on CPU.** A 7B model on CPU runs at roughly 7 tokens/s: scoring takes 10-25 s per job, and a prep kit or tailored resume takes minutes. That is why the timeout is 10 minutes and job re-scoring runs one job at a time against Ollama.
- The server asks Ollama for an 8192-token context window (its default is small and silently cuts off long prompts) and up to 3072 output tokens.
- Each saved document records `model_used` as `ollama:<model>`, so it is never mistaken for a hosted-model result.
- If Ollama is not running, or the model has not been pulled, document generation answers 502 `DOCUMENT_GENERATION_FAILED` and the app keeps working (jobs fall back to the skill-overlap score, flagged `llmFailed`). The server log says which problem it was (not running, model not pulled, timeout).

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
| POST | `/api/auth/signup` | `{ fullName, email, password, country?, city? }` | 201 `{ user }` + session cookie. `country` and `city` are optional free text (max 100 characters, blank = not given) and only admins can see them |
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

### Admin: users, reviews and the audit log

More routes under `/api/admin`, in `server/src/routes/adminConsole.js`. The portal review routes above are unchanged. Every route needs an admin: signed-out visitors get 401 and signed-in non-admins get 403 (a test lists every admin route and checks both, and fails if a route is added without being listed).

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/admin/users?page=&page_size=` | 200 `{ users, page, pageSize, total }`, newest signups first. Each user: `id, fullName, email, createdAt, country, city, resumeStatus` (`none`/`created`/`uploaded`), `resumeUrl` (null if no resume). Never includes resume text or password hashes |
| GET | `/api/admin/users/:id/resume` | 200 `{ user, resume: { id, source, text, updatedAt } }`. **Writes an audit row first**; if that fails no text is returned. 404 if no such user or no resume (nothing logged). The stored file and its path are never returned |
| GET | `/api/admin/reviews?status=&page=&page_size=` | 200 `{ reviews, page, pageSize, total }`, every status, with the author |
| PATCH | `/api/admin/reviews/:id` body `{ status: "visible"\|"hidden"\|"flagged" }` | 200 `{ review }`. `hidden` = hide, `visible` = unhide, `flagged` = flag. Setting the status it already has changes and logs nothing |
| GET | `/api/admin/audit-log?page=&page_size=` | 200 `{ actions, page, pageSize, total }`, newest first, each with `adminEmail`, `action`, `targetType`, `targetId`, `targetLabel` |

`page` starts at 1; `page_size` is 1–100 (default 20).

**Audit log** (`admin_actions`: `id, admin_id, action, target_type, target_id, created_at`). Actions: `approve_portal`, `reject_portal`, `hide_review`, `unhide_review`, `flag_review`, `view_resume` (a CHECK in the database allows only these). Targets are a portal, a review or a resume. It is append-only: nothing in the app edits or deletes rows, and rows survive an admin account being deleted (`admin_id` becomes null). How each action is logged:
- **hide / unhide / flag**: the status change and its audit row are one transaction, so neither exists without the other.
- **view resume**: the audit row is written before the text is returned.
- **approve / reject**: the portal admin code was left as it was and is wrapped in `createAuditedPortalAdminService` when the app is built (`createApp({ auditRepository })`). The row is written just after the portal change is saved, so if that write fails the approve/reject still succeeds and the failure is logged on the server. TODO: write it inside the portal review's own transaction.

**Reviews** (`reviews`: `id, user_id, portal_id, body, status, created_at`). Any signed-in user with a resume can post: `POST /api/reviews` `{ body (1–1000 characters), portal_id? }` (no `portal_id` = about the app; only approved portals can be reviewed, otherwise 400 `INVALID_PORTAL`). `GET /api/reviews?portal_id=` or `?about=app` lists only `visible` reviews; hidden **and flagged** reviews are not shown, and no author details are returned. TODO: a limit on how many reviews one user can post.

Origin: signup takes optional `country` and `city` (columns on `users`). They only appear in the admin user list.

UI: admins get Users (`/admin/users`), Moderate (`/admin/reviews`) and Audit log (`/admin/audit-log`) in the header. A resume opens only when the admin clicks "Open resume" (so a page reload never logs a view). Users get a Reviews page at `/reviews`. These pages are only a convenience; the server enforces admin access.

TODO: search and filters on the user list, names for review targets that were deleted, exporting the audit log.

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

Generated **only when the user asks** (never after a sync, scoring or resume save). Needs an AI provider (`ANTHROPIC_API_KEY`, or `AI_PROVIDER=ollama`); without one generation returns 503 `AI_NOT_CONFIGURED`.

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

### Dashboard and status tracking (require login and a resume)

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/dashboard` | 200 `{ topMatches, strongMatches, applied, interviews, pendingPortals, otherOpenJobs }`. Read-only. |
| PATCH | `/api/user-jobs/:id` body `{ status?, interview_date?, interview_notes? }` (at least one) | 200 `{ userJob }`. 404 if the row isn't yours. |
| GET | `/api/user-jobs/:id/history` | 200 `{ history: [{ id, fromStatus, toStatus, changedAt }] }`, newest first. |

`:id` is the `user_jobs` id, the `userJobId` field on every job (the job page itself still uses the shared job `id`). `status` is `new|saved|applied|interview|rejected|archived`; a user may move a job to any of them. Setting the status it already has changes nothing and writes no history row. `interview_date` is an ISO 8601 date-time with `Z` or an offset (the UI sends the user's local time as UTC); `null` clears it. `interview_notes` is up to 2000 characters; `null` or blank clears it. A change of status and its `status_history` row are written in one transaction (the row is locked first, so `from_status` is always right).

**Nothing changes a status automatically.** Not a sync, scoring, a resume update, viewing the dashboard, or entering an interview date. Interview dates are entered by the user only. The app doesn't read Gmail for interview invitations: sync still reads only the senders in `server/src/config/alertSenders.js`, and the status/dashboard code never calls Gmail (a test checks that).

Sections (a job is in at most one; checked in this order):
1. rejected or archived: none (they stay on the All jobs page);
2. **Interviews**: status `interview`, or an interview date entered. A date alone is enough to list the job here but leaves its status as it is (the card shows the real status). Upcoming dates first, then jobs with no date, then past ones;
3. **Applied**: status `applied`;
4. **Top matches** (score 90+) and **Strong matches** (80–89): jobs still `new` or `saved`.

Open jobs below 80 or not scored yet are in no section; `otherOpenJobs` counts them. **Pending portal review** lists only the portals the caller submitted that are still pending (never another user's, not even for admins; admins still have `/api/admin/portals/pending`) and only the same fields `GET /api/portals` already shows the submitter.

Cards show title, company, portal, score label, status, posted age and received date. The alert gives the posted age as of the day it arrived, so the UI shows "Posted ~N days ago" with the days since then added, or nothing if the alert didn't say. The job page (`/jobs/:id`) has the status control, interview date and notes, and the status history. The dashboard is the home page (`/`).

Migration `status-tracking` adds `user_jobs.id` (primary key; existing rows get their own ids), `interview_date`, `interview_notes`, and the `status_history` table (`id, user_job_id, from_status, to_status, changed_at`; deleted with its job link).

TODO: pagination for the dashboard and job list, a status filter on the jobs page, a history entry for interview-date edits.

## Not built yet

A Gmail connect/sync UI and a sync scheduler. Not in scope yet. Also TODO: telling a user when their portal submission is rejected (and why; the reason is stored, but `GET /api/portals` only returns approved and pending as specified), notifications for admins, an admin audit trail, OCR for scanned resumes, parsing uploaded resumes into structured data, and zip-bomb protection for DOCX uploads. Email verification, password reset and CSRF tokens are also TODO.

## Project rules

This app never asks for job portal passwords, never scrapes portals, and never submits applications on the user's behalf.
