import type { Priority, Status } from "./types";

export const COLUMNS: Array<{ id: Status; title: string; description: string }> = [
  { id: "todo", title: "To Do", description: "Planned and ready to start" },
  { id: "in_progress", title: "In Progress", description: "Actively being worked" },
  { id: "in_review", title: "In Review", description: "Needs feedback or QA" },
  { id: "done", title: "Done", description: "Completed work" },
];

export const PRIORITIES: Array<{ id: Priority; label: string }> = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
];

export const MEMBER_COLORS = [
  "#DDEEFF",
  "#FADADF",
  "#D7EDCC",
  "#FDEECB",
  "#E7E0FA",
  "#E4E1DC",
];

export const LABEL_COLORS = [
  "#1d4ed8",
  "#047857",
  "#b45309",
  "#be123c",
  "#6d28d9",
  "#334155",
];
