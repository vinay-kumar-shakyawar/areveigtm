import { requireWorkspaceContext } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { inboxCounts, listConversations } from "@/server/modules/inbox/service";
import { PageHeader } from "@/components/app/page-header";
import { InboxView } from "./inbox-view";

export const metadata = { title: "Inbox" };

export default async function InboxPage(props: PageProps<"/w/[workspaceSlug]/inbox">) {
  const { workspaceSlug } = await props.params;
  const search = await props.searchParams;
  const { ctx, user } = await requireWorkspaceContext(workspaceSlug);
  const [conversations, counts] = await Promise.all([listConversations(ctx, { filter: "all", assigned: "any", limit: 50 }), inboxCounts(ctx)]);
  return (
    <>
      <PageHeader title="Inbox" description="Replies from every channel in one place. The AI triages each one and drafts a reply; you decide what goes out." />
      <InboxView
        slug={workspaceSlug}
        userId={user.id}
        canDecide={can(ctx.role, "inbox.decide")}
        initialSelected={typeof search.conversation === "string" ? search.conversation : null}
        initialCounts={counts}
        initialConversations={conversations.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt?.toISOString() ?? null, snoozedUntil: c.snoozedUntil?.toISOString() ?? null, lastMessage: c.lastMessage ? { ...c.lastMessage, at: c.lastMessage.at.toISOString() } : null }))}
      />
    </>
  );
}
