# Kanban Task Board Assessment

A polished full-stack Kanban task board built with React, TypeScript, Vite, Supabase, and an optional Go backend API. The app supports signed-in workspaces, optional guest mode, collaborator invites, and Row Level Security.

## Features

- Automatic anonymous guest workspace on first launch
- Email/password sign in and account creation
- Google sign in through Supabase OAuth
- Email verification notice and resend flow
- Optional anonymous guest workspaces
- Workspace switching for invited collaborators
- Collaborator invites by email
- Supabase-backed task persistence with RLS
- Default columns: To Do, In Progress, In Review, Done
- Drag tasks between columns to update status
- Create and edit tasks with title, description, priority, due date, assignees, and labels
- Team members with colored avatars
- Custom labels and label filtering
- Task comments stored in Supabase
- Task activity history for creation, edits, moves, and comments
- Search plus priority, assignee, and label filters
- Board summary stats for total, done, overdue, and high-priority tasks
- Loading, empty, setup, and error states
- Responsive layout for desktop and mobile
- **Optional Go backend API** with JWT authentication and RLS passthrough

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase Auth and Postgres
- Plain CSS for a neutral, product-focused task board UI
- Go (optional backend API with Chi router, pgx, and JWT middleware)

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and enable auth providers:

   - Supabase Dashboard
   - Authentication
   - Sign In / Providers
   - Enable Anonymous Sign-Ins
   - Enable Email
   - Keep email confirmations enabled if you want the verification banner/resend flow
   - Enable Google and add your Google OAuth client credentials
   - Add your local/deployed app URL to the allowed redirect URLs

3. Run the SQL schema:

   Open `supabase/schema.sql` in the Supabase SQL editor and run it.

4. Create `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Then add your Supabase project URL and public anon key.

5. Start the app:

   ```bash
   npm run dev
   ```

## Go Backend (Optional)

The `server/` directory contains an optional Go REST API that sits between the React frontend and Supabase Postgres.

### Architecture

```
React Frontend ──(Bearer JWT)──► Go API ──(pgx + SET LOCAL)──► Supabase Postgres
```

The Go API verifies Supabase JWTs, then uses `SET LOCAL request.jwt.claims` per-transaction so **all existing RLS policies work unchanged** — no security logic is duplicated in Go.

### Go API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
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

### Running the Go Server

1. Install Go (1.21+):

   ```bash
   brew install go
   ```

2. Configure environment:

   ```bash
   cd server
   cp .env.example .env
   ```

   Fill in `SUPABASE_DB_URL` (from Supabase Dashboard → Settings → Database → Connection String) and `SUPABASE_JWT_SECRET` (from Settings → API → JWT Secret).

3. Run:

   ```bash
   cd server
   go run .
   ```

4. Connect the frontend by adding to `.env.local`:

   ```
   VITE_API_URL=http://localhost:8080
   ```

The frontend supports **dual mode**: when `VITE_API_URL` is set, it routes requests through the Go API; otherwise it falls back to direct Supabase calls.

## Verification

```bash
npm run lint
npm run build
cd server && go build ./... && go vet ./...
```

All checks pass in this workspace.

## Deployment

The easiest free deployment path is Vercel or Netlify for the frontend.

For Vercel:

1. Push this repository to GitHub.
2. Import it into Vercel.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment variables.
4. Deploy.

For the Go backend (optional), deploy to Render or Fly.io on the free tier.

Never commit a Supabase service role key. This app only needs the public anon key because RLS policies isolate each guest user's rows.

## Database

The full Supabase schema, constraints, indexes, and RLS policies are in:

```text
supabase/schema.sql
```

Tables:

- `profiles`
- `workspace_members`
- `tasks`
- `team_members`
- `task_assignees`
- `labels`
- `task_labels`
- `comments`
- `activity_events`

## Notes

Starter team members and labels are created automatically for a new workspace. Tasks are not seeded, so users begin with a clean board backed by their database rows.
