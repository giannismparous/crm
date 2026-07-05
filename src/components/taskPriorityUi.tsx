import { Clock, ClockAlert } from "lucide-react";
import type { TaskPriority } from "../types";
import { useI18n, useT } from "../contexts/I18nContext";
import { translatePriority } from "../i18n/helpers";

export const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

function priorityTipKey(p: TaskPriority): string {
  return `tasks.priority.${p}Tip`;
}

export const PRIORITY_BADGE: Record<TaskPriority, { pill: string; iconColor: string }> = {
  urgent: {
    pill: "bg-rose-100",
    iconColor: "text-rose-700",
  },
  high: {
    pill: "bg-orange-100",
    iconColor: "text-orange-800",
  },
  medium: {
    pill: "bg-indigo-50",
    iconColor: "text-indigo-700",
  },
  low: {
    pill: "bg-emerald-100",
    iconColor: "text-emerald-800",
  },
};

export { priorityTipKey };

/** Calendar / list chip colors keyed by task priority. */
export const TASK_PRIORITY_CALENDAR_CHIP: Record<
  TaskPriority,
  { stripe: string; bg: string; hover: string; label: string; text: string; ring: string; border: string }
> = {
  urgent: {
    stripe: "border-rose-600",
    bg: "bg-rose-50",
    hover: "hover:bg-rose-100/80",
    label: "text-rose-800",
    text: "text-rose-950",
    ring: "ring-rose-100",
    border: "border-rose-100",
  },
  high: {
    stripe: "border-orange-600",
    bg: "bg-orange-50",
    hover: "hover:bg-orange-100/80",
    label: "text-orange-800",
    text: "text-orange-950",
    ring: "ring-orange-100",
    border: "border-orange-100",
  },
  medium: {
    stripe: "border-indigo-600",
    bg: "bg-indigo-50",
    hover: "hover:bg-indigo-100/80",
    label: "text-indigo-800",
    text: "text-indigo-950",
    ring: "ring-indigo-100",
    border: "border-indigo-100",
  },
  low: {
    stripe: "border-emerald-600",
    bg: "bg-emerald-50",
    hover: "hover:bg-emerald-100/80",
    label: "text-emerald-800",
    text: "text-emerald-950",
    ring: "ring-emerald-100",
    border: "border-emerald-100",
  },
};

/** Lucide paths use stroke="currentColor" — `text-*` sets `color` (keep mid tones so strokes read as hue, not black). */
export function PriorityUrgencyIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const Icon = priority === "urgent" || priority === "high" ? ClockAlert : Clock;
  const { iconColor } = PRIORITY_BADGE[priority];
  return (
    <Icon
      className={`shrink-0 ${iconColor} ${className ?? ""}`}
      strokeWidth={2}
      aria-hidden
    />
  );
}

/** Multi-select urgency filter; empty selection = all priorities. */
export function PriorityFilter({
  value,
  onChange,
}: {
  value: TaskPriority[];
  onChange: (priorities: TaskPriority[]) => void;
}) {
  const t = useT();
  const { locale } = useI18n();

  function toggle(p: TaskPriority) {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  }

  return (
    <div className="segment-track shrink-0" role="group" aria-label={t("tasks.priority.filterAria")}>
      {PRIORITY_ORDER.map((p) => {
        const on = value.includes(p);
        const priorityLabel = translatePriority(locale, p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            title={`${on ? t("common.hide") : t("common.view")} ${priorityLabel} — ${t(priorityTipKey(p))}`}
            aria-label={priorityLabel}
            aria-pressed={on}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition sm:h-8 sm:w-8 ${
              on ? `${PRIORITY_BADGE[p].pill} priority-filter-on` : "priority-filter-off"
            }`}
          >
            <PriorityUrgencyIcon priority={p} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        );
      })}
    </div>
  );
}

export function PrioritySegmented({
  value,
  onChange,
  size = "md",
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
  size?: "sm" | "md";
}) {
  const t = useT();
  const { locale } = useI18n();
  const btn =
    size === "sm"
      ? "h-7 min-w-[2rem] px-1 py-0.5 sm:h-8 sm:min-w-[2.25rem]"
      : "h-8 min-w-[2.25rem] px-1 py-0.5 sm:h-9 sm:min-w-[2.5rem]";
  const icon = size === "sm" ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4 sm:h-[18px] sm:w-[18px]";
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t("tasks.priority.aria")}>
      {PRIORITY_ORDER.map((p) => {
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            title={t(priorityTipKey(p))}
            aria-label={translatePriority(locale, p)}
            aria-pressed={selected}
            className={`inline-flex ${btn} shrink-0 items-center justify-center rounded-md border transition ${PRIORITY_BADGE[p].pill} ${
              selected ? "priority-filter-on" : "priority-filter-off"
            }`}
          >
            <PriorityUrgencyIcon priority={p} className={icon} />
          </button>
        );
      })}
    </div>
  );
}
