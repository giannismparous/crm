import type { Person } from "../../types";
import { PersonAvatar } from "../PersonAvatar";

/** Org-chart avatars: exact box size, no extra ring offset. */
export function OrgChartAvatar({
  person,
  size = "xs",
  className = "",
}: {
  person?: Pick<Person, "name" | "avatarUrl">;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <PersonAvatar
      person={person}
      size={size}
      className={`!m-0 block shrink-0 !shadow-none !ring-0 ${className}`.trim()}
    />
  );
}

export const ORG_CHART_ICON_BOX = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
} as const;
