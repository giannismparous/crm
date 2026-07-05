import { useI18n, useT } from "../../contexts/I18nContext";
import { getStrategicPlanHtml } from "../../content/strategicPlanHtml";

export function StrategicPlanDocument({ isFounder }: { isFounder: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const planHtml = getStrategicPlanHtml(locale);

  if (!isFounder) return null;

  return (
    <article className="strategic-plan-doc mx-auto max-w-4xl">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          {t("operations.strategicPlanBadge")}
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">
          {t("operations.strategicPlanTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("operations.strategicPlanSubtitle")}</p>
      </header>
      <div
        className="strategic-plan-body rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8"
        dangerouslySetInnerHTML={{ __html: planHtml }}
      />
    </article>
  );
}
