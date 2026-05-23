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

// Darker, richer avatar backgrounds for dark mode surfaces.
export const MEMBER_COLORS = [
  "#2A2D5E",
  "#4A2040",
  "#1E3A2A",
  "#3D3020",
  "#352A50",
  "#2A2A30",
];

// Brighter, more vibrant label colors for dark mode visibility.
export const LABEL_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#0f766e",
  "#64748b",
];
