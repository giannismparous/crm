import type { Person } from "../types";
import { PersonAvatar } from "./PersonAvatar";
import { useT } from "../contexts/I18nContext";

export function PersonPresenceAvatar({
  person,
  name,
  avatarUrl,
  size = "md",
  online = false,
  className = "",
}: {
  person?: Pick<Person, "name" | "avatarUrl">;
  name?: string;
  avatarUrl?: string;
  size?: keyof typeof import("./PersonAvatar").PERSON_AVATAR_SIZE_CLASS;
  online?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <PersonAvatar person={person} name={name} avatarUrl={avatarUrl} size={size} />
      {online && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
          title={t("common.online")}
          aria-label={t("common.online")}
        />
      )}
    </span>
  );
}
