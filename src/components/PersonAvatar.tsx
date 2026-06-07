import type { CSSProperties } from "react";
import type { Person } from "../types";
import { personAvatarGradient, personInitials } from "../utils/personAvatar";
import { LoadableImage } from "./LoadableImage";

export const PERSON_AVATAR_SIZE_CLASS = {
  "2xs": "h-4 w-4 text-[7px]",
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-16 w-16 text-sm",
  xl: "h-24 w-24 text-xl",
  "2xl": "h-36 w-36 text-3xl",
} as const;

/** Assignee / author avatars in task cards, comments, appointments footers, etc. */
export const PERSON_AVATAR_INLINE_SIZE: keyof typeof PERSON_AVATAR_SIZE_CLASS = "sm";

export function PersonAvatar({
  person,
  name,
  avatarUrl,
  size = "md",
  className = "",
  style,
}: {
  person?: Pick<Person, "name" | "avatarUrl">;
  name?: string;
  avatarUrl?: string;
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  className?: string;
  style?: CSSProperties;
}) {
  const displayName = person?.name?.trim() || name?.trim() || "Member";
  const url = person?.avatarUrl?.trim() || avatarUrl?.trim() || "";
  const initials = personInitials(displayName);
  const gradient = personAvatarGradient(displayName);

  return (
    <span
      className={`avatar-ring relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ${PERSON_AVATAR_SIZE_CLASS[size]} ${className}`}
      style={style}
      title={displayName}
      aria-hidden={!url}
    >
      {url ? (
        <LoadableImage
          src={url}
          alt=""
          roundedClassName="rounded-full"
          className="absolute inset-0"
          imgClassName="object-cover"
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center bg-gradient-to-br font-semibold tracking-tight text-white ${gradient}`}
          aria-label={displayName}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

/** Name + avatar for inline task footers, comments, etc. */
export function PersonNameInline({
  person,
  name,
  highlight = false,
  size = "sm",
  className = "",
}: {
  person?: Pick<Person, "name" | "avatarUrl">;
  name?: string;
  highlight?: boolean;
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  className?: string;
}) {
  const displayName = person?.name?.trim() || name?.trim() || "Unknown";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 align-middle ${className}`}>
      <span
        className={
          highlight
            ? "truncate font-semibold text-indigo-700 underline decoration-indigo-400 underline-offset-2"
            : "truncate font-medium text-slate-800"
        }
      >
        {displayName}
      </span>
      <PersonAvatar
        person={person}
        name={displayName}
        size={size}
        className="avatar-ring-sm shadow-none"
      />
    </span>
  );
}

const STACK_OVERLAP: Record<keyof typeof PERSON_AVATAR_SIZE_CLASS, string> = {
  "2xs": "-ml-2",
  xs: "-ml-2.5",
  sm: "-ml-3.5",
  md: "-ml-4",
  lg: "-ml-5",
  xl: "-ml-6",
  "2xl": "-ml-8",
};

/** Overlapping avatars — e.g. task assignees at the end of a label row. */
export function PersonAvatarStack({
  people,
  size = PERSON_AVATAR_INLINE_SIZE,
  className = "",
}: {
  people: Pick<Person, "id" | "name" | "avatarUrl">[];
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  className?: string;
}) {
  if (people.length === 0) return null;
  const label = people.map((p) => p.name.trim() || "Member").join(", ");
  const overlap = STACK_OVERLAP[size];
  const showCount = people.length > 2;
  const visible = showCount ? people.slice(0, 2) : people;

  return (
    <span
      className={`inline-flex shrink-0 items-center pl-0.5 ${className}`}
      title={label}
      aria-label={label}
    >
      {visible.map((person, i) => (
        <PersonAvatar
          key={person.id}
          person={person}
          size={size}
          className={`relative shadow-none ${i > 0 ? overlap : ""} ring-2 ring-white`}
          style={{ zIndex: i + 1 }}
        />
      ))}
      {showCount && (
        <span
          className={`avatar-ring relative ${overlap} inline-flex items-center justify-center rounded-full bg-slate-700 text-[8px] font-bold leading-none tabular-nums text-white ${PERSON_AVATAR_SIZE_CLASS[size]}`}
          style={{ zIndex: visible.length + 1 }}
          title={label}
        >
          {people.length}+
        </span>
      )}
    </span>
  );
}
