# LMS Backend (Express + MySQL)

This repository is a minimal Learning Management System (LMS) backend API built with **Node.js + Express** and a **MySQL** database. It provides basic authentication, course creation/listing, enrollments, and quiz/question management.

It also serves a static **Learnly** landing page from `public/` at `GET /`.

## What it does

- **Auth**
  - Register users with a role (e.g., `student`, `instructor`)
  - Login and receive a **JWT** token
- **Courses**
  - Instructors can create courses (requires auth)
  - Anyone can list courses
  - Students can enroll in a course (requires auth)
- **Quizzes**
  - Create a quiz for a course
  - Add multiple-choice questions to a quiz
  - Fetch quiz questions for a given quiz

## How it works (high level)

- `server.js` starts an Express server on **port 5000**, enables JSON parsing, serves `public/`, and wires the route modules under `/api/*`.
- `config/db.js` creates a MySQL connection via `mysql2` and exports it.
- Controllers run SQL queries using that shared connection.
- `middleware/authMiddleware.js` verifies JWTs and populates `req.user` with the decoded payload:
  - payload fields: `{ id, role }`
- Some routes require authentication (see below). Those routes use `req.user.id` as the current user id.

## Project structure

```
config/
  db.js                   # MySQL connection
controllers/
  authController.js       # register/login
  courseController.js     # create/list/enroll
  quizController.js       # create quiz / add question / fetch quiz
middleware/
  authMiddleware.js       # JWT verification
routes/
  authRoutes.js
  courseRoutes.js
  quizRoutes.js
public/                   # static landing pages (served at /)
server.js                 # app entrypoint
uploads/                  # (currently empty)
```

## Setup

### Prerequisites

- Node.js (LTS recommended)

Database options:

- MySQL server running locally (optional)
- No DB install: use the built-in file database (recommended for quick start)

### Install dependencies

This repo currently does not include a `package.json`. If you don’t already have one, create it and install the dependencies used in the code:

```bash
npm init -y
npm i express cors mysql2 bcrypt jsonwebtoken
```

### Configure the database connection

By default, the server uses a local JSON file database at `data/data.json` (so you can run it without installing MySQL).

To use MySQL instead:

```bash
set DB_DRIVER=mysql
```

To force the file database:

```bash
set DB_DRIVER=file
```

To configure MySQL, set env vars (or edit `config/db.js`) for:

- `host` (default: `localhost`)
- `user` (default: `root`)
- `password`
- `database`

You can also set environment variables instead:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

### Create required tables

The code expects these tables/columns to exist (based on the SQL queries in controllers):

- `users`: `id`, `name`, `email`, `password`, `role`
- `courses`: `id`, `title`, `description`, `instructor_id`
- `enrollments`: `id`, `student_id`, `course_id`
- `quizzes`: `id`, `course_id`, `title`
- `quiz_questions`: `id`, `quiz_id`, `question`, `option_a`, `option_b`, `option_c`, `option_d`, `correct_option`

Add any indexes/constraints you need (for example: a unique index on `users.email`).

### Run the server

```bash
node server.js
```

Health check:

- `GET /health` → `OK`
- `GET /health/db` → `{ "connected": true/false }`

Landing page:

- `GET /` → Learnly landing page
- `GET /signin.html`, `GET /signup.html` → placeholder pages

## API

Base URL: `http://localhost:5000`

### Auth

- `POST /api/auth/register`
  - body: `{ "name", "email", "password", "role" }`
- `POST /api/auth/login`
  - body: `{ "email", "password" }`
  - response: `{ "token": "<jwt>" }`

### Authentication header

For protected routes, the middleware reads the token from the `authorization` header **as the raw token value** (not `Bearer <token>`):

```
authorization: <jwt>
```

### Courses

- `POST /api/courses/create` (auth required)
  - body: `{ "title", "description" }`
- `GET /api/courses` (public)
- `POST /api/courses/enroll` (auth required)
  - body: `{ "course_id" }`

### Quizzes

- `POST /api/quizzes/create`
  - body: `{ "course_id", "title" }`
- `POST /api/quizzes/question`
  - body: `{ "quiz_id", "question", "a", "b", "c", "d", "correct" }`
- `GET /api/quizzes/:id`
  - returns the questions for quiz `:id`

## Notes / caveats

- JWT signing uses a hard-coded secret string (`"secret"`) in `controllers/authController.js` and `middleware/authMiddleware.js`. For real deployments, move this into an environment variable and rotate it.
- CORS is currently restricted to `http://localhost:5173` (typical Vite dev server). Adjust `server.js` if your frontend runs elsewhere.
- Error handling is minimal (some queries ignore `err`). If you want, you can harden responses and validations.
- If MySQL is not running/configured, the server will automatically fall back to the file database (`data/data.json`) so the API still works without installing MySQL.
