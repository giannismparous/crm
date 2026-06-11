import { linkifySegments } from "../utils/chatLinks";

export function ChatMessageBody({
  body,
  className = "",
  linkClassName = "underline underline-offset-2",
}: {
  body: string;
  className?: string;
  linkClassName?: string;
}) {
  if (!body.trim()) return null;
  const segments = linkifySegments(body);
  return (
    <p className={`whitespace-pre-wrap text-sm leading-relaxed ${className}`.trim()}>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={`${i}-${seg.value}`}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            {seg.value}
          </a>
        ) : (
          <span key={`${i}-t`}>{seg.value}</span>
        )
      )}
    </p>
  );
}
