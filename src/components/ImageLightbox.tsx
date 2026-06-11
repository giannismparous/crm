import { useEffect, useState } from "react";
import { isTypingOrComposingTarget } from "../utils/keyboardComposition";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { useT } from "../contexts/I18nContext";

export type LightboxImage = { url: string; alt?: string };

export function ImageLightbox({
  open,
  images,
  index,
  onClose,
  onNavigate,
}: {
  open: boolean;
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useT();
  const count = images.length;
  const safeIndex = count > 0 ? Math.min(Math.max(0, index), count - 1) : 0;
  const current = images[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < count - 1;
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [current?.url, safeIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (isTypingOrComposingTarget()) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(safeIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(safeIndex + 1);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, safeIndex, hasPrev, hasNext, onClose, onNavigate]);

  if (!open || !current) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal
      aria-label={t("attachments.imageViewer")}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label={t("common.close")}
      >
        <X className="h-5 w-5" />
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(safeIndex - 1);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:left-4"
          aria-label={t("attachments.previousImage")}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(safeIndex + 1);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:right-4"
          aria-label={t("attachments.nextImage")}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {count > 1 && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
          {safeIndex + 1} / {count}
        </p>
      )}

      <div
        className="relative flex min-h-[12rem] min-w-[16rem] max-h-[85vh] max-w-[min(92vw,1200px)] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {!imageLoaded && <ShimmerPlaceholder roundedClassName="rounded-lg" />}
        <img
          src={current.url}
          alt={current.alt ?? t("common.media.image")}
          onLoad={() => setImageLoaded(true)}
          className={`max-h-[85vh] max-w-[min(92vw,1200px)] rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
