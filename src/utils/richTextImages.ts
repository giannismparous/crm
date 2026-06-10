import type { ImageAttachment } from "../types";
import type { LightboxImage } from "../components/ImageLightbox";
import { isOrgStoragePath, mediaFileFingerprint } from "./imageAttachments";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "./sanitizeRichText";

import {
  copyIntrinsicDimensions,
  inlineDisplaySizeForImage,
  inlineDisplaySizeForVideo,
  storeIntrinsicDimensions,
} from "./mediaPlaceholder";

const IMG_SELECTOR = "img.task-inline-image";
const IMG_PREVIEW_SELECTOR = "img.task-inline-image-preview";
const LIGHTBOX_IMG_SELECTOR = `${IMG_SELECTOR}, ${IMG_PREVIEW_SELECTOR}`;
const VIDEO_SELECTOR = "video.task-inline-video";
const AUDIO_SELECTOR = "audio.task-inline-audio";
const FILE_SELECTOR = "a.task-inline-file";
const WRAP_CLASS = "task-inline-image-wrap";
const VIDEO_WRAP_CLASS = "task-inline-video-wrap";
const AUDIO_WRAP_CLASS = "task-inline-audio-wrap";
const FILE_WRAP_CLASS = "task-inline-file-wrap";
const DELETE_BTN_ATTR = "data-inline-img-delete";
const RESIZE_HANDLE_ATTR = "data-inline-img-resize";
const RICH_TEXT_EDITABLE_ATTR = "data-rich-text-editable";

/** True only on live editors (contenteditable), not read-only views. */
export function isRichTextEditable(root: HTMLElement): boolean {
  const host = root.closest<HTMLElement>(`[${RICH_TEXT_EDITABLE_ATTR}]`) ?? root;
  return host.getAttribute(RICH_TEXT_EDITABLE_ATTR) === "true";
}

function stripEditControls(wrap: HTMLElement) {
  wrap.querySelectorAll(`[${DELETE_BTN_ATTR}]`).forEach((el) => el.remove());
  wrap.querySelectorAll(`[${RESIZE_HANDLE_ATTR}]`).forEach((el) => el.remove());
  wrap.draggable = false;
}
const AUDIO_PLAY_ATTR = "data-audio-play";
const VIDEO_PLAY_ATTR = "data-video-play";
const VIDEO_SEEK_ATTR = "data-video-seek";
const VIDEO_TIME_ATTR = "data-video-time";
const VIDEO_SPEED_BTN_ATTR = "data-video-speed";
const VIDEO_SPEED_MENU_ATTR = "data-video-speed-menu";
const VIDEO_SPEED_OPTION_ATTR = "data-video-speed-option";
const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const MOVE_KIND = "application/x-task-inline-image";
const UPLOADING_ATTR = "data-uploading";
const UPLOAD_ID_ATTR = "data-upload-id";
const FILE_FP_ATTR = "data-file-fp";
const RESIZE_CORNERS = ["nw", "ne", "sw", "se"] as const;
const MIN_IMG_WIDTH = 48;
const MAX_IMG_WIDTH = 800;
const MIN_VIDEO_WIDTH = 160;
const MAX_VIDEO_WIDTH = 720;

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function configureInlineVideoPlayer(video: HTMLVideoElement) {
  video.controls = false;
  video.preload = "metadata";
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.setAttribute("disablePictureInPicture", "");
  if (!PLAYBACK_SPEEDS.includes(video.playbackRate as (typeof PLAYBACK_SPEEDS)[number])) {
    video.playbackRate = 1;
  }
}

function syncVideoPlayButton(btn: HTMLButtonElement, video: HTMLVideoElement) {
  const playing = !video.paused && !video.ended;
  const prev = btn.getAttribute("data-playing") === "1";
  if (prev === playing) return;
  btn.setAttribute("data-playing", playing ? "1" : "0");
  btn.setAttribute("aria-label", playing ? "Pause video" : "Play video");
  btn.innerHTML = playing
    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
}

function syncVideoControlUi(video: HTMLVideoElement) {
  const wrap = video.closest<HTMLElement>(`.${VIDEO_WRAP_CLASS}`);
  if (!wrap) return;
  const seek = wrap.querySelector<HTMLInputElement>(`[${VIDEO_SEEK_ATTR}]`);
  const time = wrap.querySelector<HTMLElement>(`[${VIDEO_TIME_ATTR}]`);
  const playBtn = wrap.querySelector<HTMLButtonElement>(`[${VIDEO_PLAY_ATTR}]`);
  const speedBtn = wrap.querySelector<HTMLButtonElement>(`[${VIDEO_SPEED_BTN_ATTR}]`);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  if (seek) {
    const max = String(Math.max(duration, 0));
    const val = String(current);
    if (seek.max !== max) seek.max = max;
    if (seek.value !== val) seek.value = val;
  }
  if (time) {
    const next = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
    if (time.textContent !== next) time.textContent = next;
  }
  if (playBtn) syncVideoPlayButton(playBtn, video);
  if (speedBtn) {
    const rate = video.playbackRate || 1;
    const label = `${rate}×`;
    if (speedBtn.textContent !== label) speedBtn.textContent = label;
    const aria = `Playback speed ${rate}×`;
    if (speedBtn.getAttribute("aria-label") !== aria) speedBtn.setAttribute("aria-label", aria);
  }
}

