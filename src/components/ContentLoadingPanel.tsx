import { LoadingSpinner } from "./LoadingSpinner";
import { useT } from "../contexts/I18nContext";

/** Centered loading state with shimmer + spinner — matches profile images and media viewers. */
export function ContentLoadingPanel({
  className = "",
  minHeightClass = "min-h-[12rem] py-12",
}: {
  className?: string;
  minHeightClass?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("common.loading")}
      className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${minHeightClass} ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-shimmer animate-shimmer opacity-35" aria-hidden />
      <LoadingSpinner size="lg" className="relative z-[1]" />
      <p className="relative z-[1] text-sm font-medium text-slate-500">{t("common.loading")}</p>
    </div>
  );
}
