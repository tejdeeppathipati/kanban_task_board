import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { COLUMNS, LABEL_COLORS, MEMBER_COLORS, PRIORITIES } from "./constants";
import { isSupabaseConfigured, supabase, isApiConfigured, apiFetch } from "./lib/supabase";
import type {
  ActivityEvent,
  Comment,
  DraftTask,
  Filters,
  Label,
  Priority,
  Status,
  Task,
  TaskScope,
  TaskAssignee,
  TaskLabel,
  TaskView,
  TeamMember,
} from "./types";

const emptyDraft: DraftTask = {
  title: "",
  description: "",
  status: "todo",
  priority: "normal",
  due_date: "",
  assigneeIds: [],
  labelIds: [],
};

const statusNames: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const statusAccentClass: Record<Status, string> = {
  todo: "neutral",
  in_progress: "amber",
  in_review: "blue",
  done: "green",
};

type AuthMode = "signin" | "signup";

type AuthDraft = {
  email: string;
  password: string;
  name: string;
};

type WorkspaceOption = {
  ownerId: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  status: "active" | "pending";
};

type BoardScope = TaskScope;

type Collaborator = {
  id: string;
  workspace_owner_id: string;
  email: string;
  member_user_id: string | null;
  role: "editor" | "viewer";
  status: "active" | "pending";
  created_at: string;
};

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("Guest user");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [memberDraft, setMemberDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [boardScope, setBoardScope] = useState<BoardScope>("personal");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authDraft, setAuthDraft] = useState<AuthDraft>({
    email: "",
    password: "",
    name: "",
  });
  const [filters, setFilters] = useState<Filters>({
    search: "",
    priority: "all",
    assigneeId: "all",
    labelId: "all",
    due: "all",
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.ownerId === workspaceId) ?? null;
  const isWorkspaceOwner = Boolean(userId && workspaceId && userId === workspaceId);

  const ensureProfile = useCallback(async (user: User) => {
    if (!supabase) return;
    const email = user.email?.toLowerCase() ?? "";
    const profile = getUserProfile(user);

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      email,
      full_name: profile.name,
      avatar_url: profile.avatarUrl,
      email_verified: profile.emailVerified,
      provider: profile.provider,
    });

    if (profileError) {
      console.warn("Profile sync skipped:", profileError.message);
    }
  }, []);

  const loadWorkspaceAccess = useCallback(async (user: User) => {
    if (!supabase) return user.id;

    const email = user.email?.toLowerCase() ?? "";

    if (email) {
      const { error: claimError } = await supabase
        .from("workspace_members")
        .update({ member_user_id: user.id, status: "active" })
        .eq("email", email)
        .is("member_user_id", null);
      if (claimError) {
        console.warn("Workspace invite claim skipped:", claimError.message);
        setWorkspaces([
          {
            ownerId: user.id,
            name: "My workspace",
            role: "owner",
            status: "active",
          },
        ]);
        return user.id;
      }
    }

    const [memberResult, emailResult] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("*")
        .eq("member_user_id", user.id),
      email
        ? supabase.from("workspace_members").select("*").eq("email", email)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const accessError = memberResult.error || emailResult.error;
    if (accessError) {
      console.warn("Workspace access lookup skipped:", accessError.message);
      setWorkspaces([
        {
          ownerId: user.id,
          name: "My workspace",
          role: "owner",
          status: "active",
        },
      ]);
      return user.id;
    }

    const sharedRows = [
      ...((memberResult.data ?? []) as Collaborator[]),
      ...((emailResult.data ?? []) as Collaborator[]),
    ];
    const uniqueShared = new Map<string, Collaborator>();
    sharedRows.forEach((row) => {
      if (row.workspace_owner_id !== user.id) {
        uniqueShared.set(row.workspace_owner_id, row);
      }
    });

    const workspaceRows: WorkspaceOption[] = [
      {
        ownerId: user.id,
        name: "My workspace",
        role: "owner",
        status: "active",
      },
      ...Array.from(uniqueShared.values()).map((row) => ({
        ownerId: row.workspace_owner_id,
        name: `Shared workspace ${row.workspace_owner_id.slice(0, 8)}`,
        role: row.role,
        status: row.status,
      })),
    ];

    setWorkspaces(workspaceRows);
    return workspaceRows[0]?.ownerId ?? user.id;
  }, []);

  const composeTasks = useCallback(
    (
      taskRows: Task[],
      assigneeRows: TaskAssignee[],
      labelRows: TaskLabel[],
      memberRows: TeamMember[],
      labelRowsFull: Label[],
    ): TaskView[] => {
      const membersById = new Map(memberRows.map((member) => [member.id, member]));
      const labelsById = new Map(labelRowsFull.map((label) => [label.id, label]));

      return taskRows
        .map((task) => ({
          ...task,
          assignees: assigneeRows
            .filter((item) => item.task_id === task.id)
            .map((item) => membersById.get(item.member_id))
            .filter(Boolean) as TeamMember[],
          labels: labelRows
            .filter((item) => item.task_id === task.id)
            .map((item) => labelsById.get(item.label_id))
            .filter(Boolean) as Label[],
        }))
        .sort((a, b) => a.position - b.position);
    },
    [],
  );

  const createStarterData = useCallback(async (activeUserId: string) => {
    if (!supabase) return;

    const { data: existingMembers } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", activeUserId)
      .limit(1);

    if (!existingMembers?.length) {
      await supabase.from("team_members").insert([
        { user_id: activeUserId, name: "You", color: MEMBER_COLORS[0] },
        { user_id: activeUserId, name: "Design", color: MEMBER_COLORS[1] },
        { user_id: activeUserId, name: "Engineering", color: MEMBER_COLORS[2] },
      ]);
    }

    const { data: existingLabels } = await supabase
      .from("labels")
      .select("id")
      .eq("user_id", activeUserId)
      .limit(1);

    if (!existingLabels?.length) {
      await supabase.from("labels").insert([
        { user_id: activeUserId, name: "Bug", color: LABEL_COLORS[0] },
        { user_id: activeUserId, name: "Feature", color: LABEL_COLORS[1] },
        { user_id: activeUserId, name: "Design", color: LABEL_COLORS[2] },
      ]);
    }
  }, []);

  const loadBoard = useCallback(
    async (activeUserId: string, showLoading = true) => {
      if (!supabase) return;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        await createStarterData(activeUserId);

        // When the Go API is configured, fetch core data through it.
        // Assignees, task-labels, and collaborators still use Supabase directly
        // since the Go API focuses on primary entities.
        if (isApiConfigured) {
          const [apiTasks, apiMembers, apiLabels, assigneeResult, taskLabelResult, collaboratorResult] =
            await Promise.all([
              apiFetch<Task[]>(`/api/tasks?workspace_id=${activeUserId}`),
              apiFetch<TeamMember[]>(`/api/team-members?workspace_id=${activeUserId}`),
              apiFetch<Label[]>(`/api/labels?workspace_id=${activeUserId}`),
              supabase.from("task_assignees").select("*").eq("user_id", activeUserId),
              supabase.from("task_labels").select("*").eq("user_id", activeUserId),
              supabase
                .from("workspace_members")
                .select("*")
                .eq("workspace_owner_id", activeUserId)
                .order("created_at", { ascending: true }),
            ]);

          if (assigneeResult.error || taskLabelResult.error) {
            throw assigneeResult.error || taskLabelResult.error;
          }
          if (collaboratorResult.error) {
            console.warn("Collaborator list skipped:", collaboratorResult.error.message);
          }

          setMembers(apiMembers);
          setLabels(apiLabels);
          setCollaborators((collaboratorResult.data ?? []) as Collaborator[]);
          setTasks(
            composeTasks(
              apiTasks,
              (assigneeResult.data ?? []) as TaskAssignee[],
              (taskLabelResult.data ?? []) as TaskLabel[],
              apiMembers,
              apiLabels,
            ),
          );
        } else {
          const [
            taskResult,
            memberResult,
            labelResult,
            assigneeResult,
            taskLabelResult,
            collaboratorResult,
          ] = await Promise.all([
            supabase
              .from("tasks")
              .select("*")
              .eq("user_id", activeUserId)
              .order("position", { ascending: true }),
            supabase
              .from("team_members")
              .select("*")
              .eq("user_id", activeUserId)
              .order("created_at", { ascending: true }),
            supabase
              .from("labels")
              .select("*")
              .eq("user_id", activeUserId)
              .order("name", { ascending: true }),
            supabase.from("task_assignees").select("*").eq("user_id", activeUserId),
            supabase.from("task_labels").select("*").eq("user_id", activeUserId),
            supabase
              .from("workspace_members")
              .select("*")
              .eq("workspace_owner_id", activeUserId)
              .order("created_at", { ascending: true }),
          ]);

          const queryError =
            taskResult.error ||
            memberResult.error ||
            labelResult.error ||
            assigneeResult.error ||
            taskLabelResult.error;

          if (queryError) throw queryError;
          if (collaboratorResult.error) {
            console.warn("Collaborator list skipped:", collaboratorResult.error.message);
          }

          const memberRows = (memberResult.data ?? []) as TeamMember[];
          const labelRowsFull = (labelResult.data ?? []) as Label[];

          setMembers(memberRows);
          setLabels(labelRowsFull);
          setCollaborators((collaboratorResult.data ?? []) as Collaborator[]);
          setTasks(
            composeTasks(
              (taskResult.data ?? []) as Task[],
              (assigneeResult.data ?? []) as TaskAssignee[],
              (taskLabelResult.data ?? []) as TaskLabel[],
              memberRows,
              labelRowsFull,
            ),
          );
        }
      } catch (caught) {
        setError(getErrorMessage(caught));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [composeTasks, createStarterData],
  );

  const startAuthenticatedSession = useCallback(
    async (user: User) => {
      if (!supabase) return;
      const profile = getUserProfile(user);
      await ensureProfile(user);
      const nextWorkspaceId = await loadWorkspaceAccess(user);
      setUserId(user.id);
      setUserEmail(profile.email);
      setUserName(profile.name);
      setUserAvatarUrl(profile.avatarUrl);
      setEmailVerified(profile.emailVerified);
      setWorkspaceId(nextWorkspaceId);
      await loadBoard(nextWorkspaceId);
    },
    [ensureProfile, loadBoard, loadWorkspaceAccess],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootSession() {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const activeUser = sessionData.session?.user ?? null;
        if (!activeUser) {
          const { data, error: guestError } = await supabase.auth.signInAnonymously();
          if (guestError || !data.user) {
            if (isMounted) {
              setError(
                "Anonymous auth is disabled in Supabase. Enable anonymous sign-ins or sign in with an account.",
              );
              setLoading(false);
            }
            return;
          }
          if (isMounted) {
            await startAuthenticatedSession(data.user);
          }
          return;
        }

        if (isMounted) {
          await startAuthenticatedSession(activeUser);
        }
      } catch (caught) {
        if (isMounted) {
          setError(getErrorMessage(caught));
          setLoading(false);
        }
      }
    }

    bootSession();
    return () => {
      isMounted = false;
    };
  }, [startAuthenticatedSession]);

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const client = supabase;
    const channel = client
      .channel(`task-board-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${workspaceId}`,
        },
        () => {
          void loadBoard(workspaceId, false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_assignees",
          filter: `user_id=eq.${workspaceId}`,
        },
        () => {
          void loadBoard(workspaceId, false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_labels",
          filter: `user_id=eq.${workspaceId}`,
        },
        () => {
          void loadBoard(workspaceId, false);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [loadBoard, workspaceId]);

  useEffect(() => {
    function closeOverlays(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setComposerOpen(false);
      setSelectedTaskId(null);
    }

    window.addEventListener("keydown", closeOverlays);
    return () => window.removeEventListener("keydown", closeOverlays);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTaskTimeline() {
      if (!supabase || !selectedTaskId || !userId) {
        setComments([]);
        setActivity([]);
        return;
      }

      if (isApiConfigured) {
        const [apiComments, apiActivity] = await Promise.all([
          apiFetch<Comment[]>(`/api/tasks/${selectedTaskId}/comments`),
          apiFetch<ActivityEvent[]>(`/api/tasks/${selectedTaskId}/activity`),
        ]);
        if (!isMounted) return;
        setComments(apiComments);
        setActivity(apiActivity);
        return;
      }

      const [commentResult, activityResult] = await Promise.all([
        supabase
          .from("comments")
          .select("*")
          .eq("task_id", selectedTaskId)
          .order("created_at", { ascending: true }),
        supabase
          .from("activity_events")
          .select("*")
          .eq("task_id", selectedTaskId)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

      if (commentResult.error || activityResult.error) {
        setError(getErrorMessage(commentResult.error || activityResult.error));
        return;
      }

      setComments((commentResult.data ?? []) as Comment[]);
      setActivity((activityResult.data ?? []) as ActivityEvent[]);
    }

    loadTaskTimeline();
    return () => {
      isMounted = false;
    };
  }, [selectedTaskId, userId]);

  const scopedTasks = useMemo(
    () => tasks.filter((task) => (task.scope ?? "personal") === boardScope),
    [boardScope, tasks],
  );

  const visibleTasks = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return scopedTasks.filter((task) => {
      const matchesSearch =
        !search ||
        task.title.toLowerCase().includes(search) ||
        task.description.toLowerCase().includes(search);
      const matchesPriority =
        filters.priority === "all" || task.priority === filters.priority;
      const matchesAssignee =
        filters.assigneeId === "all" ||
        (filters.assigneeId === "unassigned"
          ? task.assignees.length === 0
          : task.assignees.some((member) => member.id === filters.assigneeId));
      const matchesLabel =
        filters.labelId === "all" ||
        task.labels.some((label) => label.id === filters.labelId);
      const matchesDue =
        filters.due === "all" ||
        (filters.due === "week" && isDueThisWeek(task.due_date)) ||
        (filters.due === "overdue" && getDueState(task.due_date) === "overdue");

      return (
        matchesSearch &&
        matchesPriority &&
        matchesAssignee &&
        matchesLabel &&
        matchesDue
      );
    });
  }, [filters, scopedTasks]);

  const stats = useMemo(() => {
    const overdue = scopedTasks.filter((task) => getDueState(task.due_date) === "overdue");
    return {
      total: scopedTasks.length,
      done: scopedTasks.filter((task) => task.status === "done").length,
      overdue: overdue.length,
      inFlight: scopedTasks.filter(
        (task) => task.status === "in_progress" || task.status === "in_review",
      ).length,
    };
  }, [scopedTasks]);

  async function writeActivity(
    taskId: string,
    eventType: ActivityEvent["event_type"],
    message: string,
  ) {
    if (!supabase || !userId) return;
    const { error: activityError } = await supabase.from("activity_events").insert({
      task_id: taskId,
      user_id: userId,
      event_type: eventType,
      message,
    });
    if (activityError) throw activityError;
  }

  async function replaceTaskLinks(
    taskId: string,
    assigneeIds: string[],
    labelIds: string[],
  ) {
    if (!supabase || !workspaceId) return;

    await supabase.from("task_assignees").delete().eq("task_id", taskId);
    await supabase.from("task_labels").delete().eq("task_id", taskId);

    if (assigneeIds.length) {
      const { error: assigneeError } = await supabase.from("task_assignees").insert(
        assigneeIds.map((memberId) => ({
          task_id: taskId,
          member_id: memberId,
          user_id: workspaceId,
        })),
      );
      if (assigneeError) throw assigneeError;
    }

    if (labelIds.length) {
      const { error: labelError } = await supabase.from("task_labels").insert(
        labelIds.map((labelId) => ({
          task_id: taskId,
          label_id: labelId,
          user_id: workspaceId,
        })),
      );
      if (labelError) throw labelError;
    }
  }

  async function createTaskInSupabase(
    payload: Pick<
      Task,
      | "user_id"
      | "created_by"
      | "scope"
      | "title"
      | "description"
      | "status"
      | "priority"
      | "due_date"
      | "position"
    >,
  ) {
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error: createError } = await supabase
      .from("tasks")
      .insert(payload)
      .select("*")
      .single();

    if (createError) throw createError;
    return data as Task;
  }

  async function createTask(draft: DraftTask) {
    if (!supabase || !userId || !workspaceId) return;

    setSaving(true);
    setError(null);
    setAuthNotice(null);

    try {
      const task = isApiConfigured
        ? await apiFetch<Task>("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
              user_id: workspaceId,
              created_by: userId,
              scope: boardScope,
              title: draft.title.trim(),
              description: draft.description.trim(),
              status: draft.status,
              priority: draft.priority,
              due_date: draft.due_date || null,
              position: Date.now(),
            }),
          })
        : await createTaskInSupabase({
          user_id: workspaceId,
          created_by: userId,
          scope: boardScope,
          title: draft.title.trim(),
          description: draft.description.trim(),
          status: draft.status,
          priority: draft.priority,
          due_date: draft.due_date || null,
          position: Date.now(),
        });

      await replaceTaskLinks(task.id, draft.assigneeIds, draft.labelIds);
      await writeActivity(task.id, "created", "Created task");
      await loadBoard(workspaceId);
      setComposerOpen(false);
      setSelectedTaskId(task.id);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(taskId: string, draft: DraftTask) {
    if (!supabase || !userId || !workspaceId) return;

    setSaving(true);
    setError(null);

    try {
      if (isApiConfigured) {
        await apiFetch<Task>(`/api/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: draft.title.trim(),
            description: draft.description.trim(),
            status: draft.status,
            priority: draft.priority,
            due_date: draft.due_date || null,
          }),
        });
      } else {
        const { error: updateError } = await supabase
          .from("tasks")
          .update({
          title: draft.title.trim(),
          description: draft.description.trim(),
          status: draft.status,
          priority: draft.priority,
          due_date: draft.due_date || null,
          })
          .eq("id", taskId);

        if (updateError) throw updateError;
      }

      await replaceTaskLinks(taskId, draft.assigneeIds, draft.labelIds);
      await writeActivity(taskId, "updated", "Updated task details");
      await loadBoard(workspaceId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(
    taskId: string,
    nextStatus: Status,
    beforeTaskId?: string,
  ) {
    if (!supabase || !userId || !workspaceId) return;

    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      setDraggingTaskId(null);
      return;
    }

    const previousStatus = task.status;
    const nextPosition = getNextPosition(tasks, taskId, nextStatus, beforeTaskId);
    setDraggingTaskId(null);
    setTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? { ...item, status: nextStatus, position: nextPosition }
          : item,
      ),
    );

    try {
      if (isApiConfigured) {
        await apiFetch<Task>(`/api/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus, position: nextPosition }),
        });
      } else {
        const { error: moveError } = await supabase
          .from("tasks")
          .update({ status: nextStatus, position: nextPosition })
          .eq("id", taskId);

        if (moveError) throw moveError;
      }

      await writeActivity(
        taskId,
        "moved",
        previousStatus === nextStatus
          ? `Reordered in ${statusNames[nextStatus]}`
          : `Moved from ${statusNames[previousStatus]} to ${statusNames[nextStatus]}`,
      );
      await loadBoard(workspaceId, false);
    } catch (caught) {
      setError(getErrorMessage(caught));
      await loadBoard(workspaceId, false);
    }
  }

  async function deleteTask(taskId: string) {
    if (!supabase || !userId || !workspaceId) return;

    const shouldDelete = window.confirm(
      "Delete this task and its comments/activity permanently?",
    );
    if (!shouldDelete) return;

    setSaving(true);
    setError(null);

    try {
      if (isApiConfigured) {
        await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      } else {
        const { error: deleteError } = await supabase
          .from("tasks")
          .delete()
          .eq("id", taskId)
          .eq("user_id", workspaceId);

        if (deleteError) throw deleteError;
      }

      setSelectedTaskId(null);
      await loadBoard(workspaceId, false);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !memberDraft.trim()) return;

    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];

    try {
      if (isApiConfigured) {
        await apiFetch<TeamMember>("/api/team-members", {
          method: "POST",
          body: JSON.stringify({
            user_id: workspaceId,
            name: memberDraft.trim(),
            color,
          }),
        });
      } else {
        const { error: memberError } = await supabase.from("team_members").insert({
          user_id: workspaceId,
          name: memberDraft.trim(),
          color,
        });

        if (memberError) throw memberError;
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
      return;
    }

    setMemberDraft("");
    await loadBoard(workspaceId);
  }

  async function addLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !labelDraft.trim()) return;

    const color = LABEL_COLORS[labels.length % LABEL_COLORS.length];

    try {
      if (isApiConfigured) {
        await apiFetch<Label>("/api/labels", {
          method: "POST",
          body: JSON.stringify({
            user_id: workspaceId,
            name: labelDraft.trim(),
            color,
          }),
        });
      } else {
        const { error: labelError } = await supabase.from("labels").insert({
          user_id: workspaceId,
          name: labelDraft.trim(),
          color,
        });

        if (labelError) throw labelError;
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
      return;
    }

    setLabelDraft("");
    await loadBoard(workspaceId);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || !selectedTaskId || !commentDraft.trim()) return;

    setSaving(true);
    try {
      if (isApiConfigured) {
        await apiFetch<Comment>(`/api/tasks/${selectedTaskId}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: commentDraft.trim() }),
        });
      } else {
        const { error: commentError } = await supabase.from("comments").insert({
          task_id: selectedTaskId,
          user_id: userId,
          body: commentDraft.trim(),
        });
        if (commentError) throw commentError;
      }

      await writeActivity(selectedTaskId, "commented", "Added a comment");
      setCommentDraft("");

      if (isApiConfigured) {
        const [apiComments, apiActivity] = await Promise.all([
          apiFetch<Comment[]>(`/api/tasks/${selectedTaskId}/comments`),
          apiFetch<ActivityEvent[]>(`/api/tasks/${selectedTaskId}/activity`),
        ]);
        setComments(apiComments);
        setActivity(apiActivity);
      } else {
        const [commentResult, activityResult] = await Promise.all([
          supabase
            .from("comments")
            .select("*")
            .eq("task_id", selectedTaskId)
            .order("created_at", { ascending: true }),
          supabase
            .from("activity_events")
            .select("*")
            .eq("task_id", selectedTaskId)
            .order("created_at", { ascending: false }),
        ]);

        if (commentResult.error || activityResult.error) {
          throw commentResult.error || activityResult.error;
        }

        setComments((commentResult.data ?? []) as Comment[]);
        setActivity((activityResult.data ?? []) as ActivityEvent[]);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setError(null);

    try {
      const email = authDraft.email.trim().toLowerCase();
      const password = authDraft.password;
      const result =
        authMode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: {
                  full_name: authDraft.name.trim() || email.split("@")[0],
                },
              },
            });

      if (result.error) throw result.error;
      if (!result.data.user) {
        throw new Error("Check your email to finish creating your account.");
      }

      if (authMode === "signup" && !result.data.session) {
        setAuthNotice("Check your email to verify your account before signing in.");
        setAuthMode("signin");
        setAuthDraft((current) => ({ ...current, password: "", name: "" }));
        return;
      }

      await startAuthenticatedSession(result.data.user);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function signInWithGoogle() {
    if (!supabase) return;

    setSaving(true);
    setError(null);
    setAuthNotice(null);

    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (googleError) throw googleError;
    } catch (caught) {
      setError(getErrorMessage(caught));
      setSaving(false);
    }
  }

  async function resendVerificationEmail() {
    if (!supabase) return;
    const email = (userEmail || authDraft.email).trim().toLowerCase();
    if (!email) {
      setError("Enter your email first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setAuthNotice(`Verification email sent to ${email}.`);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function continueAsGuest() {
    if (!supabase) return;

    setSaving(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        setError("Anonymous auth is disabled in Supabase. Enable it or sign in with an account.");
        return;
      }
      if (!data.user) throw new Error("Could not start a guest workspace.");
      await startAuthenticatedSession(data.user);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserId(null);
    setUserEmail("");
    setUserName("Guest user");
    setUserAvatarUrl(null);
    setEmailVerified(false);
    setAuthNotice(null);
    setWorkspaceId(null);
    setWorkspaces([]);
    setCollaborators([]);
    setTasks([]);
    setMembers([]);
    setLabels([]);
    setSelectedTaskId(null);
  }

  async function changeWorkspace(nextWorkspaceId: string) {
    setWorkspaceId(nextWorkspaceId);
    setSelectedTaskId(null);
    setBoardScope("personal");
    setFilters((current) => ({ ...current, assigneeId: "all" }));
    await loadBoard(nextWorkspaceId);
  }

  async function addCollaborator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !userId || !inviteEmail.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const email = inviteEmail.trim().toLowerCase();
      const { error: inviteError } = await supabase.from("workspace_members").upsert(
        {
          workspace_owner_id: workspaceId,
          email,
          role: "editor",
          status: "pending",
        },
        { onConflict: "workspace_owner_id,email" },
      );
      if (inviteError) throw inviteError;

      const existingMember = members.some(
        (member) => member.name.toLowerCase() === email,
      );
      if (!existingMember) {
        await supabase.from("team_members").insert({
          user_id: workspaceId,
          name: email,
          color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
        });
      }

      setInviteEmail("");
      await loadWorkspaceAccess({ id: userId, email: userEmail } as User);
      await loadBoard(workspaceId);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  if (!userId) {
    return (
      <AuthScreen
        mode={authMode}
        draft={authDraft}
        saving={saving}
        error={error}
        notice={authNotice}
        setMode={setAuthMode}
        setDraft={setAuthDraft}
        onSubmit={submitAuth}
        onGoogle={signInWithGoogle}
        onGuest={continueAsGuest}
        onResendVerification={resendVerificationEmail}
        onDismissError={() => setError(null)}
      />
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        theme={theme}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        userEmail={userEmail}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        emailVerified={emailVerified}
        isGuest={!userEmail}
        workspaces={workspaces}
        workspaceId={workspaceId}
        filters={filters}
        setFilters={setFilters}
        onWorkspaceChange={changeWorkspace}
        onCreate={() => setComposerOpen(true)}
        onSignOut={signOut}
      />

      {!emailVerified && (
        <EmailVerificationBar
          email={userEmail}
          saving={saving}
          onResend={resendVerificationEmail}
        />
      )}

      <BoardSummary
        stats={stats}
        filters={filters}
        setFilters={setFilters}
        boardScope={boardScope}
        setBoardScope={setBoardScope}
      />

      {error && (
        <div className="alert" role="alert">
          <strong>Something needs attention.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="workspace">
        <section className="board-area" aria-label="Task board">
          {loading ? (
            <BoardSkeleton />
          ) : (
            <div className="board-grid">
              {COLUMNS.map((column) => (
                <BoardColumn
                  key={column.id}
                  status={column.id}
                  title={column.title}
                  tasks={visibleTasks.filter((task) => task.status === column.id)}
                  totalCount={scopedTasks.filter((task) => task.status === column.id).length}
                  draggingTaskId={draggingTaskId}
                  onDropTask={moveTask}
                  onOpenTask={setSelectedTaskId}
                  onDragStart={setDraggingTaskId}
                  onDragEnd={() => setDraggingTaskId(null)}
                  onCreate={() => {
                    setComposerOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      <WorkspaceTools
        members={members}
        labels={labels}
        collaborators={collaborators}
        inviteEmail={inviteEmail}
        isWorkspaceOwner={isWorkspaceOwner}
        activeWorkspace={activeWorkspace}
        memberDraft={memberDraft}
        labelDraft={labelDraft}
        setMemberDraft={setMemberDraft}
        setLabelDraft={setLabelDraft}
        setInviteEmail={setInviteEmail}
        addMember={addMember}
        addLabel={addLabel}
        addCollaborator={addCollaborator}
      />

      {composerOpen && (
        <TaskModal
          title="Create task"
          saving={saving}
          initialDraft={emptyDraft}
          members={members}
          labels={labels}
          onClose={() => setComposerOpen(false)}
          onSubmit={createTask}
        />
      )}

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          members={members}
          labels={labels}
          comments={comments}
          activity={activity}
          commentDraft={commentDraft}
          saving={saving}
          setCommentDraft={setCommentDraft}
          onClose={() => setSelectedTaskId(null)}
          onSubmit={updateTask}
          onDelete={deleteTask}
          onAddComment={addComment}
        />
      )}
    </main>
  );
}

function AuthScreen({
  mode,
  draft,
  saving,
  error,
  notice,
  setMode,
  setDraft,
  onSubmit,
  onGoogle,
  onGuest,
  onResendVerification,
  onDismissError,
}: {
  mode: AuthMode;
  draft: AuthDraft;
  saving: boolean;
  error: string | null;
  notice: string | null;
  setMode: (mode: AuthMode) => void;
  setDraft: (draft: AuthDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogle: () => void;
  onGuest: () => void;
  onResendVerification: () => void;
  onDismissError: () => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="project-badge auth-brand">
          <div className="project-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 3.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z" />
            </svg>
          </div>
            <span className="project-name">Task Board</span>
        </div>
        <h1>{mode === "signin" ? "Sign in to your workspace" : "Create your workspace"}</h1>
        <p>
          Run project boards with persistent tasks, invited collaborators, labels,
          comments, and activity history.
        </p>

        {error && (
          <div className="auth-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onDismissError}>
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="auth-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={onResendVerification} disabled={saving}>
              Resend
            </button>
          </div>
        )}

        <button
          className="google-button"
          type="button"
          onClick={onGoogle}
          disabled={saving}
        >
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>

        <div className="auth-separator">
          <span>or use email</span>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "signup" && (
            <label className="field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Tejdeep Pathipati"
              />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={draft.password}
              onChange={(event) =>
                setDraft({ ...draft, password: event.target.value })
              }
              placeholder="Minimum 6 characters"
              minLength={6}
              required
            />
          </label>
          <button className="btn-new auth-submit" type="submit" disabled={saving}>
            {saving ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-actions">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "I already have an account"}
          </button>
          <button type="button" onClick={onGuest} disabled={saving}>
            Continue as guest
          </button>
        </div>
      </section>
    </main>
  );
}

function TopBar({
  theme,
  onToggleTheme,
  userEmail,
  userName,
  userAvatarUrl,
  emailVerified,
  isGuest,
  workspaces,
  workspaceId,
  filters,
  setFilters,
  onWorkspaceChange,
  onCreate,
  onSignOut,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  userEmail: string;
  userName: string;
  userAvatarUrl: string | null;
  emailVerified: boolean;
  isGuest: boolean;
  workspaces: WorkspaceOption[];
  workspaceId: string | null;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <div className="project-badge">
        <div className="project-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 3.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z" />
          </svg>
        </div>
        <span className="project-name">Task Board</span>
        <span className="project-slash">/</span>
        <select
          className="breadcrumb-select"
          value={workspaceId ?? ""}
          onChange={(event) => onWorkspaceChange(event.target.value)}
          aria-label="Active workspace"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.ownerId} value={workspace.ownerId}>
              {workspace.name}
              {workspace.role !== "owner" ? ` (${workspace.role})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="topbar-right">
        <label className="search-wrap">
          <svg
            className="search-ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <span className="sr-only">Search tasks</span>
          <input
            className="search"
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="Search tasks..."
          />
        </label>
        <button className="btn-new" type="button" onClick={onCreate}>
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          New task
        </button>
        <button
          className="ghost-button theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          style={{ padding: "7px", display: "flex", alignItems: "center" }}
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          )}
        </button>
        <div className="topbar-divider" />
        <button className="account-button" type="button" onClick={onSignOut}>
          <span className="account-avatar">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt="" />
            ) : (
              getInitials(userName || userEmail)
            )}
          </span>
          <span className="account-copy">
            <strong>{isGuest ? "Guest" : userName || userEmail.split("@")[0]}</strong>
            <small>{isGuest ? "Sign in" : emailVerified ? "Verified" : "Verify email"}</small>
          </span>
        </button>
      </div>
    </header>
  );
}

