import { type OrgRole } from "../auth/roles";
import { useI18n } from "../contexts/I18nContext";
import { translateRole } from "../i18n/helpers";

export function OrgRoleBadge({
  role,
  size = "sm",
}: {
  role: OrgRole;
  size?: "xs" | "sm" | "md";
}) {
  const { locale } = useI18n();
  const sizeClass =
    size === "md" ? "text-base sm:text-lg lg:text-xl" : size === "sm" ? "text-sm" : "text-xs sm:text-sm";

  return (
    <span
      className={`org-role-label org-role-label--${role} inline-block shrink-0 font-medium uppercase tracking-[0.14em] ${sizeClass}`}
    >
      {translateRole(locale, role)}
    </span>
  );
}
