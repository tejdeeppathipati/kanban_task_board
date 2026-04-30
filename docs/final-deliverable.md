# Tejdeep Pathipati Task Manager Assessment

## Overview

This project is a full-stack Kanban task board inspired by Linear, Asana, and Notion. The interface focuses on a clean work surface, clear task cards, fast filtering, and a detail drawer for task context. Supabase provides automatic anonymous guest authentication, persistence, and Row Level Security so each visitor only sees their own board data. Email/Google sign-in is included as an optional product upgrade.

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

- Used a restrained product UI with clear hierarchy between the workspace header, filter rail, columns, and task cards.
- Chose native browser drag-and-drop to keep the dependency footprint small while still supporting smooth status changes.
- Used a right-side task drawer so users can edit details, write comments, and inspect history without losing board context.
- Added responsive behavior where columns become horizontally scrollable on mobile, which matches common Kanban UX.

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
- Board summary stats for total tasks, completed tasks, overdue tasks, and high-priority tasks

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

## Build and Quality Checks

```bash
npm run lint
npm run build
```

Both checks pass.

## Tradeoffs and Future Improvements

- Native drag-and-drop keeps the app lightweight, but a dedicated drag library could add keyboard reordering and better touch ergonomics.
- The current app supports status movement and filtering, but task ordering inside a column could be expanded into true manual ranking.
- With more time, I would add email-delivered invitations, project-level permissions, audit exports, and stronger conflict handling for simultaneous edits.
