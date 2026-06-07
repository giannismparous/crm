import { useCallback, useEffect, useMemo, useState } from "react";
import { applyTimezoneSettings } from "../utils/orgTimezone";
import {
  getDetectedTimezone,
  loadTimezoneSettings,
  ORG_TIMEZONE,
  resolveEffectiveTimezone,
  saveTimezoneSettings,
  normalizeTimezoneSettings,
  type TimezoneMode,
  type TimezoneSettings,
} from "../utils/userTimezone";

/** Per-user timezone preference — changing it re-renders the app shell. */
export function useTimezone(userId: string) {
  const [settings, setSettingsState] = useState<TimezoneSettings>(() =>
    loadTimezoneSettings(userId)
  );

  useEffect(() => {
    const loaded = loadTimezoneSettings(userId);
    setSettingsState(loaded);
    applyTimezoneSettings(loaded);
  }, [userId]);

  const setSettings = useCallback(
    (patch: Partial<TimezoneSettings>) => {
      setSettingsState((prev) => {
        const next = normalizeTimezoneSettings({ ...prev, ...patch });
        saveTimezoneSettings(userId, next);
        applyTimezoneSettings(next);
        return next;
      });
    },
    [userId]
  );

  const setMode = useCallback(
    (mode: TimezoneMode) => {
      if (mode === "custom") {
        const prev = loadTimezoneSettings(userId);
        const customTimeZone =
          prev.mode === "custom" && prev.customTimeZone !== ORG_TIMEZONE
            ? prev.customTimeZone
            : getDetectedTimezone();
        setSettings({ mode, customTimeZone });
        return;
      }
      setSettings({ mode });
    },
    [setSettings, userId]
  );

  const resetToOrgTime = useCallback(() => {
    setSettings({ mode: "org", customTimeZone: ORG_TIMEZONE });
  }, [setSettings]);

  const effectiveTimezone = useMemo(
    () => resolveEffectiveTimezone(settings),
    [settings]
  );

  return {
    settings,
    setSettings,
    setMode,
    resetToOrgTime,
    effectiveTimezone,
    detectedTimezone: getDetectedTimezone(),
    orgTimezone: ORG_TIMEZONE,
  };
}
