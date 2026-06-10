import { whenImageReady } from "./imageLoadReady";
import {
  DEFAULT_AUDIO_HEIGHT,
  DEFAULT_AUDIO_WIDTH,
  DEFAULT_FILE_HEIGHT,
  DEFAULT_FILE_WIDTH,
  parseWidthPx,
  placeholderSizeForImage,
  placeholderSizeForVideo,
  storeIntrinsicDimensions,
} from "./mediaPlaceholder";

const SHELL_CLASS = "loadable-media-shell";
const SHIMMER_CLASS = "loadable-media-shimmer";
const PLACEHOLDER_CLASS = "loadable-media-placeholder";
const INLINE_IMAGE_WRAP_CLASS = "task-inline-image-wrap";
const INLINE_VIDEO_WRAP_CLASS = "task-inline-video-wrap";

const unbindByElement = new WeakMap<Element, () => void>();

function isInlineRichTextImage(img: HTMLImageElement): boolean {
  return img.classList.contains("task-inline-image") || Boolean(img.closest(".simple-rich-text"));
}

function isInlineRichTextVideo(video: HTMLVideoElement): boolean {
  return video.classList.contains("task-inline-video") || Boolean(video.closest(".simple-rich-text"));
}

/** One wrapper for inline videos — same pattern as images (shell + wrap, no orphan shimmers). */
function getInlineVideoContainer(video: HTMLVideoElement): HTMLElement {
  let wrap = video.closest<HTMLElement>(`.${INLINE_VIDEO_WRAP_CLASS}`);
  if (wrap) {
    wrap.classList.add(SHELL_CLASS);
    return wrap;
  }

  const parent = video.parentElement;
  if (parent?.classList.contains(SHELL_CLASS)) {
    parent.classList.add(INLINE_VIDEO_WRAP_CLASS);
    return parent;
  }

  const container = document.createElement("span");
  container.className = `${INLINE_VIDEO_WRAP_CLASS} ${SHELL_CLASS} relative inline-block max-w-full align-top overflow-hidden my-2 rounded-lg bg-slate-100`;
  container.contentEditable = "false";
  video.parentNode?.insertBefore(container, video);
  container.appendChild(video);
  return container;
}

/** One wrapper for inline images — avoids shell + wrap fighting and orphan shimmers. */
function getInlineImageContainer(img: HTMLImageElement): HTMLElement {
  let wrap = img.closest<HTMLElement>(`.${INLINE_IMAGE_WRAP_CLASS}`);
  if (wrap) {
    wrap.classList.add(SHELL_CLASS);
    return wrap;
  }

  const parent = img.parentElement;
  if (parent?.classList.contains(SHELL_CLASS)) {
    parent.classList.add(INLINE_IMAGE_WRAP_CLASS);
    return parent;
  }

  const container = document.createElement("span");
  container.className = `${INLINE_IMAGE_WRAP_CLASS} ${SHELL_CLASS} relative inline-block max-w-full align-top overflow-hidden my-2 bg-slate-100`;
  container.contentEditable = "false";
  img.parentNode?.insertBefore(container, img);
  container.appendChild(img);
  return container;
}

function setPendingContainer(container: HTMLElement, width: number, height: number) {
  container.style.boxSizing = "border-box";
  container.style.maxWidth = "100%";
  container.style.width = `${width}px`;
  container.style.minWidth = "0";
  container.style.height = `${height}px`;
  container.style.minHeight = `${height}px`;
  container.style.overflow = "hidden";
  container.style.aspectRatio = `${width} / ${height}`;
  if (!container.querySelector(`.${SHIMMER_CLASS}`)) {
    container.insertBefore(createShimmer(), container.firstChild);
  }
}

/** Keep placeholder in sync as intrinsic dimensions arrive (before load completes). */
function bindPendingMediaSizeSync(
  media: HTMLImageElement | HTMLVideoElement,
  container: HTMLElement | null,
  measure: () => { width: number; height: number }
): () => void {
  let lastKey = "";
  const sync = () => {
    if (!media.classList.contains("loadable-pending")) return;
    const { width, height } = measure();
    const key = `${width}x${height}`;
    if (key === lastKey) return;
    lastKey = key;
    if (container) {
      setPendingContainer(container, width, height);
    } else if (media instanceof HTMLImageElement) {
      applyInlinePlaceholder(media, width, height);
    }
  };

  sync();
  if (media instanceof HTMLImageElement) {
    media.addEventListener("load", sync);
  } else {
    media.addEventListener("loadedmetadata", sync);
  }
  const timers = [0, 16, 32, 64, 128, 256, 512, 1000, 2000].map((ms) => window.setTimeout(sync, ms));
  const root = media.closest(".simple-rich-text");
  const resizeObserver =
    root && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => sync())
      : null;
  resizeObserver?.observe(root as Element);

  return () => {
    if (media instanceof HTMLImageElement) {
      media.removeEventListener("load", sync);
    } else {
      media.removeEventListener("loadedmetadata", sync);
    }
    for (const id of timers) window.clearTimeout(id);
    resizeObserver?.disconnect();
  };
}

