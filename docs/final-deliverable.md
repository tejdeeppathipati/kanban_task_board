# Tejdeep Pathipati Task Manager Assessment

## Overview

This project is a full-stack Kanban task board inspired by real project-management workflows in tools like Asana, Trello, Jira, and Linear. The interface uses a neutral, product-focused visual system so the board content, filters, collaborators, and task actions stay primary. Supabase provides automatic anonymous guest authentication, persistence, and Row Level Security so each visitor only sees their own board data. Email/Google sign-in is included as an optional product upgrade. An **optional Go backend API** demonstrates full-stack architecture with JWT authentication, RLS passthrough, and RESTful endpoint design.

## Live Frontend App

Add deployed URL here:

```text
https://your-vercel-or-netlify-url
```

## GitHub Repository

Add repository URL here:

```text
https://github.com/your-username/your-repo
```

## Design Decisions

- Used a neutral task-board theme with semantic status colors, restrained borders, and solid action buttons so the UI feels functional rather than decorative.
- Kept visual emphasis on real board data: tasks, status movement, assignees, labels, due dates, comments, and activity history.
- Card hover states include a gentle lift animation (`translateY(-1px)`) with an accent-colored border glow.
- Modal and drawer entry animations (scale + fade, slide-in) create polished transitions.
- Chose native browser drag-and-drop to keep the dependency footprint small while still supporting smooth status changes.
- Used a right-side task drawer so users can edit details, write comments, and inspect history without losing board context.
- Added responsive behavior where columns become horizontally scrollable on mobile.

## Architecture

```
React Frontend ──(Bearer JWT)──► Go API ──(pgx + SET LOCAL)──► Supabase Postgres
```

The Go backend verifies Supabase-issued JWTs, then injects `request.jwt.claims` per-transaction using `SET LOCAL` so all existing PostgreSQL RLS policies enforce row-level isolation. No security logic is duplicated in Go.

The frontend supports **dual mode**: set `VITE_API_URL` to route requests through the Go API, or leave it unset to call Supabase directly. Auth and real-time subscriptions always go through the Supabase client.

## Advanced Features Built

- Team members and multi-assignee task assignment
- Colored member avatars on task cards
- Automatic anonymous guest workspaces with optional Google/email sign-in
- Email verification notice and resend flow
- Collaborator invitations and workspace switching
- Labels and label filtering
- Task comments stored in a separate `comments` table
- Task activity log stored in `activity_events`
- Due date indicators for upcoming, due soon, and overdue tasks
- Search and filtering by title/description, priority, assignee, and label
- Board summary stats for total tasks, completed tasks, overdue tasks, and in-flight tasks
- **Go backend API** with Chi router, JWT middleware, pgx connection pooling, and RLS passthrough

## Go Backend API

Located in `server/`. Key technologies:

- **Go** with `net/http` and **Chi** router for idiomatic route handling
- **pgx** connection pool for Postgres with transaction-scoped RLS
- **golang-jwt** for HS256 JWT verification
- CORS middleware, graceful shutdown, request logging

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | List workspace tasks |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/{id}` | Update a task |
| DELETE | `/api/tasks/{id}` | Delete a task |
| GET | `/api/tasks/{id}/comments` | List task comments |
| POST | `/api/tasks/{id}/comments` | Add a comment |
| GET | `/api/tasks/{id}/activity` | List task activity |
| GET | `/api/team-members` | List team members |
| POST | `/api/team-members` | Create a team member |
| GET | `/api/labels` | List labels |
| POST | `/api/labels` | Create a label |

## Database Schema

The full SQL schema is included in the repository at:

```text
supabase/schema.sql
```

It creates:

- `profiles`
- `workspace_members`
- `tasks`
- `team_members`
- `task_assignees`
- `labels`
- `task_labels`
- `comments`
- `activity_events`

RLS is enabled on every application table. Policies require `auth.uid() = user_id` for the required guest workspace isolation, with additional collaborator policies for shared workspaces.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then update `.env.local` with the Supabase project URL and public anon key. In Supabase, enable anonymous sign-ins and run the SQL in `supabase/schema.sql`. Enable Email/Google providers if you want the optional account upgrade flow.

### Go Backend (Optional)

```bash
cd server
cp .env.example .env
# Fill in SUPABASE_DB_URL and SUPABASE_JWT_SECRET
go run .
```

Add `VITE_API_URL=http://localhost:8080` to `.env.local` to route frontend requests through the Go API.

## Build and Quality Checks

```bash
npm run lint
npm run build
cd server && go build ./... && go vet ./...
```

All checks pass.

## Tradeoffs and Future Improvements

- Native drag-and-drop keeps the app lightweight, but a dedicated drag library could add keyboard reordering and better touch ergonomics.
- The Go backend demonstrates full-stack architecture; with more time I would extend it to handle assignees, labels-on-tasks, and workspace collaborator CRUD for full API coverage.
- The current app supports status movement and filtering, but task ordering inside a column could be expanded into true manual ranking.
- With more time, I would add email-delivered invitations, project-level permissions, audit exports, and stronger conflict handling for simultaneous edits.
- A light/dark mode toggle would serve users who prefer a lighter interface.
