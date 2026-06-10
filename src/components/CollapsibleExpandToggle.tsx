export function CollapsibleExpandToggle({
  show,
  onExpand,
}: {
  show: boolean;
  onExpand: () => void;
}) {
  if (!show) return null;
  return (
    <div className="border-t border-slate-100 px-2 py-1">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onExpand();
        }}
        className="text-xs font-medium text-accent hover:underline"
      >
        Show more
      </button>
    </div>
  );
}