function EmailVerificationBar({
  email,
  saving,
  onResend,
}: {
  email: string;
  saving: boolean;
  onResend: () => void;
}) {
  return (
    <section className="verify-bar">
      <span>Verify {email || "your email"} to secure this workspace and receive invites.</span>
      <button type="button" onClick={onResend} disabled={saving}>
        {saving ? "Sending..." : "Resend email"}
      </button>
    </section>
  );
}

function BoardSummary({
  stats,
  filters,
  setFilters,
  boardScope,
  setBoardScope,
}: {
  stats: {
    total: number;
    done: number;
    overdue: number;
    inFlight: number;
  };
  filters: Filters;
  setFilters: (filters: Filters) => void;
  boardScope: BoardScope;
  setBoardScope: (scope: BoardScope) => void;
}) {
  const isAll =
    filters.priority === "all" &&
    filters.assigneeId === "all" &&
    filters.labelId === "all" &&
    filters.due === "all";

  return (
    <section className="summary-bar" aria-label="Board filters">
      <div className="stat-strip" aria-label="Board summary">
        <Stat label="Total" value={stats.total} />
        <Stat label="Done" value={stats.done} />
        <Stat
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue ? "danger" : ""}
        />
        <Stat label="In flight" value={stats.inFlight} />
      </div>
      <div className="space-toggle" aria-label="Board scope">
        <button
          className={boardScope === "personal" ? "active" : ""}
          type="button"
          onClick={() => setBoardScope("personal")}
        >
          Personal
        </button>
        <button
          className={boardScope === "team" ? "active" : ""}
          type="button"
          onClick={() => setBoardScope("team")}
        >
          Team
        </button>
      </div>
      <div className="quick-filters" aria-label="Quick filters">
        <FilterChip
          label="All"
          active={isAll}
          onClick={() =>
            setFilters({
              ...filters,
              priority: "all",
              assigneeId: "all",
              labelId: "all",
              due: "all",
            })
          }
        />
        <FilterChip
          label="High priority"
          active={filters.priority === "high"}
          onClick={() =>
            setFilters({
              ...filters,
              priority: filters.priority === "high" ? "all" : "high",
            })
          }
        />
        <FilterChip
          label="Overdue"
          active={filters.due === "overdue"}
          onClick={() =>
            setFilters({
              ...filters,
              due: filters.due === "overdue" ? "all" : "overdue",
            })
          }
        />
      </div>
    </section>
  );
}

