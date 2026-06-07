import { ORG_ROLE_LABELS, type OrgRole } from "../auth/roles";

export function OrgRoleBadge({
  role,
  size = "sm",
}: {
  role: OrgRole;
  size?: "xs" | "sm" | "md";
}) {
  const isFounder = role === "founder";
  const pad =
    size === "md" ? "px-2.5 py-1 text-xs" : size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]";
  return (
    <span
      className={`inline-flex shrink-0 cursor-default select-none items-center rounded-full font-bold uppercase tracking-wide ring-1 ring-inset ${pad} ${
        isFounder
          ? "bg-gradient-to-r from-amber-100 to-amber-50 text-amber-950 ring-amber-300/80"
          : "bg-gradient-to-r from-indigo-100 to-sky-50 text-indigo-900 ring-indigo-200/90"
      }`}
    >
      {ORG_ROLE_LABELS[role]}
    </span>
  );
}
