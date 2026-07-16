# UMaT Complaint System: Backend (Express + MySQL)

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
npm run setup             # applies schema.sql, then seeds reference data + one admin account
npm start                 # API on http://localhost:4000
```

`npm run setup` = `apply-schema.js` (creates tables) + `seed.js` (loads
faculties, departments, programmes, and categories reference data, plus one
staff account, from the repo's `seedData.js`). Re-run `npm run seed` anytime
to reset reference data. It clears and reinserts in dependency order, so any
students, extra staff, or complaints created since are wiped too.

## Demo credentials
`seed.js` only creates `ADMIN001` (System Administrator, faculty_key `null`).
Its password is its own staff ID, `ADMIN001`. Every staff/admin account's
password defaults to its own staff ID, not a shared demo password, whether
seeded or registered later via `POST /api/auth/staff`. Log in as `ADMIN001` to
register additional Deans/Finance/IT/HOD staff through the admin panel.

Students are not seeded. Register one via `POST /api/auth/student/signup`
(email must end `@st.umat.edu.gh`) or through the student portal's sign-up form.

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
- RBAC: students access only their own tickets. Staff are scoped to their
  jurisdiction: Dean → their faculty's own office (`faculty_key` +
  `department_label`), Finance → their faculty, IT → university-wide,
  HOD → their faculty (read-only/analytics in the UI). SuperAdmin sees
  everything, including for reassignment eligibility checks.
- Internal notes are redacted server-side for student viewers (never sent
  over the wire).
- Status/appointment writes run inside SQL transactions; all queries are
  parameterized.

## Endpoints

**Auth** (`/api/auth`)
- `POST /student/signup`, `POST /student/login`, `POST /student/complete-profile`
- `POST /staff/login`
- `PUT  /student/password`, `PUT /staff/password`
- `PUT  /student/profile`, `PUT /staff/profile`
- `GET  /staff` (SuperAdmin-only roster), `POST /staff` (register), `DELETE /staff` (wipe all but self), `DELETE /staff/:id`

**Complaints** (`/api/complaints`)
- `POST /`: file a complaint (public, optional JWT, optional `attachment` file)
- `GET  /student/:index`, `GET /staff/:staffId`: scoped lists
- `GET  /public/track/:id`: anonymous ticket lookup
- `GET  /:id`, `GET /:id/attachment`
- `POST /:id/claim`
- `GET  /:id/eligible-officers`: staff in scope for reassignment
- `PUT  /:id/status`: status change and/or `assignedStaffId` reassignment (server-validates the target is in scope)
- `POST/PUT/DELETE /:id/directives[/:did]`
- `POST /:id/notes` (internal, staff-only, never sent to students)
- `GET/POST /:id/comments`
- `POST /:id/appointment` (schedule), `PUT …/appointment` (complete)
- `POST /:id/remind`

**Meta** (`/api/meta`)
- `GET  /`: faculties/departments/programmes/categories for form dropdowns
- `GET  /admin-dashboard`: KPI + recent-complaints summary
- `POST /faculties`, `POST /departments`

`GET /api/health` reports API + DB liveness.

## Tests
```bash
npm start          # in one terminal
npm run smoke      # in another, running end-to-end checks against the live API
```

## Frontend
The static frontend (`../index.html`, `../admin.html`) loads `../api.js` and
talks to this API. Serve it on port 8085 (its CORS origin), e.g.
`npx serve -l 8085 ..`. Override the API base by setting
`window.UMAT_API_BASE` before `api.js` loads.