function buildVideoControlBar(wrap: HTMLElement, video: HTMLVideoElement) {
  if (wrap.querySelector(".task-inline-video-controls")) return;

  const bar = document.createElement("div");
  bar.className = "task-inline-video-controls";
  bar.contentEditable = "false";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "task-inline-video-play";
  playBtn.setAttribute(VIDEO_PLAY_ATTR, "1");
  syncVideoPlayButton(playBtn, video);

  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "task-inline-video-seek";
  seek.setAttribute(VIDEO_SEEK_ATTR, "1");
  seek.min = "0";
  seek.max = "0";
  seek.value = "0";
  seek.setAttribute("aria-label", "Seek");

  const time = document.createElement("span");
  time.className = "task-inline-video-time";
  time.setAttribute(VIDEO_TIME_ATTR, "1");
  time.textContent = "0:00 / 0:00";

  const speedWrap = document.createElement("div");
  speedWrap.className = "task-inline-video-speed";

  const speedBtn = document.createElement("button");
  speedBtn.type = "button";
  speedBtn.className = "task-inline-video-speed-btn";
  speedBtn.setAttribute(VIDEO_SPEED_BTN_ATTR, "1");
  speedBtn.textContent = "1×";
  speedBtn.setAttribute("aria-label", "Playback speed 1×");
  speedBtn.setAttribute("aria-haspopup", "true");
  speedBtn.setAttribute("aria-expanded", "false");

  const speedMenu = document.createElement("div");
  speedMenu.className = "task-inline-video-speed-menu";
  speedMenu.setAttribute(VIDEO_SPEED_MENU_ATTR, "1");
  speedMenu.setAttribute("role", "menu");
  for (const rate of PLAYBACK_SPEEDS) {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "task-inline-video-speed-option";
    opt.setAttribute(VIDEO_SPEED_OPTION_ATTR, String(rate));
    opt.setAttribute("role", "menuitem");
    opt.textContent = `${rate}×`;
    speedMenu.appendChild(opt);
  }

  speedWrap.appendChild(speedBtn);
  speedWrap.appendChild(speedMenu);
  bar.appendChild(playBtn);
  bar.appendChild(seek);
  bar.appendChild(time);
  bar.appendChild(speedWrap);
  wrap.appendChild(bar);
  syncVideoControlUi(video);
}

const INLINE_MEDIA_SELECTOR = `${IMG_SELECTOR}, ${VIDEO_SELECTOR}, ${AUDIO_SELECTOR}, ${FILE_SELECTOR}`;
const INLINE_WRAP_SELECTOR = `.${WRAP_CLASS}, .${VIDEO_WRAP_CLASS}, .${AUDIO_WRAP_CLASS}, .${FILE_WRAP_CLASS}`;

type MediaWatchState = {
  observer: MutationObserver;
  refCount: number;
  afterRefresh: (() => void)[];
};

const ensuringRoots = new WeakSet<HTMLElement>();
const pendingMediaRefresh = new WeakMap<HTMLElement, number>();
const mediaWatchState = new WeakMap<HTMLElement, MediaWatchState>();

function pruneEmptyMediaWraps(root: HTMLElement) {
  for (const wrap of root.querySelectorAll<HTMLElement>(INLINE_WRAP_SELECTOR)) {
    if (wrap.hasAttribute(UPLOADING_ATTR)) continue;
    const hasMedia = wrap.querySelector(INLINE_MEDIA_SELECTOR);
    if (!hasMedia) wrap.remove();
  }
}

function stripReadOnlyMediaControls(root: HTMLElement) {
  if (isRichTextEditable(root)) return;
  root.querySelectorAll<HTMLElement>(INLINE_WRAP_SELECTOR).forEach((wrap) => stripEditControls(wrap));
  root.querySelectorAll<HTMLElement>(`[${UPLOADING_ATTR}]`).forEach((wrap) => stripEditControls(wrap));
}

function runMediaControlRefresh(root: HTMLElement, afterRefresh: (() => void)[] = []) {
  if (ensuringRoots.has(root)) return;
  ensuringRoots.add(root);
  try {
    ensureInlineImageControls(root);
    ensureInlineVideoControls(root);
    ensureInlineAudioControls(root);
    ensureInlineFileControls(root);
    stripReadOnlyMediaControls(root);
    pruneEmptyMediaWraps(root);
    for (const fn of afterRefresh) fn();
  } finally {
    ensuringRoots.delete(root);
  }
}

function scheduleMediaControlRefresh(root: HTMLElement) {
  if (pendingMediaRefresh.has(root)) return;
  const handle = requestAnimationFrame(() => {
    pendingMediaRefresh.delete(root);
    const state = mediaWatchState.get(root);
    runMediaControlRefresh(root, state?.afterRefresh ?? []);
  });
  pendingMediaRefresh.set(root, handle);
}

function acquireMediaWatch(root: HTMLElement, afterRefresh?: () => void): () => void {
  let state = mediaWatchState.get(root);
  if (!state) {
    const afterRefreshList: (() => void)[] = [];
    const observer = new MutationObserver(() => scheduleMediaControlRefresh(root));
    observer.observe(root, { childList: true, subtree: true });
    state = { observer, refCount: 0, afterRefresh: afterRefreshList };
    mediaWatchState.set(root, state);
    runMediaControlRefresh(root, afterRefreshList);
  }
  state.refCount += 1;
  if (afterRefresh && !state.afterRefresh.includes(afterRefresh)) {
    state.afterRefresh.push(afterRefresh);
    afterRefresh();
  }
  const releaseAfter = afterRefresh;
  return () => {
    const current = mediaWatchState.get(root);
    if (!current) return;
    current.refCount -= 1;
    if (releaseAfter) {
      const idx = current.afterRefresh.indexOf(releaseAfter);
      if (idx >= 0) current.afterRefresh.splice(idx, 1);
    }
    if (current.refCount <= 0) {
      current.observer.disconnect();
      mediaWatchState.delete(root);
      const pending = pendingMediaRefresh.get(root);
      if (pending !== undefined) cancelAnimationFrame(pending);
      pendingMediaRefresh.delete(root);
    }
  };
}

function inlineMediaElements(doc: ParentNode): Element[] {
  return [...doc.querySelectorAll(INLINE_MEDIA_SELECTOR)];
}

export function removeInlineImageFromUpdates(html: string, storagePath: string): string {
  const path = storagePath.trim();
  if (!path || !html.trim() || typeof DOMParser === "undefined") return sanitizeTaskUpdates(html);

  const doc = new DOMParser().parseFromString(html, "text/html");
  inlineMediaElements(doc).forEach((el) => {
    if (el.getAttribute("data-storage-path") === path) el.remove();
  });
  return sanitizeTaskUpdates(doc.body.innerHTML);
}

