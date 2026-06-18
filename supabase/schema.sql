-- Task Board Assessment schema
-- Run this in the Supabase SQL editor after creating a project.
-- Authentication: enable Anonymous sign-ins for the required guest flow.
-- Email/Password and Google OAuth are optional product upgrades in this app.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  provider text not null default 'email',
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists provider text not null default 'email';

alter table public.profiles
  add column if not exists email_verified boolean not null default false;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  email text not null,
  member_user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  unique (workspace_owner_id, email)
);

create or replace function public.can_access_workspace(owner_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = owner_id
    or exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_owner_id = owner_id
      and workspace_members.status = 'active'
      and (
        workspace_members.member_user_id = auth.uid()
        or lower(workspace_members.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    );
$$;

create or replace function public.can_edit_workspace(owner_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = owner_id
    or exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_owner_id = owner_id
      and workspace_members.status = 'active'
      and workspace_members.role = 'editor'
      and (
        workspace_members.member_user_id = auth.uid()
        or lower(workspace_members.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    );
$$;

create or replace function public.claim_workspace_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or current_email = '' then
    return;
  end if;

  update public.workspace_members
  set
    member_user_id = auth.uid(),
    status = 'active'
  where lower(email) = current_email
    and status = 'pending'
    and (member_user_id is null or member_user_id = auth.uid());
end;
$$;

revoke all on function public.claim_workspace_invites() from public;
grant execute on function public.claim_workspace_invites() to authenticated;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 80),
  role text not null default 'member'
    check (role in ('admin', 'manager', 'member')),
  color text not null default '#64748b',
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.team_members
  add column if not exists role text not null default 'member'
    check (role in ('admin', 'manager', 'member'));

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scope text not null default 'personal'
    check (scope in ('personal', 'team')),
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  due_date date,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists created_by uuid references auth.users(id) on delete cascade;

alter table public.tasks
  add column if not exists scope text not null default 'personal'
    check (scope in ('personal', 'team'));

update public.tasks
set created_by = user_id
where created_by is null;

alter table public.tasks
  alter column created_by set default auth.uid(),
  alter column created_by set not null;

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_type text not null
    check (event_type in ('created', 'updated', 'moved', 'assigned', 'labeled', 'commented')),
  message text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row
execute function public.touch_updated_at();

alter table public.team_members enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.comments enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists "profiles can manage themselves"
on public.profiles;

drop policy if exists "workspace owners manage collaborators"
on public.workspace_members;

drop policy if exists "invited users can read their invites"
on public.workspace_members;

drop policy if exists "invited users can claim their invites"
on public.workspace_members;

drop policy if exists "members are isolated by guest user"
on public.team_members;

drop policy if exists "members are shared with workspace collaborators"
on public.team_members;

drop policy if exists "members are readable by workspace collaborators"
on public.team_members;

drop policy if exists "members are editable by workspace editors"
on public.team_members;

drop policy if exists "tasks are isolated by guest user"
on public.tasks;

drop policy if exists "tasks are shared with workspace collaborators"
on public.tasks;

drop policy if exists "team tasks are readable by workspace collaborators"
on public.tasks;

drop policy if exists "team tasks are editable by workspace editors"
on public.tasks;

drop policy if exists "task assignees are isolated by guest user"
on public.task_assignees;

drop policy if exists "task assignees are shared with workspace collaborators"
on public.task_assignees;

drop policy if exists "team task assignees are readable by workspace collaborators"
on public.task_assignees;

drop policy if exists "team task assignees are editable by workspace editors"
on public.task_assignees;

drop policy if exists "labels are isolated by guest user"
on public.labels;

drop policy if exists "labels are shared with workspace collaborators"
on public.labels;

drop policy if exists "labels are readable by workspace collaborators"
on public.labels;

drop policy if exists "labels are editable by workspace editors"
on public.labels;

drop policy if exists "task labels are isolated by guest user"
on public.task_labels;

drop policy if exists "task labels are shared with workspace collaborators"
on public.task_labels;

drop policy if exists "team task labels are readable by workspace collaborators"
on public.task_labels;

drop policy if exists "team task labels are editable by workspace editors"
on public.task_labels;

drop policy if exists "comments are isolated by guest user"
on public.comments;

drop policy if exists "comments are shared with workspace collaborators"
on public.comments;

drop policy if exists "team comments are readable by workspace collaborators"
on public.comments;

drop policy if exists "team comments are editable by workspace editors"
on public.comments;

drop policy if exists "activity is isolated by guest user"
on public.activity_events;

drop policy if exists "activity is shared with workspace collaborators"
on public.activity_events;

drop policy if exists "team activity is readable by workspace collaborators"
on public.activity_events;

drop policy if exists "team activity is editable by workspace editors"
on public.activity_events;

create policy "profiles can manage themselves"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "workspace owners manage collaborators"
on public.workspace_members
for all
using (auth.uid() = workspace_owner_id)
with check (auth.uid() = workspace_owner_id);

create policy "invited users can read their invites"
on public.workspace_members
for select
using (
  member_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "members are isolated by guest user"
on public.team_members
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "members are readable by workspace collaborators"
on public.team_members
for select
using (public.can_access_workspace(user_id));

create policy "members are editable by workspace editors"
on public.team_members
for all
using (public.can_edit_workspace(user_id))
with check (public.can_edit_workspace(user_id));

create policy "tasks are isolated by guest user"
on public.tasks
for all
using (
  scope = 'personal'
  and created_by = auth.uid()
)
with check (
  scope = 'personal'
  and created_by = auth.uid()
);

create policy "team tasks are readable by workspace collaborators"
on public.tasks
for select
using (
  scope = 'team'
  and public.can_access_workspace(user_id)
);

create policy "team tasks are editable by workspace editors"
on public.tasks
for all
using (
  scope = 'team'
  and public.can_edit_workspace(user_id)
)
with check (
  scope = 'team'
  and public.can_edit_workspace(user_id)
);

create policy "task assignees are isolated by guest user"
on public.task_assignees
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = task_assignees.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
  and exists (
    select 1 from public.team_members
    where team_members.id = task_assignees.member_id
    and team_members.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = task_assignees.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
  and exists (
    select 1 from public.team_members
    where team_members.id = task_assignees.member_id
    and team_members.user_id = auth.uid()
  )
);

create policy "team task assignees are readable by workspace collaborators"
on public.task_assignees
for select
using (
  public.can_access_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_assignees.task_id
    and tasks.scope = 'team'
    and public.can_access_workspace(tasks.user_id)
  )
);

create policy "team task assignees are editable by workspace editors"
on public.task_assignees
for all
using (
  public.can_edit_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_assignees.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
)
with check (
  public.can_edit_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_assignees.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
);

create policy "labels are isolated by guest user"
on public.labels
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "labels are readable by workspace collaborators"
on public.labels
for select
using (public.can_access_workspace(user_id));

create policy "labels are editable by workspace editors"
on public.labels
for all
using (public.can_edit_workspace(user_id))
with check (public.can_edit_workspace(user_id));

create policy "task labels are isolated by guest user"
on public.task_labels
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = task_labels.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
  and exists (
    select 1 from public.labels
    where labels.id = task_labels.label_id
    and labels.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = task_labels.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
  and exists (
    select 1 from public.labels
    where labels.id = task_labels.label_id
    and labels.user_id = auth.uid()
  )
);

create policy "team task labels are readable by workspace collaborators"
on public.task_labels
for select
using (
  public.can_access_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_labels.task_id
    and tasks.scope = 'team'
    and public.can_access_workspace(tasks.user_id)
  )
);

create policy "team task labels are editable by workspace editors"
on public.task_labels
for all
using (
  public.can_edit_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_labels.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
)
with check (
  public.can_edit_workspace(user_id)
  and exists (
    select 1 from public.tasks
    where tasks.id = task_labels.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
);

create policy "comments are isolated by guest user"
on public.comments
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
);

create policy "team comments are readable by workspace collaborators"
on public.comments
for select
using (
  exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
    and tasks.scope = 'team'
    and public.can_access_workspace(tasks.user_id)
  )
);

create policy "team comments are editable by workspace editors"
on public.comments
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
);