function bindPendingSizeSync(img: HTMLImageElement, container: HTMLElement | null): () => void {
  return bindPendingMediaSizeSync(img, container, () => placeholderSizeForImage(img));
}

/** Read natural pixel size from the URL (cache-friendly) when HTML has no stored dimensions. */
function probeImageIntrinsicSize(img: HTMLImageElement, onUpdate: () => void): () => void {
  if (img.getAttribute("data-intrinsic-w") && img.getAttribute("data-intrinsic-h")) {
    return () => undefined;
  }
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    storeIntrinsicDimensions(img, img.naturalWidth, img.naturalHeight);
    return () => undefined;
  }

  const src = img.currentSrc || img.getAttribute("src") || "";
  if (!src) return () => undefined;

  const probe = new Image();
  const apply = () => {
    if (probe.naturalWidth <= 0 || probe.naturalHeight <= 0) return;
    storeIntrinsicDimensions(img, probe.naturalWidth, probe.naturalHeight);
    onUpdate();
  };

  probe.addEventListener("load", apply, { once: true });
  probe.addEventListener("error", () => undefined, { once: true });
  probe.src = src;
  if (probe.complete) apply();

  return () => {
    probe.src = "";
  };
}

/** Read video pixel size from the URL (cache-friendly) when HTML has no stored dimensions. */
function probeVideoIntrinsicSize(video: HTMLVideoElement, onUpdate: () => void): () => void {
  if (video.getAttribute("data-intrinsic-w") && video.getAttribute("data-intrinsic-h")) {
    return () => undefined;
  }
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    storeIntrinsicDimensions(video, video.videoWidth, video.videoHeight);
    return () => undefined;
  }

  const src = video.currentSrc || video.getAttribute("src") || "";
  if (!src) return () => undefined;

  const probe = document.createElement("video");
  const apply = () => {
    if (probe.videoWidth <= 0 || probe.videoHeight <= 0) return;
    storeIntrinsicDimensions(video, probe.videoWidth, probe.videoHeight);
    onUpdate();
  };

  probe.addEventListener("loadedmetadata", apply, { once: true });
  probe.addEventListener("error", () => undefined, { once: true });
  probe.preload = "metadata";
  probe.src = src;
  if (probe.readyState >= 1) apply();

  return () => {
    probe.src = "";
  };
}

function finalizeInlineMediaContainer(container: HTMLElement, media: HTMLImageElement | HTMLVideoElement) {
  removeShimmer(container);
  const specified = parseWidthPx(media);
  container.style.boxSizing = "border-box";
  container.style.display = "inline-block";
  container.style.maxWidth = "100%";
  container.style.overflow = "hidden";
  container.style.aspectRatio = "";
  container.style.background = "transparent";
  container.style.minWidth = "0";
  container.style.minHeight = "";

  if (specified) {
    container.style.width = `${specified}px`;
    container.style.height = "auto";
    media.style.display = "block";
    media.style.maxWidth = "100%";
    media.style.width = `${specified}px`;
    media.style.height = "auto";
    media.style.objectFit = "";
    return;
  }

  if (media instanceof HTMLImageElement && media.naturalWidth > 0 && media.naturalHeight > 0) {
    storeIntrinsicDimensions(media, media.naturalWidth, media.naturalHeight);
  } else if (media instanceof HTMLVideoElement && media.videoWidth > 0 && media.videoHeight > 0) {
    storeIntrinsicDimensions(media, media.videoWidth, media.videoHeight);
  }

  container.style.width = "";
  container.style.height = "";
  media.style.display = "block";
  media.style.maxWidth = "100%";
  media.style.width = "";
  media.style.height = "auto";
  media.style.objectFit = "";
}

function createShimmer(): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = `${SHIMMER_CLASS} pointer-events-none absolute inset-0 bg-shimmer animate-shimmer`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function inRichTextEditor(el: HTMLElement): boolean {
  return Boolean(el.closest('.simple-rich-text[contenteditable="true"]'));
}