/** Storage paths referenced by inline images in task updates HTML. */
export function richTextHasContent(html: string): boolean {
  const safe = sanitizeTaskUpdates(html);
  if (taskUpdatesToPlainText(safe).trim()) return true;
  if (storagePathsInUpdatesHtml(safe).length > 0) return true;
  return false;
}

/** True when body was saved as rich HTML (vs legacy plain text). */
export function isStoredRichTextBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  return (
    /task-inline-(image|video|audio|file)|<strong>|<u>|<span\s+style=/i.test(trimmed) ||
    /<(?:img|video|audio|a)\b/i.test(trimmed)
  );
}

/** Fingerprints of inline media already in a live editor (includes in-flight uploads). */
export function inlineMediaFingerprintsInEditor(root: HTMLElement): Set<string> {
  const out = new Set<string>();
  for (const el of root.querySelectorAll(`[${FILE_FP_ATTR}]`)) {
    const fp = el.getAttribute(FILE_FP_ATTR)?.trim();
    if (fp) out.add(fp);
  }
  return out;
}

export function storagePathsInUpdatesHtml(html: string): string[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const paths: string[] = [];
  for (const el of inlineMediaElements(doc)) {
    const p = el.getAttribute("data-storage-path")?.trim();
    if (p && isOrgStoragePath(p)) paths.push(p);
  }
  return paths;
}

export function imagesInHtml(html: string): LightboxImage[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll(IMG_SELECTOR)].map((el) => ({
    url: el.getAttribute("src") ?? "",
    alt: el.getAttribute("alt") ?? "Image",
  }));
}

function appendDeleteButton(wrap: HTMLElement, label: string) {
  if (wrap.querySelector(`[${DELETE_BTN_ATTR}]`)) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(DELETE_BTN_ATTR, "1");
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.className =
    "absolute right-0.5 top-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] leading-none text-white shadow hover:bg-rose-600";
  btn.textContent = "×";
  wrap.appendChild(btn);
}

/** Stable id for cancelling an in-flight inline upload. */
export function stampUploadingPlaceholder(wrap: HTMLElement): string {
  const id = crypto.randomUUID();
  wrap.setAttribute(UPLOAD_ID_ATTR, id);
  return id;
}

export function uploadIdForPlaceholder(wrap: HTMLElement): string | null {
  return wrap.getAttribute(UPLOAD_ID_ATTR)?.trim() || null;
}

/** Placeholder shown in the editor while an image uploads. */
export function createUploadingImagePlaceholder(file: File): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = `${WRAP_CLASS} task-inline-image-uploading relative inline-block max-w-full align-top`;
  wrap.contentEditable = "false";
  wrap.setAttribute(UPLOADING_ATTR, "1");
  wrap.setAttribute(FILE_FP_ATTR, mediaFileFingerprint(file));

  const box = document.createElement("span");
  box.className = "task-inline-image-placeholder";

  const preview = document.createElement("img");
  preview.className = "task-inline-image-preview";
  preview.src = URL.createObjectURL(file);
  preview.alt = "Uploading…";
  preview.draggable = false;
  preview.addEventListener("load", () => {
    if (preview.naturalWidth <= 0 || preview.naturalHeight <= 0) return;
    storeIntrinsicDimensions(wrap, preview.naturalWidth, preview.naturalHeight);
    const { width, height } = inlineDisplaySizeForImage(preview);
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.style.maxWidth = "100%";
  });

  const spinner = document.createElement("span");
  spinner.className = "task-inline-image-upload-spinner";
  spinner.setAttribute("aria-label", "Uploading");
  const ring = document.createElement("span");
  ring.className = "task-inline-image-upload-ring";
  spinner.appendChild(ring);

  box.appendChild(preview);
  box.appendChild(spinner);
  wrap.appendChild(box);
  appendDeleteButton(wrap, "Cancel upload");
  return wrap;
}

/** Swap an uploading placeholder for the real inline image once it has loaded. */
export function replaceUploadingPlaceholder(
  wrap: HTMLElement,
  attachment: ImageAttachment
): Promise<HTMLImageElement> {
  const preview = wrap.querySelector<HTMLImageElement>(".task-inline-image-preview");
  const spinner = wrap.querySelector(".task-inline-image-upload-spinner");
  const box = wrap.querySelector(".task-inline-image-placeholder");

  const img = document.createElement("img");
  img.alt = attachment.name ?? "Image";
  img.className = "task-inline-image";
  img.setAttribute("data-storage-path", attachment.storagePath);
  const fp = wrap.getAttribute(FILE_FP_ATTR)?.trim();
  if (fp) img.setAttribute(FILE_FP_ATTR, fp);
  img.draggable = false;
  if (preview) copyIntrinsicDimensions(wrap, img) || copyIntrinsicDimensions(preview, img);

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (preview?.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
      spinner?.remove();
      preview?.remove();
      box?.remove();

      wrap.removeAttribute("data-intrinsic-w");
      wrap.removeAttribute("data-intrinsic-h");
      wrap.removeAttribute(UPLOADING_ATTR);
      wrap.classList.remove("task-inline-image-uploading");
      wrap.appendChild(img);
      resolve(img);
    };

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        storeIntrinsicDimensions(img, img.naturalWidth, img.naturalHeight);
      }
      finish();
    };
    img.onerror = () => {
      if (!done) reject(new Error("Image failed to load"));
    };
    img.src = attachment.url;
    if (img.complete && img.naturalWidth > 0) {
      storeIntrinsicDimensions(img, img.naturalWidth, img.naturalHeight);
      finish();
    }
  });
}

