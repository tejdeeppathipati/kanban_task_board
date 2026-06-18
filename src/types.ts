export type Status = "todo" | "in_progress" | "in_review" | "done";

export type Priority = "low" | "normal" | "high";
export type TaskScope = "personal" | "team";
export type TeamRole = "admin" | "manager" | "member";

export type Task = {
  id: string;
  user_id: string;
  created_by: string;
  scope: TaskScope;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  id: string;
  user_id: string;
  name: string;
  role: TeamRole;
  color: string;
  avatar_url: string | null;
  created_at: string;
};

export type Label = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type TaskAssignee = {
  task_id: string;
  member_id: string;
  user_id: string;
  created_at: string;
};

export type TaskLabel = {
  task_id: string;
  label_id: string;
  user_id: string;
  created_at: string;
};

export type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type ActivityEvent = {
  id: string;
  task_id: string;
  user_id: string;
  event_type: "created" | "updated" | "moved" | "assigned" | "labeled" | "commented";
  message: string;
  created_at: string;
};

export type TaskView = Task & {
  assignees: TeamMember[];
  labels: Label[];
};

export type Filters = {
  search: string;
  priority: "all" | Priority;
  assigneeId: "all" | "unassigned" | string;
  labelId: "all" | string;
  due: "all" | "week" | "overdue";
};

export type DraftTask = {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string;
  assigneeIds: string[];
  labelIds: string[];
};