function ensureShell(
  media: HTMLElement,
  width: number,
  height: number,
  rounded = true
): HTMLElement {
  let shell = media.parentElement;
  if (!shell?.classList.contains(SHELL_CLASS)) {
    shell = document.createElement("span");
    shell.className = `${SHELL_CLASS} relative inline-block max-w-full align-top overflow-hidden border border-slate-200 ${
      rounded ? "rounded-lg" : ""
    }`;
    media.parentNode?.insertBefore(shell, media);
    shell.appendChild(createShimmer());
    shell.appendChild(media);
  }
  shell.style.boxSizing = "border-box";
  shell.style.maxWidth = "100%";
  shell.style.width = `${width}px`;
  shell.style.minWidth = "0";
  shell.style.height = `${height}px`;
  shell.style.minHeight = `${height}px`;
  return shell;
}

function removeShimmer(shell: HTMLElement | null) {
  shell?.querySelector(`.${SHIMMER_CLASS}`)?.remove();
}

function applyInlinePlaceholder(el: HTMLElement, width: number, height: number) {
  el.style.display = "block";
  el.style.maxWidth = "100%";
  if (parseWidthPx(el)) {
    el.style.width = `${parseWidthPx(el)}px`;
  } else {
    el.style.width = `${width}px`;
  }
  el.style.height = `${height}px`;
  el.style.minHeight = `${height}px`;
  el.style.objectFit = "contain";
}

function clearInlinePlaceholder(el: HTMLElement) {
  if (!parseWidthPx(el)) el.style.width = "";
  el.style.height = "auto";
  el.style.minHeight = "";
}

/** Loaded inline media: container shrink-wraps to the image (no letterbox / shimmer gap). */
function finalizeLoadedShell(shell: HTMLElement, media: HTMLImageElement | HTMLVideoElement) {
  if (
    (media instanceof HTMLImageElement && isInlineRichTextImage(media)) ||
    (media instanceof HTMLVideoElement && isInlineRichTextVideo(media))
  ) {
    finalizeInlineMediaContainer(shell, media);
    return;
  }
  removeShimmer(shell);
  const specified = parseWidthPx(media);
  shell.style.boxSizing = "border-box";
  shell.style.display = "block";
  shell.style.maxWidth = "100%";
  shell.style.overflow = "visible";
  shell.style.width = specified ? `${specified}px` : "auto";
  shell.style.minWidth = "0";
  shell.style.height = "auto";
  shell.style.minHeight = "";

  media.style.display = "block";
  media.style.maxWidth = "100%";
  media.style.width = specified ? `${specified}px` : "100%";
  media.style.height = "auto";
  media.style.minHeight = "";
  media.style.objectFit = "";
}

function markReady(el: HTMLElement) {
  el.classList.remove("loadable-pending");
  el.classList.add("loadable-ready");

  const shell = el.parentElement;
  if (shell?.classList.contains(SHELL_CLASS)) {
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
      finalizeLoadedShell(shell, el);
    } else {
      removeShimmer(shell);
    }
  } else if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
    clearInlinePlaceholder(el);
  }

  if (el.classList.contains(PLACEHOLDER_CLASS)) {
    el.classList.remove(PLACEHOLDER_CLASS);
    el.querySelector(`.${SHIMMER_CLASS}`)?.remove();
  }

  unbindByElement.get(el)?.();
  unbindByElement.delete(el);
}

function cleanupInlineMediaContainers(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(`.${SHELL_CLASS}`).forEach((shell) => {
    const media = shell.querySelector<HTMLImageElement | HTMLVideoElement>(
      "img.task-inline-image, video.task-inline-video"
    );
    if (!media) {
      shell.remove();
      return;
    }
    if (media.classList.contains("loadable-ready")) {
      if (media instanceof HTMLImageElement || media instanceof HTMLVideoElement) {
        finalizeInlineMediaContainer(shell, media);
      } else {
        finalizeLoadedShell(shell, media);
      }
    }
  });
}

