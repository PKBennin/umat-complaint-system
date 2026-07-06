# UMaT Campus Complaint System

A complaint/grievance management system for the University of Mines and Technology (UMaT), Tarkwa. Students file complaints (academic, financial, ICT, harassment, general) that are automatically routed to the right Dean, Faculty Finance Officer, or the Central IT Directorate, tracked through resolution, and escalated with directives and appointments.

- **Student portal** (`index.html`) — public complaint filing (no account required), ticket tracking, appointment/directive follow-up.
- **Admin workstation** (`admin.html`) — Deans, Finance Officers, IT staff, and HODs claim, resolve, and analyze complaints scoped to their jurisdiction.
- **Backend API** (`server/`) — Node/Express + MySQL, JWT-authenticated, replacing the app's original browser-only storage.

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
npm run setup             # creates tables and seeds reference + demo data
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

Every seeded account uses the password **`password123`**.

| Role | Login | Example |
|---|---|---|
| Student | Index number | `9012870422` (Bennin Paa Kofi) |
| Dean | Staff ID | `PS102` (FCMS) |
| Finance Officer | Staff ID | `CS102` (FCMS) |
| IT Directorate | Staff ID | `CS107` |
| HOD | Staff ID | `PS109` |

Staff IDs follow `PS###` for permanent staff (Deans, HODs) or `CS###` for contract staff (Finance Officers, IT).

Filing a complaint doesn't require login — anyone can submit one with a name and index number. Logging in is only needed to track status, and only works for a registered index (accounts filed under an unregistered index get an auto-generated, unguessable password, so they can't be logged into later).

## How complaints are routed

A complaint's category determines who resolves it:

- **Academic & Exams, Harassment, Others** → the Dean of the student's Faculty
- **Fees & Finance** → the Faculty's Finance Officer
- **ICT & Portal Services** → the Central IT Directorate (university-wide)

Harassment complaints are anonymized on the staff side — the student's name, index, email, and phone are hidden from the resolving officer.
