import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { MAX_IMAGE_BYTES } from "../types";
import { filterValidImageFiles } from "../utils/imageAttachments";
import { LoadableImage } from "./LoadableImage";
import { useT } from "../contexts/I18nContext";

export function ImageAttachmentPicker({
  files,
  onChange,
  disabled,
  label,
  uploadingIndices,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  uploadingIndices?: ReadonlySet<number>;
}) {
  const t = useT();
  const pickerLabel = label ?? t("common.media.images");
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function syncPreviews(next: File[]) {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return;
    const rejected = [...incoming].filter(
      (f) => !f.type.startsWith("image/") || f.size <= 0 || f.size > MAX_IMAGE_BYTES
    );
    const merged = filterValidImageFiles([...files, ...incoming]);
    if (rejected.length > 0 && merged.length === files.length) {
      setError(t("attachments.imagesOnly", { mb: MAX_IMAGE_BYTES / (1024 * 1024) }));
      return;
    }
    setError(null);
    onChange(merged);
    syncPreviews(merged);
  }

  function removeAt(index: number) {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
    syncPreviews(next);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {pickerLabel}
        </button>
        {files.length > 0 && (
          <span className="text-[11px] text-slate-500">
            {t("attachments.attachedCount", { count: files.length })}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => {
            const fileUploading = uploadingIndices?.has(i) ?? false;
            return (
              <div key={src} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200">
                <LoadableImage
                  src={src}
                  alt=""
                  className="absolute inset-0"
                  roundedClassName="rounded-lg"
                  imgClassName={`object-cover ${fileUploading ? "opacity-50" : ""}`}
                />
                {fileUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/45">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                  </div>
                )}
                <button
                  type="button"
                  disabled={disabled || fileUploading}
                  onClick={() => removeAt(i)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
                  aria-label={t("attachments.removeImage")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