/** Placeholder shown while a video uploads. */
export function createUploadingVideoPlaceholder(file: File): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = `${VIDEO_WRAP_CLASS} task-inline-media-uploading relative inline-block max-w-full align-top`;
  wrap.contentEditable = "false";
  wrap.setAttribute(UPLOADING_ATTR, "1");
  wrap.setAttribute(FILE_FP_ATTR, mediaFileFingerprint(file));

  const box = document.createElement("span");
  box.className = "task-inline-video-placeholder";

  const preview = document.createElement("video");
  preview.className = "task-inline-video-preview";
  preview.src = URL.createObjectURL(file);
  preview.controls = true;
  preview.playsInline = true;
  preview.preload = "metadata";
  if (file.name) preview.setAttribute("data-name", file.name);
  preview.addEventListener("loadedmetadata", () => {
    if (preview.videoWidth <= 0 || preview.videoHeight <= 0) return;
    storeIntrinsicDimensions(wrap, preview.videoWidth, preview.videoHeight);
    const { width, height } = inlineDisplaySizeForVideo(preview);
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.style.maxWidth = "100%";
  });

  const spinner = document.createElement("span");
  spinner.className = "task-inline-image-upload-spinner";
  spinner.setAttribute("aria-label", "Uploading");
  const ring = document.createElement("span");
  ring.className = "task-inline-image-upload-ring";
  spinner.appendChild(ring);

  box.appendChild(preview);
  box.appendChild(spinner);
  wrap.appendChild(box);
  appendDeleteButton(wrap, "Cancel upload");
  return wrap;
}

/** Placeholder shown while an audio file uploads. */
export function createUploadingAudioPlaceholder(file: File): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = `${AUDIO_WRAP_CLASS} task-inline-media-uploading relative inline-flex max-w-full align-top`;
  wrap.contentEditable = "false";
  wrap.setAttribute(UPLOADING_ATTR, "1");
  wrap.setAttribute(FILE_FP_ATTR, mediaFileFingerprint(file));

  const box = document.createElement("span");
  box.className = "task-inline-audio-placeholder";

  const preview = document.createElement("audio");
  preview.className = "task-inline-audio-preview";
  preview.src = URL.createObjectURL(file);
  preview.controls = true;
  preview.preload = "metadata";
  if (file.name) preview.setAttribute("data-name", file.name);

  const spinner = document.createElement("span");
  spinner.className = "task-inline-image-upload-spinner";
  spinner.setAttribute("aria-label", "Uploading");
  const ring = document.createElement("span");
  ring.className = "task-inline-image-upload-ring";
  spinner.appendChild(ring);

  box.appendChild(preview);
  box.appendChild(spinner);
  wrap.appendChild(box);
  appendDeleteButton(wrap, "Cancel upload");
  return wrap;
}

export function replaceUploadingVideoPlaceholder(
  wrap: HTMLElement,
  attachment: ImageAttachment
): Promise<HTMLVideoElement> {
  const preview = wrap.querySelector<HTMLVideoElement>(".task-inline-video-preview");
  if (preview?.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  const box = wrap.querySelector(".task-inline-video-placeholder");
  box?.remove();

  const video = document.createElement("video");
  video.className = "task-inline-video";
  video.setAttribute("data-storage-path", attachment.storagePath);
  if (attachment.name) video.setAttribute("data-name", attachment.name);
  const videoFp = wrap.getAttribute(FILE_FP_ATTR)?.trim();
  if (videoFp) video.setAttribute(FILE_FP_ATTR, videoFp);
  configureInlineVideoPlayer(video);
  if (preview) copyIntrinsicDimensions(wrap, video) || copyIntrinsicDimensions(preview, video);

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wrap.removeAttribute("data-intrinsic-w");
      wrap.removeAttribute("data-intrinsic-h");
      wrap.removeAttribute(UPLOADING_ATTR);
      wrap.classList.remove("task-inline-media-uploading");
      wrap.appendChild(video);
      resolve(video);
    };
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        storeIntrinsicDimensions(video, video.videoWidth, video.videoHeight);
      }
      finish();
    };
    video.onerror = () => {
      if (!done) reject(new Error("Video failed to load"));
    };
    video.src = attachment.url;
    if (video.readyState >= 1 && video.videoWidth > 0) {
      storeIntrinsicDimensions(video, video.videoWidth, video.videoHeight);
      finish();
    }
  });
}

export function replaceUploadingAudioPlaceholder(
  wrap: HTMLElement,
  attachment: ImageAttachment
): Promise<HTMLAudioElement> {
  const preview = wrap.querySelector<HTMLAudioElement>(".task-inline-audio-preview");
  if (preview?.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  const box = wrap.querySelector(".task-inline-audio-placeholder");
  box?.remove();

  const audio = document.createElement("audio");
  audio.className = "task-inline-audio";
  audio.setAttribute("data-storage-path", attachment.storagePath);
  audio.setAttribute("data-name", attachment.name ?? "Audio");
  const audioFp = wrap.getAttribute(FILE_FP_ATTR)?.trim();
  if (audioFp) audio.setAttribute(FILE_FP_ATTR, audioFp);
  audio.preload = "metadata";

  wrap.removeAttribute(UPLOADING_ATTR);
  wrap.classList.remove("task-inline-media-uploading");
  wrap.appendChild(audio);
  audio.src = attachment.url;
  return Promise.resolve(audio);
}

/** Placeholder shown while a generic file uploads. */
export function createUploadingFilePlaceholder(file: File): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = `${FILE_WRAP_CLASS} task-inline-media-uploading relative inline-flex max-w-full align-top`;
  wrap.contentEditable = "false";
  wrap.setAttribute(UPLOADING_ATTR, "1");
  wrap.setAttribute(FILE_FP_ATTR, mediaFileFingerprint(file));

  const box = document.createElement("span");
  box.className = "task-inline-file-placeholder";

  const link = document.createElement("a");
  link.className = "task-inline-file task-inline-file-preview";
  link.href = URL.createObjectURL(file);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = file.name || "File";

  const spinner = document.createElement("span");
  spinner.className = "task-inline-image-upload-spinner";
  spinner.setAttribute("aria-label", "Uploading");
  const ring = document.createElement("span");
  ring.className = "task-inline-image-upload-ring";
  spinner.appendChild(ring);

  box.appendChild(link);
  box.appendChild(spinner);
  wrap.appendChild(box);
  appendDeleteButton(wrap, "Cancel upload");
  return wrap;
}

