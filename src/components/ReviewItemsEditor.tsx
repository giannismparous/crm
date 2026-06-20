import { Plus, Trash2 } from "lucide-react";
import { useT } from "../contexts/I18nContext";

export function ReviewItemsEditor({
  items,
  onChange,
  compact = false,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className={compact ? "" : "sm:col-span-2"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!compact && (
          <p className="text-xs font-medium text-slate-600">{t("appointments.whatToReview")}</p>
        )}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {t("appointments.addItem")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-slate-500">{t("appointments.reviewHint")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-center text-sm font-bold leading-none text-slate-400" aria-hidden>
                •
              </span>
              <input
                value={item}
                onChange={(e) =>
                  onChange(items.map((v, i) => (i === index ? e.target.value : v)))
                }
                className="input-base min-w-0 flex-1 py-1.5"
                placeholder={t("appointments.reviewPlaceholder")}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={t("appointments.removeItemAria", { n: String(index + 1) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
