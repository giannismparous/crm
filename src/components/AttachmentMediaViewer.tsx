import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, File as FileIcon, Music, X } from "lucide-react";
import type { InlineMediaKind } from "../types";
import { useT } from "../contexts/I18nContext";
import { isTypingOrComposingTarget } from "../utils/keyboardComposition";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";

export type MediaViewerItem = {
  url: string;
  name?: string;
  kind: InlineMediaKind;
};

function kindLabel(kind: InlineMediaKind, t: ReturnType<typeof useT>): string {
  if (kind === "video") return t("common.media.video");
  if (kind === "audio") return t("common.media.audio");
  if (kind === "file") return t("common.media.file");
  return t("common.media.image");
}

export function AttachmentMediaViewer({
  open,
  items,
  index,
  onClose,
  onNavigate,
}: {
  open: boolean;
  items: MediaViewerItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useT();
  const count = items.length;
  const safeIndex = count > 0 ? Math.min(Math.max(0, index), count - 1) : 0;
  const current = items[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < count - 1;
  const [mediaReady, setMediaReady] = useState(false);

  useEffect(() => {
    setMediaReady(false);
  }, [current?.url, current?.kind, safeIndex]);

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

  const title = current.name?.trim() || kindLabel(current.kind, t);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal
      aria-label={t("attachments.viewerAria", { kind: kindLabel(current.kind, t) })}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
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
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:left-4"
          aria-label={t("attachments.previous")}
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
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:right-4"
          aria-label={t("attachments.next")}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {count > 1 && (
        <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
          {safeIndex + 1} / {count}
        </p>
      )}

      <div
        className="relative flex max-h-[85vh] w-full max-w-[min(92vw,1200px)] flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 max-w-full truncate px-8 text-center text-sm font-medium text-white/90">
          {title}
        </p>

        {current.kind === "image" && (
          <div className="relative flex min-h-[12rem] min-w-[16rem] max-h-[75vh] w-full items-center justify-center">
            {!mediaReady && <ShimmerPlaceholder roundedClassName="rounded-lg" />}
            <img
              src={current.url}
              alt={title}
              onLoad={() => setMediaReady(true)}
              onError={() => setMediaReady(true)}
              className={`max-h-[75vh] max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${mediaReady ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        )}

        {current.kind === "video" && (
          <video
            key={current.url}
            src={current.url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[75vh] w-full rounded-lg bg-black shadow-2xl"
            onLoadedData={() => setMediaReady(true)}
          />
        )}

        {current.kind === "audio" && (
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-center">
              <Music className="h-12 w-12 text-accent" aria-hidden />
            </div>
            <audio
              key={current.url}
              src={current.url}
              controls
              preload="metadata"
              className="w-full"
              onLoadedData={() => setMediaReady(true)}
            />
          </div>
        )}

        {current.kind === "file" && (
          <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-2xl">
            <FileIcon className="mx-auto h-14 w-14 text-slate-400" aria-hidden />
            <p className="mt-4 break-all text-sm font-medium text-slate-900">{title}</p>
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dim"
              onClick={() => setMediaReady(true)}
            >
              {t("attachments.openFile")}
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
