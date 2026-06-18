# Task Board

A polished Kanban-style task board built for the software development assessment. It uses React, TypeScript, Supabase Auth, Supabase Postgres, Row Level Security, and an optional Go API.

The app is designed around a real board workflow: users can create tasks, move them through columns, assign team members, add labels, leave comments, and keep personal work separate from shared team work.

## What The App Does

- Shows a Kanban board with four columns: To Do, In Progress, In Review, Done.
- Lets users create, edit, delete, and drag tasks between columns.
- Persists all board data in Supabase.
- Starts a guest workspace automatically with Supabase anonymous auth.
- Supports email/password sign-in and Google OAuth when enabled in Supabase.
- Keeps each user's personal tasks private with RLS.
- Supports Team workspaces where invited collaborators can see shared team tasks.
- Supports viewer/editor permissions for shared workspaces.
- Shows board stats for total, done, overdue, and in-flight tasks.
- Supports priority, due dates, labels, assignees, search, and filters.
- Includes task comments and activity history.
- Includes a responsive UI for desktop and smaller screens.

## Demo And Submission Links

Add these before submitting the final PDF/DOCX:

- Live app: `TODO: add deployed frontend URL`
- GitHub repository: `TODO: add repository URL`
- Architecture guide: [architectural.md](architectural.md)
- Database schema: [supabase/schema.sql](supabase/schema.sql)
- Final deliverable draft: [docs/final-deliverable.md](docs/final-deliverable.md)

## How To Use The Board

1. Open the app.
2. The app starts a guest workspace automatically.
3. Create a task with the New task button.
4. Add a title, description, priority, due date, assignees, and labels.
5. Drag the task between columns to update its status.
6. Open a task to edit details, add comments, or review activity.
7. Use Personal for private work.
8. Use Team for shared workspace work.
9. Invite teammates from Workspace settings when signed in with an email account.

## Personal vs Team

The app separates work into two spaces:

- Personal: only you can see your own tasks.
- Team: active collaborators in the selected workspace can see shared tasks.

This is enforced in Supabase with Row Level Security, not just hidden in the UI.

## Advanced Features Included

- Team members and assignees
- Member roles: admin, manager, member
- Workspace collaborators
- Workspace roles: editor, viewer
- Task comments
- Task activity history
- Labels/tags
- Due date indicators
- Search and filters
- Board summary stats
- Optional Go backend API
- RLS-protected database access

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Plain CSS
- Go API with Chi, pgx, and JWT middleware

## Local Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Create a Supabase project

In Supabase:

1. Create a new project.
2. Go to Authentication.
3. Enable Anonymous Sign-Ins.
4. Enable Email sign-in.
5. Optionally enable Google OAuth.
6. Add your local and deployed URLs to allowed redirect URLs.

### 3. Run the database schema

Open [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor and run the full file.

This creates the tables, indexes, functions, and RLS policies required by the app.

### 4. Create frontend environment variables

```bash
cp .env.example .env.local
```

Fill in:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional:

```text
VITE_API_URL=http://localhost:8080
```

Only set `VITE_API_URL` if you want the React app to call the Go backend.

### 5. Start the frontend

```bash
npm run dev
```

Vite usually runs at:

```text
http://localhost:5173
```

## Optional Go Backend

The app can call Supabase directly from the frontend, which is enough for the assessment. The `server/` folder adds an optional Go API.

The Go API verifies the Supabase JWT, then queries Postgres while preserving Supabase RLS behavior.

### Backend setup

```bash
cd server
cp .env.example .env
```

Fill in:

```text
SUPABASE_DB_URL=
SUPABASE_JWT_SECRET=
PORT=8080
ALLOWED_ORIGINS=http://localhost:5173
```

Run it:

```bash
go run .
```

Then add this to `.env.local`:

```text
VITE_API_URL=http://localhost:8080
```

### Backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/tasks?workspace_id=<uuid>` | List tasks |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/{id}` | Update a task |
| DELETE | `/api/tasks/{id}` | Delete a task |
| GET | `/api/tasks/{id}/comments` | List comments |
| POST | `/api/tasks/{id}/comments` | Add a comment |
| GET | `/api/tasks/{id}/activity` | List activity |
| GET | `/api/team-members?workspace_id=<uuid>` | List team members |
| POST | `/api/team-members` | Create a team member |
| GET | `/api/labels?workspace_id=<uuid>` | List labels |
| POST | `/api/labels` | Create a label |

## Database Tables

The full schema is in [supabase/schema.sql](supabase/schema.sql).

Main tables:

- `profiles`: user profile data.
- `workspace_members`: invited workspace collaborators.
- `team_members`: assignable people shown on the board.
- `tasks`: Kanban task records.
- `task_assignees`: task-to-member assignments.
- `labels`: workspace labels.
- `task_labels`: task-to-label assignments.
- `comments`: task comments.
- `activity_events`: task history.

## Security Notes

- The public Supabase anon key is safe to use in the frontend.
- The anon key does not bypass database security.
- Row Level Security controls who can read and write each row.
- Personal tasks are only visible to the task creator.
- Team tasks are visible to active workspace collaborators.
- Viewer collaborators can read team data but cannot edit it.
- Do not commit `.env.local`, `server/.env`, or any Supabase service role key.

## Project Map

For a detailed file-by-file guide, read [architectural.md](architectural.md).

Quick map:

- [src/App.tsx](src/App.tsx): main app behavior and UI.
- [src/types.ts](src/types.ts): frontend TypeScript data types.
- [src/constants.ts](src/constants.ts): columns, priorities, and colors.
- [src/styles.css](src/styles.css): visual design and responsive layout.
- [src/lib/supabase.ts](src/lib/supabase.ts): Supabase client and optional API client.
- [supabase/schema.sql](supabase/schema.sql): database tables, RLS, indexes, and functions.
- [server/main.go](server/main.go): optional Go API routes.
- [server/handlers/](server/handlers): backend route handlers.
- [server/db/pool.go](server/db/pool.go): database connection and RLS context.

## Verification

Run these before submitting:

```bash
npm run lint
npm run build
cd server
go build ./...
go vet ./...
```

## Tradeoffs

- The frontend currently keeps most behavior in `src/App.tsx`; for a larger production app, it should be split into smaller hooks and components.
- The Go backend is optional, so the frontend still supports direct Supabase calls.
- Realtime updates are present for core board data, but a larger app could add richer live presence and collaboration indicators.
- Workspace invitations are email-based and activate when the invited user signs in with that email.

