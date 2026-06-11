import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import type { useTimezone } from "../hooks/useTimezone";
import {
  formatTimezoneLabel,
  formatTimezonePreview,
  listAllTimezones,
} from "../utils/userTimezone";

type TimezoneControls = ReturnType<typeof useTimezone>;

function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listAllTimezones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.toLowerCase().includes(q.replace(/\s+/g, "_")));
  }, [zones, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("timezone.search")}
        className="input-base text-sm"
        aria-label={t("timezone.searchAria")}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base max-h-40 text-sm"
        size={Math.min(8, Math.max(4, filtered.length))}
        aria-label={t("timezone.selectAria")}
      >
        {filtered.map((tz) => (
          <option key={tz} value={tz}>
            {formatTimezoneLabel(tz)}
          </option>
        ))}
      </select>
      {filtered.length === 0 && (
        <p className="text-[10px] text-slate-500">{t("timezone.noMatch")}</p>
      )}
    </div>
  );
}

export function TimezoneSettingsField({ timezone }: { timezone: TimezoneControls }) {
  const t = useT();
  const {
    settings,
    setMode,
    setSettings,
    resetToOrgTime,
    effectiveTimezone,
    detectedTimezone,
    orgTimezone,
  } = timezone;

  const preview = formatTimezonePreview(effectiveTimezone);
  const usingOrgDefault = settings.mode === "org";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 settings-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {t("timezone.label")}
        </span>
        {!usingOrgDefault && (
          <button
            type="button"
            onClick={resetToOrgTime}
            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
          >
            {t("timezone.useOrg")}
          </button>
        )}
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-slate-500 settings-muted">
        {t("timezone.description")}
      </p>
      {preview && (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-medium">{t("timezone.nowPreview")}</span> {preview}
        </p>
      )}

      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50/80">
          <input
            type="radio"
            name="timezone-mode"
            checked={settings.mode === "auto"}
            onChange={() => setMode("auto")}
            className="mt-0.5 accent-accent"
          />
          <span className="min-w-0 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">{t("timezone.autoDetect")}</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {formatTimezoneLabel(detectedTimezone)}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50/80">
          <input
            type="radio"
            name="timezone-mode"
            checked={settings.mode === "org"}
            onChange={() => setMode("org")}
            className="mt-0.5 accent-accent"
          />
          <span className="min-w-0 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">{t("timezone.orgTime")}</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {t("timezone.orgTimeHint", { tz: formatTimezoneLabel(orgTimezone) })}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50/80">
          <input
            type="radio"
            name="timezone-mode"
            checked={settings.mode === "custom"}
            onChange={() => setMode("custom")}
            className="mt-0.5 accent-accent"
          />
          <span className="min-w-0 flex-1 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">{t("timezone.choose")}</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {t("timezone.chooseHint")}
            </span>
          </span>
        </label>

        {settings.mode === "custom" && (
          <div className="pl-1">
            <TimezonePicker
              value={settings.customTimeZone}
              onChange={(customTimeZone) => setSettings({ mode: "custom", customTimeZone })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
