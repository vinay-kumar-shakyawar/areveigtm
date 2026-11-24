"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changeRoleAction, removeMemberAction, revokeInvitationAction } from "../actions";
import { formatDistanceToNow } from "date-fns";

type Role = "owner" | "admin" | "member";

export function MembersTable({
  slug,
  currentUserId,
  currentRole,
  canManage,
  members,
  invitations,
}: {
  slug: string;
  currentUserId: string;
  currentRole: Role;
  canManage: boolean;
  members: { userId: string; email: string; name: string | null; role: Role; joinedAt: string; lastLoginAt: string | null }[];
  invitations: { id: string; email: string; role: Role; expiresAt: string }[];
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success("Updated");
    });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const editable = canManage && !isSelf && (m.role !== "owner" || currentRole === "owner");
              return (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="font-medium">{m.name ?? m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={m.role}
                        disabled={pending}
                        onChange={(e) => run(() => changeRoleAction(slug, m.userId, e.target.value as Role))}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        {currentRole === "owner" && <option value="owner">Owner (transfer)</option>}
                      </select>
                    ) : (
                      <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.lastLoginAt ? formatDistanceToNow(new Date(m.lastLoginAt), { addSuffix: true }) : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeMemberAction(slug, m.userId))}>
                        Remove
                      </Button>
                    )}
                    {isSelf && <span className="text-xs text-muted-foreground">you</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Pending invitations</h2>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{i.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(i.expiresAt), { addSuffix: true })}</TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvitationAction(slug, i.id))}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