export function replaceUploadingFilePlaceholder(
  wrap: HTMLElement,
  attachment: ImageAttachment
): Promise<HTMLAnchorElement> {
  const preview = wrap.querySelector<HTMLAnchorElement>("a.task-inline-file-preview");
  if (preview?.href.startsWith("blob:")) URL.revokeObjectURL(preview.href);
  const box = wrap.querySelector(".task-inline-file-placeholder");
  box?.remove();

  const link = document.createElement("a");
  link.className = "task-inline-file";
  link.href = attachment.url;
  link.setAttribute("data-storage-path", attachment.storagePath);
  link.setAttribute("data-name", attachment.name ?? "File");
  const fp = wrap.getAttribute(FILE_FP_ATTR)?.trim();
  if (fp) link.setAttribute(FILE_FP_ATTR, fp);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = attachment.name ?? "Download file";

  wrap.removeAttribute(UPLOADING_ATTR);
  wrap.classList.remove("task-inline-media-uploading");
  wrap.appendChild(link);
  return Promise.resolve(link);
}

function appendResizeHandles(wrap: HTMLElement, minWidth: number, maxWidth: number) {
  for (const corner of RESIZE_CORNERS) {
    if (wrap.querySelector(`[${RESIZE_HANDLE_ATTR}="${corner}"]`)) continue;
    const handle = document.createElement("span");
    handle.setAttribute(RESIZE_HANDLE_ATTR, corner);
    handle.setAttribute("data-min-width", String(minWidth));
    handle.setAttribute("data-max-width", String(maxWidth));
    handle.setAttribute("aria-hidden", "true");
    handle.title = "Resize";
    handle.className = `task-inline-image-resize task-inline-image-resize-${corner}`;
    wrap.appendChild(handle);
  }
}

function ensureInlineImageControls(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>(IMG_SELECTOR).forEach((img) => {
    const uploadingWrap = img.closest<HTMLElement>(`[${UPLOADING_ATTR}]`);
    if (uploadingWrap) {
      if (!isRichTextEditable(root)) stripEditControls(uploadingWrap);
      return;
    }
    let wrap = img.closest<HTMLElement>(`.${WRAP_CLASS}`);
    if (!wrap) {
      const shell = img.closest<HTMLElement>(`.loadable-media-shell`);
      if (shell?.contains(img)) {
        shell.classList.add(WRAP_CLASS);
        if (!shell.classList.contains("relative")) {
          shell.classList.add("relative", "inline-block", "max-w-full", "align-top");
        }
        wrap = shell;
      } else {
        wrap = document.createElement("span");
        wrap.className = `${WRAP_CLASS} relative inline-block max-w-full align-top`;
        wrap.contentEditable = "false";
        img.parentNode?.insertBefore(wrap, img);
        wrap.appendChild(img);
      }
    }

    if (!isRichTextEditable(root)) {
      stripEditControls(wrap);
      img.draggable = false;
      return;
    }
    appendDeleteButton(wrap, "Delete image");
    appendResizeHandles(wrap, MIN_IMG_WIDTH, MAX_IMG_WIDTH);
    wrap.draggable = true;
    img.draggable = false;
  });
}

function ensureInlineVideoControls(root: HTMLElement) {
  root.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR).forEach((video) => {
    const uploadingWrap = video.closest<HTMLElement>(`[${UPLOADING_ATTR}]`);
    if (uploadingWrap) {
      if (!isRichTextEditable(root)) stripEditControls(uploadingWrap);
      return;
    }
    let wrap = video.closest<HTMLElement>(`.${VIDEO_WRAP_CLASS}`);
    if (!wrap) {
      const shell = video.closest<HTMLElement>(`.loadable-media-shell`);
      if (shell?.contains(video)) {
        shell.classList.add(VIDEO_WRAP_CLASS);
        if (!shell.classList.contains("relative")) {
          shell.classList.add("relative", "inline-block", "max-w-full", "align-top");
        }
        wrap = shell;
      }
    }
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = `${VIDEO_WRAP_CLASS} relative inline-block max-w-full align-top`;
      wrap.contentEditable = "false";
      video.parentNode?.insertBefore(wrap, video);
      wrap.appendChild(video);
    }
    configureInlineVideoPlayer(video);
    buildVideoControlBar(wrap, video);
    if (!isRichTextEditable(root)) {
      stripEditControls(wrap);
      video.draggable = false;
      return;
    }
    appendDeleteButton(wrap, "Delete video");
    appendResizeHandles(wrap, MIN_VIDEO_WIDTH, MAX_VIDEO_WIDTH);
    wrap.draggable = true;
    video.draggable = false;
  });
}

function ensureInlineAudioControls(root: HTMLElement) {
  root.querySelectorAll<HTMLAudioElement>(AUDIO_SELECTOR).forEach((audio) => {
    const uploadingWrap = audio.closest<HTMLElement>(`[${UPLOADING_ATTR}]`);
    if (uploadingWrap) {
      if (!isRichTextEditable(root)) stripEditControls(uploadingWrap);
      return;
    }
    let wrap = audio.closest<HTMLElement>(`.${AUDIO_WRAP_CLASS}`);
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = `${AUDIO_WRAP_CLASS} relative inline-flex max-w-full align-top`;
      wrap.contentEditable = "false";
      audio.parentNode?.insertBefore(wrap, audio);
      wrap.appendChild(audio);
    }

    let ui = wrap.querySelector<HTMLElement>(".task-inline-audio-ui");
    if (!ui) {
      ui = document.createElement("span");
      ui.className = "task-inline-audio-ui";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute(AUDIO_PLAY_ATTR, "1");
      btn.setAttribute("aria-label", "Play audio");
      btn.className = "task-inline-audio-play";
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
      const name = document.createElement("span");
      name.className = "task-inline-audio-name";
      name.textContent = audio.getAttribute("data-name")?.trim() || "Audio clip";
      ui.appendChild(btn);
      ui.appendChild(name);
      wrap.appendChild(ui);
    } else {
      const name = ui.querySelector(".task-inline-audio-name");
      const next = audio.getAttribute("data-name")?.trim() || "Audio clip";
      if (name && name.textContent !== next) name.textContent = next;
    }
    if (!isRichTextEditable(root)) {
      stripEditControls(wrap);
      audio.draggable = false;
      return;
    }
    appendDeleteButton(wrap, "Delete audio");
    wrap.draggable = true;
    audio.draggable = false;
  });
}

