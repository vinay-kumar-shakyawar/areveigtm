import { describe, expect, it } from "vitest";
import { PERMISSIONS, can, assertCan } from "@/server/auth/rbac";

describe("rbac", () => {
  it("owner can do everything", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can("owner", p)).toBe(true);
  });
  it("member cannot manage credentials, members or delete the workspace", () => {
    expect(can("member", "integrations.manage")).toBe(false);
    expect(can("member", "members.manage")).toBe(false);
    expect(can("member", "workspace.delete")).toBe(false);
    expect(can("member", "leads.read")).toBe(true);
  });
  it("admin cannot delete workspace or transfer ownership", () => {
    expect(can("admin", "workspace.delete")).toBe(false);
    expect(can("admin", "members.change_owner")).toBe(false);
    expect(can("admin", "integrations.manage")).toBe(true);
  });
  it("assertCan throws a forbidden ApiError", () => {
    expect(() => assertCan("member", "workspace.delete")).toThrowError(/cannot perform/);
  });
});
