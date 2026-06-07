export const DEFAULT_MEDIA_WIDTH = 192;
export const DEFAULT_MEDIA_HEIGHT = 128;
export const DEFAULT_VIDEO_WIDTH = 320;
export const DEFAULT_VIDEO_HEIGHT = 180;
export const DEFAULT_AUDIO_WIDTH = 192;
export const DEFAULT_AUDIO_HEIGHT = 44;
export const DEFAULT_FILE_WIDTH = 160;
export const DEFAULT_FILE_HEIGHT = 44;

const WIDTH_PX = /^(\d+(?:\.\d+)?)px$/i;

export function parseWidthPx(el: HTMLElement): number | null {
  const raw = (el.style.width || el.getAttribute("width") || "").trim();
  const m = WIDTH_PX.exec(raw);
  if (!m) return null;
  return Math.min(800, Math.max(48, Math.round(Number(m[1]))));
}

export function placeholderSizeForImage(el: HTMLElement): { width: number; height: number } {
  const width = parseWidthPx(el) ?? DEFAULT_MEDIA_WIDTH;
  const height = Math.round(width * (DEFAULT_MEDIA_HEIGHT / DEFAULT_MEDIA_WIDTH));
  return { width, height };
}

export function placeholderSizeForVideo(el: HTMLElement): { width: number; height: number } {
  const width = parseWidthPx(el) ?? DEFAULT_VIDEO_WIDTH;
  const height = Math.round(width * (DEFAULT_VIDEO_HEIGHT / DEFAULT_VIDEO_WIDTH));
  return { width, height };
}