function ensureInlineFileControls(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>(FILE_SELECTOR).forEach((link) => {
    const uploadingWrap = link.closest<HTMLElement>(`[${UPLOADING_ATTR}]`);
    if (uploadingWrap) {
      if (!isRichTextEditable(root)) stripEditControls(uploadingWrap);
      return;
    }
    let wrap = link.closest<HTMLElement>(`.${FILE_WRAP_CLASS}`);
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = `${FILE_WRAP_CLASS} relative inline-flex max-w-full align-top`;
      wrap.contentEditable = "false";
      link.parentNode?.insertBefore(wrap, link);
      wrap.appendChild(link);
    }

    let ui = wrap.querySelector<HTMLElement>(".task-inline-file-ui");
    if (!ui) {
      ui = document.createElement("span");
      ui.className = "task-inline-file-ui";
      ui.appendChild(link);
      wrap.appendChild(ui);
    } else if (!ui.contains(link)) {
      ui.appendChild(link);
    }

    const name = link.getAttribute("data-name")?.trim() || link.textContent?.trim() || "File";
    if (link.textContent !== name) link.textContent = name;

    if (!isRichTextEditable(root)) {
      stripEditControls(wrap);
      link.draggable = false;
      return;
    }
    appendDeleteButton(wrap, "Delete file");
    wrap.draggable = true;
    link.draggable = false;
  });
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y);
  }
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

function insertWrapAtPoint(root: HTMLElement, wrap: HTMLElement, x: number, y: number) {
  const range = rangeFromPoint(x, y);
  if (range && root.contains(range.startContainer) && !wrap.contains(range.startContainer)) {
    range.collapse(true);
    range.insertNode(wrap);
    const spacer = document.createTextNode("\u00a0");
    wrap.after(spacer);
    return;
  }
  root.appendChild(wrap);
  root.appendChild(document.createTextNode("\u00a0"));
}

/** Remove duplicate inline images that share the same storage path (keep `keep` if set). */
function mediaWrapForElement(el: Element): HTMLElement {
  return el.closest<HTMLElement>(INLINE_WRAP_SELECTOR) ?? (el as HTMLElement);
}

function dedupeInlineImagesByPath(root: HTMLElement, keep?: HTMLElement | null) {
  const seen = new Set<string>();
  for (const el of root.querySelectorAll(INLINE_MEDIA_SELECTOR)) {
    const path = el.getAttribute("data-storage-path")?.trim() ?? "";
    if (!path) continue;
    const wrap = mediaWrapForElement(el);
    if (keep && (wrap === keep || keep.contains(wrap))) {
      seen.add(path);
      continue;
    }
    if (seen.has(path)) {
      wrap.remove();
    } else {
      seen.add(path);
    }
  }
}

function isMediaControlTarget(target: HTMLElement): boolean {
  return Boolean(
    target.closest(
      `[${DELETE_BTN_ATTR}], [${RESIZE_HANDLE_ATTR}], .task-inline-video-controls, [${AUDIO_PLAY_ATTR}], .${FILE_SELECTOR}`
    )
  );
}

