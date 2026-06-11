import { useEffect, useRef, useState } from "react";
import { File as FileIcon, ImagePlus, Loader2, Music, Video, X } from "lucide-react";
import type { ImageAttachment, InlineMediaKind } from "../types";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../types";
import {
  attachmentMediaKind,
  deleteImageFromStorage,
  duplicateUploadMessage,
  filterValidImageFiles,
  mediaFileFingerprint,
  mediaKindForFile,
  partitionAttachmentFiles,
  partitionImageFiles,
  partitionMediaFiles,
  partitionUniqueFiles,
  storageUploadErrorMessage,
  uploadSingleFile,
  uploadSingleImageFile,
  uploadSingleMediaFile,
} from "../utils/imageAttachments";
import { useT } from "../contexts/I18nContext";
import { ImageLightbox } from "./ImageLightbox";

type PendingUpload = {
  id: string;
  previewUrl?: string;
  kind: InlineMediaKind;
  fingerprint: string;
  name: string;
};

type DisplayItem =
  | { kind: "pending"; pending: PendingUpload }
  | { kind: "attachment"; attachment: ImageAttachment; index: number };

function maxMbForKind(kind: InlineMediaKind): number {
  if (kind === "video") return MAX_VIDEO_BYTES / (1024 * 1024);
  if (kind === "audio") return MAX_AUDIO_BYTES / (1024 * 1024);
  return MAX_IMAGE_BYTES / (1024 * 1024);
}

function kindLabel(kind: InlineMediaKind, t: ReturnType<typeof useT>): string {
  if (kind === "video") return t("common.media.videos");
  if (kind === "audio") return t("common.media.audio");
  if (kind === "file") return t("common.media.files");
  return t("common.media.images");
}

function existingFingerprints(
  attachments: ImageAttachment[],
  pending: PendingUpload[],
  inFlight: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>();
  for (const a of attachments) {
    if (a.fingerprint) out.add(a.fingerprint);
  }
  for (const p of pending) out.add(p.fingerprint);
  for (const fp of inFlight) out.add(fp);
  return out;
}

