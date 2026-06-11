import { ChevronLeft } from "lucide-react";
import { useT } from "../contexts/I18nContext";

/** Back control for master–detail panels on narrow viewports (hidden from lg up). */
export function MobileDetailBack({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
    >
      <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t("common.back")}
    </button>
  );
}
