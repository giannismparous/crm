import { useCallback, useEffect, useState } from "react";
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type AppearanceSettings,
  type ThemeMode,
} from "../utils/appearance";

/** Apply and edit appearance for the signed-in user. */
export function useAppearance(userId: string) {
  const [settings, setSettings] = useState<AppearanceSettings>(() => loadAppearance(userId));

  useEffect(() => {
    const loaded = loadAppearance(userId);
    setSettings(loaded);
    applyAppearance(loaded);
  }, [userId]);

  const update = useCallback(
    (patch: Partial<AppearanceSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveAppearance(userId, next);
        applyAppearance(next);
        return next;
      });
    },
    [userId]
  );

  const setTheme = useCallback((theme: ThemeMode) => update({ theme }), [update]);
  const setFontScale = useCallback((fontScale: number) => update({ fontScale }), [update]);
  const resetFontScale = useCallback(() => update({ fontScale: FONT_SCALE_DEFAULT }), [update]);

  return {
    theme: settings.theme,
    fontScale: settings.fontScale,
    setTheme,
    setFontScale,
    resetFontScale,
    fontScaleMin: FONT_SCALE_MIN,
    fontScaleMax: FONT_SCALE_MAX,
  };
}

/** Re-apply saved appearance when the active user changes (e.g. after sign-in). */
export function useUserAppearance(userId: string) {
  useEffect(() => {
    if (!userId) return;
    applyAppearance(loadAppearance(userId));
  }, [userId]);
}
