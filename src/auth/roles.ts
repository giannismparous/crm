/** Platform access role — separate from job title on `Person.title`. */
export const ORG_ROLES = ["founder", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  founder: "Founder",
  member: "Member",
};

export type RolePrivileges = {
  /** Full CRM (tasks, contacts, team, calendar). */
  fullAccess: boolean;
  /** Navbar admin settings (seeds, role management). */
  accessSettings: boolean;
  /** Create one-time registration seeds. */
  issueRegistrationSeeds: boolean;
  /** Change another user's org role. */
  manageOrgRoles: boolean;
};

export const ROLE_PRIVILEGES: Record<OrgRole, RolePrivileges> = {
  founder: {
    fullAccess: true,
    accessSettings: true,
    issueRegistrationSeeds: true,
    manageOrgRoles: true,
  },
  member: {
    fullAccess: true,
    accessSettings: false,
    issueRegistrationSeeds: false,
    manageOrgRoles: false,
  },
};

/** Roles a founder may assign when issuing a seed. */
export const SEED_ASSIGNABLE_ROLES: OrgRole[] = ["founder", "member"];

/** Roles a founder may set on existing users. */
export const ADMIN_ASSIGNABLE_ROLES: OrgRole[] = ["founder", "member"];

export const FOUNDER_BOOTSTRAP_EMAIL = "giannismparous@gmail.com";
export const FOUNDER_BOOTSTRAP_NAME = "Giannis Mparous";

export function normalizeOrgRole(value: unknown): OrgRole {
  const s = String(value ?? "").toLowerCase();
  if (s === "founder" || s === "ceo") return "founder";
  if (s === "member") return "member";
  return "member";
}

export function privilegesForRole(role: OrgRole): RolePrivileges {
  return ROLE_PRIVILEGES[role];
}

export function hasPrivilege(role: OrgRole, key: keyof RolePrivileges): boolean {
  return privilegesForRole(role)[key];
}
