import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { AppNotification } from "../types";
import { notificationHeadline, notificationTaskLine } from "../utils/notificationText";
import { useT } from "../contexts/I18nContext";
import { formatInOrgTime } from "../utils/orgTimezone";

const COLLAPSED_COUNT = 7;

function formatWhen(iso: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return t("common.justNow");
  if (diff < 3_600_000) return t("common.minutesAgo", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("common.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  return formatInOrgTime(d, { month: "short", day: "numeric" });
}

export function NotificationsBell({
  notifications,
  onSelect,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: AppNotification[];
  onSelect: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  function pick(n: AppNotification) {
    if (!n.read) void onMarkRead(n.id);
    onSelect(n);
    setOpen(false);
  }

  const visible =
    expanded || notifications.length <= COLLAPSED_COUNT
      ? notifications
      : notifications.slice(0, COLLAPSED_COUNT);
  const hiddenCount = notifications.length - visible.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
        aria-label={t("notifications.aria", {
          unread: unread.length ? t("notifications.unreadSuffix", { count: unread.length }) : "",
        })}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 top-[calc(100%+6px)] z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 transition-[max-height] duration-200 ease-out ${
            expanded ? "max-h-[min(48rem,88vh)]" : "max-h-[min(24rem,58vh)]"
          }`}
          role="dialog"
          aria-label={t("notifications.title")}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-semibold text-slate-800">{t("notifications.title")}</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="shrink-0 text-[10px] font-medium text-accent hover:underline"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-500">{t("notifications.empty")}</li>
            ) : (
              visible.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => pick(n)}
                    className={`flex w-full flex-col gap-1 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
                      !n.read ? "bg-accent/5" : "opacity-90"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold leading-snug text-slate-900">
                        {notificationHeadline(n)}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(n.createdAt, t)}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-accent">{notificationTaskLine(n)}</span>
                    {n.bodyPreview && n.kind !== "member_joined" && (
                      <span className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                        “{n.bodyPreview}”
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>

          {hiddenCount > 0 && (
            <div className="shrink-0 border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-accent hover:bg-accent/5"
              >
                {t("common.showMore", { count: hiddenCount })}
              </button>
            </div>
          )}
          {expanded && notifications.length > COLLAPSED_COUNT && (
            <div className="shrink-0 border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("common.showLess")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
