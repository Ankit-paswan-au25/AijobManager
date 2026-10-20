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

### Auth

Passwords: 10–72 bytes, hashed with bcrypt. Sessions: JWT in an httpOnly, SameSite=Lax cookie (Secure in production).

## Not built yet

Gmail, job matching and AI features. Not in scope yet. Also TODO: telling a user when their portal submission is rejected (and why; the reason is stored, but `GET /api/portals` only returns approved and pending as specified), notifications for admins, an admin audit trail, OCR for scanned resumes, parsing uploaded resumes into structured data, and zip-bomb protection for DOCX uploads. Email verification, password reset and CSRF tokens are also TODO.

## Project rules

This app never asks for job portal passwords, never scrapes portals, and never submits applications on the user's behalf.