function wireImage(img: HTMLImageElement) {
  if (img.classList.contains("loadable-ready")) return;
  if (img.classList.contains("loadable-pending") && unbindByElement.has(img)) return;
  if (img.closest(`[data-uploading]`)) return;

  const { width, height } = placeholderSizeForImage(img);
  const inlineRich = isInlineRichTextImage(img);

  if (img.complete && img.naturalWidth > 0) {
    if (inlineRich && !inRichTextEditor(img)) {
      finalizeInlineMediaContainer(getInlineImageContainer(img), img);
    }
    markReady(img);
    return;
  }

  img.classList.add("loadable-pending");

  let pendingContainer: HTMLElement | null = null;
  if (inRichTextEditor(img)) {
    applyInlinePlaceholder(img, width, height);
  } else if (inlineRich) {
    pendingContainer = getInlineImageContainer(img);
    setPendingContainer(pendingContainer, width, height);
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";
  } else {
    pendingContainer = ensureShell(img, width, height);
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";
  }

  unbindByElement.get(img)?.();
  const unbindReady = whenImageReady(img, () => markReady(img));
  const unbindSize = bindPendingSizeSync(img, inRichTextEditor(img) ? null : pendingContainer);
  const unbindProbe =
    !parseWidthPx(img) && isInlineRichTextImage(img)
      ? probeImageIntrinsicSize(img, () => {
          if (!img.classList.contains("loadable-pending")) return;
          const { width, height } = placeholderSizeForImage(img);
          if (pendingContainer) {
            setPendingContainer(pendingContainer, width, height);
          } else {
            applyInlinePlaceholder(img, width, height);
          }
        })
      : () => undefined;
  unbindByElement.set(img, () => {
    unbindReady();
    unbindSize();
    unbindProbe();
  });
}

function wireVideo(video: HTMLVideoElement) {
  if (video.classList.contains("loadable-ready")) return;
  if (video.classList.contains("loadable-pending") && unbindByElement.has(video)) return;
  if (video.closest(`[data-uploading]`)) return;

  const { width, height } = placeholderSizeForVideo(video);
  const inlineRich = isInlineRichTextVideo(video);

  if (video.readyState >= 1 && video.videoWidth > 0) {
    if (inlineRich && !inRichTextEditor(video)) {
      finalizeInlineMediaContainer(getInlineVideoContainer(video), video);
    }
    markReady(video);
    return;
  }

  video.classList.add("loadable-pending");

  let pendingContainer: HTMLElement | null = null;
  if (inlineRich && !inRichTextEditor(video)) {
    pendingContainer = getInlineVideoContainer(video);
    setPendingContainer(pendingContainer, width, height);
  } else {
    pendingContainer = ensureShell(video, width, height);
  }
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.display = "block";
  video.style.objectFit = "contain";

  const onMeta = () => markReady(video);
  video.addEventListener("loadedmetadata", onMeta, { once: true });
  video.addEventListener("error", onMeta, { once: true });

  unbindByElement.get(video)?.();
  const unbindSize = bindPendingMediaSizeSync(video, pendingContainer, () => placeholderSizeForVideo(video));
  const unbindProbe =
    !parseWidthPx(video) && inlineRich
      ? probeVideoIntrinsicSize(video, () => {
          if (!video.classList.contains("loadable-pending")) return;
          const size = placeholderSizeForVideo(video);
          if (pendingContainer) {
            setPendingContainer(pendingContainer, size.width, size.height);
          }
        })
      : () => undefined;

  unbindByElement.set(video, () => {
    video.removeEventListener("loadedmetadata", onMeta);
    video.removeEventListener("error", onMeta);
    unbindSize();
    unbindProbe();
  });
}

function wireAudio(audio: HTMLAudioElement) {
  if (audio.classList.contains("loadable-ready")) return;
  if (audio.closest(`[data-uploading]`)) return;

  const wrap = audio.parentElement;
  if (wrap?.querySelector(".task-inline-audio-ui")) {
    wrap.querySelector(`.${PLACEHOLDER_CLASS}`)?.remove();
    markReady(audio);
    return;
  }

  audio.classList.add("loadable-pending");

  let placeholder = wrap?.querySelector<HTMLElement>(`.${PLACEHOLDER_CLASS}`);
  if (!placeholder) {
    placeholder = document.createElement("span");
    placeholder.className = `${PLACEHOLDER_CLASS} task-inline-audio-placeholder relative inline-flex overflow-hidden rounded-xl border border-slate-200`;
    placeholder.style.width = `${DEFAULT_AUDIO_WIDTH}px`;
    placeholder.style.minWidth = `${DEFAULT_AUDIO_WIDTH}px`;
    placeholder.style.height = `${DEFAULT_AUDIO_HEIGHT}px`;
    placeholder.style.minHeight = `${DEFAULT_AUDIO_HEIGHT}px`;
    placeholder.appendChild(createShimmer());
    audio.parentNode?.insertBefore(placeholder, audio);
  }

  const onReady = () => {
    placeholder?.remove();
    markReady(audio);
  };

  audio.addEventListener("loadedmetadata", onReady, { once: true });
  audio.addEventListener("error", onReady, { once: true });
  const fallback = window.setTimeout(onReady, 1500);
  unbindByElement.get(audio)?.();
  unbindByElement.set(audio, () => {
    audio.removeEventListener("loadedmetadata", onReady);
    audio.removeEventListener("error", onReady);
    window.clearTimeout(fallback);
  });
}

