# Task Board Project Guide

This guide is written for reviewers, teammates, or future contributors who want to understand the project quickly. It explains how the Kanban task board works, how data flows through it, and which files to open when changing a feature.

## Big Picture

The app is a Supabase-backed Kanban board with a React frontend and an optional Go API.

```text
Browser
  |
  | React + TypeScript UI
  |
  | Option A: direct Supabase client
  v
Supabase Auth + Postgres + RLS

Browser
  |
  | Option B: VITE_API_URL enabled
  v
Go API
  |
  | pgx transaction with Supabase RLS context
  v
Supabase Auth + Postgres + RLS
```

The frontend can run in two modes:

- Direct Supabase mode: the React app calls Supabase tables and RPC functions directly.
- Go API mode: the React app sends authenticated HTTP requests to the Go backend, and the backend queries Supabase Postgres while preserving RLS.

In both modes, Supabase Row Level Security is the real security boundary.

## User Flow

1. The app starts in [src/main.tsx](src/main.tsx), which renders [src/App.tsx](src/App.tsx).
2. `App.tsx` checks whether Supabase is configured through [src/lib/supabase.ts](src/lib/supabase.ts).
3. If there is no existing session, the app signs the user in anonymously for the guest flow.
4. If the user signs in with email or Google, Supabase Auth owns the session.
5. The app syncs a profile row in `profiles`.
6. The app calls `claim_workspace_invites()` so email-based workspace invites can become active for the signed-in user.
7. The app loads accessible workspaces from `workspace_members`.
8. The selected workspace loads tasks, team members, labels, assignees, comments, and activity.
9. The board renders tasks into four columns: To Do, In Progress, In Review, Done.
10. Creating, editing, dragging, commenting, assigning, and labeling writes back to Supabase or the Go API.

## Personal vs Team Workspace

Tasks have two ownership concepts:

- `user_id`: the workspace owner. This groups data under a workspace.
- `created_by`: the authenticated user who created the task.

Tasks also have a `scope`:

- `personal`: only the task creator can read and edit it.
- `team`: active workspace collaborators can read it, and workspace editors can edit it.

This is why the board has Personal and Team views:

- Personal shows only your own private tasks.
- Team shows tasks shared inside the selected workspace.
- A collaborator viewing someone else's workspace should use Team, because Personal belongs to the workspace owner only.

## Frontend Files

### [src/main.tsx](src/main.tsx)

React entry point. It mounts the app into the DOM.

### [src/App.tsx](src/App.tsx)

Main application file. Most product behavior currently lives here:

- Authentication/session startup
- Profile sync
- Workspace access and invite claiming
- Board loading
- Task creation/editing/deletion
- Drag-and-drop status updates
- Filters/search
- Task detail drawer
- Comments and activity timeline
- Team members, roles, labels, and collaborator invites
- Personal/team board switching
- UI permission checks for viewer vs editor access

Important functions in this file:

- `ensureProfile`: upserts the signed-in user's profile.
- `loadWorkspaceAccess`: claims invites and builds the workspace switcher list.
- `createStarterData`: creates starter team members and labels for a new workspace.
- `loadBoard`: loads tasks, labels, team members, assignees, and labels for the selected workspace.
- `composeTasks`: attaches assignee and label records to task rows for rendering.
- `createTask`: creates a task and related assignee/label/activity records.
- `updateTask`: updates task fields and task relationships.
- `moveTask`: handles drag-and-drop status updates.
- `deleteTask`: removes a task.
- `addMember`: creates a board team member.
- `addLabel`: creates a label.
- `addComment`: creates a task comment and activity event.
- `addCollaborator`: invites another user to the workspace.

### [src/lib/supabase.ts](src/lib/supabase.ts)

Creates the Supabase browser client from:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

It also defines the optional Go API client:

- `VITE_API_URL` enables API mode.
- `apiFetch` attaches the current Supabase session JWT as `Authorization: Bearer <token>`.

### [src/types.ts](src/types.ts)

Shared TypeScript types for frontend data:

- `Task`
- `TaskView`
- `TeamMember`
- `Label`
- `Comment`
- `ActivityEvent`
- `DraftTask`
- `Filters`
- `TaskScope`
- `TeamRole`

If the Supabase schema changes, this file usually needs to change too.

### [src/constants.ts](src/constants.ts)

Small static product constants:

- Kanban columns
- Priority options
- Member avatar colors
- Label colors

Change column names, default statuses, or color options here.

### [src/styles.css](src/styles.css)

All visual styling for the frontend:

- Top bar
- Board layout
- Columns
- Task cards
- Modal and drawer
- Forms
- Workspace tools
- Responsive behavior
- Light/dark theme styling

### [index.html](index.html)

