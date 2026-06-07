import { useEffect, useState } from "react";
import { Music, Trash2, Video } from "lucide-react";
import type { ImageAttachment } from "../types";
import { attachmentMediaKind } from "../utils/imageAttachments";
import { ImageLightbox } from "./ImageLightbox";
import { LoadableImage } from "./LoadableImage";

export function ImageAttachmentGallery({
  attachments,
  size = "md",
  onDelete,
  deletingPath,
  /** Unique id for this gallery — resets viewer when scope changes (per comment, reply, etc.). */
  scopeKey,
}: {
  attachments?: ImageAttachment[];
  size?: "sm" | "md";
  /** When set, shows a trash icon on each thumbnail (caller handles storage + Firestore). */
  onDelete?: (attachment: ImageAttachment) => void | Promise<void>;
  deletingPath?: string | null;
  scopeKey?: string;
}) {
  const list = attachments ?? [];
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [player, setPlayer] = useState<{
    url: string;
    kind: "video" | "audio";
    name: string;
  } | null>(null);
  const listSignature = list.map((a) => a.storagePath).join("\0");

  useEffect(() => {
    setLightboxIndex(null);
    setPlayer(null);
  }, [scopeKey, listSignature]);

  if (list.length === 0) return null;

  const dim = size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const imageItems = list
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ attachment }) => attachmentMediaKind(attachment) === "image");
  const images = imageItems.map(({ attachment }) => ({
    url: attachment.url,
    alt: attachment.name ?? "Attachment",
  }));

  function openItem(attachment: ImageAttachment, index: number) {
    const kind = attachmentMediaKind(attachment);
    if (kind === "image") {
      const imageIndex = imageItems.findIndex((item) => item.index === index);
      if (imageIndex >= 0) setLightboxIndex(imageIndex);
      return;
    }
    if (kind === "file") {
      window.open(attachment.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (kind === "video" || kind === "audio") {
      setPlayer({
        url: attachment.url,
        kind,
        name: attachment.name ?? (kind === "video" ? "Video" : "Audio"),
      });
    }
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((a, i) => {
          const deleting = deletingPath === a.storagePath;
          const kind = attachmentMediaKind(a);
          return (
            <div key={a.storagePath} className={`group relative ${dim} shrink-0`}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => openItem(a, i)}
                className={`${dim} relative flex items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ring-1 ring-black/5 transition hover:ring-accent/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50`}
                title={a.name ?? (kind === "image" ? "View image" : kind === "video" ? "Play video" : "Play audio")}
              >
                {kind === "image" ? (
                  <LoadableImage
                    src={a.url}
                    alt={a.name ?? "Attachment"}
                    className="absolute inset-0"
                    roundedClassName="rounded-lg"
                    imgClassName="object-cover"
                  />
                ) : kind === "video" ? (
                  <Video className="h-6 w-6 text-slate-600" aria-hidden />
                ) : kind === "audio" ? (
                  <Music className="h-6 w-6 text-slate-600" aria-hidden />
                ) : (
                  <span className="px-1 text-[10px] font-bold uppercase text-slate-600">File</span>
                )}
              </button>
              {onDelete && (
                <button
                  type="button"
                  disabled={deleting}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onDelete(a);
                  }}
                  className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
                  aria-label="Delete attachment"
                  title="Delete attachment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <ImageLightbox
        open={lightboxIndex !== null}
        images={images}
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
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
