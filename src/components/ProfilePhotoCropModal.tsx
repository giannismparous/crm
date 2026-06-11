import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, X, ZoomIn } from "lucide-react";
import { MAX_IMAGE_BYTES } from "../types";
import { storagePathFromDownloadUrl } from "../utils/imageAttachments";
import { fetchPersonAvatarBlob, renderCircularAvatarBlob } from "../utils/personAvatar";
import { useT } from "../contexts/I18nContext";

const VIEWPORT = 280;
const MAX_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export function ProfilePhotoCropModal({
  open,
  onClose,
  onSave,
  onRemove,
  existingPhotoUrl,
  existingPhotoStoragePath,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => void | Promise<void>;
  onRemove?: () => void;
  existingPhotoUrl?: string;
  existingPhotoStoragePath?: string;
  saving?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Storage path for re-crop save (Firebase getBytes — needs bucket CORS). */
  const existingPathRef = useRef<string | undefined>(undefined);
  /** True when preview uses a remote URL (display works; save needs getBytes). */
  const remotePreviewRef = useRef(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  function revokeObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function resetCrop() {
    revokeObjectUrl();
    existingPathRef.current = undefined;
    remotePreviewRef.current = false;
    setImage(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setLoadingImage(false);
  }

  function mountImage(img: HTMLImageElement, localUrl?: string, storagePath?: string) {
    revokeObjectUrl();
    if (localUrl) objectUrlRef.current = localUrl;
    existingPathRef.current = storagePath;
    remotePreviewRef.current = false;
    setImage(img);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoadingImage(false);
  }

  function mountRemotePreview(img: HTMLImageElement, storagePath?: string) {
    existingPathRef.current = storagePath;
    remotePreviewRef.current = true;
    setImage(img);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoadingImage(false);
  }

  function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(t("profilePhoto.error.loadImage")));
      };
      img.src = url;
    });
  }

  function isImageBlob(blob: Blob): boolean {
    if (blob.size <= 0 || blob.size > MAX_IMAGE_BYTES) return false;
    if (blob.type.startsWith("image/")) return true;
    return !blob.type || blob.type === "application/octet-stream";
  }

  function loadBlob(blob: Blob): Promise<boolean> {
    if (!isImageBlob(blob)) {
      setError(t("profilePhoto.error.choosePhoto", { maxMb: MAX_MB }));
      setLoadingImage(false);
      return Promise.resolve(false);
    }
    setError(null);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    return new Promise((resolve) => {
      img.onload = () => {
        mountImage(img, url);
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setError(t("profilePhoto.error.loadThatImage"));
        setLoadingImage(false);
        resolve(false);
      };
      img.src = url;
    });
  }

  function loadFile(file: File) {
    loadBlob(file);
  }

  async function loadExistingPhoto(url: string, storagePath?: string) {
    setLoadingImage(true);
    setError(null);

    const path = storagePath?.trim() || (url ? storagePathFromDownloadUrl(url) : null) || undefined;

    // Plain <img> load — no CORS required for preview (unlike fetch / getBytes / crossOrigin).
    if (url) {
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("load failed"));
          img.src = url;
        });
        mountRemotePreview(img, path);
        return;
      } catch {
        /* fall through */
      }
    }

    if (path) {
      try {
        if (await loadBlob(await fetchPersonAvatarBlob(path))) {
          existingPathRef.current = path;
          return;
        }
      } catch {
        /* fall through */
      }
    }

    if (url) {
      setError(t("profilePhoto.error.loadCurrent"));
    }
    setLoadingImage(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) {
      resetCrop();
      return;
    }
    const url = existingPhotoUrl?.trim() ?? "";
    const path = existingPhotoStoragePath?.trim();
    if (!url && !path) return;
    void loadExistingPhoto(url, path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when modal opens with this photo
  }, [open, existingPhotoUrl, existingPhotoStoragePath]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!image || saving || loadingImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.ox + (e.clientX - drag.x),
      y: drag.oy + (e.clientY - drag.y),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function resolveExportImage(): Promise<HTMLImageElement> {
    if (!image) throw new Error(t("profilePhoto.error.noImage"));
    const path = existingPathRef.current?.trim();
    if (!remotePreviewRef.current || !path) return image;
    return imageFromBlob(await fetchPersonAvatarBlob(path));
  }

  async function handleSave() {
    if (!image || saving) return;
    setRendering(true);
    setError(null);
    let exportUrl: string | null = null;
    try {
      const exportImage = await resolveExportImage();
      if (exportImage.src.startsWith("blob:")) exportUrl = exportImage.src;
      const blob = await renderCircularAvatarBlob(exportImage, scale, offset.x, offset.y, VIEWPORT);
      await onSave(blob);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "storage/unauthorized" || code === "storage/unauthenticated") {
        setError(t("profilePhoto.error.saveCrop"));
      } else if (remotePreviewRef.current) {
        setError(t("profilePhoto.error.saveCors"));
      } else {
        setError(err instanceof Error ? err.message : t("profilePhoto.error.saveFailed"));
      }
    } finally {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      setRendering(false);
    }
  }

  if (!open) return null;

  const busy = saving || rendering || loadingImage;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal
      aria-label={t("profilePhoto.aria")}
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900">{t("profilePhoto.aria")}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{t("profilePhoto.hint")}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="relative mx-auto mt-4 overflow-hidden rounded-full bg-slate-100 ring-4 ring-slate-200/80"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {image ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={(() => {
                const base = Math.max(
                  VIEWPORT / image.naturalWidth,
                  VIEWPORT / image.naturalHeight
                );
                const drawScale = base * scale;
                const drawW = image.naturalWidth * drawScale;
                const drawH = image.naturalHeight * drawScale;
                return {
                  left: (VIEWPORT - drawW) / 2 + offset.x,
                  top: (VIEWPORT - drawH) / 2 + offset.y,
                  width: drawW,
                  height: drawH,
                };
              })()}
            />
          ) : loadingImage ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" aria-label={t("profilePhoto.loadingAria")} />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
              <ZoomIn className="h-8 w-8 opacity-60" aria-hidden />
              <p className="text-xs">{t("profilePhoto.chooseToCrop")}</p>
            </div>
          )}
        </div>

        {image && (
          <label className="mt-4 block">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden />
              {t("profilePhoto.zoom")}
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={scale}
              disabled={busy}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>
        )}

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {image ? t("profilePhoto.chooseAnother") : t("profilePhoto.choosePhoto")}
          </button>
          <button
            type="button"
            disabled={!image || busy}
            onClick={() => void handleSave()}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(saving || rendering) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("profilePhoto.savePhoto")}
          </button>
          {onRemove && (existingPhotoUrl || existingPhotoStoragePath) && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="inline-flex w-full basis-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 hover:border-rose-400 active:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:basis-auto"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              {t("profilePhoto.removePhoto")}
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
