import { useEffect, useState } from "react";
import { File as FileIcon, Music, Trash2, Video } from "lucide-react";
import type { ImageAttachment } from "../types";
import { attachmentMediaKind } from "../utils/imageAttachments";
import { AttachmentMediaViewer, type MediaViewerItem } from "./AttachmentMediaViewer";
import { useT } from "../contexts/I18nContext";
import { LoadableImage } from "./LoadableImage";

export function ImageAttachmentGallery({
  attachments,
  size = "md",
  layout = "thumbs",
  onDelete,
  deletingPath,
  scopeKey,
}: {
  attachments?: ImageAttachment[];
  size?: "sm" | "md";
  /** `chat` — inline previews that fit message width; `thumbs` — compact grid. */
  layout?: "thumbs" | "chat";
  onDelete?: (attachment: ImageAttachment) => void | Promise<void>;
  deletingPath?: string | null;
  scopeKey?: string;
}) {
  const t = useT();
  const list = attachments ?? [];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const listSignature = list.map((a) => a.storagePath).join("\0");

  useEffect(() => {
    setViewerIndex(null);
  }, [scopeKey, listSignature]);

  if (list.length === 0) return null;

  const viewerItems: MediaViewerItem[] = list.map((attachment) => ({
    url: attachment.url,
    name: attachment.name,
    kind: attachmentMediaKind(attachment),
  }));

  const dim = size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const isChat = layout === "chat";

  function openAt(index: number) {
    setViewerIndex(index);
  }

  return (
    <>
      <div className={isChat ? "mt-1.5 flex max-w-full flex-col gap-2" : "mt-2 flex flex-wrap gap-2"}>
        {list.map((a, i) => {
          const deleting = deletingPath === a.storagePath;
          const kind = attachmentMediaKind(a);
          const label =
            a.name ??
            (kind === "image"
              ? t("richText.viewImage")
              : kind === "video"
                ? t("richText.playVideo")
                : kind === "audio"
                  ? t("richText.playAudio")
                  : t("richText.openFile"));

          if (isChat) {
            return (
              <div key={a.storagePath} className="group relative max-w-full">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => openAt(i)}
                  className="block max-w-full overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/80 ring-1 ring-black/5 transition hover:ring-accent/40 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                  title={label}
                >
                  {kind === "image" ? (
                    <LoadableImage
                      src={a.url}
                      alt={a.name ?? t("common.attachment")}
                      className="max-h-52 w-full"
                      roundedClassName="rounded-lg"
                      imgClassName="mx-auto max-h-52 w-full object-contain"
                    />
                  ) : (
                    <span className="flex min-h-[3.5rem] max-w-full items-center gap-2 px-3 py-2.5 text-left">
                      {kind === "video" ? (
                        <Video className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                      ) : kind === "audio" ? (
                        <Music className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                      ) : (
                        <FileIcon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
                      )}
                      <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                        {a.name ?? kindLabel(kind, t)}
                      </span>
                    </span>
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
                    className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
                    aria-label={t("richText.deleteAttachment")}
                    title={t("richText.deleteAttachment")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          }

          return (
            <div key={a.storagePath} className={`group relative ${dim} shrink-0`}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => openAt(i)}
                className={`${dim} relative flex items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ring-1 ring-black/5 transition hover:ring-accent/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50`}
                title={label}
              >
                {kind === "image" ? (
                  <LoadableImage
                    src={a.url}
                    alt={a.name ?? t("common.attachment")}
                    className="absolute inset-0"
                    roundedClassName="rounded-lg"
                    imgClassName="object-cover"
                  />
                ) : kind === "video" ? (
                  <Video className="h-6 w-6 text-slate-600" aria-hidden />
                ) : kind === "audio" ? (
                  <Music className="h-6 w-6 text-slate-600" aria-hidden />
                ) : (
                  <span className="px-1 text-[10px] font-bold uppercase text-slate-600">
                    {t("common.media.file")}
                  </span>
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
                  aria-label={t("richText.deleteAttachment")}
                  title={t("richText.deleteAttachment")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AttachmentMediaViewer
        open={viewerIndex !== null}
        items={viewerItems}
        index={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onNavigate={setViewerIndex}
      />
    </>
  );
}

function kindLabel(kind: MediaViewerItem["kind"], t: ReturnType<typeof useT>): string {
  if (kind === "video") return t("common.media.video");
  if (kind === "audio") return t("common.media.audio");
  if (kind === "file") return t("common.media.file");
  return t("common.media.image");
}
