import { type OrgRole } from "../auth/roles";
import { useI18n, useT } from "../contexts/I18nContext";
import { translateRole, translateRoleSummary } from "../i18n/helpers";
import { InfoTooltip } from "./InfoTooltip";
import { OrgRoleBadge } from "./OrgRoleBadge";

export function OrgRoleWithInfo({
  role,
  size = "sm",
  showInfo = true,
}: {
  role: OrgRole;
  size?: "xs" | "sm" | "md";
  showInfo?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const iconSize = size === "md" ? "h-4 w-4" : size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span className="inline-flex select-none items-center gap-1">
      <OrgRoleBadge role={role} size={size} />
      {showInfo && (
        <InfoTooltip
          text={translateRoleSummary(locale, role)}
          label={t("roles.aboutRole", { role: translateRole(locale, role) })}
          iconClassName={iconSize}
        />
      )}
    </span>
  );
}
