import { whenImageReady } from "./imageLoadReady";
import {
  DEFAULT_AUDIO_HEIGHT,
  DEFAULT_AUDIO_WIDTH,
  DEFAULT_FILE_HEIGHT,
  DEFAULT_FILE_WIDTH,
  parseWidthPx,
  placeholderSizeForImage,
  placeholderSizeForVideo,
} from "./mediaPlaceholder";

const SHELL_CLASS = "loadable-media-shell";
const SHIMMER_CLASS = "loadable-media-shimmer";
const PLACEHOLDER_CLASS = "loadable-media-placeholder";

const unbindByElement = new WeakMap<Element, () => void>();

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

/** Loaded inline media: shell wraps image at natural aspect ratio (no letterbox gap). */
function finalizeLoadedShell(shell: HTMLElement, media: HTMLImageElement | HTMLVideoElement) {
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

function wireImage(img: HTMLImageElement) {
  if (img.classList.contains("loadable-ready")) return;
  if (img.classList.contains("loadable-pending") && unbindByElement.has(img)) return;
  if (img.closest(`[data-uploading]`)) return;

  const { width, height } = placeholderSizeForImage(img);

  if (img.complete && img.naturalWidth > 0) {
    if (!inRichTextEditor(img) && img.classList.contains("task-inline-image")) {
      ensureShell(img, width, height);
    }
    markReady(img);
    return;
  }

  img.classList.add("loadable-pending");

  if (inRichTextEditor(img)) {
    applyInlinePlaceholder(img, width, height);
  } else if (img.classList.contains("task-inline-image") || img.closest(".simple-rich-text")) {
    ensureShell(img, width, height);
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";
  } else {
    applyInlinePlaceholder(img, width, height);
  }

  unbindByElement.get(img)?.();
  unbindByElement.set(img, whenImageReady(img, () => markReady(img)));
}

function wireVideo(video: HTMLVideoElement) {
  if (video.classList.contains("loadable-ready")) return;
  if (video.classList.contains("loadable-pending") && unbindByElement.has(video)) return;
  if (video.closest(`[data-uploading]`)) return;

  const { width, height } = placeholderSizeForVideo(video);

  if (video.readyState >= 1 && video.videoWidth > 0) {
    ensureShell(video, width, height);
    markReady(video);
    return;
  }

  video.classList.add("loadable-pending");
  ensureShell(video, width, height);
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.display = "block";
  video.style.objectFit = "contain";

  const onMeta = () => markReady(video);
  video.addEventListener("loadedmetadata", onMeta, { once: true });
  video.addEventListener("error", onMeta, { once: true });
  unbindByElement.get(video)?.();
  unbindByElement.set(video, () => {
    video.removeEventListener("loadedmetadata", onMeta);
    video.removeEventListener("error", onMeta);
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
    const shell = img.parentElement;
    if (shell?.classList.contains(SHELL_CLASS)) {
      shell.style.maxHeight = "none";
      if (img.classList.contains("loadable-ready") && img.naturalWidth > 0) {
        finalizeLoadedShell(shell, img);
      } else if (img.classList.contains("loadable-pending")) {
        const { width, height } = placeholderSizeForImage(img);
        ensureShell(img, width, height);
      }
    } else {
      img.style.height = "auto";
      img.style.minHeight = "";
    }
  });

  root.querySelectorAll<HTMLVideoElement>("video.task-inline-video").forEach((video) => {
    const shell = video.parentElement;
    if (shell?.classList.contains(SHELL_CLASS)) {
      shell.style.maxHeight = "none";
      if (video.classList.contains("loadable-ready") && video.videoWidth > 0) {
        finalizeLoadedShell(shell, video);
      } else if (video.classList.contains("loadable-pending")) {
        const { width, height } = placeholderSizeForVideo(video);
        ensureShell(video, width, height);
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
