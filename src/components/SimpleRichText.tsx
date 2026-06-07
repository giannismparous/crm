import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { File as FileIcon, ImagePlus, Music, Video } from "lucide-react";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";
import {
  deleteImagesFromStorage,
  mediaKindForFile,
  duplicateUploadMessage,
  partitionAttachmentFiles,
  partitionImageFiles,
  partitionMediaFiles,
  partitionUniqueFiles,
  storageUploadErrorMessage,
  uploadSingleFile,
  uploadSingleImageFile,
  uploadSingleMediaFile,
} from "../utils/imageAttachments";
import {
  bindInlineAudioPlay,
  bindInlineVideoControls,
  bindInlineImageDelete,
  bindInlineImageLightbox,
  bindInlineImageMove,
  bindInlineImageResize,
  createUploadingAudioPlaceholder,
  createUploadingFilePlaceholder,
  createUploadingImagePlaceholder,
  createUploadingVideoPlaceholder,
  replaceUploadingAudioPlaceholder,
  replaceUploadingFilePlaceholder,
  replaceUploadingPlaceholder,
  replaceUploadingVideoPlaceholder,
  inlineMediaFingerprintsInEditor,
  stampUploadingPlaceholder,
  storagePathsInUpdatesHtml,
  uploadIdForPlaceholder,
} from "../utils/richTextImages";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../types";
import { bindLoadableImages, refreshRichTextMediaLayout } from "../utils/bindLoadableImages";
import { RICH_TEXT_HIGHLIGHT_COLOR } from "../utils/richTextHighlight";
import { ImageLightbox, type LightboxImage } from "./ImageLightbox";
/** Default visible height for updates (matches min-height). */
export const UPDATES_COLLAPSED_MAX = "4.5rem";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** When set, new typing is tagged with data-author for multi-user color view. */
  authorId?: string;
  className?: string;
  /** Cap height until user expands; shows “… Show more” / “Show less”. */
  collapsible?: boolean;
  /** Resets expand/collapse when task changes. */
  collapseKey?: string;
  /** When set, workers can attach images inline in updates. */
  taskId?: string;
  /** Override inline image storage path (e.g. tasks/{id}/feedback). Defaults to tasks/{taskId}/updates. */
  inlineImageStorageDir?: string;
  /** Fires while inline images are uploading. */
  onImagesUploadingChange?: (uploading: boolean) => void;
  /** Show “attach any file” (PDF, docs, etc.) with auto-routing for images/video/audio. Defaults to on when inline storage is enabled. */
  enableGenericFileAttach?: boolean;
};

const COLLAPSED_HEIGHT_PX = 72;

function isOtherTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  if (el.matches("textarea")) return true;
  if (el.matches("input")) {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image"].includes(
      type
    );
  }
  return false;
}

function useCollapsibleBody(
  collapseKey: string | undefined,
  watchHtml: string,
  collapsible: boolean,
  bodyRef: RefObject<HTMLDivElement | null>
) {
  const [expanded, setExpanded] = useState(false);
  /** Stays open after first edit until "Show less" or focus moves to another text field. */
  const [activated, setActivated] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const effectiveExpanded = expanded || activated;

  useEffect(() => {
    setExpanded(false);
    setActivated(false);
  }, [collapseKey]);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el || !collapsible) {
      setOverflows(false);
      return;
    }
    const hasContent =
      (el.textContent ?? "").trim().length > 0 ||
      Boolean(el.querySelector("img, video, audio, a.task-inline-file, table, ul, ol"));
    if (!hasContent) {
      setOverflows(false);
      return;
    }
    setOverflows(el.scrollHeight > COLLAPSED_HEIGHT_PX + 2);
  }, [collapsible]);

  useEffect(() => {
    measure();
  }, [measure, watchHtml, collapseKey, expanded, activated]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const mo = new MutationObserver(() => measure());
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure, collapseKey]);

  const showToggle = collapsible && overflows;

  const scheduleMediaLayoutRefresh = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    refreshRichTextMediaLayout(el);
    requestAnimationFrame(() => refreshRichTextMediaLayout(el));
    window.setTimeout(() => refreshRichTextMediaLayout(el), 150);
  }, [bodyRef]);

  const collapseToggle = showToggle ? (
    <div className="border-t border-slate-100 px-2 py-1">
      <button
        type="button"
        onClick={() => {
          if (effectiveExpanded) {
            setExpanded(false);
            setActivated(false);
          } else {
            setExpanded(true);
            setActivated(true);
            scheduleMediaLayoutRefresh();
          }
        }}
        className="text-xs font-medium text-accent hover:underline"
      >
        {effectiveExpanded ? "Show less" : "… Show more"}
      </button>
    </div>
  ) : null;

  const bodyClampClass = collapsible
    ? effectiveExpanded
      ? "is-expanded max-h-none overflow-visible"
      : "is-collapsed max-h-[4.5rem] overflow-hidden"
    : "";

  useEffect(() => {
    if (!effectiveExpanded) return;
    scheduleMediaLayoutRefresh();
  }, [effectiveExpanded, watchHtml, collapseKey, scheduleMediaLayoutRefresh]);

  const activate = useCallback(() => {
    setActivated(true);
    scheduleMediaLayoutRefresh();
  }, [scheduleMediaLayoutRefresh]);

  const deactivate = useCallback(() => {
    setExpanded(false);
    setActivated(false);
  }, []);

  return {
    bodyClampClass,
    collapseToggle,
    activate,
    deactivate,
  };
}

