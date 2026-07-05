import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { useT } from "../contexts/I18nContext";

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-100/90 ${className}`}>
      <ShimmerPlaceholder className="opacity-70" />
    </div>
  );
}

function LoadingCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <li
      className="content-fade-in overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <SkeletonBar className="h-5 w-[min(72%,18rem)]" />
          <SkeletonBar className="h-8 w-8 shrink-0 rounded-full" />
        </div>
        <SkeletonBar className="h-3 w-full" />
        <SkeletonBar className="h-3 w-[82%]" />
        <div className="flex flex-wrap gap-2 pt-0.5">
          <SkeletonBar className="h-6 w-16 rounded-full" />
          <SkeletonBar className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </li>
  );
}

/** Centered or list-shaped loading — shimmer only; label stays in aria for screen readers. */
export function ContentLoadingPanel({
  className = "",
  minHeightClass = "min-h-[12rem] py-12",
  variant = "panel",
  cardRows = 3,
  showLabel = false,
}: {
  className?: string;
  minHeightClass?: string;
  variant?: "panel" | "cards";
  cardRows?: number;
  showLabel?: boolean;
}) {
  const t = useT();
  const label = t("common.loading");

  if (variant === "cards") {
    return (
      <ul
        role="status"
        aria-live="polite"
        aria-label={label}
        className={`space-y-3 content-fade-in ${className}`}
      >
        {Array.from({ length: cardRows }, (_, i) => (
          <LoadingCardSkeleton key={i} delayMs={i * 70} />
        ))}
      </ul>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`content-fade-in relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${minHeightClass} ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-shimmer animate-shimmer opacity-30" aria-hidden />
      <span
        className="relative z-[1] inline-flex h-6 w-6 animate-spin rounded-full border-2 border-slate-200/90 border-t-accent/70"
        aria-hidden
      />
      {showLabel ? (
        <p className="relative z-[1] mt-3 text-sm font-medium text-slate-500">{label}</p>
      ) : null}
    </div>
  );
}