/** Image / video / audio picker + previews anchored inside a text field (bottom-right). */
export function InlineImageAttachments({
  files,
  onChange,
  storageDir,
  attachments,
  onAttachmentsChange,
  onUploadingChange,
  disabled,
  uploading,
  uploadingIndices,
}: {
  /** Deferred mode: local files until parent uploads on submit. */
  files?: File[];
  onChange?: (files: File[]) => void;
  /** Immediate mode: upload to Storage as soon as files are picked. */
  storageDir?: string;
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  /** When true, all previews show a loading overlay (deferred mode). */
  uploading?: boolean;
  /** Per-preview loading in deferred mode. */
  uploadingIndices?: ReadonlySet<number>;
}) {
  const t = useT();
  const uploadMode = Boolean(storageDir && onAttachmentsChange);
  const fileList = files ?? [];
  const attachmentList = attachments ?? [];

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const uploadsBusy = uploading || (uploadMode && pending.length > 0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [player, setPlayer] = useState<{
    url: string;
    kind: "video" | "audio";
    name: string;
  } | null>(null);
  const abortedRef = useRef(new Set<string>());
  const inFlightFingerprintsRef = useRef(new Set<string>());
  const attachmentsRef = useRef(attachmentList);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    attachmentsRef.current = attachmentList;
  }, [attachmentList]);

  useEffect(() => {
    if (!uploadMode) {
      const urls = fileList.map((f) => URL.createObjectURL(f));
      setFilePreviews(urls);
      return () => urls.forEach((u) => URL.revokeObjectURL(u));
    }
    return undefined;
  }, [fileList, uploadMode]);

  useEffect(() => {
    onUploadingChange?.(pending.length > 0);
  }, [pending.length, onUploadingChange]);

  const displayItems: DisplayItem[] = uploadMode
    ? [
        ...pending.map((p) => ({ kind: "pending" as const, pending: p })),
        ...attachmentList.map((attachment, index) => ({
          kind: "attachment" as const,
          attachment,
          index,
        })),
      ]
    : [];

  const itemCount = uploadMode ? displayItems.length : fileList.length;

  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= itemCount) setLightboxIndex(null);
  }, [itemCount, lightboxIndex]);

  function resolveUploadKind(file: File): InlineMediaKind {
    const kind = mediaKindForFile(file);
    if (!kind) return "file";
    if (kind === "image") return partitionImageFiles([file]).valid.length > 0 ? "image" : "file";
    return partitionMediaFiles([file], kind).valid.length > 0 ? kind : "file";
  }

  function commitAttachments(updater: (prev: ImageAttachment[]) => ImageAttachment[]) {
    if (!onAttachmentsChange) return;
    const next = updater(attachmentsRef.current);
    attachmentsRef.current = next;
    onAttachmentsChange(next);
  }

  async function uploadPickedFile(file: File, uploadIndex = 0) {
    if (!storageDir || !onAttachmentsChange) return;
    const mediaKind = resolveUploadKind(file);
    const id = crypto.randomUUID();
    const fingerprint = mediaFileFingerprint(file);
    const previewUrl = URL.createObjectURL(file);
    const slot = {
      id,
      previewUrl,
      kind: mediaKind,
      fingerprint,
      name: file.name || kindLabel(mediaKind, t),
    };
    inFlightFingerprintsRef.current.add(fingerprint);
    pendingRef.current = [...pendingRef.current, slot];
    setPending(pendingRef.current);
    try {
      const uploaded =
        mediaKind === "file"
          ? await uploadSingleFile(storageDir, file, uploadIndex)
          : mediaKind === "image"
            ? await uploadSingleImageFile(storageDir, file, uploadIndex)
            : await uploadSingleMediaFile(storageDir, file, uploadIndex);
      if (abortedRef.current.has(id)) {
        abortedRef.current.delete(id);
        await deleteImageFromStorage(uploaded.storagePath).catch(console.error);
      } else {
        commitAttachments((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      console.error("inline media upload", err);
      setError(storageUploadErrorMessage(err));
    } finally {
      inFlightFingerprintsRef.current.delete(fingerprint);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      pendingRef.current = pendingRef.current.filter((p) => p.id !== id);
      setPending(pendingRef.current);
    }
  }

  function addFiles(incoming: FileList | null, mediaKind: InlineMediaKind) {
    if (!incoming?.length || disabled || uploadsBusy) return;
    const picked = [...incoming];
    const limits = { maxMb: maxMbForKind(mediaKind), label: kindLabel(mediaKind, t) };

    if (uploadMode) {
      const { valid, rejected } =
        mediaKind === "image"
          ? partitionImageFiles(picked)
          : partitionMediaFiles(picked, mediaKind);
      const { valid: unique, duplicates } = partitionUniqueFiles(
        valid,
        existingFingerprints(attachmentList, pendingRef.current, inFlightFingerprintsRef.current)
      );
      if (unique.length === 0) {
        if (duplicates > 0) {
          setError(duplicateUploadMessage(duplicates));
        } else {
          setError(`${limits.label} only, max ${limits.maxMb} MB each.`);
        }
        return;
      }
      const parts: string[] = [];
      if (rejected > 0) parts.push(`${rejected} skipped (invalid or over ${limits.maxMb} MB)`);
      if (duplicates > 0) parts.push(duplicateUploadMessage(duplicates, true));
      setError(parts.length > 0 ? parts.join("; ") : null);
      unique.forEach((file, index) => void uploadPickedFile(file, index));
      return;
    }

    if (!onChange) return;
    const rejected = picked.filter((f) => {
      const kind =
        f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "image";
      if (kind === "video") return f.size <= 0 || f.size > MAX_VIDEO_BYTES;
      if (kind === "audio") return f.size <= 0 || f.size > MAX_AUDIO_BYTES;
      return !f.type.startsWith("image/") || f.size <= 0 || f.size > MAX_IMAGE_BYTES;
    });
    const merged = filterValidImageFiles([...fileList, ...picked]);
    if (rejected.length > 0 && merged.length === fileList.length) {
      setError(`Images only, max ${MAX_IMAGE_BYTES / (1024 * 1024)} MB each.`);
      return;
    }
    setError(null);
    onChange(merged);
  }

  function addAnyFiles(incoming: FileList | null) {
    if (!incoming?.length || disabled || uploadsBusy) return;
    const picked = [...incoming];

    if (uploadMode) {
      const { valid, rejected } = partitionAttachmentFiles(picked);
      const { valid: unique, duplicates } = partitionUniqueFiles(
        valid,
        existingFingerprints(attachmentList, pendingRef.current, inFlightFingerprintsRef.current)
      );
      if (unique.length === 0) {
        if (duplicates > 0) {
          setError(duplicateUploadMessage(duplicates));
        } else {
          setError(t("common.fileSizeLimit"));
        }
        return;
      }
      const parts: string[] = [];
      if (rejected > 0) parts.push(`${rejected} skipped (invalid or over size limit)`);
      if (duplicates > 0) parts.push(duplicateUploadMessage(duplicates, true));
      setError(parts.length > 0 ? parts.join("; ") : null);
      unique.forEach((file, index) => void uploadPickedFile(file, index));
      return;
    }

    if (!onChange) return;
    const { valid, rejected } = partitionAttachmentFiles(picked);
    const merged = [...fileList, ...valid];
    if (rejected > 0 && valid.length === 0) {
      setError(t("common.fileSizeLimit"));
      return;
    }
    setError(rejected > 0 ? `${rejected} skipped (invalid or over size limit)` : null);
    onChange(merged);
  }

  function removeFileAt(i: number) {
    onChange?.(fileList.filter((_, idx) => idx !== i));
  }

  function removePending(id: string) {
    abortedRef.current.add(id);
    const slot = pendingRef.current.find((p) => p.id === id);
    if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    if (slot?.fingerprint) inFlightFingerprintsRef.current.delete(slot.fingerprint);
    pendingRef.current = pendingRef.current.filter((p) => p.id !== id);
    setPending(pendingRef.current);
  }

  async function removeAttachmentAt(i: number) {
    const att = attachmentList[i];
    if (!att || !onAttachmentsChange) return;
    try {
      await deleteImageFromStorage(att.storagePath);
      commitAttachments((prev) => prev.filter((_, idx) => idx !== i));
    } catch (err) {
      console.error("inline media delete", err);
      setError(storageUploadErrorMessage(err));
    }
  }

  function openAttachment(item: DisplayItem) {
    if (item.kind === "pending") {
      const p = item.pending;
      if (!p.previewUrl) return;
      if (p.kind === "image") {
        const imageOnly = displayItems.filter(
          (d) =>
            d.kind === "pending"
              ? d.pending.kind === "image" && d.pending.previewUrl
              : attachmentMediaKind(d.attachment) === "image"
        );
        setLightboxIndex(imageOnly.indexOf(item));
        return;
      }
      if (p.kind === "video" || p.kind === "audio") {
        setPlayer({ url: p.previewUrl, kind: p.kind, name: p.name });
        return;
      }
      if (p.kind === "file") {
        window.open(p.previewUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    const att = item.attachment;
    const mediaKind = attachmentMediaKind(att);
    if (mediaKind === "image") {
      const imageOnly = displayItems.filter(
        (d) => d.kind === "attachment" && attachmentMediaKind(d.attachment) === "image"
      );
      setLightboxIndex(imageOnly.findIndex((d) => d.kind === "attachment" && d.index === item.index));
      return;
    }
    if (mediaKind === "file") {
      window.open(att.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (mediaKind === "video" || mediaKind === "audio") {
      setPlayer({ url: att.url, kind: mediaKind, name: att.name ?? t("common.attachment") });
    }
  }

  const lightboxImages = uploadMode
    ? displayItems
        .filter(
          (item) =>
            item.kind === "pending"
              ? item.pending.kind === "image" && item.pending.previewUrl
              : attachmentMediaKind(item.attachment) === "image"
        )
        .map((item) =>
          item.kind === "pending"
            ? { url: item.pending.previewUrl!, alt: item.pending.name }
            : { url: item.attachment.url, alt: item.attachment.name ?? t("common.attachment") }
        )
    : filePreviews.map((url, i) => ({ url, alt: fileList[i]?.name ?? t("common.attachment") }));

  function renderMediaThumb(
    mediaKind: InlineMediaKind,
    src: string | undefined,
    name: string,
    fileUploading: boolean,
    onView: () => void,
    onRemove: () => void,
    key: string
  ) {
    return (
      <div
        key={key}
        className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-slate-200/90 bg-slate-100 shadow-sm"
      >
        <button
          type="button"
          onClick={onView}
          className="flex h-full w-full items-center justify-center"
          aria-label={
            fileUploading
              ? mediaKind === "image"
                ? t("richText.previewUploadingImage")
                : mediaKind === "video"
                  ? t("richText.playUploadingVideo")
                  : mediaKind === "audio"
                    ? t("richText.playUploadingAudio")
                    : t("richText.openUploadingFile")
              : mediaKind === "image"
                ? t("richText.viewImage")
                : mediaKind === "video"
                  ? t("richText.playVideo")
                  : mediaKind === "audio"
                    ? t("richText.playAudio")
                    : t("richText.openFile")
          }
          title={name}
        >
          {mediaKind === "image" && src ? (
            <img
              src={src}
              alt=""
              className={`h-full w-full object-cover ${fileUploading ? "opacity-50" : ""}`}
            />
          ) : mediaKind === "video" ? (
            <Video className={`h-3.5 w-3.5 text-slate-600 ${fileUploading ? "opacity-50" : ""}`} />
          ) : mediaKind === "audio" ? (
            <Music className={`h-3.5 w-3.5 text-slate-600 ${fileUploading ? "opacity-50" : ""}`} />
          ) : (
            <FileIcon className={`h-3.5 w-3.5 text-slate-600 ${fileUploading ? "opacity-50" : ""}`} />
          )}
        </button>
        {fileUploading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
          </div>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="absolute right-0 top-0 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-bl-md bg-black/70 text-white hover:bg-rose-600 disabled:opacity-40"
          aria-label={fileUploading ? t("richText.cancelUpload") : t("richText.removeAttachment")}
        >
          <X className="h-2 w-2" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-2 bottom-1.5 flex items-end justify-between gap-2"
        aria-hidden={false}
      >
        <div className="pointer-events-auto flex min-h-[1.75rem] flex-1 flex-wrap items-center gap-1">
          {uploadMode
            ? displayItems.map((item) => {
                const fileUploading = item.kind === "pending";
                if (item.kind === "pending") {
                  const p = item.pending;
                  return renderMediaThumb(
                    p.kind,
                    p.previewUrl,
                    p.name,
                    fileUploading,
                    () => openAttachment(item),
                    () => removePending(p.id),
                    p.id
                  );
                }
                const att = item.attachment;
                const mediaKind = attachmentMediaKind(att);
                return renderMediaThumb(
                  mediaKind,
                  mediaKind === "image" ? att.url : undefined,
                  att.name ?? t("common.attachment"),
                  false,
                  () => openAttachment(item),
                  () => void removeAttachmentAt(item.index),
                  att.storagePath
                );
              })
            : filePreviews.map((src, i) => {
                const fileUploading = uploadingIndices?.has(i) ?? uploading ?? false;
                return renderMediaThumb(
                  "image",
                  src,
                  fileList[i]?.name ?? t("common.attachment"),
                  Boolean(fileUploading),
                  () => setLightboxIndex(i),
                  () => removeFileAt(i),
                  `${i}-${src}`
                );
              })}
          {error && <span className="text-[10px] text-rose-600">{error}</span>}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={disabled || uploadsBusy}
            onClick={() => imageInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
            title={t("richText.attachImages")}
            aria-label={t("richText.attachImages")}
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled || uploadsBusy}
            onClick={() => videoInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
            title={t("richText.attachVideo")}
            aria-label={t("richText.attachVideo")}
          >
            <Video className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled || uploadsBusy}
            onClick={() => audioInputRef.current?.click()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
            title={t("richText.attachAudio")}
            aria-label={t("richText.attachAudio")}
          >
            <Music className="h-3.5 w-3.5" aria-hidden />
          </button>
          {uploadMode && (
            <button
              type="button"
              disabled={disabled || uploadsBusy}
              onClick={() => anyFileInputRef.current?.click()}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200/90 bg-white/95 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
              title={t("richText.attachFile")}
              aria-label={t("richText.attachFile")}
            >
              <FileIcon className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, "image");
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, "video");
          e.target.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files, "audio");
          e.target.value = "";
        }}
      />
      <input
        ref={anyFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addAnyFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <ImageLightbox
        open={lightboxIndex !== null}
        images={lightboxImages}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
      {player && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal
          aria-label={player.name}
          onClick={() => setPlayer(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 truncate text-sm font-medium text-slate-900">{player.name}</p>
            {player.kind === "video" ? (
              <video
                src={player.url}
                controls
                playsInline
                disablePictureInPicture
                className="max-h-[60vh] w-full rounded-lg bg-black"
              />
            ) : (
              <audio src={player.url} controls className="w-full" />
            )}
            <button
              type="button"
              onClick={() => setPlayer(null)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