function hasHighlightInSelection(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  let node: Node | null = sel.anchorNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "MARK") return true;
      if (el.hasAttribute("data-author")) continue;
      const bg = el.style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;
    }
    node = node.parentNode;
  }
  return false;
}

function selectionIntersectsNode(range: Range, node: Node): boolean {
  try {
    if (typeof range.intersectsNode === "function") return range.intersectsNode(node);
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    );
  } catch {
    return false;
  }
}

function unwrapHighlightedSpans(root: HTMLElement) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  let range: Range;
  try {
    range = sel.getRangeAt(0);
  } catch {
    return;
  }
  if (!root.contains(range.commonAncestorContainer)) return;

  const spans = [...root.querySelectorAll("span[style*='background']:not([data-author]), mark")];
  for (const el of spans) {
    if (!selectionIntersectsNode(range, el)) continue;
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

function authorSpanForCaret(root: HTMLElement, authorId: string): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "SPAN" && el.getAttribute("data-author") === authorId) return el;
    }
    node = node.parentNode;
  }
  return null;
}

function ensureAuthorSpan(root: HTMLElement, authorId: string) {
  if (authorSpanForCaret(root, authorId)) return;

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  const span = document.createElement("span");
  span.setAttribute("data-author", authorId);

  if (range.collapsed) {
    range.insertNode(span);
    const zwsp = document.createTextNode("\u200b");
    span.appendChild(zwsp);
    range.setStart(zwsp, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  try {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore range errors */
  }
}

function insertNodeAtCaret(root: HTMLElement, node: Node) {
  root.focus();
  const sel = window.getSelection();
  if (sel?.rangeCount && root.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(node);
    const spacer = document.createTextNode("\u00a0");
    if (node.parentNode) node.parentNode.insertBefore(spacer, node.nextSibling);
    range.setStartAfter(spacer);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    root.appendChild(node);
    root.appendChild(document.createTextNode("\u00a0"));
  }
}

export function SimpleRichText({
  value,
  onChange,
  placeholder = "Add progress notes…",
  minHeight = UPDATES_COLLAPSED_MAX,
  authorId,
  className = "",
  collapsible = false,
  collapseKey,
  taskId,
  inlineImageStorageDir,
  onImagesUploadingChange,
  enableGenericFileAttach: enableGenericFileAttachProp,
}: Props) {
  const imageStorageDir =
    inlineImageStorageDir ?? (taskId ? `tasks/${taskId}/updates` : undefined);
  const enableGenericFileAttach = enableGenericFileAttachProp ?? Boolean(imageStorageDir);
  const uploadsInFlight = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const anyFileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const updatesScopeKey = `updates-${collapseKey ?? taskId ?? "default"}`;

  useEffect(() => {
    setLightbox(null);
  }, [updatesScopeKey]);

  const { bodyClampClass, collapseToggle, activate, deactivate } = useCollapsibleBody(
    collapseKey,
    value,
    collapsible,
    ref
  );

  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl || !collapsible) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      const host = rootRef.current;
      if (!target || !host || host.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      if (isOtherTextEntry(target)) deactivate();
    }
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [collapseKey, collapsible, deactivate]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(value);
  const focused = useRef(false);
  const deleteImageRef = useRef<(storagePath: string, el: HTMLElement) => void>(() => {});
  const abortedUploadIdsRef = useRef(new Set<string>());
  const uploadingFingerprintsRef = useRef(new Set<string>());

  function existingFingerprintsForEditor(): Set<string> {
    const el = ref.current;
    const out = el ? inlineMediaFingerprintsInEditor(el) : new Set<string>();
    for (const fp of uploadingFingerprintsRef.current) out.add(fp);
    return out;
  }

  function trackUploadFingerprint(wrap: HTMLElement) {
    const fp = wrap.getAttribute("data-file-fp")?.trim();
    if (fp) uploadingFingerprintsRef.current.add(fp);
  }

  function releaseUploadFingerprint(wrap: HTMLElement) {
    const fp = wrap.getAttribute("data-file-fp")?.trim();
    if (fp) uploadingFingerprintsRef.current.delete(fp);
  }

  const syncFromProp = useCallback(() => {
    const el = ref.current;
    if (!el || focused.current) return;

    const safe = sanitizeTaskUpdates(value);
    const domSafe = sanitizeTaskUpdates(el.innerHTML);
    // DOM already reflects our latest emit — don't revert to a stale prop.
    if (domSafe === lastEmitted.current) return;
    if (safe === lastEmitted.current && domSafe === safe) return;

    if (domSafe !== safe) {
      el.innerHTML = safe || "";
      lastEmitted.current = safe;
    }
  }, [value]);

  useEffect(() => {
    syncFromProp();
  }, [syncFromProp]);

  function purgeRemovedInlineImages(prevHtml: string, nextHtml: string) {
    const prevPaths = storagePathsInUpdatesHtml(prevHtml);
    const nextSet = new Set(storagePathsInUpdatesHtml(nextHtml));
    const removed = prevPaths.filter((p) => !nextSet.has(p));
    if (removed.length === 0) return;
    void deleteImagesFromStorage(removed).catch((err) => {
      console.error("purge removed inline images", err);
      setUploadError(storageUploadErrorMessage(err));
    });
  }

  function emit() {
    const el = ref.current;
    if (!el) return;
    const safe = sanitizeTaskUpdates(el.innerHTML);
    if (safe !== lastEmitted.current) {
      const prev = lastEmitted.current;
      purgeRemovedInlineImages(prev, safe);
      lastEmitted.current = safe;
      onChange(safe);
    }
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(emit, 600);
  }

  function onEditInput() {
    const el = ref.current;
    if (el && authorId) ensureAuthorSpan(el, authorId);
    scheduleSave();
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onEditInput();
  }

  deleteImageRef.current = (_storagePath, target) => {
    setUploadError(null);
    const wrap =
      target.closest<HTMLElement>(
        ".task-inline-image-wrap, .task-inline-video-wrap, .task-inline-audio-wrap, .task-inline-file-wrap"
      ) ?? target;
    const uploadId = uploadIdForPlaceholder(wrap);
    if (uploadId) abortedUploadIdsRef.current.add(uploadId);
    releaseUploadFingerprint(wrap);
    for (const el of [
      wrap.querySelector<HTMLImageElement>(".task-inline-image-preview"),
      wrap.querySelector<HTMLVideoElement>(".task-inline-video-preview"),
      wrap.querySelector<HTMLAudioElement>(".task-inline-audio-preview"),
    ]) {
      if (el?.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
    }
    const filePreview = wrap.querySelector<HTMLAnchorElement>("a.task-inline-file-preview");
    if (filePreview?.href.startsWith("blob:")) URL.revokeObjectURL(filePreview.href);
    wrap.remove();
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    emit();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unbindLightbox = bindInlineImageLightbox(el, (images, index) => {
      setLightbox({ images, index });
    });
    const unbindDelete = bindInlineImageDelete(el, (path, img) => deleteImageRef.current(path, img));
    const unbindResize = bindInlineImageResize(el, () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      emit();
    });
    const unbindMove = bindInlineImageMove(el, () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      emit();
    });
    const unbindAudio = bindInlineAudioPlay(el);
    const unbindVideo = bindInlineVideoControls(el);
    return () => {
      unbindLightbox();
      unbindDelete();
      unbindResize();
      unbindMove();
      unbindAudio();
      unbindVideo();
    };
  }, [collapseKey, imageStorageDir]);

  useLayoutEffect(() => {
    return bindLoadableImages(ref.current);
  }, [collapseKey, imageStorageDir, value]);

  useEffect(() => {
    return bindLoadableImages(ref.current);
  }, [collapseKey, imageStorageDir, value]);

  function bumpUploads(delta: number) {
    uploadsInFlight.current = Math.max(0, uploadsInFlight.current + delta);
    onImagesUploadingChange?.(uploadsInFlight.current > 0);
  }

  type RoutedUploadKind = "image" | "video" | "audio" | "file";

  function routedKindForFile(file: File): RoutedUploadKind {
    return mediaKindForFile(file) ?? "file";
  }

  function createPlaceholderForKind(file: File, kind: RoutedUploadKind): HTMLElement {
    if (kind === "image") return createUploadingImagePlaceholder(file);
    if (kind === "video") return createUploadingVideoPlaceholder(file);
    if (kind === "audio") return createUploadingAudioPlaceholder(file);
    return createUploadingFilePlaceholder(file);
  }

  function replacePlaceholderForKind(
    wrap: HTMLElement,
    attachment: Awaited<ReturnType<typeof uploadSingleMediaFile>>,
    kind: RoutedUploadKind
  ) {
    if (kind === "image") return replaceUploadingPlaceholder(wrap, attachment);
    if (kind === "video") return replaceUploadingVideoPlaceholder(wrap, attachment);
    if (kind === "audio") return replaceUploadingAudioPlaceholder(wrap, attachment);
    return replaceUploadingFilePlaceholder(wrap, attachment);
  }

  function uploadFileForKind(file: File, index: number, kind: RoutedUploadKind) {
    if (kind === "image") return uploadSingleImageFile(imageStorageDir!, file, index);
    if (kind === "file") return uploadSingleFile(imageStorageDir!, file, index);
    return uploadSingleMediaFile(imageStorageDir!, file, index);
  }

  async function finishInlineUpload(
    placeholder: HTMLElement,
    uploadId: string,
    kind: RoutedUploadKind,
    uploadFile: (file: File, index: number) => Promise<Awaited<ReturnType<typeof uploadSingleMediaFile>>>,
    file: File,
    index: number
  ): Promise<"ok" | "cancelled" | "failed"> {
    const el = ref.current;
    try {
      const attachment = await uploadFile(file, index);
      const cancelled =
        abortedUploadIdsRef.current.has(uploadId) || !el?.contains(placeholder);
      abortedUploadIdsRef.current.delete(uploadId);
      if (cancelled) {
        releaseUploadFingerprint(placeholder);
        placeholder.remove();
        await deleteImagesFromStorage([attachment.storagePath]).catch(console.error);
        return "cancelled";
      }
      releaseUploadFingerprint(placeholder);
      await replacePlaceholderForKind(placeholder, attachment, kind);
      emit();
      return "ok";
    } catch (err) {
      abortedUploadIdsRef.current.delete(uploadId);
      releaseUploadFingerprint(placeholder);
      placeholder.remove();
      console.error(`task updates upload (${kind})`, err);
      setUploadError(storageUploadErrorMessage(err));
      return "failed";
    }
  }

  async function uploadInlineMedia(
    files: FileList | null,
    kind: "image" | "video" | "audio",
    createPlaceholder: (file: File) => HTMLElement,
    uploadFile: (file: File, index: number) => Promise<Awaited<ReturnType<typeof uploadSingleMediaFile>>>,
    limits: { maxMb: number; label: string }
  ) {
    const el = ref.current;
    if (!el || !imageStorageDir || !files?.length) return;
    const picked = [...files];
    const { valid, rejected } =
      kind === "image" ? partitionImageFiles(picked) : partitionMediaFiles(picked, kind);
    const { valid: unique, duplicates } = partitionUniqueFiles(valid, existingFingerprintsForEditor());
    if (unique.length === 0) {
      if (duplicates > 0) {
        setUploadError(duplicateUploadMessage(duplicates));
      } else {
        setUploadError(`${limits.label} only, max ${limits.maxMb} MB each.`);
      }
      return;
    }

    const slots = unique.map((file) => {
      const placeholder = createPlaceholder(file);
      const uploadId = stampUploadingPlaceholder(placeholder);
      trackUploadFingerprint(placeholder);
      insertNodeAtCaret(el, placeholder);
      return { file, placeholder, uploadId };
    });
    setUploadError(duplicates > 0 ? duplicateUploadMessage(duplicates, true) : null);
    bumpUploads(slots.length);
    let failures = 0;
    await Promise.allSettled(
      slots.map(async ({ file, placeholder, uploadId }, index) => {
        try {
          const routedKind: RoutedUploadKind = kind;
          const result = await finishInlineUpload(
            placeholder,
            uploadId,
            routedKind,
            uploadFile,
            file,
            index
          );
          if (result === "failed") failures++;
        } finally {
          bumpUploads(-1);
        }
      })
    );

    if (rejected > 0 || duplicates > 0 || failures > 0) {
      const parts: string[] = [];
      if (rejected > 0) {
        parts.push(`${rejected} skipped (invalid type or over ${limits.maxMb} MB)`);
      }
      if (duplicates > 0) parts.push(duplicateUploadMessage(duplicates, true));
      if (failures > 0) parts.push(`${failures} failed to upload`);
      setUploadError(parts.join("; "));
    }
  }

  function onImagePicked(files: FileList | null) {
    return uploadInlineMedia(
      files,
      "image",
      createUploadingImagePlaceholder,
      (file, index) => uploadSingleImageFile(imageStorageDir!, file, index),
      {
        maxMb: MAX_IMAGE_BYTES / (1024 * 1024),
        label: "Images",
      }
    );
  }

  function onVideoPicked(files: FileList | null) {
    return uploadInlineMedia(
      files,
      "video",
      createUploadingVideoPlaceholder,
      (file, index) => uploadSingleMediaFile(imageStorageDir!, file, index),
      {
        maxMb: MAX_VIDEO_BYTES / (1024 * 1024),
        label: "Videos",
      }
    );
  }

  function onAudioPicked(files: FileList | null) {
    return uploadInlineMedia(
      files,
      "audio",
      createUploadingAudioPlaceholder,
      (file, index) => uploadSingleMediaFile(imageStorageDir!, file, index),
      {
        maxMb: MAX_AUDIO_BYTES / (1024 * 1024),
        label: "Audio",
      }
    );
  }

  async function onAnyFilesPicked(files: FileList | null) {
    const el = ref.current;
    if (!el || !imageStorageDir || !files?.length) return;
    const picked = [...files];
    const { valid, rejected } = partitionAttachmentFiles(picked);
    const { valid: unique, duplicates } = partitionUniqueFiles(valid, existingFingerprintsForEditor());
    if (unique.length === 0) {
      if (duplicates > 0) {
        setUploadError(duplicateUploadMessage(duplicates));
      } else {
        setUploadError("Files must be under 20 MB (videos up to 100 MB).");
      }
      return;
    }

    const slots = unique.map((file) => {
      const kind = routedKindForFile(file);
      const placeholder = createPlaceholderForKind(file, kind);
      const uploadId = stampUploadingPlaceholder(placeholder);
      trackUploadFingerprint(placeholder);
      insertNodeAtCaret(el, placeholder);
      return { file, kind, placeholder, uploadId };
    });
    setUploadError(duplicates > 0 ? duplicateUploadMessage(duplicates, true) : null);
    bumpUploads(slots.length);
    let failures = 0;
    await Promise.allSettled(
      slots.map(async ({ file, kind, placeholder, uploadId }, index) => {
        try {
          const result = await finishInlineUpload(
            placeholder,
            uploadId,
            kind,
            (f, i) => uploadFileForKind(f, i, kind),
            file,
            index
          );
          if (result === "failed") failures++;
        } finally {
          bumpUploads(-1);
        }
      })
    );

    if (rejected > 0 || duplicates > 0 || failures > 0) {
      const parts: string[] = [];
      if (rejected > 0) parts.push(`${rejected} skipped (invalid or over size limit)`);
      if (duplicates > 0) parts.push(duplicateUploadMessage(duplicates, true));
      if (failures > 0) parts.push(`${failures} failed to upload`);
      setUploadError(parts.join("; "));
    }
  }

  function toggleHighlight() {
    const el = ref.current;
    if (!el) return;
    try {
      el.focus();
      if (hasHighlightInSelection(el)) {
        document.execCommand("hiliteColor", false, "transparent");
        document.execCommand("backColor", false, "transparent");
        unwrapHighlightedSpans(el);
      } else {
        document.execCommand("hiliteColor", false, RICH_TEXT_HIGHLIGHT_COLOR);
      }
      onEditInput();
    } catch (err) {
      console.error("toggleHighlight", err);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/80 ${className}`}
    >
      <div className="rich-text-toolbar flex items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
        <ToolbarBtn label="Bold" onClick={() => exec("bold")}>
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn label="Underline" onClick={() => exec("underline")}>
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn label="Highlight (click again to remove)" onClick={toggleHighlight}>
          <span className="rich-text-toolbar-highlight-mark">H</span>
        </ToolbarBtn>
        {imageStorageDir && (
          <>
            <ToolbarBtn label="Attach images" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
            </ToolbarBtn>
            <ToolbarBtn label="Attach video" onClick={() => videoRef.current?.click()}>
              <Video className="h-3.5 w-3.5" aria-hidden />
            </ToolbarBtn>
            <ToolbarBtn label="Attach audio" onClick={() => audioRef.current?.click()}>
              <Music className="h-3.5 w-3.5" aria-hidden />
            </ToolbarBtn>
            {enableGenericFileAttach && (
              <ToolbarBtn label="Attach any file" onClick={() => anyFileRef.current?.click()}>
                <FileIcon className="h-3.5 w-3.5" aria-hidden />
              </ToolbarBtn>
            )}
          </>
        )}
      </div>
      <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
          if (collapsible) activate();
          if (authorId && ref.current) ensureAuthorSpan(ref.current, authorId);
        }}
        onBlur={() => {
          focused.current = false;
          if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          emit();
        }}
        onInput={onEditInput}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" && e.key !== "Delete") return;
          requestAnimationFrame(() => {
            if (saveTimer.current) {
              clearTimeout(saveTimer.current);
              saveTimer.current = null;
            }
            emit();
          });
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          onEditInput();
        }}
        className={`simple-rich-text min-h-[4.5rem] cursor-text px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] ${bodyClampClass}`}
        style={{ minHeight }}
      />
      {imageStorageDir && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onImagePicked(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onVideoPicked(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={audioRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onAudioPicked(e.target.files);
              e.target.value = "";
            }}
          />
          {enableGenericFileAttach && (
            <input
              ref={anyFileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void onAnyFilesPicked(e.target.files);
                e.target.value = "";
              }}
            />
          )}
        </>
      )}
      </div>
      {uploadError && (
        <p className="border-t border-rose-100 px-3 py-2 text-xs text-rose-700">{uploadError}</p>
      )}
      {collapseToggle}
      <ImageLightbox
        open={lightbox !== null}
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        onNavigate={(index) => setLightbox((lb) => (lb ? { ...lb, index } : null))}
      />
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rich-text-toolbar-btn flex h-7 w-7 items-center justify-center rounded-md text-xs text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

export function SimpleRichTextView({
  html,
  className = "",
  collapsible = false,
  collapseKey,
}: {
  html: string;
  className?: string;
  collapsible?: boolean;
  collapseKey?: string;
}) {
  const safe = sanitizeTaskUpdates(html);
  const viewRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const { bodyClampClass, collapseToggle } = useCollapsibleBody(
    collapseKey,
    safe,
    collapsible,
    viewRef
  );

  useEffect(() => {
    setLightbox(null);
  }, [collapseKey, safe]);

  useLayoutEffect(() => {
    return bindLoadableImages(viewRef.current);
  }, [safe, collapseKey]);

  useEffect(() => {
    return bindLoadableImages(viewRef.current);
  }, [safe, collapseKey]);

  useEffect(() => {
    const el = viewRef.current;
    const unbindLightbox = bindInlineImageLightbox(el, (images, index) => {
      setLightbox({ images, index });
    });
    const unbindAudio = bindInlineAudioPlay(el);
    const unbindVideo = bindInlineVideoControls(el);
    return () => {
      unbindLightbox();
      unbindAudio();
      unbindVideo();
    };
  }, [safe, collapseKey]);

  if (!safe) return null;
  return (
    <>
      <div
        ref={viewRef}
        className={`simple-rich-text px-3 py-2 text-sm leading-relaxed text-slate-800 ${bodyClampClass} ${className}`}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
      {collapseToggle}
      <ImageLightbox
        open={lightbox !== null}
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        onNavigate={(index) => setLightbox((lb) => (lb ? { ...lb, index } : null))}
      />
    </>
  );
}
