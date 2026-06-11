import { useMemo, useState } from "react";
import { ExternalLink, File as FileIcon, Music, Paperclip, Video } from "lucide-react";
import type { ChatMessage, ImageAttachment, Person } from "../types";
import { attachmentMediaKind } from "../utils/imageAttachments";
import { extractUrlsFromText } from "../utils/chatLinks";
import { formatInOrgTime } from "../utils/orgTimezone";
import { useT } from "../contexts/I18nContext";
import { AttachmentMediaViewer, type MediaViewerItem } from "./AttachmentMediaViewer";

type HistoryTab = "files" | "links";

type FileEntry = {
  attachment: ImageAttachment;
  messageId: string;
  authorId: string;
  createdAt: string;
};

type LinkEntry = {
  url: string;
  messageId: string;
  authorId: string;
  createdAt: string;
};

function kindIcon(kind: ReturnType<typeof attachmentMediaKind>) {
  if (kind === "video") return Video;
  if (kind === "audio") return Music;
  if (kind === "file") return FileIcon;
  return Paperclip;
}

export function ChatConversationHistory({
  messages,
  people,
}: {
  messages: ChatMessage[];
  people: Person[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HistoryTab>("files");
  const [historyViewerIndex, setHistoryViewerIndex] = useState<number | null>(null);

  const files = useMemo(() => {
    const out: FileEntry[] = [];
    for (const m of messages) {
      for (const attachment of m.attachments ?? []) {
        out.push({
          attachment,
          messageId: m.id,
          authorId: m.authorId,
          createdAt: m.createdAt,
        });
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [messages]);

  const links = useMemo(() => {
    const out: LinkEntry[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      for (const url of extractUrlsFromText(m.body)) {
        const key = `${url}\0${m.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url, messageId: m.id, authorId: m.authorId, createdAt: m.createdAt });
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [messages]);

  const historyViewerItems: MediaViewerItem[] = useMemo(
    () =>
      files.map(({ attachment }) => ({
        url: attachment.url,
        name: attachment.name,
        kind: attachmentMediaKind(attachment),
      })),
    [files]
  );

  function authorName(id: string) {
    return people.find((p) => p.id === id)?.name.trim() || t("common.member");
  }

  function openHistoryFileAt(messageId: string, storagePath: string) {
    const idx = files.findIndex(
      (f) => f.messageId === messageId && f.attachment.storagePath === storagePath
    );
    if (idx >= 0) setHistoryViewerIndex(idx);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        aria-expanded={open}
      >
        {t("chat.history")}
        {(files.length > 0 || links.length > 0) && (
          <span className="ml-1 tabular-nums text-slate-400">
            ({files.length + links.length})
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex border-b border-slate-100">
            {(["files", "links"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 px-3 py-2 text-xs font-semibold capitalize ${
                  tab === id ? "border-b-2 border-accent text-accent" : "text-slate-500"
                }`}
              >
                {t(`chat.history.${id}`)} ({id === "files" ? files.length : links.length})
              </button>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto p-3">
            {tab === "files" ? (
              files.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">{t("chat.history.noFiles")}</p>
              ) : (
                <ul className="space-y-3">
                  {files.map(({ attachment, messageId, authorId, createdAt }) => {
                    const kind = attachmentMediaKind(attachment);
                    const Icon = kindIcon(kind);
                    return (
                      <li key={`${messageId}-${attachment.storagePath}`}>
                        <button
                          type="button"
                          onClick={() => openHistoryFileAt(messageId, attachment.storagePath)}
                          className="w-full rounded-lg border border-slate-100 p-2 text-left transition hover:bg-slate-50"
                        >
                          <div className="flex items-start gap-2">
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-800">
                                {attachment.name || kind}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {authorName(authorId)} ·{" "}
                                {formatInOrgTime(createdAt, { dateStyle: "short", timeStyle: "short" })}
                              </p>
                            </div>
                          </div>
                          {kind === "image" ? (
                            <img
                              src={attachment.url}
                              alt={attachment.name ?? t("common.attachment")}
                              className="mt-2 h-16 max-w-full rounded-lg border border-slate-200 object-contain"
                            />
                          ) : (
                            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent">
                              {t("chat.history.openViewer")}
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : links.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">{t("chat.history.noLinks")}</p>
            ) : (
              <ul className="space-y-2">
                {links.map(({ url, authorId, createdAt, messageId }) => (
                  <li key={`${messageId}-${url}`}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-slate-100 px-2.5 py-2 hover:bg-slate-50"
                    >
                      <p className="break-all text-xs font-medium text-accent">{url}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {authorName(authorId)} · {formatInOrgTime(createdAt, { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AttachmentMediaViewer
        open={historyViewerIndex !== null}
        items={historyViewerItems}
        index={historyViewerIndex ?? 0}
        onClose={() => setHistoryViewerIndex(null)}
        onNavigate={setHistoryViewerIndex}
      />
    </div>
  );
}
