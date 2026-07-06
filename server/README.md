# UMaT Complaint System — Backend (Express + MySQL)

REST API that replaces the frontend's old localStorage storage with a real
MySQL-backed, JWT-secured service, per `backend_design.pdf`.

## Prerequisites
- Node.js 18+
- A local MySQL 8 instance. The easiest path used during development is Docker:
  ```bash
  docker run --name umat-mysql -e MYSQL_ROOT_PASSWORD=umatroot \
    -e MYSQL_DATABASE=umat_complaints_db -p 3306:3306 -d mysql:8
  ```
  Or install natively: `brew install mysql && brew services start mysql`.

## Setup
```bash
cd server
cp .env.example .env      # adjust DB_* + JWT_SECRET to your instance
npm install
npm run setup             # applies schema.sql, then seeds reference + demo data
npm start                 # API on http://localhost:4000
```

`npm run setup` = `apply-schema.js` (creates tables) + `seed.js` (loads
faculties, departments, programmes, categories, students, staff from the repo's
`seedData.js`). Re-run `npm run seed` anytime to reset demo data.

## Demo credentials
Every seeded account uses the password **`password123`**.
- Students: 10-digit index numbers, e.g. `9012870422` (Bennin Paa Kofi) — see `seedData.js`
- Staff: `PS102` (Dean, FCMS), `CS107` (IT Directorate), `CS102` (Finance), etc. — `PS###` = permanent staff, `CS###` = contract staff.

## Schema notes (superset of the PDF)
The frontend uses more fields than the PDF's tables model, so the schema adds:
`categories`, `internal_notes`, `directives`, extended `appointments`
(`instructions`, `feedback`, `completed_at`), `comments.is_admin_instruction`,
`complaints.programme_id`, and `'Critical'` in the urgency enum. The API returns
the frontend's existing complaint object shape (embedded
`timeline/comments/internalNotes/directives/appointment`).

## Security
- Passwords hashed with bcrypt (10 rounds).
- JWT bearer auth on all endpoints except login.
- RBAC: students access only their own tickets; staff are scoped to their
  jurisdiction (Dean/Finance → faculty, IT → university, HOD → department).
- **Internal notes are redacted server-side for student viewers** (never sent
  over the wire).
- Status/appointment writes run inside SQL transactions; all queries are
  parameterized.

## Endpoints
- `POST /api/auth/student/login`, `POST /api/auth/staff/login`
- `PUT  /api/auth/student/password`, `PUT /api/auth/staff/password`
- `POST /api/complaints`, `GET /api/complaints/:id`
- `GET  /api/complaints/student/:index`, `GET /api/complaints/staff/:staffId`
- `POST /api/complaints/:id/claim`, `PUT /api/complaints/:id/status`
- `POST/PUT/DELETE /api/complaints/:id/directives[/:did]`
- `POST /api/complaints/:id/notes`
- `GET/POST /api/complaints/:id/comments`
- `POST /api/complaints/:id/appointment` (schedule), `PUT …/appointment` (complete)
- `POST /api/complaints/:id/remind`
- `GET  /api/meta`, `GET /api/health`

## Tests
```bash
npm start          # in one terminal
npm run smoke      # in another — 28 end-to-end assertions
```

## Frontend
The static frontend (`../index.html`, `../admin.html`) loads `../api.js` and
talks to this API. Serve it on port 8085 (its CORS origin), e.g.
`npx serve -l 8085 ..`. Override the API base by setting
`window.UMAT_API_BASE` before `api.js` loads.
