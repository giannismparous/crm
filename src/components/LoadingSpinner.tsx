const SIZE_CLASS = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
  xl: "h-10 w-10 border-2",
} as const;

export function LoadingSpinner({
  size = "md",
  className = "",
  label = "Loading",
}: {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" aria-label={label} className={`inline-flex shrink-0 ${className}`}>
      <span
        className={`animate-spin rounded-full border-slate-200/90 border-t-accent ${SIZE_CLASS[size]}`}
        aria-hidden
      />
    </span>
  );
}