create policy "activity is isolated by guest user"
on public.activity_events
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = activity_events.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = activity_events.task_id
    and tasks.scope = 'personal'
    and tasks.created_by = auth.uid()
  )
);

create policy "team activity is readable by workspace collaborators"
on public.activity_events
for select
using (
  exists (
    select 1 from public.tasks
    where tasks.id = activity_events.task_id
    and tasks.scope = 'team'
    and public.can_access_workspace(tasks.user_id)
  )
);

create policy "team activity is editable by workspace editors"
on public.activity_events
for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = activity_events.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.id = activity_events.task_id
    and tasks.scope = 'team'
    and public.can_edit_workspace(tasks.user_id)
  )
);

create index if not exists idx_tasks_user_status_position
  on public.tasks (user_id, status, position);

create index if not exists idx_tasks_user_scope_status_position
  on public.tasks (user_id, scope, status, position);

create index if not exists idx_tasks_created_by_scope
  on public.tasks (created_by, scope);

create index if not exists idx_workspace_members_owner
  on public.workspace_members (workspace_owner_id);

create index if not exists idx_workspace_members_owner_status_role
  on public.workspace_members (workspace_owner_id, status, role);

create index if not exists idx_workspace_members_email
  on public.workspace_members (lower(email));

create index if not exists idx_team_members_user
  on public.team_members (user_id);

create index if not exists idx_task_assignees_user_task
  on public.task_assignees (user_id, task_id);

create index if not exists idx_task_assignees_member
  on public.task_assignees (member_id);

create index if not exists idx_task_labels_user_task
  on public.task_labels (user_id, task_id);

create index if not exists idx_task_labels_label
  on public.task_labels (label_id);

create index if not exists idx_comments_user
  on public.comments (user_id);

create index if not exists idx_comments_task_created
  on public.comments (task_id, created_at);

create index if not exists idx_activity_user
  on public.activity_events (user_id);

create index if not exists idx_activity_task_created
  on public.activity_events (task_id, created_at desc);