function FilterChip({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`filter-chip ${active ? "active" : ""}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <span className={`stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function WorkspaceTools({
  members,
  labels,
  collaborators,
  inviteEmail,
  isWorkspaceOwner,
  activeWorkspace,
  memberDraft,
  labelDraft,
  setMemberDraft,
  setLabelDraft,
  setInviteEmail,
  addMember,
  addLabel,
  addCollaborator,
}: {
  members: TeamMember[];
  labels: Label[];
  collaborators: Collaborator[];
  inviteEmail: string;
  isWorkspaceOwner: boolean;
  activeWorkspace: WorkspaceOption | null;
  memberDraft: string;
  labelDraft: string;
  setMemberDraft: (value: string) => void;
  setLabelDraft: (value: string) => void;
  setInviteEmail: (value: string) => void;
  addMember: (event: FormEvent<HTMLFormElement>) => void;
  addLabel: (event: FormEvent<HTMLFormElement>) => void;
  addCollaborator: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <details className="workspace-tools">
      <summary>Workspace settings</summary>
      <div className="workspace-tools-grid">
        <section className="panel">
          <h2>Collaborators</h2>
          <p className="panel-note">
            {activeWorkspace?.role === "owner"
              ? "Invite teammates by email. They can sign in and work in this board."
              : "You are collaborating in this shared workspace."}
          </p>
          <div className="collaborator-list">
            <span className="collaborator-row owner-row">
              <strong>Owner</strong>
              <span>{activeWorkspace?.name ?? "Current workspace"}</span>
            </span>
            {collaborators.map((collaborator) => (
              <span className="collaborator-row" key={collaborator.id}>
                <strong>{collaborator.email}</strong>
                <span>{collaborator.status}</span>
              </span>
            ))}
          </div>
          {isWorkspaceOwner && (
            <form className="inline-form" onSubmit={addCollaborator}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@company.com"
              />
              <button type="submit">Invite</button>
            </form>
          )}
        </section>

        <section className="panel">
          <h2>Team</h2>
          <div className="member-list">
            {members.map((member) => (
              <span className="member-pill" key={member.id}>
                <Avatar member={member} />
                {member.name}
              </span>
            ))}
          </div>
          <form className="inline-form" onSubmit={addMember}>
            <input
              value={memberDraft}
              onChange={(event) => setMemberDraft(event.target.value)}
              placeholder="Add member"
            />
            <button type="submit">Add</button>
          </form>
        </section>

        <section className="panel">
          <h2>Labels</h2>
          <div className="label-list">
            {labels.map((label) => (
              <span className="label-chip" key={label.id}>
                <span className="label-dot" style={{ backgroundColor: label.color }} />
                {label.name}
              </span>
            ))}
          </div>
          <form className="inline-form" onSubmit={addLabel}>
            <input
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              placeholder="Add label"
            />
            <button type="submit">Add</button>
          </form>
        </section>
      </div>
    </details>
  );
}

function BoardColumn({
  status,
  title,
  tasks,
  totalCount,
  draggingTaskId,
  onDropTask,
  onOpenTask,
  onDragStart,
  onDragEnd,
  onCreate,
}: {
  status: Status;
  title: string;
  tasks: TaskView[];
  totalCount: number;
  draggingTaskId: string | null;
  onDropTask: (taskId: string, status: Status, beforeTaskId?: string) => void;
  onOpenTask: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onCreate: () => void;
}) {
  return (
    <section
      className={`column ${draggingTaskId ? "drop-ready" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
        if (taskId) onDropTask(taskId, status);
      }}
    >
      <header className="column-header">
        <div className="column-title">
          <span className={`status-dot ${statusAccentClass[status]}`} />
          <h2>{title}</h2>
        </div>
        <div className="column-tools">
          <span>{totalCount}</span>
          <button type="button" onClick={onCreate} aria-label={`Create task in ${title}`}>
            +
          </button>
        </div>
      </header>
      <div className="task-stack">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpenTask(task.id)}
              onDragStart={() => onDragStart(task.id)}
              onDragEnd={onDragEnd}
              onDropBefore={(taskId) => onDropTask(taskId, status, task.id)}
            />
          ))
        ) : (
          <button className="empty-column" type="button" onClick={onCreate}>
            <strong>No visible tasks</strong>
            <span>Create one or adjust filters.</span>
          </button>
        )}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  task: TaskView;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: (taskId: string) => void;
}) {
  const dueState = getDueState(task.due_date);

  return (
    <article
      className={`task-card ${task.status === "done" ? "is-done" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const taskId = event.dataTransfer.getData("text/plain");
        if (taskId && taskId !== task.id) onDropBefore(taskId);
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
    >
      <header className="task-title-row">
        <span className={`priority-dot ${task.priority}`} />
        <h3>{task.title}</h3>
      </header>
      {task.description && <p>{task.description}</p>}
      <div className="task-meta-row">
        <div className="task-labels">
          {task.labels.slice(0, 2).map((label) => (
            <span className="label-chip compact" key={label.id}>
              {label.name}
            </span>
          ))}
        </div>
        <DueBadge dueDate={task.due_date} state={dueState} />
      </div>
      <footer>
        <div className="avatar-stack">
          {task.assignees.length ? (
            task.assignees.slice(0, 4).map((member) => (
              <Avatar key={member.id} member={member} />
            ))
          ) : (
            <span className="unassigned">Unassigned</span>
          )}
        </div>
      </footer>
    </article>
  );
}

function TaskModal({
  title,
  initialDraft,
  members,
  labels,
  saving,
  onClose,
  onSubmit,
}: {
  title: string;
  initialDraft: DraftTask;
  members: TeamMember[];
  labels: Label[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: DraftTask) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <TaskEditor
          title={title}
          initialDraft={initialDraft}
          members={members}
          labels={labels}
          saving={saving}
          submitLabel="Create task"
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

function TaskDrawer({
  task,
  members,
  labels,
  comments,
  activity,
  commentDraft,
  saving,
  setCommentDraft,
  onClose,
  onSubmit,
  onDelete,
  onAddComment,
}: {
  task: TaskView;
  members: TeamMember[];
  labels: Label[];
  comments: Comment[];
  activity: ActivityEvent[];
  commentDraft: string;
  saving: boolean;
  setCommentDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: (taskId: string, draft: DraftTask) => void;
  onDelete: (taskId: string) => void;
  onAddComment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const initialDraft: DraftTask = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ?? "",
    assigneeIds: task.assignees.map((member) => member.id),
    labelIds: task.labels.map((label) => label.id),
  };

  return (
    <aside className="drawer" aria-label="Task details">
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{statusNames[task.status]}</p>
          <h2>{task.title}</h2>
        </div>
        <div className="drawer-actions">
          <button
            className="danger-button"
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={saving}
          >
            Delete
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <TaskEditor
        key={task.id}
        title="Task details"
        initialDraft={initialDraft}
        members={members}
        labels={labels}
        saving={saving}
        submitLabel="Save changes"
        onSubmit={(draft) => onSubmit(task.id, draft)}
        onCancel={onClose}
      />
      <section className="timeline-section">
        <h3>Comments</h3>
        <form className="comment-form" onSubmit={onAddComment}>
          <textarea
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="Write a project note..."
          />
          <button className="secondary-button" type="submit" disabled={saving}>
            Add comment
          </button>
        </form>
        <div className="timeline-list">
          {comments.length ? (
            comments.map((comment) => (
              <article className="timeline-item" key={comment.id}>
                <p>{comment.body}</p>
                <time>{formatDateTime(comment.created_at)}</time>
              </article>
            ))
          ) : (
            <p className="muted">No comments yet.</p>
          )}
        </div>
      </section>
      <section className="timeline-section">
        <h3>Activity</h3>
        <div className="timeline-list">
          {activity.length ? (
            activity.map((event) => (
              <article className="timeline-item" key={event.id}>
                <p>{event.message}</p>
                <time>{formatDateTime(event.created_at)}</time>
              </article>
            ))
          ) : (
            <p className="muted">No activity yet.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

function TaskEditor({
  title,
  initialDraft,
  members,
  labels,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialDraft: DraftTask;
  members: TeamMember[];
  labels: Label[];
  saving: boolean;
  submitLabel: string;
  onSubmit: (draft: DraftTask) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DraftTask>(initialDraft);

  function toggleAssignee(memberId: string) {
    setDraft((current) => ({
      ...current,
      assigneeIds: current.assigneeIds.includes(memberId)
        ? current.assigneeIds.filter((id) => id !== memberId)
        : [...current.assigneeIds, memberId],
    }));
  }

  function toggleLabel(labelId: string) {
    setDraft((current) => ({
      ...current,
      labelIds: current.labelIds.includes(labelId)
        ? current.labelIds.filter((id) => id !== labelId)
        : [...current.labelIds, labelId],
    }));
  }

  return (
    <form
      className="task-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.title.trim()) onSubmit(draft);
      }}
    >
      <h2>{title}</h2>
      <label className="field">
        <span>Title</span>
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          placeholder="e.g. Polish onboarding flow"
          required
          maxLength={160}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
          placeholder="Add the context a teammate would need."
          rows={4}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Status</span>
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as Status })
            }
          >
            {COLUMNS.map((column) => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select
            value={draft.priority}
            onChange={(event) =>
              setDraft({ ...draft, priority: event.target.value as Priority })
            }
          >
            {PRIORITIES.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={draft.due_date}
            onChange={(event) =>
              setDraft({ ...draft, due_date: event.target.value })
            }
          />
        </label>
      </div>
      <div className="picker-block">
        <span>Assignees</span>
        <div className="choice-list">
          {members.map((member) => (
            <label className="choice" key={member.id}>
              <input
                type="checkbox"
                checked={draft.assigneeIds.includes(member.id)}
                onChange={() => toggleAssignee(member.id)}
              />
              <Avatar member={member} />
              {member.name}
            </label>
          ))}
        </div>
      </div>
      <div className="picker-block">
        <span>Labels</span>
        <div className="choice-list">
          {labels.map((label) => (
            <label className="choice" key={label.id}>
              <input
                type="checkbox"
                checked={draft.labelIds.includes(label.id)}
                onChange={() => toggleLabel(label.id)}
              />
              <span className="label-dot" style={{ backgroundColor: label.color }} />
              {label.name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Avatar({ member }: { member: TeamMember }) {
  return (
    <span
      className="avatar"
      title={member.name}
      style={{
        backgroundColor: member.color,
        color: getAvatarTextColor(member.color),
      }}
    >
      {member.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function DueBadge({
  dueDate,
  state,
}: {
  dueDate: string | null;
  state: "none" | "upcoming" | "soon" | "overdue";
}) {
  if (!dueDate) return null;
  return <span className={`due-badge ${state}`}>{formatShortDate(dueDate)}</span>;
}

function BoardSkeleton() {
  return (
    <div className="board-grid">
      {COLUMNS.map((column) => (
        <section className="column" key={column.id}>
          <header className="column-header">
            <div>
              <h2>{column.title}</h2>
              <p>Loading workspace...</p>
            </div>
            <span>0</span>
          </header>
          <div className="skeleton-card" />
          <div className="skeleton-card short" />
        </section>
      ))}
    </div>
  );
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <p className="eyebrow">Supabase setup required</p>
        <h1>Connect your task board</h1>
        <p>
          Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`,
          then run the SQL in `supabase/schema.sql`. Anonymous sign-in must be
          enabled in Supabase Auth.
        </p>
        <pre>
          <code>
            VITE_SUPABASE_URL=https://your-project-ref.supabase.co{"\n"}
            VITE_SUPABASE_ANON_KEY=your-public-anon-key
          </code>
        </pre>
      </section>
    </main>
  );
}

function getDueState(dueDate: string | null): "none" | "upcoming" | "soon" | "overdue" {
  if (!dueDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "upcoming";
}

function isDueThisWeek(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  return days >= 0 && days <= 7;
}

function getNextPosition(
  tasks: TaskView[],
  movedTaskId: string,
  nextStatus: Status,
  beforeTaskId?: string,
) {
  const targetTasks = tasks
    .filter((task) => task.status === nextStatus && task.id !== movedTaskId)
    .sort((a, b) => a.position - b.position);

  if (!targetTasks.length) return Date.now();
  if (!beforeTaskId) return targetTasks[targetTasks.length - 1].position + 1000;

  const beforeIndex = targetTasks.findIndex((task) => task.id === beforeTaskId);
  if (beforeIndex < 0) return targetTasks[targetTasks.length - 1].position + 1000;

  const beforeTask = targetTasks[beforeIndex];
  const previousTask = targetTasks[beforeIndex - 1];

  if (!previousTask) return beforeTask.position - 1000;
  return (previousTask.position + beforeTask.position) / 2;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unexpected error. Please try again.";
}

function getAvatarTextColor(color: string) {
  const colors: Record<string, string> = {
    // Dark mode text pairs
    "#2A2D5E": "#A5B4FC",
    "#4A2040": "#F9A8D4",
    "#1E3A2A": "#6EE7B7",
    "#3D3020": "#FCD34D",
    "#352A50": "#C4B5FD",
    "#2A2A30": "#A1A1AA",
    // Light mode text pairs
    "#DDEEFF": "#1557A0",
    "#FADADF": "#8C2040",
    "#D7EDCC": "#2E6013",
    "#FDEECB": "#7A4500",
    "#E7E0FA": "#4B3BA5",
    "#E4E1DC": "#514C45",
  };
  return colors[color.toUpperCase()] ?? colors[color] ?? "#EDEDEF";
}

function getUserProfile(user: User) {
  const metadata = user.user_metadata ?? {};
  const email = user.email?.toLowerCase() ?? "";
  if (user.is_anonymous) {
    return {
      email,
      name: "Guest workspace",
      avatarUrl: null,
      provider: "anonymous",
      emailVerified: true,
    };
  }
  const name =
    String(
      metadata.full_name ??
        metadata.name ??
        [metadata.given_name, metadata.family_name].filter(Boolean).join(" ") ??
        metadata.user_name ??
        metadata.preferred_username ??
        "",
    ).trim() ||
    email.split("@")[0] ||
    "New teammate";
  const avatarUrl =
    String(metadata.avatar_url ?? metadata.picture ?? metadata.photo_url ?? "").trim() ||
    null;
  const provider = String(
    user.app_metadata?.provider ??
      user.identities?.[0]?.provider ??
      (user.is_anonymous ? "anonymous" : "email"),
  );

  return {
    email,
    name,
    avatarUrl,
    provider,
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at || user.is_anonymous),
  };
}

function getInitials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/\s+|[._-]/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

export default App;
