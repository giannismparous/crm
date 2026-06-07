import { ORG_ROLE_SUMMARY, type OrgRole } from "../auth/roles";
import { InfoTooltip } from "./InfoTooltip";

export function RoleInfoTip({ role, iconClassName }: { role: OrgRole; iconClassName?: string }) {
  return (
    <InfoTooltip
      text={ORG_ROLE_SUMMARY[role]}
      label={`About ${role} role`}
      iconClassName={iconClassName}
    />
  );
}
