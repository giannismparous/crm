export const PROJECT_COLOR_OPTIONS = [
  "#6366f1",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
  "#f43f5e",
] as const;

export type ProjectColor = (typeof PROJECT_COLOR_OPTIONS)[number];

export const DEFAULT_PROJECT_COLOR: ProjectColor = PROJECT_COLOR_OPTIONS[0];

export const UNASSIGNED_PROJECT_ID = "__unassigned__";

export const UNASSIGNED_PROJECT_COLOR = "#94a3b8";

const COLOR_SET = new Set<string>(PROJECT_COLOR_OPTIONS);

export function normalizeProjectColor(value: unknown): ProjectColor {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (COLOR_SET.has(s)) return s as ProjectColor;
  return DEFAULT_PROJECT_COLOR;
}
