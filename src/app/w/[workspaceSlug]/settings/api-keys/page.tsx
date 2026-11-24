import { requireWorkspaceContext } from "@/server/auth/context";
import { listApiKeys } from "@/server/modules/api-keys/service";
import { can } from "@/server/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { ApiKeysPanel } from "./api-keys-panel";
import { EmptyState } from "@/components/app/empty-state";
import { KeyRound } from "lucide-react";

export default async function ApiKeysPage(props: PageProps<"/w/[workspaceSlug]/settings/api-keys">) {
  const { workspaceSlug } = await props.params;
  const { ctx } = await requireWorkspaceContext(workspaceSlug);
  if (!can(ctx.role, "api_keys.manage")) {
    return (
      <>
        <PageHeader title="API keys" />
        <EmptyState icon={KeyRound} title="Admins only" description="Ask a workspace admin to create API keys." />
      </>
    );
  }
  const keys = await listApiKeys(ctx);
  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            Use a key as <code className="rounded bg-muted px-1">Authorization: Bearer agk_…</code> against <code className="rounded bg-muted px-1">/api/v1</code>. Keys are shown once and stored hashed.
          </>
        }
      />
      <ApiKeysPanel slug={workspaceSlug} keys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null }))} />
    </>
  );
}
