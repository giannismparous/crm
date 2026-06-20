export function ChatDateSeparator({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={label}>
      <div className="h-px min-w-0 flex-1 bg-slate-200" aria-hidden />
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500">
        {label}
      </span>
      <div className="h-px min-w-0 flex-1 bg-slate-200" aria-hidden />
    </div>
  );
}
