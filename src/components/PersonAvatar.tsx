import type { CSSProperties, MouseEvent } from "react";
import type { Person } from "../types";
import { useOpenTeamMember } from "../contexts/PersonNavContext";
import { personAvatarGradient, personInitials } from "../utils/personAvatar";
import { LoadableImage } from "./LoadableImage";
import { useT } from "../contexts/I18nContext";

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
  const t = useT();
  const displayName = person?.name?.trim() || name?.trim() || t("common.member");
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

function personNavButtonClass(extra = ""): string {
  return `inline-flex max-w-full items-center rounded-md text-left transition hover:bg-slate-100/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${extra}`.trim();
}

function openPersonProfile(
  e: MouseEvent,
  openTeam: ((personId: string) => void) | null,
  personId: string | undefined,
  stopPropagation?: boolean
) {
  if (!personId || !openTeam) return;
  if (stopPropagation) e.stopPropagation();
  openTeam(personId);
}

/** Name + avatar for inline task footers, comments, etc. */
export function PersonNameInline({
  person,
  personId,
  name,
  highlight = false,
  size = "sm",
  showAvatar = true,
  stopPropagation = false,
  className = "",
}: {
  person?: Pick<Person, "id" | "name" | "avatarUrl">;
  personId?: string;
  name?: string;
  highlight?: boolean;
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  showAvatar?: boolean;
  stopPropagation?: boolean;
  className?: string;
}) {
  const t = useT();
  const openTeam = useOpenTeamMember();
  const displayName = person?.name?.trim() || name?.trim() || t("common.unknown");
  const resolvedId = person?.id?.trim() || personId?.trim();
  const canNavigate = Boolean(resolvedId && openTeam);

  const nameClass = highlight
    ? "truncate font-semibold text-indigo-700 underline decoration-indigo-400 underline-offset-2"
    : "truncate font-medium text-slate-800";

  const inner = (
    <>
      <span className={nameClass}>{displayName}</span>
      {showAvatar && (
        <PersonAvatar
          person={person}
          name={displayName}
          size={size}
          className="avatar-ring-sm shadow-none"
        />
      )}
    </>
  );

  if (!canNavigate) {
    return (
      <span className={`inline-flex max-w-full items-center gap-1.5 align-middle ${className}`}>{inner}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => openPersonProfile(e, openTeam, resolvedId, stopPropagation)}
      className={`${personNavButtonClass("gap-1.5 align-middle")} ${className}`}
      title={t("team.viewMember", { name: displayName })}
    >
      {inner}
    </button>
  );
}

/** Comma-separated names only — pairs with PersonAvatarStack. */
export function PersonNamesInline({
  people,
  currentUserId,
  stopPropagation = false,
  className = "",
}: {
  people: Pick<Person, "id" | "name">[];
  currentUserId?: string;
  stopPropagation?: boolean;
  className?: string;
}) {
  const t = useT();
  const openTeam = useOpenTeamMember();
  if (people.length === 0) return null;

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center ${className}`}>
      {people.map((person, index) => {
        const isMe = currentUserId && person.id === currentUserId;
        const name = person.name.trim() || t("common.someone");
        const canNavigate = Boolean(person.id && openTeam);
        const nameClass = isMe
          ? "font-semibold text-indigo-700 underline decoration-indigo-400 underline-offset-2"
          : "font-medium text-slate-800";

        return (
          <span key={person.id} className="inline-flex items-center">
            {index > 0 && <span className="text-slate-500">, </span>}
            {canNavigate ? (
              <button
                type="button"
                onClick={(e) => openPersonProfile(e, openTeam, person.id, stopPropagation)}
                className={personNavButtonClass(`px-0.5 ${nameClass}`)}
                title={t("team.viewMember", { name })}
              >
                {name}
              </button>
            ) : (
              <span className={nameClass}>{name}</span>
            )}
          </span>
        );
      })}
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
  stopPropagation = false,
}: {
  people: Pick<Person, "id" | "name" | "avatarUrl">[];
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  className?: string;
  stopPropagation?: boolean;
}) {
  const t = useT();
  const openTeam = useOpenTeamMember();
  if (people.length === 0) return null;
  const label = people.map((p) => p.name.trim() || t("common.member")).join(", ");
  const overlap = STACK_OVERLAP[size];
  const showCount = people.length > 2;
  const visible = showCount ? people.slice(0, 2) : people;

  return (
    <span
      className={`inline-flex shrink-0 items-center pl-0.5 ${className}`}
      title={label}
      aria-label={label}
    >
      {visible.map((person, i) => {
        const avatar = (
          <PersonAvatar
            person={person}
            size={size}
            className={`relative shadow-none ${i > 0 ? overlap : ""} ring-2 ring-white`}
            style={{ zIndex: i + 1 }}
          />
        );
        if (!person.id || !openTeam) {
          return <span key={person.id}>{avatar}</span>;
        }
        return (
          <button
            key={person.id}
            type="button"
            onClick={(e) => openPersonProfile(e, openTeam, person.id, stopPropagation)}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            title={t("team.viewMember", { name: person.name.trim() || t("common.member") })}
            style={{ zIndex: i + 1 }}
          >
            {avatar}
          </button>
        );
      })}
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
