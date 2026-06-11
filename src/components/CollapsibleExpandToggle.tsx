import { useT } from "../contexts/I18nContext";

export function CollapsibleExpandToggle({
  show,
  onExpand,
}: {
  show: boolean;
  onExpand: () => void;
}) {
  const t = useT();
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
        {t("common.showMorePlain")}
      </button>
    </div>
  );
}
