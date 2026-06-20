export const DEFAULT_MEDIA_WIDTH = 192;
export const DEFAULT_MEDIA_HEIGHT = 128;
export const DEFAULT_VIDEO_WIDTH = 320;
export const DEFAULT_VIDEO_HEIGHT = 180;
export const DEFAULT_AUDIO_WIDTH = 192;
export const DEFAULT_AUDIO_HEIGHT = 44;
export const DEFAULT_FILE_WIDTH = 160;
export const DEFAULT_FILE_HEIGHT = 44;
export const MAX_INLINE_MEDIA_WIDTH = 800;
export const MIN_INLINE_MEDIA_WIDTH = 48;

const WIDTH_PX = /^(\d+(?:\.\d+)?)px$/i;
const STYLE_WIDTH = /(?:^|\s)width\s*:\s*([^;]+)/i;
const DEFAULT_ASPECT = DEFAULT_MEDIA_HEIGHT / DEFAULT_MEDIA_WIDTH;
const INLINE_WIDTH_PARENT_SELECTOR =
  ".task-inline-image-wrap, .loadable-media-shell, .task-inline-video-wrap";

export function readWidthRaw(el: HTMLElement): string {
  const inline = el.style.width?.trim();
  if (inline) return inline;
  const styleAttr = el.getAttribute("style") ?? "";
  const fromAttr = STYLE_WIDTH.exec(styleAttr)?.[1]?.trim();
  if (fromAttr) return fromAttr;
  return (el.getAttribute("width") ?? "").trim();
}

function parseWidthRaw(raw: string): number | null {
  const m = WIDTH_PX.exec(raw.trim());
  if (!m) return null;
  return Math.min(MAX_INLINE_MEDIA_WIDTH, Math.max(MIN_INLINE_MEDIA_WIDTH, Math.round(Number(m[1]))));
}

export function parseWidthPx(el: HTMLElement): number | null {
  const direct = parseWidthRaw(readWidthRaw(el));
  if (direct) return direct;
  const parent = el.closest<HTMLElement>(INLINE_WIDTH_PARENT_SELECTOR);
  if (parent && parent !== el) {
    return parseWidthRaw(readWidthRaw(parent));
  }
  return null;
}

/** Copy display width from wrapper → img/video so persisted HTML keeps user resize. */
export function syncPersistedInlineMediaWidths(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLImageElement | HTMLVideoElement>("img.task-inline-image, video.task-inline-video")
    .forEach((media) => {
      if (parseWidthRaw(readWidthRaw(media))) return;
      const parent = media.closest<HTMLElement>(INLINE_WIDTH_PARENT_SELECTOR);
      const w = parent ? parseWidthPx(parent) : null;
      if (!w) return;
      media.style.width = `${w}px`;
      media.style.height = "auto";
    });
}

function readIntrinsicDimensions(el: HTMLElement): { width: number; height: number } | null {
  const fromNatural =
    el instanceof HTMLImageElement
      ? { width: el.naturalWidth, height: el.naturalHeight }
      : el instanceof HTMLVideoElement
        ? { width: el.videoWidth, height: el.videoHeight }
        : null;
  if (fromNatural && fromNatural.width > 0 && fromNatural.height > 0) return fromNatural;

  const w = Number.parseInt(el.getAttribute("data-intrinsic-w") ?? "", 10);
  const h = Number.parseInt(el.getAttribute("data-intrinsic-h") ?? "", 10);
  if (w > 0 && h > 0) return { width: w, height: h };
  return null;
}

function displayAspect(el: HTMLImageElement | HTMLVideoElement): number {
  const intrinsic = readIntrinsicDimensions(el);
  if (intrinsic) return intrinsic.height / intrinsic.width;
  return el instanceof HTMLVideoElement
    ? DEFAULT_VIDEO_HEIGHT / DEFAULT_VIDEO_WIDTH
    : DEFAULT_ASPECT;
}

