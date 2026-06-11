import { describe, expect, it } from "vitest";
import {
  ADMIN_ASSIGNABLE_ROLES,
  canSeeAllOrgData,
  hasPrivilege,
  normalizeOrgRole,
  ROLE_PRIVILEGES,
  SEED_ASSIGNABLE_ROLES,
} from "./roles";

describe("roles", () => {
  it("normalizes legacy aliases", () => {
    expect(normalizeOrgRole("ceo")).toBe("founder");
    expect(normalizeOrgRole("member")).toBe("partner");
    expect(normalizeOrgRole("founder")).toBe("founder");
    expect(normalizeOrgRole("")).toBe("partner");
  });

  it("founder has full privileges", () => {
    expect(canSeeAllOrgData("founder")).toBe(true);
    expect(hasPrivilege("founder", "accessSettings")).toBe(true);
    expect(hasPrivilege("founder", "manageProjects")).toBe(true);
    expect(hasPrivilege("founder", "issueRegistrationSeeds")).toBe(true);
  });

  it("partner lacks admin privileges", () => {
    expect(canSeeAllOrgData("partner")).toBe(false);
    expect(hasPrivilege("partner", "accessSettings")).toBe(false);
    expect(hasPrivilege("partner", "manageProjects")).toBe(false);
    expect(hasPrivilege("partner", "issueRegistrationSeeds")).toBe(false);
    expect(hasPrivilege("partner", "fullAccess")).toBe(true);
  });

  it("seed assignable roles are founder and partner", () => {
    expect(SEED_ASSIGNABLE_ROLES).toEqual(["founder", "partner"]);
    expect(ADMIN_ASSIGNABLE_ROLES).toEqual(["founder", "partner"]);
  });

  it("privilege matrix is stable", () => {
    expect(ROLE_PRIVILEGES.founder.seeAllOrgData).toBe(true);
    expect(ROLE_PRIVILEGES.partner.seeAllOrgData).toBe(false);
  });
});
