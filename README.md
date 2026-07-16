# UMaT Campus Complaint System

A complaint/grievance management system for the University of Mines and Technology (UMaT), Tarkwa. Students file complaints (academic, financial, ICT, harassment, general) that are automatically routed to the right Dean, Faculty Finance Officer, or the Central IT Directorate, tracked through resolution, and escalated with directives and appointments.

- **Student portal** (`index.html`): public complaint filing (no account required), ticket tracking, appointment/directive follow-up.
- **Admin workstation** (`admin.html`): Deans, Finance Officers, IT staff, and HODs claim, resolve, and analyze complaints scoped to their jurisdiction.
- **Backend API** (`server/`): Node/Express + MySQL, JWT-authenticated, replacing the app's original browser-only storage.

## Stack

- Frontend: vanilla HTML/CSS/JS (no build step), Chart.js for analytics, Lucide icons.
- Backend: Node.js, Express, MySQL (`mysql2`), JWT auth (`jsonwebtoken`), bcrypt password hashing, Multer for file uploads.

## Getting started

### 1. Backend

Requires a local MySQL 8 instance. The quickest way is Docker:

```bash
docker run --name umat-mysql -e MYSQL_ROOT_PASSWORD=umatroot \
  -e MYSQL_DATABASE=umat_complaints_db -p 3306:3306 -d mysql:8
```

Then:

```bash
cd server
cp .env.example .env      # adjust DB_* / JWT_SECRET if needed
npm install
npm run setup             # creates tables and seeds reference data + one admin account
npm start                 # API on http://localhost:4000
```

See [server/README.md](server/README.md) for endpoint details, schema notes, and the test suite (`npm run smoke`).

### 2. Frontend

Serve the static files from the repo root (must be on the port configured in `server/.env`'s `CORS_ORIGIN`, default `8085`):

```bash
npx serve -l 8085 .
```

Open `http://localhost:8085` for the student portal, or `http://localhost:8085/admin.html` for the staff workstation.

## Demo credentials

`npm run seed` only creates one account. Students and other staff are created through the app itself, not pre-loaded:

| Role | Login | Password | Notes |
|---|---|---|---|
| System Administrator | `admin@umat.edu.gh` or `ADMIN001` | `ADMIN001` | Log in via admin.html's "System Admin" tab. Use it to register Deans, Finance Officers, IT staff, and HODs from the Staff Roster & Registration screen. |

Staff and admin passwords default to the account's own staff ID (e.g. staff ID `DEAN01` logs in with password `DEAN01`), whether seeded or registered later through the admin panel. There's no shared "demo password" for staff.

Students aren't seeded. Sign up from the student portal with an email ending in `@st.umat.edu.gh` and a 4-8 character password, then complete the profile (name, phone, level, programme) on first login.

Filing a complaint doesn't require login. Anyone can submit one with a name and index number ("submit anonymously" hides the identity from staff too). Logging in is only needed to track status under your own account.

## How complaints are routed

A complaint's category determines who resolves it:

- **Academic & Exams, Harassment, Others** → the Dean of the student's Faculty
- **Fees & Finance** → the Faculty's Finance Officer
- **ICT & Portal Services** → the Central IT Directorate (university-wide)

Harassment complaints are anonymized on the staff side: the student's name, index, email, and phone are hidden from the resolving officer.

Once routed, the assigned officer can claim, resolve, and reassign a complaint to any other staff member within the same jurisdiction (e.g. another Dean in the same faculty office, or another IT officer) via the "Reassign Case Officer" control on the workstation. The eligible-officers list and the reassignment itself are both scoped server-side, so a complaint can't be handed to someone outside its routed faculty/department.
