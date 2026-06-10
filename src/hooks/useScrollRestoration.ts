import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "crm-scroll:";

function storageKey(section: string) {
  return STORAGE_PREFIX + section;
}

function saveScroll(section: string) {
  try {
    sessionStorage.setItem(storageKey(section), String(window.scrollY));
  } catch {
    /* private browsing / quota */
  }
}

function readScroll(section: string): number | null {
  try {
    const raw = sessionStorage.getItem(storageKey(section));
    if (!raw) return null;
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}

/**
 * Restores window scroll per main tab/section across refresh and tab switches.
 * Waits until `ready` (e.g. Firestore loaded) so list height is available.
 */
export function useScrollRestoration(section: string, ready: boolean) {
  const restoredFor = useRef<string | null>(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  useEffect(() => {
    let throttle = 0;
    const onScroll = () => {
      window.clearTimeout(throttle);
      throttle = window.setTimeout(() => saveScroll(sectionRef.current), 80);
    };
    const onPageHide = () => saveScroll(sectionRef.current);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearTimeout(throttle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      saveScroll(sectionRef.current);
    };
  }, [section]);

  useEffect(() => {
    const prev = restoredFor.current === section ? null : restoredFor.current;
    if (prev !== null && prev !== section) {
      saveScroll(prev);
    }
    restoredFor.current = null;
  }, [section]);

  useEffect(() => {
    if (!ready || restoredFor.current === section) return;

    const y = readScroll(section);
    restoredFor.current = section;

    if (y == null || y === 0) {
      window.scrollTo(0, 0);
      return;
    }

    let attempts = 0;
    const tryRestore = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (attempts < 40 && max < y - 8) {
        attempts += 1;
        requestAnimationFrame(tryRestore);
        return;
      }
      window.scrollTo(0, Math.min(y, max));
    };
    requestAnimationFrame(tryRestore);

    const late = window.setTimeout(() => {
      const lateY = readScroll(section);
      if (lateY == null || lateY === 0) return;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(lateY, max));
    }, 450);

    return () => window.clearTimeout(late);
  }, [section, ready]);
}