Vite HTML shell. This provides the root DOM node used by React.

### Config Files

- [package.json](package.json): npm scripts and frontend dependencies.
- [vite.config.ts](vite.config.ts): Vite build/dev configuration.
- [eslint.config.js](eslint.config.js): linting rules.
- [tsconfig.json](tsconfig.json), [tsconfig.app.json](tsconfig.app.json), [tsconfig.node.json](tsconfig.node.json): TypeScript configuration.
- [.env.example](.env.example): frontend environment variable template.

## Supabase Files

### [supabase/schema.sql](supabase/schema.sql)

This is the source of truth for the database.

It defines:

- Tables
- Columns
- Constraints
- Indexes
- Trigger functions
- RPC functions
- Row Level Security policies

Main tables:

- `profiles`: app profile data for each Supabase Auth user.
- `workspace_members`: invited collaborators for a workspace.
- `team_members`: board-level assignable people, with roles like admin, manager, member.
- `tasks`: Kanban tasks.
- `task_assignees`: many-to-many task assignment records.
- `labels`: workspace labels.
- `task_labels`: many-to-many task label records.
- `comments`: task comments.
- `activity_events`: task history timeline.

Important functions:

- `can_access_workspace(owner_id)`: true when the current user owns or can read a workspace.
- `can_edit_workspace(owner_id)`: true when the current user owns or has editor access.
- `claim_workspace_invites()`: activates pending email invites for the signed-in user.
- `touch_updated_at()`: updates `tasks.updated_at` when a task changes.

Important RLS behavior:

- Personal tasks are isolated by `created_by = auth.uid()`.
- Team tasks are readable by active workspace collaborators.
- Team tasks are editable by workspace owners and editor collaborators.
- Viewer collaborators can read shared team data but cannot write it.
- Invite activation is handled by the RPC, not by exposing broad update permission on `workspace_members`.

When schema changes are made locally, run the whole file in the Supabase SQL editor.

## Go Backend Files

The Go backend is optional. The frontend works without it if `VITE_API_URL` is not set.

### [server/main.go](server/main.go)

Go API entry point.

It:

- Loads environment variables.
- Opens the database pool.
- Creates handlers.
- Registers middleware.
- Defines routes.
- Starts the HTTP server.
- Handles graceful shutdown.

