import { Info } from "lucide-react";
import { type OrgRole } from "../auth/roles";
import { useI18n } from "../contexts/I18nContext";
import { translateRoleSummary } from "../i18n/helpers";
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
  const { locale } = useI18n();
  const iconSize = size === "md" ? "h-4 w-4" : size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span className={`inline-flex select-none items-center gap-1 ${showInfo ? "cursor-pointer" : ""}`}>
      <OrgRoleBadge role={role} size={size} />
      {showInfo && (
        <span className="group/info relative inline-flex cursor-pointer">
          <Info className={`${iconSize} text-slate-400 transition-colors group-hover/info:text-slate-600`} aria-hidden />
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-2 text-[10px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover/info:block"
          >
            {translateRoleSummary(locale, role)}
          </span>
        </span>
      )}
    </span>
  );
}