/** Max width an inline image can occupy inside its rich-text host. */
export function maxInlineDisplayWidth(el: HTMLElement): number {
  const root = el.closest(".simple-rich-text");
  const host = (root as HTMLElement | null) ?? el.parentElement;
  const raw = host?.clientWidth ?? 0;
  const inset = root ? 24 : 8;
  const available = raw > inset ? raw - inset : MAX_INLINE_MEDIA_WIDTH;
  return Math.max(MIN_INLINE_MEDIA_WIDTH, Math.min(MAX_INLINE_MEDIA_WIDTH, available));
}

export function storeIntrinsicDimensions(
  el: HTMLElement,
  width: number,
  height: number
): void {
  if (width <= 0 || height <= 0) return;
  if (el.getAttribute("data-intrinsic-w")) return;
  el.setAttribute("data-intrinsic-w", String(width));
  el.setAttribute("data-intrinsic-h", String(height));
}

/** Copy stored or natural pixel size onto another element (e.g. upload preview → final img). */
export function copyIntrinsicDimensions(from: HTMLElement, to: HTMLElement): boolean {
  const w = Number.parseInt(from.getAttribute("data-intrinsic-w") ?? "", 10);
  const h = Number.parseInt(from.getAttribute("data-intrinsic-h") ?? "", 10);
  if (w > 0 && h > 0) {
    storeIntrinsicDimensions(to, w, h);
    return true;
  }
  if (from instanceof HTMLImageElement && from.naturalWidth > 0 && from.naturalHeight > 0) {
    storeIntrinsicDimensions(to, from.naturalWidth, from.naturalHeight);
    return true;
  }
  if (from instanceof HTMLVideoElement && from.videoWidth > 0 && from.videoHeight > 0) {
    storeIntrinsicDimensions(to, from.videoWidth, from.videoHeight);
    return true;
  }
  return false;
}

export function inlineDisplaySizeForImage(img: HTMLImageElement): { width: number; height: number } {
  const specified = parseWidthPx(img);
  if (specified) {
    return {
      width: specified,
      height: Math.max(MIN_INLINE_MEDIA_WIDTH, Math.round(specified * displayAspect(img))),
    };
  }

  const maxW = maxInlineDisplayWidth(img);
  const intrinsic = readIntrinsicDimensions(img);
  if (intrinsic) {
    const width = Math.min(maxW, intrinsic.width);
    return {
      width,
      height: Math.max(MIN_INLINE_MEDIA_WIDTH, Math.round(width * (intrinsic.height / intrinsic.width))),
    };
  }

  return { width: DEFAULT_MEDIA_WIDTH, height: DEFAULT_MEDIA_HEIGHT };
}

export function inlineDisplaySizeForVideo(video: HTMLVideoElement): { width: number; height: number } {
  const specified = parseWidthPx(video);
  if (specified) {
    return {
      width: specified,
      height: Math.max(MIN_INLINE_MEDIA_WIDTH, Math.round(specified * displayAspect(video))),
    };
  }

  const maxW = maxInlineDisplayWidth(video);
  const intrinsic = readIntrinsicDimensions(video);
  if (intrinsic) {
    const width = Math.min(maxW, intrinsic.width);
    return {
      width,
      height: Math.max(MIN_INLINE_MEDIA_WIDTH, Math.round(width * (intrinsic.height / intrinsic.width))),
    };
  }

  return { width: DEFAULT_VIDEO_WIDTH, height: DEFAULT_VIDEO_HEIGHT };
}

export function placeholderSizeForImage(el: HTMLImageElement): { width: number; height: number } {
  return inlineDisplaySizeForImage(el);
}

export function placeholderSizeForVideo(el: HTMLElement): { width: number; height: number } {
  if (el instanceof HTMLVideoElement) return inlineDisplaySizeForVideo(el);
  const width = parseWidthPx(el) ?? DEFAULT_VIDEO_WIDTH;
  const height = Math.round(width * (DEFAULT_VIDEO_HEIGHT / DEFAULT_VIDEO_WIDTH));
  return { width, height };
}
