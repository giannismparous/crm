/** Platform access role — separate from job title on `Person.title`. */
export const ORG_ROLES = ["founder", "partner"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  founder: "Founder",
  partner: "Partner",
};

/** Short capability blurb for role info tooltips. */
export const ORG_ROLE_SUMMARY: Record<OrgRole, string> = {
  founder: "Sees everything, manages projects, issues invites, and opens settings.",
  partner: "Sees their departments — tasks, projects, appointments, and reminders scoped to them.",
};

export type RolePrivileges = {
  /** Full CRM (tasks, contacts, team, calendar). */
  fullAccess: boolean;
  /** See all org data across every department. */
  seeAllOrgData: boolean;
  /** Navbar admin settings (seeds, role management). */
  accessSettings: boolean;
  /** Create one-time registration seeds. */
  issueRegistrationSeeds: boolean;
  /** Change another user's org role. */
  manageOrgRoles: boolean;
  /** Create, edit, and delete projects. */
  manageProjects: boolean;
  /** Founder-only research section. */
  accessResearch: boolean;
  /** Founder-only strategic business plan document. */
  accessStrategicPlan: boolean;
};

export const ROLE_PRIVILEGES: Record<OrgRole, RolePrivileges> = {
  founder: {
    fullAccess: true,
    seeAllOrgData: true,
    accessSettings: true,
    issueRegistrationSeeds: true,
    manageOrgRoles: true,
    manageProjects: true,
    accessResearch: true,
    accessStrategicPlan: true,
  },
  partner: {
    fullAccess: true,
    seeAllOrgData: false,
    accessSettings: false,
    issueRegistrationSeeds: false,
    manageOrgRoles: false,
    manageProjects: false,
    accessResearch: false,
    accessStrategicPlan: false,
  },
};

/** Roles a founder may assign when issuing a seed. */
export const SEED_ASSIGNABLE_ROLES: OrgRole[] = ["founder", "partner"];

/** Roles a founder may set on existing users. */
export const ADMIN_ASSIGNABLE_ROLES: OrgRole[] = ["founder", "partner"];

export const FOUNDER_BOOTSTRAP_EMAIL = "giannismparous@gmail.com";
export const FOUNDER_BOOTSTRAP_NAME = "Giannis Mparous";

export function normalizeOrgRole(value: unknown): OrgRole {
  const s = String(value ?? "").toLowerCase();
  if (s === "founder" || s === "ceo") return "founder";
  if (s === "partner" || s === "member") return "partner";
  return "partner";
}

export function canSeeAllOrgData(role: OrgRole): boolean {
  return hasPrivilege(role, "seeAllOrgData");
}

export function privilegesForRole(role: OrgRole): RolePrivileges {
  return ROLE_PRIVILEGES[role];
}

export function hasPrivilege(role: OrgRole, key: keyof RolePrivileges): boolean {
  return privilegesForRole(role)[key];
}