/** Wire click → lightbox on inline images inside a live DOM subtree. */
export function bindInlineImageLightbox(
  root: HTMLElement | null,
  onOpen: (images: LightboxImage[], index: number) => void
): () => void {
  if (!root) return () => undefined;

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (isMediaControlTarget(target)) return;
    const img = target.closest<HTMLImageElement>(LIGHTBOX_IMG_SELECTOR);
    if (!img || !root.contains(img)) return;
    const imgs = [...root.querySelectorAll<HTMLImageElement>(LIGHTBOX_IMG_SELECTOR)];
    const index = imgs.indexOf(img);
    if (index < 0) return;
    e.preventDefault();
    e.stopPropagation();
    onOpen(
      imgs.map((el) => ({ url: el.src, alt: el.alt || "Image" })),
      index
    );
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

/** Trash on inline images in a contenteditable editor (delegated — survives re-renders). */
export function bindInlineImageDelete(
  root: HTMLElement | null,
  onDelete: (storagePath: string, el: HTMLElement) => void
): () => void {
  if (!root) return () => undefined;

  const releaseWatch = acquireMediaWatch(root);

  const onPointer = (e: Event) => {
    if (!isRichTextEditable(root)) return;
    const target = e.target as HTMLElement;
    const btn = target.closest(`[${DELETE_BTN_ATTR}]`);
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = btn.closest<HTMLElement>(INLINE_WRAP_SELECTOR);
    if (!wrap) return;
    if (wrap.hasAttribute(UPLOADING_ATTR)) {
      onDelete("", wrap);
      return;
    }
    const media = wrap.querySelector(INLINE_MEDIA_SELECTOR);
    if (!media) return;
    onDelete(media.getAttribute("data-storage-path") ?? "", media as HTMLElement);
  };

  root.addEventListener("mousedown", onPointer, true);
  root.addEventListener("click", onPointer, true);

  return () => {
    root.removeEventListener("mousedown", onPointer, true);
    root.removeEventListener("click", onPointer, true);
    releaseWatch();
  };
}

/** Corner drag handles to resize inline images (width persisted on the img). */
export function bindInlineImageResize(
  root: HTMLElement | null,
  onResizeEnd?: () => void
): () => void {
  if (!root) return () => undefined;

  const releaseWatch = acquireMediaWatch(root);

  let active: {
    el: HTMLImageElement | HTMLVideoElement;
    startX: number;
    startWidth: number;
    corner: (typeof RESIZE_CORNERS)[number];
    minWidth: number;
    maxWidth: number;
  } | null = null;

  function onMouseMove(e: MouseEvent) {
    if (!active) return;
    const dx = e.clientX - active.startX;
    const growsRight = active.corner === "se" || active.corner === "ne";
    let next = active.startWidth + (growsRight ? dx : -dx);
    next = Math.min(active.maxWidth, Math.max(active.minWidth, Math.round(next)));
    active.el.style.width = `${next}px`;
    active.el.style.height = "auto";
    active.el.style.maxHeight = "none";
  }

  function endDrag() {
    if (active) {
      const { el } = active;
      if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
        storeIntrinsicDimensions(el, el.naturalWidth, el.naturalHeight);
      } else if (el instanceof HTMLVideoElement && el.videoWidth > 0) {
        storeIntrinsicDimensions(el, el.videoWidth, el.videoHeight);
      }
      active = null;
      onResizeEnd?.();
    }
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", endDrag);
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  }

  const onMouseDown = (e: Event) => {
    if (!isRichTextEditable(root)) return;
    const me = e as MouseEvent;
    const target = me.target as HTMLElement;
    const handle = target.closest<HTMLElement>(`[${RESIZE_HANDLE_ATTR}]`);
    if (!handle || !root.contains(handle)) return;
    me.preventDefault();
    me.stopPropagation();

    const wrap = handle.closest(`.${WRAP_CLASS}, .${VIDEO_WRAP_CLASS}`);
    const el =
      wrap?.querySelector<HTMLImageElement>(IMG_SELECTOR) ??
      wrap?.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    if (!el) return;

    const corner = handle.getAttribute(RESIZE_HANDLE_ATTR) as (typeof RESIZE_CORNERS)[number];
    if (!RESIZE_CORNERS.includes(corner)) return;

    const minWidth = Number(handle.getAttribute("data-min-width")) || MIN_IMG_WIDTH;
    const maxWidth = Number(handle.getAttribute("data-max-width")) || MAX_IMG_WIDTH;
    const rect = el.getBoundingClientRect();
    active = {
      el,
      startX: me.clientX,
      startWidth: rect.width,
      corner,
      minWidth,
      maxWidth,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor =
      corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", endDrag);
  };

  root.addEventListener("mousedown", onMouseDown, true);

  return () => {
    endDrag();
    root.removeEventListener("mousedown", onMouseDown, true);
    releaseWatch();
  };
}

function closeAllVideoSpeedMenus(root: HTMLElement, except?: HTMLElement | null) {
  root.querySelectorAll<HTMLElement>(`[${VIDEO_SPEED_MENU_ATTR}]`).forEach((menu) => {
    if (except && (menu === except || except.contains(menu))) return;
    menu.classList.remove("is-open");
    const btn = menu.parentElement?.querySelector<HTMLButtonElement>(`[${VIDEO_SPEED_BTN_ATTR}]`);
    btn?.setAttribute("aria-expanded", "false");
  });
}

/** Custom play/seek/speed controls for inline videos (replaces native overflow menu). */
export function bindInlineVideoControls(root: HTMLElement | null): () => void {
  if (!root) return () => undefined;
  const host = root;

  const wired = new WeakSet<HTMLVideoElement>();

  function wireVideo(video: HTMLVideoElement) {
    if (wired.has(video)) return;
    wired.add(video);
    const onSync = () => syncVideoControlUi(video);
    video.addEventListener("timeupdate", onSync);
    video.addEventListener("loadedmetadata", onSync);
    video.addEventListener("durationchange", onSync);
    video.addEventListener("play", onSync);
    video.addEventListener("pause", onSync);
    video.addEventListener("ended", onSync);
    onSync();
  }

  function wireAllVideos() {
    host.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR).forEach(wireVideo);
  }

  const releaseWatch = acquireMediaWatch(host, wireAllVideos);

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!host.contains(target)) return;

    const speedOption = target.closest<HTMLButtonElement>(`[${VIDEO_SPEED_OPTION_ATTR}]`);
    if (speedOption) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = speedOption.closest(`.${VIDEO_WRAP_CLASS}`);
      const video = wrap?.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
      if (!video) return;
      const rate = Number(speedOption.getAttribute(VIDEO_SPEED_OPTION_ATTR));
      if (!PLAYBACK_SPEEDS.includes(rate as (typeof PLAYBACK_SPEEDS)[number])) return;
      video.playbackRate = rate;
      syncVideoControlUi(video);
      closeAllVideoSpeedMenus(host);
      return;
    }

    const speedBtn = target.closest<HTMLButtonElement>(`[${VIDEO_SPEED_BTN_ATTR}]`);
    if (speedBtn) {
      e.preventDefault();
      e.stopPropagation();
      const menu = speedBtn.parentElement?.querySelector<HTMLElement>(`[${VIDEO_SPEED_MENU_ATTR}]`);
      if (!menu) return;
      const open = !menu.classList.contains("is-open");
      closeAllVideoSpeedMenus(host, open ? menu : null);
      menu.classList.toggle("is-open", open);
      speedBtn.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }

    const playBtn = target.closest<HTMLButtonElement>(`[${VIDEO_PLAY_ATTR}]`);
    if (playBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = playBtn.closest(`.${VIDEO_WRAP_CLASS}`);
      const video = wrap?.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
      if (!video) return;
      if (video.paused) void video.play().catch(console.error);
      else video.pause();
      syncVideoControlUi(video);
      return;
    }

    if (!target.closest(`.${VIDEO_WRAP_CLASS}`)) {
      closeAllVideoSpeedMenus(host);
    }
  };

  const onInput = (e: Event) => {
    const target = e.target as HTMLElement;
    const seek = target.closest<HTMLInputElement>(`[${VIDEO_SEEK_ATTR}]`);
    if (!seek || !host.contains(seek)) return;
    const wrap = seek.closest(`.${VIDEO_WRAP_CLASS}`);
    const video = wrap?.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    if (!video) return;
    const next = Number(seek.value);
    if (Number.isFinite(next)) {
      video.currentTime = next;
      syncVideoControlUi(video);
    }
  };

  host.addEventListener("click", onClick, true);
  host.addEventListener("input", onInput, true);

  return () => {
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("input", onInput, true);
    releaseWatch();
  };
}