Routes are defined here, for example:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/{id}`
- `DELETE /api/tasks/{id}`
- `GET /api/tasks/{id}/comments`
- `POST /api/tasks/{id}/comments`
- `GET /api/tasks/{id}/activity`
- `GET /api/team-members`
- `POST /api/team-members`
- `GET /api/labels`
- `POST /api/labels`

### [server/config/config.go](server/config/config.go)

Loads backend environment variables:

- `SUPABASE_DB_URL`
- `SUPABASE_JWT_SECRET`
- `PORT`
- `ALLOWED_ORIGINS`

If the backend fails immediately on startup, check this file and [server/.env.example](server/.env.example).

### [server/db/pool.go](server/db/pool.go)

Database connection and RLS bridge.

The key method is `WithRLS`. It opens a transaction and sets:

- `role = authenticated`
- `request.jwt.claims = '{"sub":"<user id>","role":"authenticated"}'`

That makes Postgres functions like `auth.uid()` work during Go API queries, so the same Supabase RLS policies protect Go requests.

### [server/middleware/auth.go](server/middleware/auth.go)

HTTP middleware.

It:

- Reads the `Authorization: Bearer <token>` header.
- Verifies the Supabase JWT using `SUPABASE_JWT_SECRET`.
- Extracts the user id from the `sub` claim.
- Stores the user id in the request context.
- Handles CORS.

### [server/models/models.go](server/models/models.go)

Go structs for API request and response shapes:

- `Task`
- `CreateTaskRequest`
- `UpdateTaskRequest`
- `Comment`
- `ActivityEvent`
- `TeamMember`
- `Label`
- API error response shape

When JSON payloads change, update this file and the relevant handler.

### [server/handlers/tasks.go](server/handlers/tasks.go)

Task API handlers:

- List tasks for a workspace.
- Create tasks.
- Patch existing tasks.
- Delete tasks.

All database work runs through `DB.WithRLS`.

### [server/handlers/comments.go](server/handlers/comments.go)

Comment API handlers:

- List comments for a task.
- Create comments on a task.

### [server/handlers/activity.go](server/handlers/activity.go)

Activity timeline API handlers:

- List activity events for a task.

Activity creation mainly happens when task/comment actions occur.

### [server/handlers/team_members.go](server/handlers/team_members.go)

Team member API handlers:

- List workspace team members.
- Create assignable team members with name, role, and color.

These are board-level assignable people, not necessarily login accounts.

### [server/handlers/labels.go](server/handlers/labels.go)

Label API handlers:

- List workspace labels.
- Create labels.

### [server/handlers/helpers.go](server/handlers/helpers.go)

Shared HTTP response helpers:

- JSON responses
- Error responses

## Request Flow Examples

### Creating a Task Directly Through Supabase

1. User fills out the task form in `TaskEditor` inside [src/App.tsx](src/App.tsx).
2. `createTask` builds a `DraftTask`.
3. The app inserts into `tasks`.
4. The app inserts related rows into `task_assignees` and `task_labels`.
5. The app inserts a `created` row into `activity_events`.
6. `loadBoard` refreshes board data.
7. RLS checks whether the current user is allowed to insert into that workspace and scope.

### Creating a Task Through the Go API

1. `createTask` calls `apiFetch("/api/tasks", { method: "POST", ... })`.
2. `apiFetch` attaches the Supabase session JWT.
3. `server/middleware/auth.go` validates the JWT.
4. `server/handlers/tasks.go` decodes the request.
5. `server/db/pool.go` runs the query inside `WithRLS`.
6. Supabase RLS decides whether the insert is allowed.
7. The API returns the created task to the frontend.

### Dragging a Task

1. The user drags a task card to another column.
2. `moveTask` in [src/App.tsx](src/App.tsx) updates the task `status` and `position`.
3. The UI updates after the database write succeeds.
4. An activity event records the move.

### Claiming a Workspace Invite

1. A workspace owner invites an email using `addCollaborator`.
2. A row is created in `workspace_members` with `status = 'pending'`.
3. When that invited person signs in with the same email, `loadWorkspaceAccess` calls `claim_workspace_invites()`.
4. The RPC sets `member_user_id` and changes `status` to `active`.
5. The user can now see the shared Team workspace according to RLS.

## Where To Change Things

| Goal | Start here |
| --- | --- |
| Change board columns | [src/constants.ts](src/constants.ts), then update status checks in [supabase/schema.sql](supabase/schema.sql) |
| Change task fields | [supabase/schema.sql](supabase/schema.sql), [src/types.ts](src/types.ts), [src/App.tsx](src/App.tsx), optionally [server/models/models.go](server/models/models.go) and [server/handlers/tasks.go](server/handlers/tasks.go) |
| Change task card design | [src/App.tsx](src/App.tsx), [src/styles.css](src/styles.css) |
| Change top bar or stats | `TopBar` and `BoardSummary` in [src/App.tsx](src/App.tsx), styles in [src/styles.css](src/styles.css) |
| Change auth behavior | [src/App.tsx](src/App.tsx), [src/lib/supabase.ts](src/lib/supabase.ts), Supabase Auth dashboard |
| Change RLS/security rules | [supabase/schema.sql](supabase/schema.sql) |
| Add a new table | [supabase/schema.sql](supabase/schema.sql), [src/types.ts](src/types.ts), then frontend/backend query code |
| Add a new API route | [server/main.go](server/main.go), relevant file in `server/handlers/`, [server/models/models.go](server/models/models.go) |
| Change backend auth | [server/middleware/auth.go](server/middleware/auth.go), [server/db/pool.go](server/db/pool.go) |
| Change environment variables | [.env.example](.env.example), [server/.env.example](server/.env.example), [src/lib/supabase.ts](src/lib/supabase.ts), [server/config/config.go](server/config/config.go) |
| Change mobile layout | [src/styles.css](src/styles.css) |

## Environment Variables

Frontend:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

Backend:

```text
SUPABASE_DB_URL=
SUPABASE_JWT_SECRET=
PORT=
ALLOWED_ORIGINS=
```

Notes:

- `VITE_SUPABASE_ANON_KEY` is public by design. It is safe to ship to the browser because RLS protects data.
- Never commit the Supabase service role key.
- `server/.env` and `.env.local` should stay local only.

## Security Model

The app assumes users can inspect frontend code and see the anon key. Security comes from:

- Supabase Auth sessions
- RLS policies in Postgres
- `auth.uid()` checks
- Workspace membership checks
- Viewer/editor separation
- Go API JWT validation when API mode is enabled

The Go API does not replace RLS. It forwards authenticated identity into Postgres so the same RLS policies still apply.

## Verification Commands

Run these before submitting or pushing:

```bash
npm run lint
npm run build
cd server
go build ./...
go vet ./...
```

## Current Tradeoffs

- `src/App.tsx` owns a lot of behavior. For a larger production app, split it into hooks and components.
- Team members are assignable board people, while workspace collaborators are login users. That distinction is useful but should be explained in the UI if expanded.
- Realtime subscriptions are not currently required; the board refreshes after writes.
- The Go backend is optional, so some behavior exists in both frontend direct-Supabase code and backend handlers.
