/** Preset author highlight colors (background + accent border). */
export const AUTHOR_COLORS = [
  { bg: "#dbeafe", border: "#3b82f6", label: "text-blue-900" },
  { bg: "#dcfce7", border: "#22c55e", label: "text-emerald-900" },
  { bg: "#fce7f3", border: "#ec4899", label: "text-pink-900" },
  { bg: "#fef3c7", border: "#f59e0b", label: "text-amber-900" },
  { bg: "#e0e7ff", border: "#6366f1", label: "text-indigo-900" },
  { bg: "#ccfbf1", border: "#14b8a6", label: "text-teal-900" },
  { bg: "#ffe4e6", border: "#f43f5e", label: "text-rose-900" },
  { bg: "#f3e8ff", border: "#a855f7", label: "text-violet-900" },
] as const;

export function authorColorForWorker(workerIds: string[], authorId: string) {
  const sorted = [...workerIds].sort();
  const idx = Math.max(0, sorted.indexOf(authorId));
  return AUTHOR_COLORS[idx % AUTHOR_COLORS.length];
}