/** Play / pause custom audio controls in updates. */
export function bindInlineAudioPlay(root: HTMLElement | null): () => void {
  if (!root) return () => undefined;

  const releaseWatch = acquireMediaWatch(root);

  function syncBtn(btn: HTMLButtonElement, audio: HTMLAudioElement) {
    const playing = !audio.paused && !audio.ended;
    const prev = btn.getAttribute("data-playing") === "1";
    if (prev === playing) return;
    btn.setAttribute("data-playing", playing ? "1" : "0");
    btn.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
    btn.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>(`[${AUDIO_PLAY_ATTR}]`);
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = btn.closest(`.${AUDIO_WRAP_CLASS}`);
    const audio = wrap?.querySelector<HTMLAudioElement>(AUDIO_SELECTOR);
    if (!audio) return;
    if (audio.paused) void audio.play().catch(console.error);
    else audio.pause();
    syncBtn(btn, audio);
  };

  const onEnded = (e: Event) => {
    const audio = e.target as HTMLAudioElement;
    if (!root.contains(audio)) return;
    const btn = audio.parentElement?.querySelector<HTMLButtonElement>(`[${AUDIO_PLAY_ATTR}]`);
    if (btn) syncBtn(btn, audio);
  };

  root.addEventListener("click", onClick, true);
  root.addEventListener("ended", onEnded, true);

  return () => {
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("ended", onEnded, true);
    releaseWatch();
  };
}

/** Drag inline images to reposition them (move, not copy). */
export function bindInlineImageMove(
  root: HTMLElement | null,
  onMoveEnd?: () => void
): () => void {
  if (!root) return () => undefined;

  const releaseWatch = acquireMediaWatch(root);

  let movingWrap: HTMLElement | null = null;

  const onDragStart = (e: Event) => {
    if (!isRichTextEditable(root)) return;
    const de = e as DragEvent;
    const target = de.target as HTMLElement;
    if (isMediaControlTarget(target)) return;
    const wrap = target.closest<HTMLElement>(INLINE_WRAP_SELECTOR);
    if (!wrap || wrap.hasAttribute(UPLOADING_ATTR) || !root.contains(wrap)) return;

    const media =
      wrap.querySelector<HTMLImageElement>(IMG_SELECTOR) ??
      wrap.querySelector<HTMLVideoElement>(VIDEO_SELECTOR) ??
      wrap.querySelector<HTMLAudioElement>(AUDIO_SELECTOR) ??
      wrap.querySelector<HTMLAnchorElement>(FILE_SELECTOR);
    if (!media) return;

    movingWrap = wrap;
    de.dataTransfer?.setData(MOVE_KIND, "1");
    de.dataTransfer?.setData("text/plain", "");
    if (de.dataTransfer) de.dataTransfer.effectAllowed = "move";
    if (de.dataTransfer) {
      const dragPreview =
        wrap.querySelector<HTMLElement>(".task-inline-audio-ui") ??
        wrap.querySelector<HTMLElement>(".task-inline-file-ui") ??
        (media as HTMLElement);
      de.dataTransfer.setDragImage(dragPreview, 20, 20);
    }
    de.stopPropagation();
  };

  const onDragOver = (e: Event) => {
    const de = e as DragEvent;
    if (!movingWrap && !de.dataTransfer?.types.includes(MOVE_KIND)) return;
    de.preventDefault();
    if (de.dataTransfer) de.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: Event) => {
    const de = e as DragEvent;
    const wrap = movingWrap;
    if (!wrap || !root.contains(wrap)) return;
    if (!de.dataTransfer?.types.includes(MOVE_KIND)) return;

    de.preventDefault();
    de.stopPropagation();

    wrap.remove();
    insertWrapAtPoint(root, wrap, de.clientX, de.clientY);
    runMediaControlRefresh(root, mediaWatchState.get(root)?.afterRefresh ?? []);
    dedupeInlineImagesByPath(root, wrap);
    movingWrap = null;
    onMoveEnd?.();
  };

  const onDragEnd = () => {
    if (movingWrap) dedupeInlineImagesByPath(root, movingWrap);
    movingWrap = null;
  };

  root.addEventListener("dragstart", onDragStart, true);
  root.addEventListener("dragover", onDragOver, true);
  root.addEventListener("drop", onDrop, true);
  root.addEventListener("dragend", onDragEnd, true);

  return () => {
    movingWrap = null;
    root.removeEventListener("dragstart", onDragStart, true);
    root.removeEventListener("dragover", onDragOver, true);
    root.removeEventListener("drop", onDrop, true);
    root.removeEventListener("dragend", onDragEnd, true);
    releaseWatch();
  };
}

export type UpdateMediaCounts = {
  images: number;
  videos: number;
  audio: number;
  files: number;
};

const EMPTY_UPDATE_MEDIA_COUNTS: UpdateMediaCounts = {
  images: 0,
  videos: 0,
  audio: 0,
  files: 0,
};

/** Count inline media in saved update HTML (images, video, audio, generic files). */
export function countUpdateMediaInHtml(html: string): UpdateMediaCounts {
  const trimmed = html.trim();
  if (!trimmed) return { ...EMPTY_UPDATE_MEDIA_COUNTS };

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  return {
    images: doc.querySelectorAll(IMG_SELECTOR).length,
    videos: doc.querySelectorAll(VIDEO_SELECTOR).length,
    audio: doc.querySelectorAll(AUDIO_SELECTOR).length,
    files: doc.querySelectorAll(FILE_SELECTOR).length,
  };
}

/** Badge label: 1–3 as-is; 4+ as +N (e.g. +5). */
export function updateMediaCountLabel(count: number): string {
  if (count <= 0) return "";
  if (count > 3) return `+${count}`;
  return String(count);
}
