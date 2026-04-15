# Learnly LMS

> Styled HTML version: [README.html](README.html)

Learnly LMS is a full-stack learning management system built with Node.js, Express, MySQL, JWT auth, and a static HTML/CSS/JS frontend.

It supports three roles:

- Student
- Instructor
- Admin

## Features

- Role-based dashboards and permissions
- Course browsing, enrollment, and course materials
- Assignment creation, file submissions, and grading
- Quiz creation, question authoring, and quiz attempts
- Course-wide and global announcements
- User notifications
- Profile management and password changes
- Forgot-password and reset-password flow for local development
- Admin analytics, user management, permissions, and audit logs
- HttpOnly cookie authentication with JWT compatibility for headers and bearer tokens

## Tech Stack

- Backend: Node.js + Express
- Database: MySQL via `mysql2`
- Auth: JWT + `bcrypt`
- File uploads: `multer`
- Frontend: static pages in `frontend/public/`

## Project Structure

```text
backend/
  app.js              Express app, middleware, routes, static hosting
  server.js           Server bootstrap and DB initialization
  config/db.js        MySQL pool and query helpers
  controllers/        Route handlers
  middleware/         Auth, role, permission, and error handling
  routes/             API route definitions
  scripts/            Schema and seed scripts
  services/           Audit logs and permissions helpers
frontend/public/      Static landing page, auth pages, and dashboards
uploads/submissions/  Assignment upload storage
```

The app serves the static UI from `frontend/public/`.

## Requirements

- Node.js
- MySQL

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file from `.env.example`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Example configuration:

```env
PORT=5000
JWT_SECRET=change_this_in_production

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=learnly_lms

# Optional
DB_POOL_SIZE=10
SEED_DROP=1
```

### 3. Create the database

Create the MySQL database before seeding:

```sql
CREATE DATABASE learnly_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Seed the database

This applies the schema and loads demo data:

```bash
npm run seed
```

To wipe existing tables before reseeding:

```bash
SEED_DROP=1 npm run seed
```

### 5. Start the app

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Scripts

- `npm start` - start the server from `backend/server.js`
- `npm run dev` - start the server with `nodemon`
- `npm run seed` - apply the schema and load sample data

## Demo Accounts

All seeded demo users use the password `Password123!`.

- `admin@learnly.local`
- `instructor@learnly.local`
- `student@learnly.local`
- `james@learnly.local`
- `riya@learnly.local`
- `kwame@learnly.local`

## Key Pages

These pages are served from `frontend/public/`:

- `/`
- `/signin.html`
- `/signup.html`
- `/dashboard.html`
- `/student-dashboard.html`
- `/instructor-dashboard.html`
- `/admin-dashboard.html`
- `/course.html?id=1`
- `/profile.html`
- `/forgot-password.html`
- `/reset-password.html`
- `/privacy.html`
- `/terms.html`

## API Overview

The backend exposes REST endpoints under `/api`.

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

### Courses

- `GET /api/courses`
- `POST /api/courses`
- `POST /api/courses/create`
- `POST /api/courses/enroll`
- `GET /api/courses/my`
- `GET /api/courses/:id`
- `POST /api/courses/:courseId/enroll`
- `POST /api/courses/:courseId/materials`

### Assignments

- `GET /api/assignments`
- `POST /api/assignments`
- `GET /api/assignments/course/:courseId`
- `GET /api/assignments/:id`

### Submissions

- `POST /api/submissions`
- `GET /api/submissions/my?assignmentId=...`
- `GET /api/submissions/mine`
- `GET /api/submissions/assignment/:assignmentId`
- `PATCH /api/submissions/:id/grade`

### Quizzes

- `GET /api/quizzes/course/:courseId`
- `POST /api/quizzes`
- `POST /api/quizzes/create`
- `POST /api/quizzes/:id/questions`
- `POST /api/quizzes/question`
- `GET /api/quizzes/:id`
- `POST /api/quizzes/:id/attempt`
- `GET /api/quizzes/my/attempts`
- `GET /api/quizzes/:id/attempts`

### Announcements

- `GET /api/announcements`
- `POST /api/announcements`

### Notifications

- `GET /api/notifications`
- `POST /api/notifications/:id/read`

### Profile

- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/profile/password`

### Admin

- `GET /api/admin/analytics`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/courses`
- `DELETE /api/admin/courses/:id`
- `GET /api/admin/permissions`
- `PUT /api/admin/permissions/:key`
- `GET /api/admin/logs`

## Authentication Notes

- The login flow sets an HttpOnly cookie named `learnly_token`.
- The backend also accepts JWTs from the `Authorization` header.
- `Authorization: <jwt>` and `Authorization: Bearer <jwt>` are both supported.

## Uploads

- Assignment submissions are stored in `uploads/submissions/`
- Uploaded files are served from `/uploads/...`
- Submission uploads have a 15 MB limit

## Health Checks

- `GET /health`
- `GET /health/db`

## Notes

- Use `npm start` rather than running the root `server.js` directly.
- The frontend includes a few legacy action URLs, and the backend keeps those aliases for compatibility.
- If the dashboards look empty, confirm the database name in `.env` and rerun `npm run seed`.
- In production, set a strong `JWT_SECRET`, use HTTPS, and connect password reset to a real email provider.
