/** Profile-style loading shimmer — reserves space when used with explicit dimensions. */
export function ShimmerPlaceholder({
  className = "",
  roundedClassName = "",
}: {
  className?: string;
  roundedClassName?: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute inset-0 bg-shimmer animate-shimmer ${roundedClassName} ${className}`}
      aria-hidden
    />
  );
}
