import type { WorkspaceRole } from "@prisma/client";
import { ApiError } from "@/server/api/errors";

/**
 * Permission catalogue. Keep it flat and explicit so tests can enumerate it.
 */
export const PERMISSIONS = {
  "workspace.read": ["owner", "admin", "member"],
  "workspace.update": ["owner", "admin"],
  "workspace.delete": ["owner"],
  "members.read": ["owner", "admin", "member"],
  "members.manage": ["owner", "admin"],
  "members.change_owner": ["owner"],
  "integrations.read": ["owner", "admin", "member"],
  "integrations.manage": ["owner", "admin"],
  "api_keys.manage": ["owner", "admin"],
  "company.read": ["owner", "admin", "member"],
  "company.update": ["owner", "admin", "member"],
  "icp.manage": ["owner", "admin", "member"],
  "leads.read": ["owner", "admin", "member"],
  "leads.manage": ["owner", "admin", "member"],
  "leads.delete": ["owner", "admin"],
  "leads.export": ["owner", "admin"],
  "campaigns.read": ["owner", "admin", "member"],
  "campaigns.manage": ["owner", "admin", "member"],
  "campaigns.activate": ["owner", "admin"],
  "messages.approve": ["owner", "admin", "member"],
  "inbox.read": ["owner", "admin", "member"],
  "inbox.decide": ["owner", "admin", "member"],
  "senders.manage": ["owner", "admin"],
  "analytics.read": ["owner", "admin", "member"],
  "webhooks.manage": ["owner", "admin"],
  "audit.read": ["owner", "admin"],
  "settings.update": ["owner", "admin"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly WorkspaceRole[]).includes(role);
}

export function assertCan(role: WorkspaceRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw ApiError.forbidden(`Your role (${role}) cannot perform ${permission}`);
  }
}

export const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 3, admin: 2, member: 1 };
