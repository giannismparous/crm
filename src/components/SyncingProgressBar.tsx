import { useT } from "../contexts/I18nContext";

/** Thin indeterminate bar — visible while data syncs; does not block interaction. */
export function SyncingProgressBar({ active }: { active: boolean }) {
  const t = useT();
  const topClass = "top-0";

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 ${topClass} z-50 h-0.5 overflow-hidden bg-slate-100/80 transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!active}
      aria-label={active ? t("sync.loadingData") : undefined}
    >
      <div
        className="loading-bar-indeterminate h-full rounded-full bg-accent"
        style={{ animationPlayState: active ? "running" : "paused" }}
      />
    </div>
  );
}
