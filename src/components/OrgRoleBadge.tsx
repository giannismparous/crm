import { ORG_ROLE_LABELS, type OrgRole } from "../auth/roles";

export function OrgRoleBadge({
  role,
  size = "sm",
}: {
  role: OrgRole;
  size?: "xs" | "sm" | "md";
}) {
  const sizeClass =
    size === "md" ? "text-base sm:text-lg lg:text-xl" : size === "sm" ? "text-sm" : "text-xs sm:text-sm";

  return (
    <span
      className={`org-role-label org-role-label--${role} inline-block shrink-0 font-medium uppercase tracking-[0.14em] ${sizeClass}`}
    >
      {ORG_ROLE_LABELS[role]}
    </span>
  );
}