function wireFile(link: HTMLAnchorElement) {
  if (link.classList.contains("loadable-ready")) return;
  if (!link.classList.contains("task-inline-file")) return;
  if (link.closest(`[data-uploading]`)) return;

  const wrap = link.parentElement;
  if (wrap?.querySelector(".task-inline-file-ui")) {
    wrap.querySelector(`.${PLACEHOLDER_CLASS}`)?.remove();
    markReady(link);
    return;
  }

  link.classList.add("loadable-pending");

  let placeholder = wrap?.querySelector<HTMLElement>(`.${PLACEHOLDER_CLASS}`);
  if (!placeholder) {
    placeholder = document.createElement("span");
    placeholder.className = `${PLACEHOLDER_CLASS} task-inline-file-placeholder relative inline-flex overflow-hidden rounded-lg border border-slate-200`;
    placeholder.style.width = `${DEFAULT_FILE_WIDTH}px`;
    placeholder.style.minWidth = `${DEFAULT_FILE_WIDTH}px`;
    placeholder.style.height = `${DEFAULT_FILE_HEIGHT}px`;
    placeholder.style.minHeight = `${DEFAULT_FILE_HEIGHT}px`;
    placeholder.appendChild(createShimmer());
    link.parentNode?.insertBefore(placeholder, link);
  }

  const onReady = () => {
    placeholder?.remove();
    markReady(link);
  };

  const fallback = window.setTimeout(onReady, 600);
  unbindByElement.get(link)?.();
  unbindByElement.set(link, () => window.clearTimeout(fallback));
}

function releaseElements(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("img, video, audio, a.task-inline-file").forEach((el) => {
    unbindByElement.get(el)?.();
    unbindByElement.delete(el);
  });
}

function scan(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>("img").forEach(wireImage);
  root.querySelectorAll<HTMLVideoElement>("video.task-inline-video").forEach(wireVideo);
  root.querySelectorAll<HTMLAudioElement>("audio.task-inline-audio").forEach(wireAudio);
  root.querySelectorAll<HTMLAnchorElement>("a.task-inline-file").forEach(wireFile);
  cleanupInlineMediaContainers(root);

  root.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`).forEach((ph) => {
    const wrap = ph.parentElement;
    if (wrap?.querySelector(".task-inline-audio-ui, .task-inline-file-ui")) {
      ph.remove();
    }
  });
}

/** Recompute inline media sizing after “Show more” expands rich text. */
export function refreshRichTextMediaLayout(root: HTMLElement | null) {
  if (!root) return;

  root.querySelectorAll<HTMLImageElement>("img.task-inline-image").forEach((img) => {
    img.style.maxHeight = "";
    const container = img.closest<HTMLElement>(`.${INLINE_IMAGE_WRAP_CLASS}, .${SHELL_CLASS}`);
    if (container) {
      container.style.maxHeight = "none";
      if (img.classList.contains("loadable-ready") && img.naturalWidth > 0) {
        finalizeInlineMediaContainer(container, img);
      } else if (img.classList.contains("loadable-pending")) {
        const { width, height } = placeholderSizeForImage(img);
        setPendingContainer(container, width, height);
      }
    } else {
      img.style.height = "auto";
      img.style.minHeight = "";
    }
  });

  root.querySelectorAll<HTMLVideoElement>("video.task-inline-video").forEach((video) => {
    video.style.maxHeight = "";
    const container = video.closest<HTMLElement>(`.${INLINE_VIDEO_WRAP_CLASS}, .${SHELL_CLASS}`);
    if (container) {
      container.style.maxHeight = "none";
      if (video.classList.contains("loadable-ready") && video.videoWidth > 0) {
        finalizeInlineMediaContainer(container, video);
      } else if (video.classList.contains("loadable-pending")) {
        const { width, height } = placeholderSizeForVideo(video);
        setPendingContainer(container, width, height);
      }
    }
  });
}

/** Shimmer placeholders with reserved space for images, video, audio, and files in rich text. */
export function bindLoadableImages(root: HTMLElement | null): () => void {
  if (!root) return () => undefined;

  const el = root;
  scan(el);

  const observer = new MutationObserver(() => scan(el));
  observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href"] });

  const timers = [100, 300, 800, 1500].map((ms) => window.setTimeout(() => scan(el), ms));

  return () => {
    observer.disconnect();
    for (const id of timers) window.clearTimeout(id);
    releaseElements(el);
  };
}
