import { type OrgRole } from "../auth/roles";
import { useI18n, useT } from "../contexts/I18nContext";
import { translateRole, translateRoleSummary } from "../i18n/helpers";
import { InfoTooltip } from "./InfoTooltip";

export function RoleInfoTip({ role, iconClassName }: { role: OrgRole; iconClassName?: string }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <InfoTooltip
      text={translateRoleSummary(locale, role)}
      label={t("roles.aboutRole", { role: translateRole(locale, role) })}
      iconClassName={iconClassName}
    />
  );
}
