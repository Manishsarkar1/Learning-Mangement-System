# Learnly LMS (Node.js + Express + MySQL + JWT)

Full-fledged LMS web app with role-based dashboards for **Student**, **Instructor**, and **Admin**.

## Important UI constraint (respected)

The existing **Landing page** and **Login page** UI are treated as **read-only** (no HTML/CSS/JS changes). They are only wired to backend auth endpoints:

- Landing: `GET /` (static)
- Login: `GET /signin.html` → calls `POST /api/auth/login`

## Tech stack

- Frontend: HTML/CSS/JS (static pages under `frontend/public/`)
- Backend: Node.js + Express (`backend/`)
- Database: MySQL (`mysql2`)
- Auth: JWT + bcrypt

## Project structure

```
frontend/
  public/                 # all static pages (landing/login + dashboards)
backend/
  app.js                  # express app
  server.js               # boot + MySQL connection
  config/
    db.js                 # MySQL pool
  controllers/
  middleware/
  models/
  routes/
  scripts/
    seed.js               # sample data
uploads/
  submissions/            # assignment uploads (served at /uploads/*)
```

## Setup

### 1) Install

```bash
npm install
```

If PowerShell blocks `npm` scripts on your machine, use `npm.cmd` instead (example: `npm.cmd install`).

### 2) Configure env

Create `.env` (or copy `.env.example`) and set:

- `JWT_SECRET`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

Example:

```bash
cp .env.example .env
```

### 3) Start MySQL + create DB

Ensure MySQL is running and create a database (example):

```sql
CREATE DATABASE learnly_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4) Seed sample data (recommended)

```bash
npm run seed
```

To wipe tables first:

```bash
SEED_DROP=1 npm run seed
```

Seed prints sample credentials:

- `admin@learnly.local` / `Password123!`
- `instructor@learnly.local` / `Password123!`
- `student@learnly.local` / `Password123!`

### 5) Run the server

```bash
npm start
```

Open:

- Landing: `http://localhost:5000/`
- Sign in: `http://localhost:5000/signin.html`
- Role dashboard redirect: `http://localhost:5000/dashboard.html`

## Database schema (tables)

- `users`
- `courses`
- `enrollments`
- `course_materials`
- `assignments`
- `submissions` (includes file + grade fields)
- `notifications` (includes `meta` JSON)
- `quizzes`, `quiz_questions`

Schema file: `backend/scripts/schema.mysql.sql`

## API (REST)

### Auth

- `POST /api/auth/register` (student/instructor only)
  - body: `{ name, email, password, role }`
- `POST /api/auth/login`
  - body: `{ email, password }`
  - response: `{ token }`
- `GET /api/auth/me` (auth)

### Auth header

The existing UI sends the raw token (not `Bearer`), but both formats are accepted:

```
authorization: <jwt>
authorization: Bearer <jwt>
```

### Courses

- `GET /api/courses` (public, supports `?q=search`)
- `POST /api/courses` (instructor/admin)
- `GET /api/courses/my` (auth)
- `POST /api/courses/:courseId/enroll` (student/admin)
- `POST /api/courses/:courseId/materials` (instructor/admin)

Back-compat for the existing demo UI:

- `POST /api/courses/create`
- `POST /api/courses/enroll` (body `{ course_id }`)

### Assignments

- `POST /api/assignments` (instructor/admin)
- `GET /api/assignments/course/:courseId` (auth, must be enrolled/owner/admin)
- `GET /api/assignments/:id` (auth)

### Submissions + grading (file upload supported)

- `POST /api/submissions` (student/admin, multipart)
  - fields: `assignmentId` (required), `text` (optional), `file` (optional)
- `GET /api/submissions/my?assignmentId=...` (student/admin)
- `GET /api/submissions/assignment/:assignmentId` (instructor/admin)
- `PATCH /api/submissions/:id/grade` (instructor/admin)
  - body: `{ score: 0-100, feedback }`

### Notifications

- `GET /api/notifications` (auth)
- `POST /api/notifications/:id/read` (auth)

### Admin (admin only)

- `GET /api/admin/analytics`
- `GET /api/admin/users` / `POST /api/admin/users` / `DELETE /api/admin/users/:id`
- `GET /api/admin/courses` / `DELETE /api/admin/courses/:id`

## Notes

- For production, set strong `JWT_SECRET`, use HTTPS, and restrict CORS.
- File uploads are stored in `uploads/submissions/` and served via `GET /uploads/...`.
